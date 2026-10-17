const crypto = require('crypto');
const db = require('../db');
const { HttpError } = require('../lib/httpError');
const front = require('../lib/front');
const { nextNumero } = require('../lib/numerotation');

// Champs client que le devis peut exiger : clé côté API → colonne en base
const CHAMPS = { nom: 'client_nom', email: 'client_email', tel: 'client_tel', adresse: 'client_adresse' };
const CHAMPS_LABELS = { nom: 'nom et prénom', email: 'email', tel: 'téléphone', adresse: 'adresse' };
const DEFAULT_REQUIS = ['nom', 'email', 'tel'];
const TVA_VALUES = [0, 5.5, 10, 20];

const r2 = n => Math.round(n * 100) / 100;
const str = (v, max = 255) => String(v ?? '').trim().slice(0, max);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ─── Dates (journée entière ou créneau) ─────────────────────
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function labelDate(o) {
  const d = new Date(o.date + 'T12:00:00Z');
  const jour = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const cap = jour.charAt(0).toUpperCase() + jour.slice(1);
  return o.mode === 'creneau'
    ? `${cap}, de ${o.debut.replace(':', 'h')} à ${o.fin.replace(':', 'h')}`
    : `${cap}, journée entière`;
}

function parseDates(body) {
  const raw = Array.isArray(body.dates) ? body.dates : [];
  if (!raw.length) throw new HttpError(400, 'Indiquez au moins une date pour la sortie (elle conditionne le droit de rétractation du client).');
  if (raw.length > 10) throw new HttpError(400, '10 dates maximum');
  const today = new Date().toISOString().slice(0, 10);
  const seen = new Set();
  const out = raw.map((x, i) => {
    const date = str(x.date, 10);
    if (!DATE_RE.test(date) || isNaN(new Date(date + 'T12:00:00Z'))) throw new HttpError(400, `Date ${i + 1} invalide`);
    if (date < today) throw new HttpError(400, `Date ${i + 1} : elle est déjà passée`);
    const mode = x.mode === 'creneau' ? 'creneau' : 'journee';
    const o = { date, mode };
    if (mode === 'creneau') {
      const debut = str(x.debut, 5), fin = str(x.fin, 5);
      if (!TIME_RE.test(debut) || !TIME_RE.test(fin)) throw new HttpError(400, `Date ${i + 1} : heures de début et de fin requises (HH:MM)`);
      if (fin <= debut) throw new HttpError(400, `Date ${i + 1} : la fin doit être après le début`);
      o.debut = debut; o.fin = fin;
    }
    const key = `${o.date}|${o.mode}|${o.debut || ''}|${o.fin || ''}`;
    if (seen.has(key)) throw new HttpError(400, `Date ${i + 1} en double`);
    seen.add(key);
    return o;
  });
  return out.sort((a, b) => (a.date + (a.debut || '')).localeCompare(b.date + (b.debut || '')));
}

// ─── Lignes ──────────────────────────────────────────────────
function parseLignes(body) {
  let lignes = body.lignes;
  // Compatibilité : ancien format (une description + un montant HT)
  if (!Array.isArray(lignes) && body.description && body.montant_ht != null) {
    lignes = [{ description: body.description, quantite: 1, prix_unitaire_ht: body.montant_ht }];
  }
  if (!Array.isArray(lignes) || lignes.length === 0)
    throw new HttpError(400, 'Ajoutez au moins une ligne au devis');
  if (lignes.length > 30) throw new HttpError(400, '30 lignes maximum');

  return lignes.map((l, i) => {
    const description = str(l.description, 500);
    const quantite = Number(l.quantite);
    const prix = Number(l.prix ?? l.prix_unitaire_ht);
    if (!description) throw new HttpError(400, `Ligne ${i + 1} : description manquante`);
    if (!(quantite > 0) || quantite > 10000) throw new HttpError(400, `Ligne ${i + 1} : quantité invalide`);
    if (!(prix >= 0) || prix > 1e6) throw new HttpError(400, `Ligne ${i + 1} : prix invalide`);
    return { description, quantite: r2(quantite), prix: r2(prix) };
  });
}

// ─── Création ────────────────────────────────────────────────
async function createDevis(proId, body, updateId = null) {
  const { rows: pr } = await db.query('SELECT * FROM pros WHERE id=$1', [proId]);
  const pro = pr[0];
  if (!pro) throw new HttpError(401, 'Compte introuvable');
  if (!pro.adresse || !pro.siret)
    throw new HttpError(422, 'Complétez votre profil (adresse et SIRET) avant de créer un devis.', { code: 'PROFIL_INCOMPLET' });
  if (!pro.cgv_version_id && !pro.cgv_en_version_id && !pro.cgv_url)
    throw new HttpError(422, 'Ajoutez vos conditions générales de vente (PDF) dans votre profil avant de créer un devis.', { code: 'PROFIL_INCOMPLET' });

  const dates = parseDates(body);
  const date_prestation = dates.map(labelDate).join(' ; ').slice(0, 500);
  const participants_max = Math.floor(Number(body.participants_max));
  if (!(participants_max >= 1) || participants_max > 200)
    throw new HttpError(400, 'Indiquez le nombre maximum de participants (1 à 200)');

  // CGV : langue choisie sur le devis (français par défaut)
  const hasFr = !!(pro.cgv_version_id || pro.cgv_url), hasEn = !!pro.cgv_en_version_id;
  const cgv_langue = body.cgv_langue === 'en' ? 'en' : (body.cgv_langue === 'fr' ? 'fr' : (hasFr ? 'fr' : 'en'));
  if ((cgv_langue === 'fr' && !hasFr) || (cgv_langue === 'en' && !hasEn))
    throw new HttpError(400, `Vous n'avez pas de CGV en ${cgv_langue === 'en' ? 'anglais' : 'français'} : ajoutez-les dans votre profil.`);

  // TVA : choisie sur chaque devis. « Non applicable » = prix net, taux 0.
  const tva_mode = body.tva_mode === 'non_applicable' ? 'non_applicable' : (body.tva_mode === 'incluse' ? 'incluse' : (pro.tva_franchise ? 'non_applicable' : 'incluse'));
  const tvaIn = Number(body.tva_pct ?? 20);
  const tva_pct = tva_mode === 'non_applicable' ? 0 : (TVA_VALUES.includes(tvaIn) && tvaIn > 0 ? tvaIn : 20);

  // Prix saisis en TTC (montant final) — HT possible via l'API. Le total payé est exactement le montant annoncé.
  const prix_mode = tva_mode === 'incluse' && body.prix_mode === 'ht' ? 'ht' : 'ttc';
  const objet = str(body.objet, 255);
  // Un seul montant suffit : une ligne portant l'intitulé. Des lignes détaillées restent possibles.
  const bodyLignes = Array.isArray(body.lignes) && body.lignes.length
    ? body
    : (body.montant != null ? { ...body, lignes: [{ description: objet || 'Prestation', quantite: 1, prix: body.montant }] } : body);
  const saisies = parseLignes(bodyLignes);
  const f = 1 + tva_pct / 100;
  let montant_ht, montant_ttc;
  if (prix_mode === 'ttc') {
    montant_ttc = r2(saisies.reduce((s, l) => s + l.quantite * l.prix, 0));
    montant_ht = r2(montant_ttc - r2(montant_ttc - montant_ttc / f));
  } else {
    montant_ht = r2(saisies.reduce((s, l) => s + l.quantite * l.prix, 0));
    montant_ttc = r2(montant_ht * f);
  }
  if (!(montant_ttc > 0)) throw new HttpError(400, 'Le total du devis doit être supérieur à 0');
  const lignes = saisies.map(l => prix_mode === 'ttc'
    ? { description: l.description, quantite: l.quantite, prix_unitaire_ttc: l.prix, prix_unitaire_ht: Math.round(l.prix / f * 10000) / 10000 }
    : { description: l.description, quantite: l.quantite, prix_unitaire_ht: l.prix, prix_unitaire_ttc: r2(l.prix * f) });

  // Champs à compléter par le client : le pro ne les remplit pas (valeur ignorée)
  const requis = Array.isArray(body.champs_requis) ? [...new Set(body.champs_requis.filter(k => CHAMPS[k]))] : DEFAULT_REQUIS;
  const prefill = {};
  for (const k of Object.keys(CHAMPS)) prefill[k] = requis.includes(k) ? '' : str(body[CHAMPS[k]], k === 'adresse' ? 500 : 255);
  if (!requis.includes('nom') && !prefill.nom)
    throw new HttpError(400, 'Indiquez le nom du client, ou cochez « Le client doit compléter ».');

  const email = prefill.email;
  if (email && !EMAIL_RE.test(email)) throw new HttpError(400, 'Email du client invalide');

  const description = objet || lignes.map(l => l.description).join(' · ').slice(0, 500);
  const expireDays = Math.min(Math.max(parseInt(body.expire_days) || 30, 1), 90);
  const expire_at = new Date(Date.now() + expireDays * 86400000);
  const token = crypto.randomBytes(32).toString('hex');

  return db.tx(async tx => {
    if (updateId) {
      // Correction d'un devis non signé : même numéro, même lien
      const { rows: ex } = await tx.query('SELECT id, statut, token_unique FROM devis WHERE id=$1 AND pro_id=$2 FOR UPDATE', [updateId, proId]);
      if (!ex[0]) throw new HttpError(404, 'Devis introuvable');
      if (ex[0].statut !== 'en_attente') throw new HttpError(409, 'Un devis signé ne peut plus être modifié');
      const { rows } = await tx.query(
        `UPDATE devis SET objet=$2, date_prestation=$3, description=$4, client_nom=$5, client_email=$6, client_tel=$7, client_adresse=$8,
           montant_ht=$9, tva_pct=$10, expire_at=$11, champs_requis=$12::jsonb, dates=$13::jsonb, participants_max=$14,
           montant_ttc=$15, prix_mode=$16, cgv_langue=$17, tva_mode=$18 WHERE id=$1 RETURNING *`,
        [updateId, objet || null, date_prestation, description, prefill.nom || null, email || null, prefill.tel || null, prefill.adresse || null,
         montant_ht, tva_pct, expire_at, JSON.stringify(requis), JSON.stringify(dates), participants_max, montant_ttc, prix_mode, cgv_langue, tva_mode]
      );
      await tx.query('DELETE FROM devis_lignes WHERE devis_id=$1', [updateId]);
      for (let i = 0; i < lignes.length; i++) {
        await tx.query(
          `INSERT INTO devis_lignes (devis_id, position, description, quantite, prix_unitaire_ht, prix_unitaire_ttc) VALUES ($1,$2,$3,$4,$5,$6)`,
          [updateId, i, lignes[i].description, lignes[i].quantite, lignes[i].prix_unitaire_ht, lignes[i].prix_unitaire_ttc]
        );
      }
      return { ...rows[0], lignes, dates, lien_unique: `${front()}/p/${ex[0].token_unique}` };
    }
    const numero = await nextNumero(tx, proId, 'devis');
    const { rows } = await tx.query(
      `INSERT INTO devis (pro_id, token_unique, numero, objet, date_prestation, description,
         client_nom, client_email, client_tel, client_adresse, montant_ht, tva_pct, expire_at, champs_requis,
         dates, participants_max, montant_ttc, prix_mode, cgv_langue, tva_mode)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb,$16,$17,$18,$19,$20) RETURNING *`,
      [proId, token, numero, objet || null, date_prestation, description,
       prefill.nom || null, email || null, prefill.tel || null, prefill.adresse || null,
       montant_ht, tva_pct, expire_at, JSON.stringify(requis), JSON.stringify(dates), participants_max, montant_ttc, prix_mode, cgv_langue, tva_mode]
    );
    const devis = rows[0];
    for (let i = 0; i < lignes.length; i++) {
      await tx.query(
        `INSERT INTO devis_lignes (devis_id, position, description, quantite, prix_unitaire_ht, prix_unitaire_ttc) VALUES ($1,$2,$3,$4,$5,$6)`,
        [devis.id, i, lignes[i].description, lignes[i].quantite, lignes[i].prix_unitaire_ht, lignes[i].prix_unitaire_ttc]
      );
    }
    return { ...devis, lignes, dates, lien_unique: `${front()}/p/${token}` };
  });
}

// ─── Lecture ─────────────────────────────────────────────────
async function getLignes(devisId) {
  const { rows } = await db.query(
    `SELECT description, quantite, prix_unitaire_ht, prix_unitaire_ttc FROM devis_lignes WHERE devis_id=$1 ORDER BY position`, [devisId]
  );
  return rows;
}

// Vue publique pour le client (lien unique). Retourne null si introuvable.
async function getPublicDevis(token) {
  const { rows } = await db.query(
    `SELECT d.*, p.nom AS pro_nom, p.prenom AS pro_prenom, p.activite, p.cgv_url, p.mediateur, p.cgv_version_id AS pro_cgv_fr, p.cgv_en_version_id AS pro_cgv_en, p.tva_franchise AS pro_franchise
       FROM devis d JOIN pros p ON d.pro_id = p.id WHERE d.token_unique=$1`, [token]
  );
  const d = rows[0];
  if (!d) return null;
  if (d.expire_at && new Date(d.expire_at) < new Date() && d.statut === 'en_attente')
    throw new HttpError(410, 'Lien expiré');
  let lignes = await getLignes(d.id);
  // Devis créés avant la V1 : une seule ligne synthétique
  if (!lignes.length) lignes = [{ description: d.description, quantite: 1, prix_unitaire_ht: d.montant_ht, prix_unitaire_ttc: d.montant_ttc }];
  return {
    id: d.id, token_unique: d.token_unique, numero: d.numero, objet: d.objet || null,
    description: d.description, date_prestation: d.date_prestation, lignes,
    montant_ht: d.montant_ht, tva_pct: d.tva_pct, montant_ttc: d.montant_ttc, prix_mode: d.prix_mode || 'ht',
    tva_franchise: d.tva_mode ? d.tva_mode === 'non_applicable' : !!d.pro_franchise,
    statut: d.statut, expire_at: d.expire_at,
    pro_nom: [d.pro_prenom, d.pro_nom].filter(Boolean).join(' '), activite: d.activite,
    mediateur: d.mediateur || null,
    cgv_langue: d.cgv_langue || 'fr',
    cgv_url: (d.cgv_langue || 'fr') === 'fr' ? (d.cgv_url || null) : null,
    cgv_pdf: !!(d.cgv_version_id || ((d.cgv_langue || 'fr') === 'en' ? d.pro_cgv_en : d.pro_cgv_fr)),
    has_cgv: !!(d.cgv_version_id || ((d.cgv_langue || 'fr') === 'en' ? d.pro_cgv_en : (d.pro_cgv_fr || d.cgv_url))),
    dates: (Array.isArray(d.dates) ? d.dates : []).map(o => ({ ...o, label: labelDate(o) })),
    participants_max: d.participants_max || 1,
    participants_nb: d.participants_nb || null,
    champs_requis: Array.isArray(d.champs_requis) ? d.champs_requis : DEFAULT_REQUIS,
    client: { nom: d.client_nom || '', email: d.client_email || '', tel: d.client_tel || '', adresse: d.client_adresse || '' },
  };
}

// ─── Signature ───────────────────────────────────────────────
// Valide les champs requis et les cases cochées, fige un snapshot, calcule son hash.
async function signDevis(token, body, ip, ua) {
  return db.tx(async tx => {
    const { rows } = await tx.query(
      `SELECT d.*, p.cgv_url, p.cgv_version_id AS pro_cgv_fr, p.cgv_en_version_id AS pro_cgv_en FROM devis d JOIN pros p ON d.pro_id=p.id WHERE d.token_unique=$1 FOR UPDATE OF d`, [token]
    );
    const d = rows[0];
    if (!d) throw new HttpError(404, 'Devis introuvable');
    if (d.statut !== 'en_attente') throw new HttpError(400, `Devis déjà ${d.statut}`);
    if (d.expire_at && new Date(d.expire_at) < new Date()) throw new HttpError(410, 'Ce lien a expiré');

    // Infos client : ce que le client saisit complète/corrige ce que le pro avait prérempli
    const given = body.client || {};
    const client = {};
    for (const k of Object.keys(CHAMPS)) {
      client[k] = str(given[k], k === 'adresse' ? 500 : 255) || str(d[CHAMPS[k]], 500);
    }
    const requis = Array.isArray(d.champs_requis) ? d.champs_requis : DEFAULT_REQUIS;
    const manquants = [...new Set(['nom', ...requis])].filter(k => !client[k]);
    if (manquants.length)
      throw new HttpError(400, `À renseigner : ${manquants.map(k => CHAMPS_LABELS[k]).join(', ')}`, { champs_manquants: manquants });
    if (client.email && !EMAIL_RE.test(client.email)) throw new HttpError(400, 'Email invalide', { champs_manquants: ['email'] });
    if (client.tel && client.tel.replace(/\D/g, '').length < 6) throw new HttpError(400, 'Téléphone invalide', { champs_manquants: ['tel'] });

    // Cases à cocher
    const c = body.cases || {};
    const cases = { accept_devis: c.accept_devis === true, accept_cgv: c.accept_cgv === true, accept_rgpd: c.accept_rgpd === true, accept_signature: c.accept_signature === true };
    const casesManquantes = [];
    if (!cases.accept_devis) casesManquantes.push('accept_devis');
    let cgv = null; // version PDF des CGV proposée au moment de la signature
    const cgvId = (d.cgv_langue || 'fr') === 'en' ? d.pro_cgv_en : d.pro_cgv_fr;
    if (cgvId) {
      const { rows: cv } = await tx.query('SELECT id, nom, hash FROM cgv_versions WHERE id=$1', [cgvId]);
      cgv = cv[0] || null;
    }
    const cgvLien = (d.cgv_langue || 'fr') === 'fr' ? d.cgv_url : null;
    if ((cgvLien || cgv) && !cases.accept_cgv) casesManquantes.push('accept_cgv');
    if (!cases.accept_rgpd) casesManquantes.push('accept_rgpd');
    if (!cases.accept_signature) casesManquantes.push('accept_signature');
    if (casesManquantes.length)
      throw new HttpError(400, 'Veuillez cocher toutes les cases obligatoires', { cases_manquantes: casesManquantes });

    // Toutes les dates du devis doivent être cochées (dates convenues, pas de choix) ; nombre de participants
    const options = Array.isArray(d.dates) ? d.dates : [];
    const cochees = Array.isArray(body.dates_confirmees) ? body.dates_confirmees : [];
    const key = o => `${o.date}|${o.mode}|${o.debut || ''}|${o.fin || ''}`;
    const setCochees = new Set(cochees.map(key));
    if (options.some(o => !setCochees.has(key(o))))
      throw new HttpError(400, 'Cochez toutes les dates de la prestation', { champs_manquants: ['dates'] });
    const max = d.participants_max || 1;
    const nb = max === 1 ? 1 : Math.floor(Number(body.participants_nb));
    if (!(nb >= 1) || nb > max)
      throw new HttpError(400, `Indiquez le nombre de participants (1 à ${max})`, { champs_manquants: ['participants'] });
    const datePrestation = d.date_prestation;

    const { rows: lr } = await tx.query(
      `SELECT description, quantite, prix_unitaire_ht, prix_unitaire_ttc FROM devis_lignes WHERE devis_id=$1 ORDER BY position`, [d.id]
    );
    const lignes = (lr.length ? lr : [{ description: d.description, quantite: 1, prix_unitaire_ht: d.montant_ht, prix_unitaire_ttc: d.montant_ttc }])
      .map(l => ({ description: l.description, quantite: String(l.quantite), prix_unitaire_ht: String(l.prix_unitaire_ht), prix_unitaire_ttc: l.prix_unitaire_ttc == null ? null : String(l.prix_unitaire_ttc) }));

    // Ce que le client a vu et signé — l'ordre des clés est fixe (hash stable)
    const snapshot = {
      devis_id: d.id, numero: d.numero, pro_id: d.pro_id,
      objet: d.objet, date_prestation: datePrestation, dates: options.map(labelDate), participants: nb, participants_max: max, description: d.description, lignes,
      prix_mode: d.prix_mode || 'ht', tva_mode: d.tva_mode || null,
      montant_ht: String(d.montant_ht), tva_pct: String(d.tva_pct), montant_ttc: String(d.montant_ttc),
      client: { nom: client.nom, email: client.email, tel: client.tel, adresse: client.adresse },
      cgv_langue: d.cgv_langue || 'fr', cgv_url: cgvLien || null, cgv_nom: cgv ? cgv.nom : null, cgv_hash: cgv ? cgv.hash : null, cases,
    };
    const hash = crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');

    await tx.query(
      `UPDATE devis SET statut='signe', client_nom=$2, client_email=$3, client_tel=$4, client_adresse=$5,
         date_prestation=$6, participants_nb=$7, cgv_version_id=$8 WHERE id=$1`,
      [d.id, client.nom, client.email || null, client.tel || null, client.adresse || null,
       datePrestation, nb, cgv ? cgv.id : null]
    );
    const nom_signe = str(body.nom_signe) || client.nom;
    const { rows: sg } = await tx.query(
      `INSERT INTO signatures (devis_id, nom_signe, ip_address, user_agent, contenu_snapshot, contenu_hash)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6) RETURNING signe_at`,
      [d.id, nom_signe, ip, ua, JSON.stringify(snapshot), hash]
    );
    return { devis_id: d.id, signe_at: sg[0].signe_at, hash };
  });
}

module.exports = { createDevis, getPublicDevis, getLignes, signDevis, CHAMPS };
