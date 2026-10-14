import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api'

const F = [
  ['prenom', 'Prénom', 'text'], ['nom', 'Nom', 'text'], ['activite', 'Activité', 'text'],
  ['siret', 'SIRET (14 chiffres)', 'text'], ['telephone', 'Téléphone', 'tel'],
  ['adresse', 'Adresse', 'text'], ['code_postal', 'Code postal', 'text'], ['ville', 'Ville', 'text'],
]

export default function Profil() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [p, setP] = useState(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)
  const [cgvBusy, setCgvBusy] = useState(false)

  useEffect(() => { api.get('/api/profil').then(({ data }) => setP(data)).catch(() => setError('Chargement impossible')) }, [])
  if (!p) return <div className="loading"><div className="spinner" /></div>

  const set = k => e => { setSaved(false); setP(v => ({ ...v, [k]: e.target.value })) }
  const manque = k => params.get('requis') && (k === 'adresse' || k === 'siret') && !p[k]
  const cgvOk = !!(p.cgv_pdf || p.cgv_url)

  const uploadCgv = async e => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setError('')
    if (f.type !== 'application/pdf') { setError('Le fichier doit être un PDF'); return }
    if (f.size > 5 * 1024 * 1024) { setError('PDF trop lourd (5 Mo maximum)'); return }
    setCgvBusy(true)
    try {
      const { data } = await api.put(`/api/profil/cgv?nom=${encodeURIComponent(f.name)}`, f, { headers: { 'Content-Type': 'application/pdf' } })
      setP(v => ({ ...v, cgv_pdf: data }))
    } catch (err) { setError(err.response?.data?.error || "Échec de l'envoi du PDF") } finally { setCgvBusy(false) }
  }
  const removeCgv = async () => {
    try { await api.delete('/api/profil/cgv'); setP(v => ({ ...v, cgv_pdf: null })) } catch { setError('Suppression impossible') }
  }

  const submit = async e => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      const { data } = await api.put('/api/profil', p)
      setP(v => ({ ...data, cgv_pdf: v.cgv_pdf })); setSaved(true)
      if (params.get('requis') && data.adresse && data.siret && (data.cgv_pdf || data.cgv_url)) nav('/devis/new')
    } catch (err) { setError(err.response?.data?.error || 'Erreur') } finally { setLoading(false) }
  }

  return (
    <div className="page"><div className="container">
      <div className="topbar">
        <Link to="/" className="logo">Finalise</Link>
        <Link to="/" className="btn btn-ghost">← Retour</Link>
      </div>
      <h1 style={{ marginBottom: 8 }}>Mon profil</h1>
      <p className="form-hint" style={{ marginBottom: 24 }}>Ces informations apparaissent sur vos devis et vos factures.</p>
      <form onSubmit={submit}>
        {error && <div className="error-msg">{error}</div>}
        {saved && <div className="form-hint" style={{ color: 'var(--green)', marginBottom: 12 }}>Profil enregistré.</div>}
        <div className="card" style={{ marginBottom: 16 }}>
          {F.map(([k, label, type]) => (
            <div className="form-group" key={k}>
              <label>{label}{manque(k) && <span style={{ color: 'var(--amber)' }}> — à renseigner</span>}</label>
              <input type={type} value={p[k] || ''} onChange={set(k)} required={k === 'nom'}
                style={manque(k) ? { border: '2px solid var(--amber)', background: 'var(--amber-bg)' } : undefined} />
            </div>
          ))}
          <label className="checkbox-row">
            <input type="checkbox" checked={!!p.tva_franchise} onChange={e => { setSaved(false); setP(v => ({ ...v, tva_franchise: e.target.checked })) }} />
            <span>TVA non applicable (franchise en base, art. 293 B du CGI)</span>
          </label>
        </div>
        <div className="card" style={{ marginBottom: 24, ...(params.get('requis') && !cgvOk ? { border: '2px solid var(--amber)' } : {}) }}>
          <h3 style={{ marginBottom: 4 }}>Conditions générales de vente <span style={{ color: 'var(--amber)', fontSize: 13 }}>(obligatoire)</span></h3>
          <div className="form-hint" style={{ marginBottom: 12 }}>
            Le client devra cocher « J'accepte les CGV » avant de payer. Vos conditions de remboursement figurent dans vos CGV. La version acceptée est conservée avec la signature.
          </div>
          {p.cgv_pdf ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <span style={{ color: 'var(--green)' }}>✓</span>
              <strong style={{ fontSize: 14, wordBreak: 'break-all' }}>{p.cgv_pdf.nom}</strong>
              <span className="form-hint">({Math.round(p.cgv_pdf.taille / 1024)} Ko, envoyé le {new Date(p.cgv_pdf.created_at).toLocaleDateString('fr-FR')})</span>
              <button type="button" className="btn btn-ghost" onClick={removeCgv}>Retirer</button>
            </div>
          ) : null}
          <label className="btn btn-secondary" style={{ display: 'inline-block', cursor: 'pointer' }}>
            {cgvBusy ? 'Envoi…' : p.cgv_pdf ? 'Remplacer le PDF' : 'Envoyer mes CGV (PDF, 5 Mo max)'}
            <input type="file" accept="application/pdf" onChange={uploadCgv} disabled={cgvBusy} style={{ display: 'none' }} />
          </label>
          <div className="form-group" style={{ marginTop: 16, marginBottom: 0 }}>
            <label>Ou, à défaut, un lien vers vos CGV (https://…)</label>
            <input type="url" value={p.cgv_url || ''} onChange={set('cgv_url')} placeholder="https://monsite.fr/cgv" />
            <div className="form-hint">Moins sûr : si la page change après la signature, vous ne pourrez pas prouver ce que le client a accepté. Préférez le PDF.</div>
          </div>
        </div>
        <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>{loading ? 'Enregistrement…' : 'Enregistrer'}</button>
      </form>
    </div></div>
  )
}
