import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import api from '../api'
import { buildMessage, waLink, mailLink } from '../share'
import { pushState, enablePush, disablePush } from '../push'

const LABELS = {
  en_attente: 'En attente',
  signe:      'Signé',
  paye:       'Payé',
  expire:     'Expiré',
}

const fmt = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)

function StatTile({ label, value, sub, accent }) {
  return (
    <div style={{
      flex: 1, minWidth: 0,
      padding: '16px 18px',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      boxShadow: 'var(--shadow)',
    }}>
      <div style={{ fontSize: 11, color: 'var(--fg3)', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{
        fontSize: 22,
        fontWeight: 700,
        letterSpacing: '-.5px',
        fontVariantNumeric: 'tabular-nums',
        color: accent || 'var(--fg)',
      }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: 'var(--fg3)', marginTop: 2 }}>{sub}</div>
      )}
    </div>
  )
}

export default function Dashboard() {
  const [pro, setPro] = useState(null)
  const [push, setPush] = useState(null)
  const [pushErr, setPushErr] = useState('')
  useEffect(() => { pushState().then(setPush) }, [])
  const togglePush = async () => { try { if (push === 'on') await disablePush(); else await enablePush() } catch (e) { setPushErr(e.message) } setPush(await pushState()) }
  const actAs = (() => { try { return JSON.parse(localStorage.getItem('actAs') || 'null') } catch { return null } })()
  useEffect(() => { api.get('/api/profil').then(r => setPro(r.data)).catch(() => {}) }, [])
  const { user, logout, refreshUser } = useAuth()
  const [devis, setDevis]             = useState([])
  const [loading, setLoading]         = useState(true)
  const [stripeLoading, setStripeLoading] = useState(false)
  const [stripeMsg, setStripeMsg]     = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('stripe') === 'ok')      { setStripeMsg('✓ Compte Stripe connecté avec succès !'); refreshUser() }
    if (params.get('stripe') === 'refresh') setStripeMsg('Onboarding Stripe interrompu — veuillez recommencer.')
    if (params.get('stripe')) window.history.replaceState({}, '', '/')

    api.get('/api/devis')
      .then(r => setDevis(r.data))
      .finally(() => setLoading(false))
  }, [])

  const connectStripe = async () => {
    setStripeLoading(true)
    setStripeMsg('')
    try {
      const { data } = await api.post('/api/stripe/onboard')
      window.location.href = data.url
    } catch (err) {
      setStripeMsg(err.response?.data?.error || 'Erreur lors de la connexion Stripe')
      setStripeLoading(false)
    }
  }

  const profilOk = !!(pro && pro.adresse && pro.siret && pro.code_postal && pro.ville)
  const cgvOk = !!(pro && (pro.cgv_pdf?.fr || pro.cgv_url))
  const checklist = pro ? [
    { id: 'profil', ok: profilOk, titre: 'Votre profil', aide: 'Adresse et SIRET : obligatoires sur chaque devis.', fait: 'Adresse et SIRET renseignés.', cta: 'Compléter', to: '/profil?requis=1' },
    { id: 'cgv', ok: cgvOk, titre: 'Vos conditions de vente', aide: 'Envoyez vos CGV en PDF : le client les accepte en signant.', fait: 'CGV enregistrées.', cta: 'Envoyer', to: '/profil?requis=1' },
    { id: 'stripe', ok: !!user?.charges_enabled, titre: 'Les paiements', aide: user?.stripe_account_id ? "Votre compte Stripe n'est pas encore actif : vos clients ne peuvent pas payer." : 'Connectez Stripe pour recevoir l\'argent directement sur votre compte.', fait: 'Stripe connecté.', cta: user?.stripe_account_id ? 'Reprendre' : 'Connecter Stripe', onClick: connectStripe, busy: stripeLoading },
    ...(push === 'off' || push === 'on' ? [{ id: 'push', ok: push === 'on', titre: 'Les notifications', aide: 'Soyez prévenu à la seconde où un client signe ou paie.', fait: 'Activées sur cet appareil.', cta: 'Activer', onClick: togglePush }] : []),
    ...(push === 'ios-install' ? [{ id: 'push', ok: false, titre: 'Les notifications', aide: "Sur iPhone : Safari, Partager, « Sur l'écran d'accueil », puis ouvrez Finalise depuis son icône.", cta: '', to: undefined, onClick: undefined }] : []),
  ] : []


  // Calcul des stats
  const totalEncaisse = devis
    .filter(d => d.statut === 'paye')
    .reduce((s, d) => s + Number(d.montant_ttc || 0), 0) // pg renvoie NUMERIC en string

  const enAttente = devis.filter(d => d.statut === 'en_attente').length
  const signes    = devis.filter(d => d.statut === 'signe').length

  return (
    <div className="page">
      <div className="container">
        <div className="topbar">
          <span className="logo">Finalise</span>
          <div className="topbar-actions">
            <span className="hide-sm" style={{ fontSize: 13, color: 'var(--fg2)' }}>
              {user?.prenom || user?.nom}
            </span>
            {push === 'on' && <button className="btn btn-ghost" title="Désactiver les notifications" onClick={togglePush}>🔔</button>}
            <Link to="/equipe" className="btn btn-ghost">Bureau</Link>
            <Link to="/profil" className="btn btn-ghost">Profil</Link>
            <button className="btn btn-ghost hide-sm" onClick={logout}>Déconnexion</button>
          </div>
        </div>

        {actAs && (
          <div className="info-box">
            <span>Vous gérez les devis de <strong>{actAs.nom}</strong>.</span>
            <button className="btn btn-secondary" onClick={() => { try { localStorage.removeItem('actAs') } catch {} window.location.reload() }}>Revenir à mon compte</button>
          </div>
        )}

        {/* Démarrage : ce qu'il reste à faire avant le premier devis */}
        {!actAs && checklist.some(c => !c.ok) && (
          <section className="start-card" aria-label="Pour démarrer">
            <h2>Avant votre premier devis</h2>
            <p className="start-sub">{checklist.filter(c => c.ok).length} sur {checklist.length} étapes terminées</p>
            <ul className="start-list">
              {checklist.map(c => (
                <li key={c.id} className={c.ok ? 'done' : undefined}>
                  <span className="start-mark" aria-hidden="true">{c.ok ? '✓' : ''}</span>
                  <div className="start-text"><strong>{c.titre}</strong><span>{c.ok ? c.fait : c.aide}</span></div>
                  {!c.ok && (c.to
                    ? <Link to={c.to} className="btn btn-secondary">{c.cta}</Link>
                    : <button className="btn btn-primary" onClick={c.onClick} disabled={c.busy}>{c.busy ? 'Un instant…' : c.cta}</button>)}
                </li>
              ))}
            </ul>
            {pushErr && <div className="error-msg">{pushErr}</div>}
          </section>
        )}
        {stripeMsg && (
          <div className={`stripe-msg ${stripeMsg.startsWith('✓') ? 'stripe-msg-ok' : 'stripe-msg-warn'}`}>
            {stripeMsg}
          </div>
        )}

        {/* Stats */}
        {!loading && devis.length > 0 && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
            <StatTile
              label="Encaissé"
              value={fmt(totalEncaisse)}
              accent={totalEncaisse > 0 ? 'var(--green)' : undefined}
            />
            <StatTile
              label="À signer"
              value={enAttente}
              sub={enAttente === 1 ? 'devis' : 'devis'}
            />
            <StatTile
              label="À encaisser"
              value={signes}
              sub={signes === 1 ? 'paiement attendu' : 'paiements attendus'}
              accent={signes > 0 ? 'var(--amber)' : undefined}
            />
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h1>Mes devis</h1>
          <Link to="/devis/new" className="btn btn-primary">+ Nouveau devis</Link>
        </div>

        {loading ? (
          <div className="loading" style={{ height: 200 }}><div className="spinner" /></div>
        ) : devis.length === 0 ? (
          <div className="empty">
            <h3>Aucun devis pour l'instant</h3>
            <p>Créez votre premier devis et envoyez le lien à votre client.</p>
            <Link to="/devis/new" className="btn btn-primary">Créer un devis</Link>
          </div>
        ) : (
          <div className="devis-list">
            {devis.map(d => {
              const url = `${window.location.origin}/p/${d.token_unique}`
              const texte = d.statut === 'en_attente' ? buildMessage(d, pro, url) : ''
              return (
              <div key={d.id} className="devis-item">
              <Link to={`/devis/${d.id}`} className="devis-row">
                <div className="devis-row-left">
                  <span className="devis-client">{d.client_nom || d.objet || 'Devis'}</span>
                  <span className="devis-desc">{d.client_nom ? (d.objet || d.description) : 'Le client renseignera ses informations'}</span>
                </div>
                <div className="devis-row-right">
                  <span className="devis-amount">{fmt(d.montant_ttc)}</span>
                  <span className={`badge badge-${d.statut}`}>{LABELS[d.statut] || d.statut}</span>
                </div>
              </Link>
              {texte && (
                <div className="quick-send">
                  <a href={waLink(d.client_tel, texte)} target="_blank" rel="noreferrer" className="btn btn-secondary">WhatsApp</a>
                  <a href={mailLink(d, pro, texte)} className="btn btn-secondary">Email</a>
                </div>
              )}
              </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
