import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import api from '../api'

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
      background: 'var(--bg)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      boxShadow: 'var(--shadow)',
    }}>
      <div style={{ fontSize: 11, color: 'var(--fg3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>
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
            <span style={{ fontSize: 13, color: 'var(--fg2)' }}>
              {user?.prenom || user?.nom}
            </span>
            <button className="btn btn-ghost" onClick={logout}>Déconnexion</button>
          </div>
        </div>

        {/* Bandeau Stripe Connect */}
        {!user?.charges_enabled && !stripeMsg && (
          <div className="stripe-banner">
            <div>
              <strong>{user?.stripe_account_id ? 'Terminez votre inscription Stripe' : 'Activez les paiements'}</strong>
              <span style={{ fontSize: 13, color: 'var(--fg2)', marginLeft: 8 }}>
                {user?.stripe_account_id
                  ? "Votre compte n'est pas encore actif : vos clients ne peuvent pas encore payer."
                  : 'Connectez votre compte Stripe pour recevoir les paiements de vos clients.'}
              </span>
            </div>
            <button
              className="btn btn-primary"
              onClick={connectStripe}
              disabled={stripeLoading}
            >
              {stripeLoading ? 'Redirection…' : user?.stripe_account_id ? 'Reprendre' : 'Connecter Stripe'}
            </button>
          </div>
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
              label="Total encaissé"
              value={fmt(totalEncaisse)}
              accent={totalEncaisse > 0 ? 'var(--green)' : undefined}
            />
            <StatTile
              label="En attente"
              value={enAttente}
              sub={enAttente === 1 ? 'devis à signer' : 'devis à signer'}
            />
            <StatTile
              label="Signés"
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
            {devis.map(d => (
              <Link key={d.id} to={`/devis/${d.id}`} className="devis-row">
                <div className="devis-row-left">
                  <span className="devis-client">{d.client_nom || 'Client sans nom'}</span>
                  <span className="devis-desc">{d.description}</span>
                </div>
                <div className="devis-row-right">
                  <span className="devis-amount">{fmt(d.montant_ttc)}</span>
                  <span className={`badge badge-${d.statut}`}>{LABELS[d.statut] || d.statut}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
