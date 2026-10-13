import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import api from '../api'

const fmt = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)

// Stripe instance — chargée une seule fois
const stripePromise = import.meta.env.VITE_STRIPE_PUBLIC_KEY
  ? loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY)
  : null

// ─── Formulaire paiement Stripe ───────────────────────────
function PaymentForm({ devis, onSuccess }) {
  const stripe   = useStripe()
  const elements = useElements()
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  const pay = async e => {
    e.preventDefault()
    if (!stripe || !elements) return
    setLoading(true)
    setError('')
    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/p/${devis.token_unique}?paid=1`,
      },
      redirect: 'if_required',
    })
    if (stripeError) {
      setError(stripeError.message)
      setLoading(false)
    } else {
      onSuccess()
    }
  }

  return (
    <form onSubmit={pay}>
      {error && <div className="error-msg" style={{ marginBottom: 16 }}>{error}</div>}
      <PaymentElement options={{ layout: 'tabs' }} />
      <button
        type="submit"
        className="btn btn-primary btn-lg"
        style={{ marginTop: 20 }}
        disabled={!stripe || loading}
      >
        {loading ? 'Paiement en cours…' : `Payer ${fmt(devis.montant_ttc)}`}
      </button>
      <div className="legal-notice" style={{ textAlign: 'center', marginTop: 12 }}>
        Paiement sécurisé · Stripe · Vos données bancaires ne sont jamais stockées
      </div>
    </form>
  )
}

// ─── Progress steps ──────────────────────────────────────
function Steps({ current }) {
  const steps = [
    { key: 'view', label: 'Devis' },
    { key: 'sign', label: 'Signature' },
    { key: 'pay',  label: 'Paiement' },
  ]
  const idx = { view: 0, sign: 1, pay: 2, pay_pending: 2, done: 3 }
  const cur = idx[current] ?? 0

  return (
    <div className="steps-bar">
      {steps.map((s, i) => (
        <div key={s.key} className={`step ${i < cur ? 'step-done' : i === cur ? 'step-active' : 'step-todo'}`}>
          <div className="step-dot">{i < cur ? '✓' : i + 1}</div>
          <div className="step-label">{s.label}</div>
          {i < steps.length - 1 && <div className="step-line" />}
        </div>
      ))}
    </div>
  )
}

// ─── Page principale ─────────────────────────────────────
export default function ClientPage() {
  const { token } = useParams()
  const [devis, setDevis]           = useState(null)
  const [error, setError]           = useState('')
  const [step, setStep]             = useState('view') // view | sign | pay | done
  const [clientSecret, setClientSecret] = useState(null)

  // Signature
  const [nomSigne, setNomSigne]   = useState('')
  const [accepted, setAccepted]   = useState(false)
  const [signLoading, setSignLoading] = useState(false)
  const [signError, setSignError] = useState('')

  useEffect(() => {
    // Retour depuis redirection Stripe
    const params = new URLSearchParams(window.location.search)
    if (params.get('paid') === '1') { setStep('done'); return }

    api.get(`/api/devis/token/${token}`)
      .then(r => {
        const d = r.data
        setDevis(d)
        if (d.statut === 'paye') { setStep('done'); return }
        if (d.statut === 'signe') { initPayment(d); return }
      })
      .catch(() => setError('Ce lien est invalide ou a expiré.'))
  }, [token])

  const initPayment = async (d) => {
    try {
      const { data } = await api.post('/api/stripe/create-payment-intent', { token })
      setClientSecret(data.client_secret)
      setStep('pay')
    } catch (err) {
      // Pro pas encore connecté à Stripe → afficher message
      setStep('pay_pending')
    }
  }

  const sign = async e => {
    e.preventDefault()
    if (!accepted) { setSignError('Veuillez cocher la case de consentement.'); return }
    setSignLoading(true)
    setSignError('')
    try {
      await api.post('/api/paiement/signer', { token, nom_signe: nomSigne })
      setDevis(d => ({ ...d, statut: 'signe' }))
      await initPayment(devis)
    } catch (err) {
      setSignError(err.response?.data?.error || 'Erreur lors de la signature')
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

  if (!devis && step !== 'done') return <div className="loading"><div className="spinner" /></div>

  if (step === 'done') return (
    <div className="success-page">
      <div className="success-icon">✓</div>
      <h2>Paiement confirmé</h2>
      {devis && (
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-.5px', fontVariantNumeric: 'tabular-nums', margin: '4px 0 8px' }}>
          {fmt(devis.montant_ttc)}
        </div>
      )}
      <p>Merci — votre paiement a bien été reçu. Une confirmation vous sera transmise par le prestataire.</p>
    </div>
  )

  const stripeOptions = clientSecret ? {
    clientSecret,
    appearance: {
      theme: 'stripe',
      variables: {
        colorPrimary: '#0f0f0f',
        borderRadius: '10px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
      },
    },
  } : null

  return (
    <div className="client-page">
      <div className="client-header">
        <div className="client-logo">Finalise</div>
        {devis?.pro_nom && (
          <div className="client-pro">Devis de {devis.pro_nom}{devis.activite ? ` · ${devis.activite}` : ''}</div>
        )}
      </div>

      <Steps current={step} />

      {/* Récap devis */}
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

      {/* Étape : signature */}
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
              Signature électronique au sens des articles 1366-1367 du Code civil. Date, heure, adresse IP et identifiant de navigateur sont enregistrés comme preuve d'engagement. Ce document constitue un accord contractuel entre les parties.
            </div>
          </form>
        </div>
      )}

      {/* Étape : paiement Stripe */}
      {step === 'pay' && clientSecret && stripePromise && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <span style={{ color: 'var(--green)', fontSize: 18 }}>✓</span>
            <span style={{ fontSize: 14, color: 'var(--fg2)' }}>Devis signé — finalisez le paiement</span>
          </div>
          <div className="card">
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div className="montant-display">{fmt(devis.montant_ttc)}</div>
              <div style={{ fontSize: 13, color: 'var(--fg2)', marginTop: 4 }}>à régler maintenant</div>
            </div>
            <Elements stripe={stripePromise} options={stripeOptions}>
              <PaymentForm devis={devis} onSuccess={() => setStep('done')} />
            </Elements>
          </div>
        </div>
      )}

      {/* Stripe pas encore configuré */}
      {step === 'pay_pending' && (
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
          <h3>Paiement bientôt disponible</h3>
          <p style={{ color: 'var(--fg2)', fontSize: 14, marginTop: 8 }}>
            Le prestataire finalise la configuration du paiement. Vous serez contacté sous peu.
          </p>
        </div>
      )}
    </div>
  )
}
