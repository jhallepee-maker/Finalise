import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import api from '../api'

const fmt = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)

// Direct charge : une instance Stripe par compte connecté (mise en cache)
const stripeCache = {}
const getStripe = (account) => {
  const key = import.meta.env.VITE_STRIPE_PUBLIC_KEY
  if (!key || !account) return null
  if (!stripeCache[account]) stripeCache[account] = loadStripe(key, { stripeAccount: account })
  return stripeCache[account]
}

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
        {loading ? 'Paiement en cours…' : (
          <span>Commande avec obligation de paiement<br /><span style={{ fontWeight: 500, fontSize: 13 }}>{fmt(devis.montant_ttc)} TTC</span></span>
        )}
      </button>
      <div className="legal-notice" style={{ textAlign: 'center', marginTop: 12 }}>
        Paiement sécurisé · Stripe · Vos données bancaires ne sont jamais stockées
      </div>
    </form>
  )
}

const CHAMPS_CLIENT = [
  { k: 'nom', label: 'Nom et prénom', type: 'text', ph: 'Jean Martin' },
  { k: 'email', label: 'Email', type: 'email', ph: 'jean@exemple.fr' },
  { k: 'tel', label: 'Téléphone', type: 'tel', ph: '06 12 34 56 78' },
  { k: 'adresse', label: 'Adresse de facturation', type: 'text', ph: '12 rue des Alpes, 74000 Annecy' },
]

// ─── Progress steps ──────────────────────────────────────
function Steps({ current }) {
  const steps = [
    { key: 'view', label: 'Devis' },
    { key: 'sign', label: 'Signature' },
    { key: 'pay',  label: 'Paiement' },
  ]
  const idx = { view: 0, sign: 1, pay: 2, pay_pending: 2, confirming: 2, confirming_timeout: 2, done: 3 }
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
  const [stripeAccount, setStripeAccount] = useState(null)

  // Informations client + cases à cocher
  const [client, setClient] = useState({ nom: '', email: '', tel: '', adresse: '' })
  const [cases, setCases]   = useState({ accept_devis: false, accept_cgv: false, accept_signature: false })
  const [missing, setMissing] = useState({ champs: [], cases: [] })
  const [prefilled, setPrefilled] = useState({})
  const [signLoading, setSignLoading] = useState(false)
  const [signError, setSignError] = useState('')

  useEffect(() => {
    // Retour depuis redirection Stripe
    const params = new URLSearchParams(window.location.search)
    // On ne se fie pas au paramètre : on attend que le webhook ait marqué le devis « payé »
    if (params.get('paid') === '1') {
      let tries = 0
      let timer
      const poll = () => api.get(`/api/devis/token/${token}`)
        .then(r => {
          setDevis(r.data)
          if (r.data.statut === 'paye') { setStep('done'); return }
          if (++tries < 15) timer = setTimeout(poll, 2000)
          else setStep('confirming_timeout')
        })
        .catch(() => setError('Ce lien est invalide ou a expiré.'))
      setStep('confirming')
      poll()
      return () => clearTimeout(timer)
    }

    api.get(`/api/devis/token/${token}`)
      .then(r => {
        const d = r.data
        setDevis(d)
        if (d.client) {
          setClient(d.client)
          setPrefilled(Object.fromEntries(Object.entries(d.client).map(([k, v]) => [k, !!v])))
        }
        if (d.statut === 'paye') { setStep('done'); return }
        if (d.statut === 'signe') { initPayment(d); return }
      })
      .catch(() => setError('Ce lien est invalide ou a expiré.'))
  }, [token])

  const initPayment = async (d) => {
    try {
      const { data } = await api.post('/api/stripe/create-payment-intent', { token })
      setClientSecret(data.client_secret)
      setStripeAccount(data.stripe_account)
      setStep('pay')
    } catch (err) {
      // Pro pas encore connecté à Stripe → afficher message
      setStep('pay_pending')
    }
  }

  const sign = async e => {
    e.preventDefault()
    setSignError('')
    const champs = [...new Set(['nom', ...(devis.champs_requis || [])])].filter(k => !client[k].trim())
    const manque = []
    if (!cases.accept_devis) manque.push('accept_devis')
    if (devis.cgv_url && !cases.accept_cgv) manque.push('accept_cgv')
    if (!cases.accept_signature) manque.push('accept_signature')
    setMissing({ champs, cases: manque })
    if (champs.length || manque.length) {
      setSignError('Complétez les champs en orange et cochez les cases obligatoires.')
      return
    }
    setSignLoading(true)
    try {
      await api.post('/api/paiement/signer', { token, client, cases, nom_signe: client.nom })
      setDevis(d => ({ ...d, statut: 'signe' }))
      await initPayment(devis)
    } catch (err) {
      const x = err.response?.data || {}
      setMissing({ champs: x.champs_manquants || [], cases: x.cases_manquantes || [] })
      setSignError(x.error || 'Erreur lors de la signature')
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
      <p style={{ marginTop: 16 }}>
        <a href={`${import.meta.env.VITE_API_URL || ''}/api/paiement/facture/${token}`}
           target="_blank" rel="noreferrer" style={{ fontSize: 14 }}>
          Télécharger la facture acquittée (PDF)
        </a>
      </p>
      <p style={{ marginTop: 8 }}>
        <a href={`${import.meta.env.VITE_API_URL || ''}/api/paiement/justificatif/${token}`}
           target="_blank" rel="noreferrer" style={{ fontSize: 14 }}>
          Télécharger le justificatif de signature (PDF)
        </a>
      </p>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{devis.objet || 'Prestation'}</div>
            {devis.numero && <div style={{ fontSize: 11, color: 'var(--fg3)', fontFamily: 'monospace' }}>{devis.numero}</div>}
          </div>
          {devis.date_prestation && <div style={{ fontSize: 13, color: 'var(--fg2)', marginTop: 4 }}>{devis.date_prestation}</div>}
        </div>
        {devis.lignes.map((l, i) => (
          <div className="line-item" key={i}>
            <span className="line-item-label">{l.description}{Number(l.quantite) !== 1 ? ` × ${Number(l.quantite)}` : ''}</span>
            <span className="line-item-value">{fmt(Number(l.quantite) * Number(l.prix_unitaire_ht))}</span>
          </div>
        ))}
        <div className="line-item" style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8 }}>
          <span className="line-item-label">Total HT</span>
          <span className="line-item-value">{fmt(devis.montant_ht)}</span>
        </div>
        <div className="line-item">
          <span className="line-item-label">{devis.tva_franchise ? 'TVA non applicable (art. 293 B du CGI)' : `TVA ${Number(devis.tva_pct)} %`}</span>
          <span className="line-item-value">{devis.tva_franchise ? '—' : fmt(devis.montant_ttc - devis.montant_ht)}</span>
        </div>
        <div className="line-item line-item-total">
          <span className="line-item-label">Total TTC</span>
          <span className="line-item-value">{fmt(devis.montant_ttc)}</span>
        </div>
      </div>

      {/* Étape : informations + cases + signature */}
      {step === 'view' && (
        <form onSubmit={sign}>
          {signError && <div className="error-msg" style={{ marginBottom: 16 }}>{signError}</div>}

          <div className="signature-block">
            <h3>1. Vos informations</h3>
            <div className="form-hint" style={{ marginBottom: 14 }}>Vérifiez les champs préremplis. Complétez ceux marqués « À renseigner ».</div>
            {CHAMPS_CLIENT.map(c => {
              const requis = c.k === 'nom' || (devis.champs_requis || []).includes(c.k)
              const todo = requis && !client[c.k].trim()
              const err = missing.champs.includes(c.k)
              const badge = !requis ? 'facultatif' : todo ? 'À RENSEIGNER' : (prefilled[c.k] ? 'prérempli' : 'complété')
              return (
                <div className="form-group" key={c.k}>
                  <label htmlFor={`f-${c.k}`} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{c.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 99, padding: '2px 8px',
                      background: todo ? '#fef3c7' : '#f2f2f0', color: todo ? '#92400e' : '#166534' }}>{badge}</span>
                  </label>
                  <input id={`f-${c.k}`} type={c.type} value={client[c.k]} placeholder={c.ph}
                    onChange={e => setClient(v => ({ ...v, [c.k]: e.target.value }))}
                    style={todo || err ? { border: '2px solid #d97706', background: '#fffbeb' } : undefined} />
                </div>
              )
            })}
          </div>

          <div className="signature-block">
            <h3>2. À cocher pour continuer</h3>
            <div className="form-hint" style={{ marginBottom: 14 }}>Ces cases sont obligatoires.</div>
            {[
              ['accept_devis', <>J'ai lu le devis ci-dessus et je l'accepte pour <strong>{fmt(devis.montant_ttc)} TTC</strong>.</>],
              ...(devis.cgv_url ? [['accept_cgv', <>J'ai lu et j'accepte les <a href={devis.cgv_url} target="_blank" rel="noreferrer">conditions générales de vente</a> de {devis.pro_nom}.</>]] : []),
              ['accept_signature', <>Je signe ce devis électroniquement (art. 1366 du Code civil). Mon adresse IP et l'heure sont enregistrées comme preuve.</>],
            ].map(([k, text]) => (
              <label key={k} className="checkbox-row"
                style={missing.cases.includes(k) ? { outline: '2px solid #d97706', borderRadius: 10 } : undefined}>
                <input type="checkbox" checked={cases[k]} onChange={e => setCases(c => ({ ...c, [k]: e.target.checked }))} />
                <span>{text}</span>
              </label>
            ))}
            <div className="legal-notice">
              Prestation de loisirs à date précise{devis.date_prestation ? ` (${devis.date_prestation})` : ''} : le droit de rétractation de 14 jours ne s'applique pas. Le paiement de {fmt(devis.montant_ttc)} est exigé en totalité à la commande.
            </div>
            <button type="submit" className="btn btn-primary btn-lg" disabled={signLoading}>
              {signLoading ? 'Enregistrement…' : 'Signer et passer au paiement'}
            </button>
          </div>
        </form>
      )}

      {/* Étape : paiement Stripe */}
      {step === 'pay' && clientSecret && getStripe(stripeAccount) && (
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
            <Elements stripe={getStripe(stripeAccount)} options={stripeOptions}>
              <PaymentForm devis={devis} onSuccess={() => setStep('done')} />
            </Elements>
          </div>
        </div>
      )}

      {/* Retour de Stripe : confirmation en cours */}
      {(step === 'confirming' || step === 'confirming_timeout') && (
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          {step === 'confirming' ? (
            <>
              <div className="spinner" style={{ margin: '0 auto 16px' }} />
              <h3>Confirmation du paiement…</h3>
              <p style={{ color: 'var(--fg2)', fontSize: 14, marginTop: 8 }}>Cela ne prend que quelques secondes.</p>
            </>
          ) : (
            <>
              <h3>Paiement en cours de traitement</h3>
              <p style={{ color: 'var(--fg2)', fontSize: 14, marginTop: 8 }}>
                Nous n'avons pas encore reçu la confirmation de votre banque. Rechargez cette page dans un instant : si le paiement a abouti, il s'affichera ici.
              </p>
            </>
          )}
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
