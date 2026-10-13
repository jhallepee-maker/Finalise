import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import api from '../api'

const fmt = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)

export default function ClientPage() {
  const { token } = useParams()
  const [devis, setDevis] = useState(null)
  const [error, setError] = useState('')
  const [step, setStep] = useState('view') // view | sign | pay | done

  // Signature
  const [nomSigne, setNomSigne] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [signLoading, setSignLoading] = useState(false)
  const [signError, setSignError] = useState('')

  useEffect(() => {
    api.get(`/api/devis/token/${token}`)
      .then(r => {
        setDevis(r.data)
        if (r.data.statut === 'signe' || r.data.statut === 'paye') setStep('pay')
        if (r.data.statut === 'paye') setStep('done')
      })
      .catch(() => setError('Ce lien est invalide ou a expiré.'))
  }, [token])

  const sign = async e => {
    e.preventDefault()
    if (!accepted) { setSignError('Veuillez cocher la case de consentement.'); return }
    setSignLoading(true)
    setSignError('')
    try {
      await api.post('/api/paiement/signer', { token, nom_signe: nomSigne })
      setStep('pay')
      setDevis(d => ({ ...d, statut: 'signe' }))
    } catch (err) {
      setSignError(err.response?.data?.error || 'Erreur lors de la signature')
    } finally {
      setSignLoading(false)
    }
  }

  if (error) return (
    <div className="client-page">
      <div className="client-header">
        <div className="client-logo">Finalise</div>
      </div>
      <div className="error-msg" style={{ marginTop: 40 }}>{error}</div>
    </div>
  )

  if (!devis) return <div className="loading"><div className="spinner" /></div>

  if (step === 'done') return (
    <div className="success-page">
      <div className="success-icon">✓</div>
      <h2>Paiement confirmé</h2>
      <p>Vous recevrez une confirmation par email avec la preuve archivée.</p>
    </div>
  )

  return (
    <div className="client-page">
      <div className="client-header">
        <div className="client-logo">Finalise</div>
        <div className="client-pro">Devis de {devis.pro_nom || 'votre prestataire'}</div>
      </div>

      {/* Récapitulatif devis */}
      <div className="card devis-card">
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: 'var(--fg2)', marginBottom: 4 }}>Prestation</div>
          <div style={{ fontSize: 15, lineHeight: 1.5 }}>{devis.description}</div>
        </div>

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

      {/* Signature */}
      {step === 'view' && (
        <div className="signature-block">
          <h3>Signature électronique</h3>

          <form onSubmit={sign}>
            {signError && <div className="error-msg" style={{ marginBottom: 16 }}>{signError}</div>}

            <div className="form-group">
              <label>Votre nom complet</label>
              <input
                type="text" required
                value={nomSigne}
                onChange={e => setNomSigne(e.target.value)}
                placeholder="Jean Martin"
              />
            </div>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={accepted}
                onChange={e => setAccepted(e.target.checked)}
              />
              <span>
                Je reconnais avoir lu et accepté les conditions de la prestation, et je signe électroniquement ce devis conformément à l'article 1366 du Code civil.
              </span>
            </label>

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={signLoading || !nomSigne.trim()}
            >
              {signLoading ? 'Signature en cours…' : 'Signer le devis'}
            </button>

            <div className="legal-notice">
              Signature électronique au sens de l'article 1366-1367 du Code civil. Date, heure, adresse IP et identifiant de navigateur sont enregistrés comme preuve d'engagement. Ce document constitue un accord contractuel entre les parties.
            </div>
          </form>
        </div>
      )}

      {/* Paiement — Stripe à brancher */}
      {step === 'pay' && (
        <div>
          <div className="success-page" style={{ minHeight: 'auto', padding: '24px 0' }}>
            <div className="success-icon">✓</div>
            <h2>Devis signé</h2>
            <p>Procédez au paiement pour finaliser.</p>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div className="montant-display">{fmt(devis.montant_ttc)}</div>
              <div style={{ fontSize: 13, color: 'var(--fg2)', marginTop: 4 }}>à régler maintenant</div>
            </div>

            {/* Stripe Elements sera monté ici */}
            <div
              id="stripe-element-mount"
              style={{
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: 12,
                minHeight: 44,
                marginBottom: 16,
                background: 'var(--bg2)',
                color: 'var(--fg3)',
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ← Clés Stripe à configurer
            </div>

            <button className="btn btn-primary btn-lg" disabled>
              Payer {fmt(devis.montant_ttc)}
            </button>

            <div className="legal-notice" style={{ textAlign: 'center', marginTop: 12 }}>
              Paiement sécurisé · Stripe · Vos données bancaires ne sont jamais stockées
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
