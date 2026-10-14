import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../api'

const fmt = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)

const EXPIRE_OPTIONS = [7, 14, 30, 60]
const CHAMPS = [
  { k: 'nom', label: 'Nom et prénom', field: 'client_nom', type: 'text', ph: 'Jean Martin', locked: true },
  { k: 'email', label: 'Email', field: 'client_email', type: 'email', ph: 'jean@exemple.fr' },
  { k: 'tel', label: 'Téléphone', field: 'client_tel', type: 'tel', ph: '06 12 34 56 78' },
  { k: 'adresse', label: 'Adresse de facturation', field: 'client_adresse', type: 'text', ph: '12 rue des Alpes, 74000 Annecy' },
]
const emptyLigne = () => ({ description: '', quantite: '1', prix_unitaire_ht: '' })

export default function NewDevis() {
  const nav = useNavigate()
  const [profil, setProfil] = useState(null)
  const [form, setForm] = useState({
    objet: '', date_prestation: '', tva_pct: '20', expire_days: 30,
    client_nom: '', client_email: '', client_tel: '', client_adresse: '',
  })
  const [lignes, setLignes] = useState([emptyLigne()])
  const [requis, setRequis] = useState({ nom: true, email: true, tel: true, adresse: false })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.get('/api/profil').then(({ data }) => {
      setProfil(data)
      if (data.tva_franchise) setForm(f => ({ ...f, tva_pct: '0' }))
    }).catch(() => {})
  }, [])

  const franchise = !!profil?.tva_franchise
  const profilIncomplet = profil && (!profil.adresse || !profil.siret)

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const setL = (i, k) => e => setLignes(ls => ls.map((l, j) => (j === i ? { ...l, [k]: e.target.value } : l)))

  const ht = lignes.reduce((s, l) => s + (parseFloat(l.quantite) || 0) * (parseFloat(l.prix_unitaire_ht) || 0), 0)
  const tva = franchise ? 0 : parseFloat(form.tva_pct) || 0
  const ttc = ht * (1 + tva / 100)

  const expireLabel = new Date(Date.now() + form.expire_days * 86400000)
    .toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })

  const submit = async e => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/api/devis', {
        objet: form.objet, date_prestation: form.date_prestation,
        tva_pct: tva, expire_days: form.expire_days,
        client_nom: form.client_nom, client_email: form.client_email,
        client_tel: form.client_tel, client_adresse: form.client_adresse,
        champs_requis: CHAMPS.filter(c => c.locked || requis[c.k]).map(c => c.k),
        lignes: lignes.map(l => ({
          description: l.description, quantite: parseFloat(l.quantite), prix_unitaire_ht: parseFloat(l.prix_unitaire_ht),
        })),
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

        <h1 style={{ marginBottom: 24 }}>Nouveau devis</h1>

        {profilIncomplet && (
          <div className="error-msg" style={{ marginBottom: 16 }}>
            Votre adresse et votre SIRET sont obligatoires sur un devis. <Link to="/profil?requis=1">Compléter mon profil</Link>
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
            <div className="form-group">
              <label>Date de la sortie <span style={{ color: '#b45309' }}>(obligatoire)</span></label>
              <input type="text" required value={form.date_prestation} onChange={set('date_prestation')} placeholder="Samedi 14 mars 2027" maxLength={120} />
              <div className="form-hint">Une prestation de loisirs à date précise n'ouvre pas de droit de rétractation de 14 jours : la date doit figurer sur le devis.</div>
            </div>

            <label style={{ display: 'block', marginBottom: 8 }}>Lignes du devis</label>
            {lignes.map((l, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, padding: '10px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                <input type="text" required value={l.description} onChange={setL(i, 'description')} placeholder="Encadrement guide, 6 h" />
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="number" required min="0.01" step="0.01" value={l.quantite} onChange={setL(i, 'quantite')} style={{ width: 80 }} aria-label="Quantité" />
                  <span>×</span>
                  <input type="number" required min="0" step="0.01" value={l.prix_unitaire_ht} onChange={setL(i, 'prix_unitaire_ht')} placeholder="Prix HT €" style={{ flex: 1 }} aria-label="Prix unitaire HT" />
                  {lignes.length > 1 && (
                    <button type="button" className="btn btn-ghost" onClick={() => setLignes(ls => ls.filter((_, j) => j !== i))} aria-label="Supprimer la ligne">✕</button>
                  )}
                </div>
              </div>
            ))}
            <button type="button" className="btn btn-secondary" style={{ marginTop: 8 }} onClick={() => setLignes(ls => [...ls, emptyLigne()])}>+ Ajouter une ligne</button>

            <div className="form-group" style={{ marginTop: 16 }}>
              <label>TVA</label>
              {franchise ? (
                <div className="form-hint">TVA non applicable (art. 293 B du CGI) — réglé dans votre profil.</div>
              ) : (
                <select value={form.tva_pct} onChange={set('tva_pct')}>
                  <option value="0">0 % (exonéré)</option>
                  <option value="5.5">5,5 %</option>
                  <option value="10">10 %</option>
                  <option value="20">20 %</option>
                </select>
              )}
            </div>

            {ht > 0 && (
              <div style={{ padding: '12px 0', borderTop: '1px solid var(--border)', marginTop: 8 }}>
                <div className="line-item"><span className="line-item-label">HT</span><span className="line-item-value">{fmt(ht)}</span></div>
                <div className="line-item"><span className="line-item-label">TVA {tva} %</span><span className="line-item-value">{fmt(ttc - ht)}</span></div>
                <div className="line-item line-item-total"><span className="line-item-label">Total TTC à payer en une fois</span><span className="line-item-value">{fmt(ttc)}</span></div>
              </div>
            )}
          </div>

          {/* 2. Client */}
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ marginBottom: 4 }}>2. Informations du client</h3>
            <div className="form-hint" style={{ marginBottom: 16 }}>
              Remplissez ce que vous savez. Cochez « Le client doit compléter » pour ce qui manque : il le saisira avant de payer.
            </div>
            {CHAMPS.map(c => {
              const vide = !form[c.field].trim()
              return (
                <div className="form-group" key={c.k}>
                  <label style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span>{c.label}</span>
                    {c.locked ? (
                      <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--fg3)' }}>toujours demandé</span>
                    ) : (
                      <span style={{ fontWeight: 400, fontSize: 12 }}>
                        <input type="checkbox" checked={requis[c.k]} onChange={e => setRequis(r => ({ ...r, [c.k]: e.target.checked }))} style={{ width: 'auto', marginRight: 6 }} />
                        Le client doit compléter
                      </span>
                    )}
                  </label>
                  <input type={c.type} value={form[c.field]} onChange={set(c.field)} placeholder={c.ph} />
                  {(c.locked || requis[c.k]) && vide && <div className="form-hint" style={{ color: '#b45309' }}>Sera demandé au client (à renseigner).</div>}
                </div>
              )
            })}
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
