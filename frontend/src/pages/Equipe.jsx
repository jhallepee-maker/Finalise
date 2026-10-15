import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../api'

const ROLE = { admin: 'Administrateur', guide: 'Guide', secretaire: 'Secrétaire' }

export default function Equipe() {
  const nav = useNavigate()
  const [data, setData] = useState(null)
  const [nom, setNom] = useState('')
  const [inv, setInv] = useState({ email: '', role: 'guide' })
  const [code, setCode] = useState('')
  const [lien, setLien] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(() => api.get('/api/org').then(r => setData(r.data)).catch(() => setError('Chargement impossible')), [])
  useEffect(() => { load() }, [load])

  const run = async (fn) => { setError(''); try { await fn(); await load() } catch (e) { setError(e.response?.data?.error || 'Action impossible') } }

  const agir = m => { try { localStorage.setItem('actAs', JSON.stringify({ id: m.id, nom: [m.prenom, m.nom].filter(Boolean).join(' ') })) } catch {} nav('/') }

  if (!data) return <div className="page"><div className="container">{error || 'Chargement…'}</div></div>

  return (
    <div className="page"><div className="container" style={{ maxWidth: 720 }}>
      <div className="topbar"><span className="logo">Finalise</span><Link to="/" className="btn btn-ghost">← Retour</Link></div>
      <h1>Bureau</h1>
      {error && <div className="error-msg" style={{ marginBottom: 16 }}>{error}</div>}

      {!data.org ? (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ marginTop: 0 }}>Créer un bureau</h3>
            <p style={{ fontSize: 14, color: 'var(--fg2)' }}>Réunissez des guides et une secrétaire : elle crée et suit les devis au nom de chaque guide, qui garde son propre compte Stripe, ses CGV et ses factures.</p>
            <input value={nom} onChange={e => setNom(e.target.value)} placeholder="Nom du bureau" />
            <button className="btn btn-primary" style={{ marginTop: 10 }} disabled={!nom.trim()} onClick={() => run(() => api.post('/api/org', { nom }))}>Créer</button>
          </div>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>J'ai reçu une invitation</h3>
            <input value={code} onChange={e => setCode(e.target.value)} placeholder="Code d'invitation" />
            <button className="btn btn-secondary" style={{ marginTop: 10 }} disabled={!code.trim()} onClick={() => run(() => api.post('/api/org/accept', { code: code.trim() }))}>Rejoindre</button>
          </div>
        </>
      ) : (
        <>
          <h2 style={{ fontSize: 18 }}>{data.org.nom}</h2>
          <div className="card" style={{ marginBottom: 16 }}>
            {data.membres.map(m => (
              <div key={m.id} style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', padding: '8px 0' }}>
                <div style={{ minWidth: 0 }}>
                  <strong>{[m.prenom, m.nom].filter(Boolean).join(' ')}</strong> <span className="badge">{ROLE[m.org_role]}</span>
                  <div style={{ fontSize: 12, color: 'var(--fg3)' }}>{m.email}{m.org_role !== 'secretaire' && !m.charges_enabled ? ' · paiement Stripe non connecté' : ''}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {['admin', 'secretaire'].includes(data.mon_role) && m.org_role !== 'secretaire' && (
                    <button className="btn btn-secondary" onClick={() => agir(m)}>Gérer ses devis</button>
                  )}
                  {data.mon_role === 'admin' && (
                    <button className="btn btn-ghost" onClick={() => run(() => api.delete(`/api/org/membres/${m.id}`))}>Retirer</button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {data.mon_role === 'admin' && (
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Inviter</h3>
              <p style={{ fontSize: 14, color: 'var(--fg2)' }}>La personne doit déjà avoir un compte Finalise avec cet email, et accepter l'invitation depuis son compte : personne ne peut être ajouté à son insu.</p>
              <input type="email" value={inv.email} onChange={e => setInv({ ...inv, email: e.target.value })} placeholder="Email du compte" />
              <select value={inv.role} onChange={e => setInv({ ...inv, role: e.target.value })} style={{ marginTop: 8 }}>
                <option value="guide">Guide (la secrétaire gère ses devis)</option>
                <option value="secretaire">Secrétaire (gère les devis des guides)</option>
              </select>
              <button className="btn btn-primary" style={{ marginTop: 10 }} disabled={!inv.email.trim()} onClick={() => run(async () => { const { data: r } = await api.post('/api/org/invitations', inv); setLien(r.code); setInv({ ...inv, email: '' }) })}>Créer l'invitation</button>
              {lien && <p style={{ fontSize: 14 }}>Code à transmettre : <code style={{ userSelect: 'all' }}>{lien}</code> (valable 7 jours)</p>}
              {data.invitations?.length > 0 && <ul style={{ fontSize: 13, color: 'var(--fg2)' }}>{data.invitations.map(i => <li key={i.code}>{i.email} · {ROLE[i.role]} · en attente</li>)}</ul>}
            </div>
          )}
          <button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={() => run(async () => { const { data: me } = await api.get('/api/auth/me'); await api.delete(`/api/org/membres/${me.id}`) })}>Quitter ce bureau</button>
        </>
      )}
    </div></div>
  )
}
