import { useEffect, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import api from '../api'

const fmt = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)

const EXPIRE_OPTIONS = [7, 14, 30, 60]
const CHAMPS = [
  { k: 'nom', label: 'Nom et prénom', field: 'client_nom', type: 'text', ph: 'Jean Martin' },
  { k: 'email', label: 'Email', field: 'client_email', type: 'email', ph: 'jean@exemple.fr' },
  { k: 'tel', label: 'Téléphone', field: 'client_tel', type: 'tel', ph: '06 12 34 56 78' },
  { k: 'adresse', label: 'Adresse de facturation', field: 'client_adresse', type: 'text', ph: '12 rue des Alpes, 74000 Annecy' },
]
const emptyLigne = () => ({ description: '', quantite: '1', prix: '' })
const emptyDate = () => ({ date: '', mode: 'journee', debut: '08:00', fin: '17:00' })

export default function NewDevis() {
  const nav = useNavigate()
  const src = useLocation().state?.from // devis dupliqué (sans dates ni client)
  const srcMulti = !!src && (src.lignes || []).length > 1
  const [profil, setProfil] = useState(null)
  const [form, setForm] = useState({
    objet: src?.objet || '', montant: src && !srcMulti ? String(Number(src.montant_ttc)) : '', cgv_langue: src?.cgv_langue || 'fr', tva_mode: src?.tva_mode || 'incluse', tva_pct: src && Number(src.tva_pct) > 0 ? String(Number(src.tva_pct)) : '20', expire_days: 30, participants_max: String(src?.participants_max || 4), prix_mode: 'ttc',
    client_nom: '', client_email: '', client_tel: '', client_adresse: '',
  })
  const [detail, setDetail] = useState(!!srcMulti)
  const [lignes, setLignes] = useState(srcMulti
    ? src.lignes.map(l => ({ description: l.description, quantite: String(Number(l.quantite)), prix: String(l.prix_unitaire_ttc != null ? Number(l.prix_unitaire_ttc) : Math.round(Number(l.prix_unitaire_ht) * (1 + Number(src.tva_pct || 0) / 100) * 100) / 100) }))
    : [emptyLigne()])
  const [dates, setDates] = useState([emptyDate()])
  const [requis, setRequis] = useState({ nom: true, email: true, tel: true, adresse: false })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.get('/api/profil').then(({ data }) => {
      setProfil(data)
      if (!src) setForm(f => ({
        ...f,
        tva_mode: data.tva_franchise ? 'non_applicable' : 'incluse',
        cgv_langue: data.cgv_pdf?.fr || data.cgv_url ? 'fr' : 'en',
      }))
    }).catch(() => {})
  }, [])

  const franchise = form.tva_mode === 'non_applicable'
  const hasFr = !!(profil?.cgv_pdf?.fr || profil?.cgv_url), hasEn = !!profil?.cgv_pdf?.en
  const profilIncomplet = profil && (!profil.adresse || !profil.siret || (!hasFr && !hasEn))

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const setL = (i, k) => e => setLignes(ls => ls.map((l, j) => (j === i ? { ...l, [k]: e.target.value } : l)))
  const setD = (i, k) => e => setDates(ds => ds.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))

  const ttcMode = franchise || form.prix_mode === 'ttc'
  const tva = franchise ? 0 : parseFloat(form.tva_pct) || 0
  const lignesEff = detail ? lignes : [{ quantite: '1', prix: form.montant }]
  const somme = lignesEff.reduce((s, l) => s + (parseFloat(l.quantite) || 0) * (parseFloat(l.prix) || 0), 0)
  const ttc = ttcMode ? somme : somme * (1 + tva / 100)
  const ht = ttcMode ? ttc / (1 + tva / 100) : somme

  const expireLabel = new Date(Date.now() + form.expire_days * 86400000)
    .toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })

  const submit = async e => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const requisKeys = CHAMPS.filter(c => requis[c.k]).map(c => c.k)
      const { data } = await api.post('/api/devis', {
        objet: form.objet, dates: dates.map(d => d.mode === 'creneau' ? d : { date: d.date, mode: 'journee' }),
        participants_max: parseInt(form.participants_max), prix_mode: ttcMode ? 'ttc' : 'ht',
        tva_mode: form.tva_mode, tva_pct: tva, cgv_langue: form.cgv_langue, expire_days: form.expire_days,
        client_nom: form.client_nom, client_email: form.client_email,
        client_tel: form.client_tel, client_adresse: form.client_adresse,
        champs_requis: requisKeys,
        ...(detail
          ? { lignes: lignes.map(l => ({ description: l.description, quantite: parseFloat(l.quantite), prix: parseFloat(l.prix) })) }
          : { montant: parseFloat(form.montant) }),
      })
      nav(`/devis/${data.id}`)
    } catch (err) {
      if (err.response?.data?.code === 'PROFIL_INCOMPLET') { nav('/profil?requis=1'); return }
      setError(err.response?.data?.error || 'Erreur lors de la création')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <div className="container">
        <div className="topbar">
          <Link to="/" className="logo">Finalise</Link>
          <Link to="/" className="btn btn-ghost">← Retour</Link>
        </div>

        <h1 style={{ marginBottom: 24 }}>{src ? `Nouveau devis (copie de ${src.numero || "devis"})` : 'Nouveau devis'}</h1>

        {profilIncomplet && (
          <div className="error-msg" style={{ marginBottom: 16 }}>
            Votre adresse, votre SIRET et vos CGV (PDF) sont obligatoires pour créer un devis. <Link to="/profil?requis=1">Compléter mon profil</Link>
          </div>
        )}

        <form onSubmit={submit}>
          {error && <div className="error-msg">{error}</div>}

          {/* 1. Prestation */}
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ marginBottom: 16 }}>1. Prestation</h3>
            <div className="form-group">
              <label>Intitulé</label>
              <input type="text" value={form.objet} onChange={set('objet')} placeholder="Journée d'escalade en falaise" maxLength={255} />
            </div>
            <label style={{ display: 'block', marginBottom: 4 }}>Date de la sortie <span style={{ color: 'var(--amber)' }}>(obligatoire)</span></label>
            <div className="form-hint" style={{ marginBottom: 8 }}>
              Toutes les dates ci-dessous font partie de la prestation : le client les confirme une par une en signant.
            </div>
            {dates.map((d, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                <input type="date" required value={d.date} onChange={setD(i, 'date')} style={{ flex: '1 1 150px' }} aria-label="Date" />
                <select value={d.mode} onChange={setD(i, 'mode')} style={{ flex: '1 1 150px' }} aria-label="Durée">
                  <option value="journee">Journée entière</option>
                  <option value="creneau">Créneau horaire</option>
                </select>
                {d.mode === 'creneau' && (
                  <>
                    <input type="time" required value={d.debut} onChange={setD(i, 'debut')} style={{ width: 110 }} aria-label="Début" />
                    <span>→</span>
                    <input type="time" required value={d.fin} onChange={setD(i, 'fin')} style={{ width: 110 }} aria-label="Fin" />
                  </>
                )}
                {dates.length > 1 && (
                  <button type="button" className="btn btn-ghost" onClick={() => setDates(ds => ds.filter((_, j) => j !== i))} aria-label="Supprimer la date">✕</button>
                )}
              </div>
            ))}
            <button type="button" className="btn btn-secondary" style={{ marginBottom: 16 }} onClick={() => setDates(ds => [...ds, emptyDate()])}>+ Ajouter une date</button>

            <div className="form-group">
              <label>Nombre maximum de participants</label>
              <input type="number" required min="1" max="200" step="1" value={form.participants_max} onChange={set('participants_max')} style={{ maxWidth: 120 }} />
              <div className="form-hint">Le client indiquera combien ils seront (jusqu'à ce maximum). Le prix est global, quel que soit leur nombre.</div>
            </div>

            <div className="form-group">
              <label>TVA</label>
              <div className="choice-row">
                <label className={`choice ${form.tva_mode === 'incluse' ? 'on' : ''}`}>
                  <input type="radio" name="tva_mode" checked={form.tva_mode === 'incluse'} onChange={() => setForm(f => ({ ...f, tva_mode: 'incluse' }))} />
                  <span>TVA comprise</span>
                </label>
                <label className={`choice ${form.tva_mode === 'non_applicable' ? 'on' : ''}`}>
                  <input type="radio" name="tva_mode" checked={form.tva_mode === 'non_applicable'} onChange={() => setForm(f => ({ ...f, tva_mode: 'non_applicable' }))} />
                  <span>TVA non applicable</span>
                </label>
              </div>
              {!franchise ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                  <select value={form.tva_pct} onChange={set('tva_pct')} style={{ maxWidth: 110 }} aria-label="Taux de TVA">
                    <option value="5.5">5,5 %</option>
                    <option value="10">10 %</option>
                    <option value="20">20 %</option>
                  </select>
                  <div className="form-hint" style={{ margin: 0 }}>Le montant saisi est le prix final TTC.</div>
                </div>
              ) : (
                <div className="form-hint">Le montant saisi est le prix final. Mention « TVA non applicable, art. 293 B du CGI » sur le devis et la facture.</div>
              )}
            </div>

            {!detail ? (
              <div className="form-group">
                <label>Montant à payer {franchise ? '(net)' : '(TTC)'}</label>
                <input type="number" required min="0.01" step="0.01" value={form.montant} onChange={set('montant')} placeholder="450" style={{ maxWidth: 180 }} />
                <button type="button" className="btn btn-ghost" style={{ marginTop: 6, padding: 0 }} onClick={() => setDetail(true)}>Détailler en plusieurs lignes</button>
              </div>
            ) : (
              <>
                <label style={{ display: 'block', marginBottom: 8 }}>Lignes du devis</label>
                {lignes.map((l, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, padding: '10px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                    <input type="text" required value={l.description} onChange={setL(i, 'description')} placeholder="Encadrement guide, 6 h" />
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input type="number" required min="0.01" step="0.01" value={l.quantite} onChange={setL(i, 'quantite')} style={{ width: 80 }} aria-label="Quantité" />
                      <span>×</span>
                      <input type="number" required min="0" step="0.01" value={l.prix} onChange={setL(i, 'prix')} placeholder="Prix €" style={{ flex: 1 }} aria-label="Prix unitaire" />
                      {lignes.length > 1 && (
                        <button type="button" className="btn btn-ghost" onClick={() => setLignes(ls => ls.filter((_, j) => j !== i))} aria-label="Supprimer la ligne">✕</button>
                      )}
                    </div>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setLignes(ls => [...ls, emptyLigne()])}>+ Ajouter une ligne</button>
                  <button type="button" className="btn btn-ghost" onClick={() => setDetail(false)}>Un seul montant</button>
                </div>
              </>
            )}

            {hasFr && hasEn && (
              <div className="form-group" style={{ marginTop: 16 }}>
                <label>Langue des CGV pour ce devis</label>
                <div className="choice-row">
                  {[['fr', 'Français'], ['en', 'English']].map(([v, t]) => (
                    <label key={v} className={`choice ${form.cgv_langue === v ? 'on' : ''}`}>
                      <input type="radio" name="cgv_langue" checked={form.cgv_langue === v} onChange={() => setForm(f => ({ ...f, cgv_langue: v }))} />
                      <span>{t}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {somme > 0 && (
              <div style={{ padding: '12px 0', borderTop: '1px solid var(--border)', marginTop: 8 }}>
                {franchise ? (
                  <div className="line-item line-item-total"><span className="line-item-label">Total à payer en une fois</span><span className="line-item-value">{fmt(ttc)}</span></div>
                ) : (
                  <>
                    <div className="line-item"><span className="line-item-label">HT</span><span className="line-item-value">{fmt(ht)}</span></div>
                    <div className="line-item"><span className="line-item-label">TVA {tva} %</span><span className="line-item-value">{fmt(ttc - ht)}</span></div>
                    <div className="line-item line-item-total"><span className="line-item-label">Total TTC à payer en une fois</span><span className="line-item-value">{fmt(ttc)}</span></div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* 2. Client */}
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ marginBottom: 4 }}>2. Informations du client</h3>
            <div className="form-hint" style={{ marginBottom: 16 }}>
              Remplissez ce que vous savez. Cochez « Le client doit compléter » pour ce qui manque : il le saisira avant de payer.
            </div>
            {CHAMPS.map(c => (
              <div className="form-group" key={c.k}>
                <label style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <span>{c.label}</span>
                  <span style={{ fontWeight: 400, fontSize: 12 }}>
                    <input type="checkbox" checked={requis[c.k]} style={{ width: 'auto', marginRight: 6 }}
                      onChange={e => {
                        const on = e.target.checked
                        setRequis(r => ({ ...r, [c.k]: on }))
                        if (on) setForm(f => ({ ...f, [c.field]: '' }))
                      }} />
                    Le client doit compléter
                  </span>
                </label>
                <input type={c.type} value={form[c.field]} disabled={requis[c.k]}
                  onChange={e => { set(c.field)(e); if (e.target.value && requis[c.k]) setRequis(r => ({ ...r, [c.k]: false })) }}
                  placeholder={requis[c.k] ? 'Sera saisi par le client' : c.ph} />
              </div>
            ))}
          </div>

          {/* 3. Validité */}
          <div className="card" style={{ marginBottom: 24 }}>
            <h3 style={{ marginBottom: 16 }}>3. Validité du devis</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {EXPIRE_OPTIONS.map(v => (
                <button key={v} type="button" className={`btn ${form.expire_days === v ? 'btn-primary' : 'btn-secondary'}`} style={{ minWidth: 90 }}
                  onClick={() => setForm(f => ({ ...f, expire_days: v }))}>{v} jours</button>
              ))}
            </div>
            <div className="form-hint" style={{ marginTop: 10 }}>Le lien expirera le <strong>{expireLabel}</strong></div>
          </div>

          <button type="submit" className="btn btn-primary btn-lg" disabled={loading || profilIncomplet}>
            {loading ? 'Création…' : 'Créer le devis et générer le lien'}
          </button>
        </form>
      </div>
    </div>
  )
}
