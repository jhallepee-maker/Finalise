import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api'
import { useAuth } from '../AuthContext'

const F = [
  ['prenom', 'Prénom', 'text'], ['nom', 'Nom', 'text'], ['activite', 'Activité', 'text'],
  ['siret', 'SIRET (14 chiffres)', 'text'], ['telephone', 'Téléphone', 'tel'],
  ['adresse', 'Adresse', 'text'], ['code_postal', 'Code postal', 'text'], ['ville', 'Ville', 'text'],
]

export default function Profil() {
  const { logout } = useAuth()
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
  const cgvOk = !!(p.cgv_pdf?.fr || p.cgv_pdf?.en || p.cgv_url)

  const uploadCgv = langue => async e => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setError('')
    if (f.type !== 'application/pdf') { setError('Le fichier doit être un PDF'); return }
    if (f.size > 5 * 1024 * 1024) { setError('PDF trop lourd (5 Mo maximum)'); return }
    setCgvBusy(langue)
    try {
      const { data } = await api.put(`/api/profil/cgv?langue=${langue}&nom=${encodeURIComponent(f.name)}`, f, { headers: { 'Content-Type': 'application/pdf' } })
      setP(v => ({ ...v, cgv_pdf: data }))
    } catch (err) { setError(err.response?.data?.error || "Échec de l'envoi du PDF") } finally { setCgvBusy(false) }
  }
  const removeCgv = langue => async () => {
    try { const { data } = await api.delete(`/api/profil/cgv?langue=${langue}`); setP(v => ({ ...v, cgv_pdf: data })) } catch { setError('Suppression impossible') }
  }

  const submit = async e => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      const { data } = await api.put('/api/profil', p)
      setP(v => ({ ...data, cgv_pdf: v.cgv_pdf })); setSaved(true)
      if (params.get('requis') && data.adresse && data.siret && (p.cgv_pdf?.fr || p.cgv_pdf?.en || data.cgv_url)) nav('/devis/new')
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
            <span>TVA non applicable par défaut sur mes devis (franchise en base, art. 293 B du CGI) — modifiable devis par devis</span>
          </label>
        </div>
        <div className="card" style={{ marginBottom: 24, ...(params.get('requis') && !cgvOk ? { border: '2px solid var(--amber)' } : {}) }}>
          <h3 style={{ marginBottom: 4 }}>Conditions générales de vente <span style={{ color: 'var(--amber)', fontSize: 13 }}>(obligatoire)</span></h3>
          <div className="form-hint" style={{ marginBottom: 12 }}>
            Le client devra cocher « J'accepte les CGV » avant de payer. Vos conditions de remboursement figurent dans vos CGV. La version acceptée est conservée avec la signature.
          </div>
          {[['fr', 'Version française'], ['en', 'English version (optionnel)']].map(([l, titre]) => {
            const c = p.cgv_pdf?.[l]
            return (
              <div key={l} style={{ padding: '12px 0', borderTop: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{titre}</div>
                {c && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                    <span style={{ color: 'var(--green)' }}>✓</span>
                    <strong style={{ fontSize: 14, wordBreak: 'break-all' }}>{c.nom}</strong>
                    <span className="form-hint">({Math.round(c.taille / 1024)} Ko, envoyé le {new Date(c.created_at).toLocaleDateString('fr-FR')})</span>
                    <button type="button" className="btn btn-ghost" onClick={removeCgv(l)}>Retirer</button>
                  </div>
                )}
                <label className="btn btn-secondary" style={{ display: 'inline-block', cursor: 'pointer' }}>
                  {cgvBusy === l ? 'Envoi…' : c ? 'Remplacer le PDF' : 'Envoyer le PDF (5 Mo max)'}
                  <input type="file" accept="application/pdf" onChange={uploadCgv(l)} disabled={!!cgvBusy} style={{ display: 'none' }} />
                </label>
              </div>
            )
          })}
          <div className="form-group" style={{ marginTop: 16, marginBottom: 0 }}>
            <label>Ou, à défaut, un lien vers vos CGV (https://…)</label>
            <input type="url" value={p.cgv_url || ''} onChange={set('cgv_url')} placeholder="https://monsite.fr/cgv" />
            <div className="form-hint">Moins sûr : si la page change après la signature, vous ne pourrez pas prouver ce que le client a accepté. Préférez le PDF.</div>
          </div>
        </div>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Médiateur de la consommation</label>
            <textarea rows={3} value={p.mediateur || ''} onChange={set('mediateur')} placeholder="Nom, adresse postale et site web du médiateur dont vous relevez" maxLength={400} />
            <div className="form-hint">Obligatoire pour toute vente à un particulier (art. L612-1 et R616-1 du Code de la consommation). Il sera indiqué à vos clients sur le devis et la facture. Renseignez-le auprès de votre organisation professionnelle ou d'un médiateur référencé.</div>
          </div>
        </div>
        <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>{loading ? 'Enregistrement…' : 'Enregistrer'}</button>
      </form>
      <button className="btn btn-ghost" style={{ marginTop: 24 }} onClick={logout}>Se déconnecter</button>
    </div></div>
  )
}
