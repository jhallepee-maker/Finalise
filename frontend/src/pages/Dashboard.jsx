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
  const { user, logout } = useAuth()
  const [devis, setDevis] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/devis')
      .then(r => setDevis(r.data))
      .finally(() => setLoading(false))
  }, [])

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
