const crypto = require('crypto');
const db = require('../db');
const { HttpError } = require('../lib/httpError');
const { nextNumero } = require('../lib/numerotation');

// Champs client que le devis peut exiger : clé côté API → colonne en base
const CHAMPS = { nom: 'client_nom', email: 'client_email', tel: 'client_tel', adresse: 'client_adresse' };
const CHAMPS_LABELS = { nom: 'nom et prénom', email: 'email', tel: 'téléphone', adresse: 'adresse' };
const DEFAULT_REQUIS = ['nom', 'email', 'tel'];
const TVA_VALUES = [0, 5.5, 10, 20];

const r2 = n => Math.round(n * 100) / 100;
const str = (v, max = 255) => String(v ?? '').trim().slice(0, max);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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
    const prix = Number(l.prix_unitaire_ht);
    if (!description) throw new HttpError(400, `Ligne ${i + 1} : description manquante`);
    if (!(quantite > 0) || quantite > 10000) throw new HttpError(400, `Ligne ${i + 1} : quantité invalide`);
    if (!(prix >= 0) || prix > 1e6) throw new HttpError(400, `Ligne ${i + 1} : prix invalide`);
    return { description, quantite: r2(quantite), prix_unitaire_ht: r2(prix) };
  });
}

// ─── Création ────────────────────────────────────────────────
async function createDevis(proId, body) {
  const { rows: pr } = await db.query('SELECT * FROM pros WHERE id=$1', [proId]);
  const pro = pr[0];
  if (!pro) throw new HttpError(401, 'Compte introuvable');
  if (!pro.adresse || !pro.siret)
    throw new HttpError(422, 'Complétez votre profil (adresse et SIRET) avant de créer un devis.', { code: 'PROFIL_INCOMPLET' });

  const lignes = parseLignes(body);
  const montant_ht = r2(lignes.reduce((s, l) => s + l.quantite * l.prix_unitaire_ht, 0));
  if (!(montant_ht > 0)) throw new HttpError(400, 'Le total du devis doit être supérieur à 0');

  const date_prestation = str(body.date_prestation, 120);
  if (!date_prestation)
    throw new HttpError(400, 'Indiquez la date de la prestation (elle conditionne le droit de rétractation du client).');

  // Franchise en base de TVA : toujours 0 %
  const tvaIn = Number(body.tva_pct ?? 20);
  const tva_pct = pro.tva_franchise ? 0 : (TVA_VALUES.includes(tvaIn) ? tvaIn : 20);

  const requis = Array.isArray(body.champs_requis)
    ? body.champs_requis.filter(k => CHAMPS[k])
    : DEFAULT_REQUIS;
  if (!requis.includes('nom')) requis.unshift('nom'); // le signataire doit toujours être identifié

  const email = str(body.client_email);
  if (email && !EMAIL_RE.test(email)) throw new HttpError(400, 'Email du client invalide');

  const objet = str(body.objet, 255);
  const description = objet || lignes.map(l => l.description).join(' · ').slice(0, 500);
  const expireDays = Math.min(Math.max(parseInt(body.expire_days) || 30, 1), 90);
  const expire_at = new Date(Date.now() + expireDays * 86400000);
  const token = crypto.randomBytes(32).toString('hex');

  return db.tx(async tx => {
    const numero = await nextNumero(tx, proId, 'devis');
    const { rows } = await tx.query(
      `INSERT INTO devis (pro_id, token_unique, numero, objet, date_prestation, description,
         client_nom, client_email, client_tel, client_adresse, montant_ht, tva_pct, expire_at, champs_requis)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb) RETURNING *`,
      [proId, token, numero, objet || null, date_prestation, description,
       str(body.client_nom) || null, email || null, str(body.client_tel, 30) || null, str(body.client_adresse, 500) || null,
       montant_ht, tva_pct, expire_at, JSON.stringify(requis)]
    );
    const devis = rows[0];
    for (let i = 0; i < lignes.length; i++) {
      await tx.query(
        `INSERT INTO devis_lignes (devis_id, position, description, quantite, prix_unitaire_ht) VALUES ($1,$2,$3,$4,$5)`,
        [devis.id, i, lignes[i].description, lignes[i].quantite, lignes[i].prix_unitaire_ht]
      );
    }
    return { ...devis, lignes, lien_unique: `${process.env.FRONTEND_URL}/p/${token}` };
  });
}

// ─── Lecture ─────────────────────────────────────────────────
async function getLignes(devisId) {
  const { rows } = await db.query(
    `SELECT description, quantite, prix_unitaire_ht FROM devis_lignes WHERE devis_id=$1 ORDER BY position`, [devisId]
  );
  return rows;
}

// Vue publique pour le client (lien unique). Retourne null si introuvable.
async function getPublicDevis(token) {
  const { rows } = await db.query(
    `SELECT d.*, p.nom AS pro_nom, p.prenom AS pro_prenom, p.activite, p.cgv_url, p.tva_franchise
       FROM devis d JOIN pros p ON d.pro_id = p.id WHERE d.token_unique=$1`, [token]
  );
  const d = rows[0];
  if (!d) return null;
  if (d.expire_at && new Date(d.expire_at) < new Date() && d.statut === 'en_attente')
    throw new HttpError(410, 'Lien expiré');
  let lignes = await getLignes(d.id);
  // Devis créés avant la V1 : une seule ligne synthétique
  if (!lignes.length) lignes = [{ description: d.description, quantite: 1, prix_unitaire_ht: d.montant_ht }];
  return {
    id: d.id, token_unique: d.token_unique, numero: d.numero, objet: d.objet || null,
    description: d.description, date_prestation: d.date_prestation, lignes,
    montant_ht: d.montant_ht, tva_pct: d.tva_pct, montant_ttc: d.montant_ttc,
    tva_franchise: !!d.tva_franchise,
    statut: d.statut, expire_at: d.expire_at,
    pro_nom: [d.pro_prenom, d.pro_nom].filter(Boolean).join(' '), activite: d.activite,
    cgv_url: d.cgv_url || null,
    champs_requis: Array.isArray(d.champs_requis) ? d.champs_requis : DEFAULT_REQUIS,
    client: { nom: d.client_nom || '', email: d.client_email || '', tel: d.client_tel || '', adresse: d.client_adresse || '' },
  };
}

// ─── Signature ───────────────────────────────────────────────
// Valide les champs requis et les cases cochées, fige un snapshot, calcule son hash.
async function signDevis(token, body, ip, ua) {
  return db.tx(async tx => {
    const { rows } = await tx.query(
      `SELECT d.*, p.cgv_url FROM devis d JOIN pros p ON d.pro_id=p.id WHERE d.token_unique=$1 FOR UPDATE OF d`, [token]
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
    const cases = { accept_devis: c.accept_devis === true, accept_cgv: c.accept_cgv === true, accept_signature: c.accept_signature === true };
    const casesManquantes = [];
    if (!cases.accept_devis) casesManquantes.push('accept_devis');
    if (d.cgv_url && !cases.accept_cgv) casesManquantes.push('accept_cgv');
    if (!cases.accept_signature) casesManquantes.push('accept_signature');
    if (casesManquantes.length)
      throw new HttpError(400, 'Veuillez cocher toutes les cases obligatoires', { cases_manquantes: casesManquantes });

    const { rows: lr } = await tx.query(
      `SELECT description, quantite, prix_unitaire_ht FROM devis_lignes WHERE devis_id=$1 ORDER BY position`, [d.id]
    );
    const lignes = (lr.length ? lr : [{ description: d.description, quantite: 1, prix_unitaire_ht: d.montant_ht }])
      .map(l => ({ description: l.description, quantite: String(l.quantite), prix_unitaire_ht: String(l.prix_unitaire_ht) }));

    // Ce que le client a vu et signé — l'ordre des clés est fixe (hash stable)
    const snapshot = {
      devis_id: d.id, numero: d.numero, pro_id: d.pro_id,
      objet: d.objet, date_prestation: d.date_prestation, description: d.description, lignes,
      montant_ht: String(d.montant_ht), tva_pct: String(d.tva_pct), montant_ttc: String(d.montant_ttc),
      client: { nom: client.nom, email: client.email, tel: client.tel, adresse: client.adresse },
      cgv_url: d.cgv_url || null, cases,
    };
    const hash = crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');

    await tx.query(
      `UPDATE devis SET statut='signe', client_nom=$2, client_email=$3, client_tel=$4, client_adresse=$5 WHERE id=$1`,
      [d.id, client.nom, client.email || null, client.tel || null, client.adresse || null]
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
