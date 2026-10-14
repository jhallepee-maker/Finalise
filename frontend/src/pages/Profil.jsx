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

  useEffect(() => { api.get('/api/profil').then(({ data }) => setP(data)).catch(() => setError('Chargement impossible')) }, [])
  if (!p) return <div className="loading"><div className="spinner" /></div>

  const set = k => e => { setSaved(false); setP(v => ({ ...v, [k]: e.target.value })) }
  const manque = k => params.get('requis') && (k === 'adresse' || k === 'siret') && !p[k]

  const submit = async e => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      const { data } = await api.put('/api/profil', p)
      setP(data); setSaved(true)
      if (params.get('requis') && data.adresse && data.siret) nav('/devis/new')
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
              <label>{label}{manque(k) && <span style={{ color: '#b45309' }}> — à renseigner</span>}</label>
              <input type={type} value={p[k] || ''} onChange={set(k)} required={k === 'nom'}
                style={manque(k) ? { border: '2px solid #d97706', background: '#fffbeb' } : undefined} />
            </div>
          ))}
          <label className="checkbox-row">
            <input type="checkbox" checked={!!p.tva_franchise} onChange={e => { setSaved(false); setP(v => ({ ...v, tva_franchise: e.target.checked })) }} />
            <span>TVA non applicable (franchise en base, art. 293 B du CGI)</span>
          </label>
        </div>
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Lien vers vos conditions générales de vente (https://…)</label>
            <input type="url" value={p.cgv_url || ''} onChange={set('cgv_url')} placeholder="https://monsite.fr/cgv" />
            <div className="form-hint">Si renseigné, le client devra cocher « J'accepte les CGV » avant de payer. Vos conditions de remboursement figurent dans vos CGV.</div>
          </div>
        </div>
        <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>{loading ? 'Enregistrement…' : 'Enregistrer'}</button>
      </form>
    </div></div>
  )
}
