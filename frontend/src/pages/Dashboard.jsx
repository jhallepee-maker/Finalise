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

function fmt(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)
}

export default function Dashboard() {
  const { user, logout, refreshUser } = useAuth()
  const [devis, setDevis]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [stripeLoading, setStripeLoading] = useState(false)
  const [stripeMsg, setStripeMsg]   = useState('')

  useEffect(() => {
    // Retour depuis Stripe onboarding
    const params = new URLSearchParams(window.location.search)
    if (params.get('stripe') === 'ok')   { setStripeMsg('✓ Compte Stripe connecté avec succès !'); refreshUser() }
    if (params.get('stripe') === 'refresh') setStripeMsg('Onboarding Stripe interrompu — veuillez recommencer.')
    // Nettoyer l'URL sans rechargement
    if (params.get('stripe')) window.history.replaceState({}, '', '/dashboard')

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
        {!user?.stripe_account_id && !stripeMsg && (
          <div className="stripe-banner">
            <div>
              <strong>Activez les paiements</strong>
              <span style={{ fontSize: 13, color: 'var(--fg2)', marginLeft: 8 }}>
                Connectez votre compte Stripe pour recevoir les paiements de vos clients.
              </span>
            </div>
            <button
              className="btn btn-primary"
              onClick={connectStripe}
              disabled={stripeLoading}
            >
              {stripeLoading ? 'Redirection…' : 'Connecter Stripe'}
            </button>
          </div>
        )}
        {stripeMsg && (
          <div className={`stripe-msg ${stripeMsg.startsWith('✓') ? 'stripe-msg-ok' : 'stripe-msg-warn'}`}>
            {stripeMsg}
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
