import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import api from '../api'
import { calEvents, icsHref } from '../calendar'
import { showTtc, unitPrice, lineTotal } from '../pricing'

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
          <span>Commande avec obligation de paiement<br /><span style={{ fontWeight: 500, fontSize: 13 }}>{fmt(devis.montant_ttc)}{devis.tva_franchise ? '' : ' TTC'}</span></span>
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


function Agenda({ devis, nom }) {
  const ev = calEvents(devis, nom)
  if (!ev.length) return null
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ fontSize: 13, color: 'var(--fg2)', marginBottom: 8 }}>Ajouter à votre agenda</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        <a className="btn btn-secondary" style={{ textDecoration: 'none' }} href={icsHref(devis, nom)} download={`${devis.numero || 'devis'}.ics`}>Apple / Outlook (.ics)</a>
        {ev.map((e, i) => (
          <a key={i} className="btn btn-secondary" style={{ textDecoration: 'none' }} href={e.google} target="_blank" rel="noreferrer">
            Google Agenda{ev.length > 1 ? ` · ${new Date(e.date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}` : ''}
          </a>
        ))}
      </div>
    </div>
  )
}

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
  const [assurance, setAssurance] = useState({ enabled: false })
  const [choixLoading, setChoixLoading] = useState(false)

  // Informations client + cases à cocher
  const [client, setClient] = useState({ nom: '', email: '', tel: '', adresse: '' })
  const [cases, setCases]   = useState({ accept_devis: false, accept_cgv: false, accept_rgpd: false, accept_signature: false })
  const [datesOk, setDatesOk] = useState({})
  const [nbPart, setNbPart] = useState('')
  const API = import.meta.env.VITE_API_URL || ''
  const [prefilled, setPrefilled] = useState({})
  const [signLoading, setSignLoading] = useState(false)
  const [tried, setTried] = useState(false)
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
      // Assurance annulation (si activée côté serveur) : réponse oui/non obligatoire avant le paiement
      const a = (await api.get(`/api/assurance/${token}`).catch(() => ({ data: { enabled: false } }))).data
      setAssurance(a)
      if (a.enabled && !a.choix) { setStep('assurance'); return }
      const { data } = await api.post('/api/stripe/create-payment-intent', { token })
      setClientSecret(data.client_secret)
      setStripeAccount(data.stripe_account)
      setStep('pay')
    } catch (err) {
      // Pro pas encore connecté à Stripe → afficher message
      setStep('pay_pending')
    }
  }

  // Éléments requis (état en direct) : le bouton ne valide pas tant que tout n'est pas fait
  const items = []
  if (devis && step === 'view') {
    const requis = [...new Set(['nom', ...(devis.champs_requis || [])])]
    for (const c of CHAMPS_CLIENT) if (requis.includes(c.k)) items.push({ id: c.k, t: c.label, ok: !!client[c.k].trim() })
    devis.dates.forEach((d, i) => items.push({ id: `d${i}`, t: `Date à confirmer : ${d.label}`, ok: !!datesOk[i] }))
    if (devis.participants_max > 1) items.push({ id: 'participants', t: 'Nombre de participants', ok: !!nbPart })
    items.push({ id: 'accept_devis', t: 'Accepter le devis', ok: !!cases.accept_devis })
    if (devis.has_cgv) items.push({ id: 'accept_cgv', t: 'Accepter les CGV', ok: !!cases.accept_cgv })
    items.push({ id: 'accept_rgpd', t: 'Confidentialité des données', ok: !!cases.accept_rgpd })
    items.push({ id: 'accept_signature', t: 'Signature électronique', ok: !!cases.accept_signature })
  }
  const reste = items.filter(i => !i.ok)
  const isTodo = id => reste.some(r => r.id === id)
  const suffixe = devis && !devis.tva_franchise ? ' TTC' : ''

  const choisirAssurance = async choix => {
    setChoixLoading(true)
    try {
      const { data } = await api.post(`/api/assurance/${token}`, { choix })
      setAssurance(data)
      await initPayment(devis)
    } catch { setError("Impossible d'enregistrer votre choix. Réessayez.") }
    finally { setChoixLoading(false) }
  }

  const sign = async e => {
    e.preventDefault()
    setSignError('')
    if (reste.length) return
    setSignLoading(true)
    try {
      await api.post('/api/paiement/signer', {
        token, client, cases, nom_signe: client.nom,
        dates_confirmees: devis.dates.map(({ date, mode, debut, fin }) => ({ date, mode, debut, fin })),
        participants_nb: devis.participants_max > 1 ? parseInt(nbPart) : 1,
      })
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
      {devis && <Agenda devis={devis} nom={devis.pro_nom} />}
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
        colorPrimary: '#1c5a4d',
        borderRadius: '10px',
        fontFamily: 'Hanken Grotesk, system-ui, sans-serif',
      },
    },
  } : null

  return (
    <div className="client-page">
      <header className="hero">
        <div className="client-logo">Finalise</div>
        <div className="hero-pro">Devis de {devis.pro_nom}{devis.activite ? `, ${devis.activite}` : ''}</div>
        <h1>{devis.objet || 'Votre prestation'}</h1>
        <div className="hero-when">{devis.dates.length ? (devis.dates.length <= 2 ? devis.dates.map(d => d.label).join(' · ') : `${devis.dates.length} dates`) : devis.date_prestation}</div>
        <div className="hero-price">
          <strong>{fmt(devis.montant_ttc)}</strong>
          <span>{devis.tva_franchise ? '' : 'TTC'}</span>
        </div>
      </header>

      <Steps current={step} />

      {/* Récap devis */}
      <div className="card devis-card">
        {devis.numero && <div style={{ fontSize: 12, color: 'var(--fg3)', marginBottom: 6 }}>Devis {devis.numero}</div>}
        {devis.lignes.length > 1 && devis.lignes.map((l, i) => (
          <div className="line-item" key={i}>
            <span className="line-item-label">{l.description}{Number(l.quantite) !== 1 ? ` × ${Number(l.quantite)}` : ''}</span>
            <span className="line-item-value">{fmt(lineTotal(l, devis))}</span>
          </div>
        ))}
        <div style={devis.lignes.length > 1 ? { borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8 } : undefined}>
          {devis.tva_franchise ? (
            <>
              {devis.lignes.length > 1 && (
                <div className="line-item line-item-total">
                  <span className="line-item-label">Total à payer</span>
                  <span className="line-item-value">{fmt(devis.montant_ttc)}</span>
                </div>
              )}
              <div className="form-hint">TVA non applicable, art. 293 B du CGI.</div>
            </>
          ) : showTtc(devis) ? (
            <>
              <div className="line-item line-item-total">
                <span className="line-item-label">Total TTC</span>
                <span className="line-item-value">{fmt(devis.montant_ttc)}</span>
              </div>
              <div className="form-hint">dont TVA {Number(devis.tva_pct)} % : {fmt(devis.montant_ttc - devis.montant_ht)}</div>
            </>
          ) : (
            <>
              <div className="line-item"><span className="line-item-label">Total HT</span><span className="line-item-value">{fmt(devis.montant_ht)}</span></div>
              <div className="line-item"><span className="line-item-label">TVA {Number(devis.tva_pct)} %</span><span className="line-item-value">{fmt(devis.montant_ttc - devis.montant_ht)}</span></div>
              <div className="line-item line-item-total"><span className="line-item-label">Total TTC</span><span className="line-item-value">{fmt(devis.montant_ttc)}</span></div>
            </>
          )}
        </div>
      </div>

      {/* Étape : informations + cases + signature */}
      {step === 'view' && (
        <form onSubmit={sign} className={tried ? 'show-errors' : undefined}>
          {signError && <div className="error-msg" style={{ marginBottom: 16 }}>{signError}</div>}
          <p className="form-hint" style={{ marginBottom: 12 }}><span className="req">*</span> champ obligatoire</p>

          <div className="signature-block">
            <h3>1. Votre sortie</h3>
            <div className="form-group">
              <label>Dates de la prestation — confirmez chacune <span className="req">*</span></label>
              {devis.dates.map((d, i) => (
                <label key={i} className={`checkbox-row ${isTodo(`d${i}`) ? 'row-todo' : ''}`}>
                  <input type="checkbox" checked={!!datesOk[i]} onChange={e => setDatesOk(o => ({ ...o, [i]: e.target.checked }))} />
                  <span>{d.label}</span>
                </label>
              ))}
            </div>
            {devis.participants_max > 1 && (
              <div className="form-group">
                <label htmlFor="f-nb">Nombre de participants (maximum {devis.participants_max}) <span className="req">*</span></label>
                <select id="f-nb" value={nbPart} onChange={e => setNbPart(e.target.value)} className={isTodo('participants') ? 'is-todo' : undefined}>
                  <option value="">Choisir…</option>
                  {Array.from({ length: devis.participants_max }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="signature-block">
            <h3>2. Vos informations</h3>
            {CHAMPS_CLIENT.map(c => {
              const requis = c.k === 'nom' || (devis.champs_requis || []).includes(c.k)
              return (
                <div className="form-group" key={c.k}>
                  <label htmlFor={`f-${c.k}`}>{c.label}{requis ? <span className="req"> *</span> : <span className="form-hint"> (facultatif)</span>}</label>
                  <input id={`f-${c.k}`} type={c.type} value={client[c.k]} placeholder={c.ph}
                    onChange={e => setClient(v => ({ ...v, [c.k]: e.target.value }))}
                    className={isTodo(c.k) ? 'is-todo' : undefined} />
                </div>
              )
            })}
          </div>

          <div className="signature-block">
            <h3>3. À cocher pour continuer</h3>
            {[
              ['accept_devis', <>J'ai lu le devis ci-dessus et je l'accepte pour <strong>{fmt(devis.montant_ttc)}{suffixe}</strong>.</>],
              ...(devis.has_cgv ? [['accept_cgv', <>J'ai lu et j'accepte les <a href={devis.cgv_pdf ? `${API}/api/paiement/cgv/${token}` : devis.cgv_url} target="_blank" rel="noreferrer">conditions générales de vente</a> de {devis.pro_nom}{devis.cgv_langue === 'en' ? ' (English)' : ''}.</>]] : []),
              ['accept_rgpd', <>J'ai pris connaissance de la <a href="/confidentialite" target="_blank" rel="noreferrer">politique de confidentialité</a> : mes données sont utilisées par {devis.pro_nom} pour exécuter cette prestation.</>],
              ['accept_signature', <>Je signe ce devis électroniquement (art. 1366 du Code civil). Mon adresse IP et l'heure sont enregistrées comme preuve.</>],
            ].map(([k, text]) => (
              <label key={k} className={`checkbox-row ${isTodo(k) ? 'row-todo' : ''}`}>
                <input type="checkbox" checked={cases[k]} onChange={e => setCases(c => ({ ...c, [k]: e.target.checked }))} />
                <span>{text} <span className="req">*</span></span>
              </label>
            ))}
            <div className="legal-notice">
              Prestation de loisirs à date précise : le droit de rétractation de 14 jours ne s'applique pas. Le paiement de {fmt(devis.montant_ttc)} est exigé en totalité à la commande.
            </div>
            {reste.length > 0 ? (
              <div className="progress-box" role={tried ? 'alert' : 'status'}>
                <div className="progress-head"><strong>{items.length - reste.length} sur {items.length}</strong> éléments complétés</div>
                <div className="progress-bar"><span style={{ width: `${Math.round(((items.length - reste.length) / items.length) * 100)}%` }} /></div>
                {tried && <ul>{reste.map(r => <li key={r.id}>{r.t}</li>)}</ul>}
              </div>
            ) : (
              <div className="progress-box ready" role="status">Tout est prêt : vous pouvez signer.</div>
            )}
            <button type="submit" className="btn btn-primary btn-lg" style={{ marginTop: 16 }} disabled={signLoading}
              aria-disabled={reste.length > 0}
              data-pending={reste.length > 0 ? 'true' : undefined}
              onClick={e => {
                if (!reste.length) return
                e.preventDefault(); setTried(true)
                requestAnimationFrame(() => document.querySelector('.show-errors .is-todo, .show-errors .row-todo')?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
              }}>
              {signLoading ? 'Enregistrement…' : 'Signer et passer au paiement'}
            </button>
          </div>
        </form>
      )}

      {/* Étape : assurance annulation (optionnelle, réponse obligatoire) */}
      {step === 'assurance' && assurance.enabled && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Souhaitez-vous assurer votre réservation ?</h3>
          <p style={{ fontSize: 14, color: 'var(--fg2)' }}>
            Assurance annulation proposée par Meetch : en cas d'annulation pour un motif garanti, vous êtes remboursé selon les conditions du contrat.
            Prime : <strong>{fmt(assurance.prime)}</strong>, ajoutée au paiement. Le remboursement est géré par l'assureur, pas par {devis.pro_nom} ni Finalise.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" disabled={choixLoading} onClick={() => choisirAssurance('oui')}>Oui, m'assurer (+ {fmt(assurance.prime)})</button>
            <button className="btn btn-secondary" disabled={choixLoading} onClick={() => choisirAssurance('non')}>Non, sans assurance</button>
          </div>
        </div>
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
              <div className="montant-display">{fmt(Number(devis.montant_ttc) + (assurance.choix === 'oui' ? Number(assurance.prime || 0) : 0))}</div>
              {assurance.choix === 'oui' && <div style={{ fontSize: 12, color: 'var(--fg2)' }}>dont assurance annulation {fmt(assurance.prime)}</div>}
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
