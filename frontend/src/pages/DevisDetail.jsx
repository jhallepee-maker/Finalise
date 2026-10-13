import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../api'

const LABELS = { en_attente: 'En attente', signe: 'Signé', paye: 'Payé', expire: 'Expiré' }
const fmt = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)

export default function DevisDetail() {
  const { id } = useParams()
  const [devis, setDevis] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    api.get(`/api/devis/${id}`).then(r => setDevis(r.data))
  }, [id])

  if (!devis) return <div className="loading"><div className="spinner" /></div>

  const publicUrl = `${window.location.origin}/p/${devis.token_unique}`

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback: select text
    }
  }

  return (
    <div className="page">
      <div className="container">
        <div className="topbar">
          <Link to="/" className="logo">Finalise</Link>
          <Link to="/" className="btn btn-ghost">← Mes devis</Link>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <h1>{devis.client_nom || 'Client sans nom'}</h1>
          <span className={`badge badge-${devis.statut}`}>{LABELS[devis.statut]}</span>
        </div>

        {/* Lien client */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 12 }}>Lien à envoyer au client</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              readOnly
              value={publicUrl}
              style={{ flex: 1, minWidth: 0, background: 'var(--bg2)', fontSize: 13 }}
              onFocus={e => e.target.select()}
            />
            <button className="btn btn-secondary" onClick={copyLink}>
              {copied ? '✓ Copié' : 'Copier'}
            </button>
          </div>
          <div className="form-hint" style={{ marginTop: 8 }}>
            Le client signe et paie directement via ce lien. Aucun compte requis de son côté.
          </div>
        </div>

        {/* Détails */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 16 }}>Détails</h3>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: 'var(--fg2)', marginBottom: 4 }}>Description</div>
            <div style={{ fontSize: 15 }}>{devis.description}</div>
          </div>

          {devis.client_email && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: 'var(--fg2)', marginBottom: 2 }}>Email client</div>
              <div>{devis.client_email}</div>
            </div>
          )}

          <hr className="divider" />

          <div className="line-item">
            <span className="line-item-label">Montant HT</span>
            <span className="line-item-value">{fmt(devis.montant_ht)}</span>
          </div>
          <div className="line-item">
            <span className="line-item-label">TVA {devis.tva_pct}%</span>
            <span className="line-item-value">{fmt(devis.montant_ttc - devis.montant_ht)}</span>
          </div>
          <div className="line-item line-item-total">
            <span className="line-item-label">Total TTC</span>
            <span className="line-item-value">{fmt(devis.montant_ttc)}</span>
          </div>
        </div>

        <div style={{ fontSize: 12, color: 'var(--fg3)', textAlign: 'center' }}>
          Créé le {new Date(devis.created_at).toLocaleDateString('fr-FR')}
        </div>
      </div>
    </div>
  )
}
