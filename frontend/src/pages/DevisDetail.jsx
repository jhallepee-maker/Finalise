import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../api'

const LABELS = {
  en_attente: 'En attente',
  signe:      'Signé',
  paye:       'Payé',
  expire:     'Expiré',
}
const fmt = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)
const fmtDate = s => new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
const fmtDateTime = s => new Date(s).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function DevisDetail() {
  const { id } = useParams()
  const [devis, setDevis]   = useState(null)
  const [copied, setCopied] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    api.get(`/api/devis/${id}`)
      .then(r => setDevis(r.data))
      .catch(() => setError('Devis introuvable.'))
  }, [id])

  if (error) return (
    <div className="page"><div className="container">
      <div className="topbar"><Link to="/" className="logo">Finalise</Link></div>
      <div className="error-msg" style={{ marginTop: 32 }}>{error}</div>
    </div></div>
  )

  if (!devis) return <div className="loading"><div className="spinner" /></div>

  const publicUrl = `${window.location.origin}/p/${devis.token_unique}`

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl)
    } catch {
      // fallback: sélection manuelle
      const el = document.getElementById('lien-client')
      if (el) { el.select(); document.execCommand('copy') }
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const mailtoLink = () => {
    const subject = encodeURIComponent(`Votre devis — ${devis.description.slice(0, 60)}`)
    const body = encodeURIComponent(
      `Bonjour${devis.client_nom ? ' ' + devis.client_nom : ''},\n\n` +
      `Veuillez trouver ci-dessous le lien pour consulter, signer et régler votre devis :\n\n` +
      `${publicUrl}\n\n` +
      `Montant TTC : ${fmt(devis.montant_ttc)}\n\n` +
      `Ce lien vous permet de signer électroniquement et de procéder au paiement sécurisé.\n\n` +
      `Cordialement`
    )
    const to = devis.client_email ? encodeURIComponent(devis.client_email) : ''
    return `mailto:${to}?subject=${subject}&body=${body}`
  }

  const isPaid   = devis.statut === 'paye'
  const isSigned = devis.statut === 'signe' || isPaid
  const isExpire = devis.statut === 'expire'

  return (
    <div className="page">
      <div className="container">
        <div className="topbar">
          <Link to="/" className="logo">Finalise</Link>
          <Link to="/" className="btn btn-ghost">← Mes devis</Link>
        </div>

        {/* En-tête */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0 }}>{devis.client_nom || 'Client sans nom'}</h1>
          <span className={`badge badge-${devis.statut}`}>{LABELS[devis.statut]}</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--fg2)', marginBottom: 24 }}>
          Créé le {fmtDate(devis.created_at)}
          {devis.expire_at && ` · Expire le ${fmtDate(devis.expire_at)}`}
        </div>

        {/* Lien client */}
        {!isExpire && (
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ marginBottom: 12 }}>Lien à envoyer au client</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                id="lien-client"
                readOnly
                value={publicUrl}
                style={{ flex: 1, minWidth: 0, fontSize: 13 }}
                onFocus={e => e.target.select()}
              />
              <button className="btn btn-secondary" onClick={copyLink} style={{ minWidth: 90 }}>
                {copied ? '✓ Copié !' : 'Copier'}
              </button>
              {devis.client_email && (
                <a
                  href={mailtoLink()}
                  className="btn btn-secondary"
                  style={{ textDecoration: 'none' }}
                >
                  ✉ Email
                </a>
              )}
            </div>
            {!devis.client_email && (
              <div className="form-hint" style={{ marginTop: 8 }}>
                Aucun email client renseigné — partagez le lien manuellement.
              </div>
            )}
          </div>
        )}

        {/* Statut paiement */}
        {isPaid && devis.paiement && (
          <div className="card card-success" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ color: 'var(--green)', fontSize: 18 }}>✓</span>
              <strong>Paiement reçu</strong>
              <span style={{ fontSize: 13, color: 'var(--fg2)', marginLeft: 'auto' }}>
                {fmtDateTime(devis.paiement.paye_at)}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--fg3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>TTC client</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{fmt(devis.paiement.montant_ttc)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--fg3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Commission 1%</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg2)' }}>−{fmt(devis.paiement.commission_joseph)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--fg3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Net pro</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--green)' }}>{fmt(devis.paiement.montant_net_pro)}</div>
              </div>
            </div>
          </div>
        )}

        {/* Statut signature */}
        {isSigned && devis.signature && (
          <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--accent)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 13 }}>✍</span>
              <strong style={{ fontSize: 14 }}>Signé électroniquement</strong>
            </div>
            <div style={{ fontSize: 13, color: 'var(--fg2)' }}>
              {devis.signature.nom_signe} · {fmtDateTime(devis.signature.signe_at)}
            </div>
          </div>
        )}

        {/* Détails prestation */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 16 }}>Prestation</h3>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: 'var(--fg2)', marginBottom: 4 }}>Description</div>
            <div style={{ fontSize: 15, lineHeight: 1.6 }}>{devis.description}</div>
          </div>

          {(devis.client_email || devis.client_tel) && (
            <div style={{ display: 'flex', gap: 24, marginBottom: 16, flexWrap: 'wrap' }}>
              {devis.client_email && (
                <div>
                  <div style={{ fontSize: 13, color: 'var(--fg2)', marginBottom: 2 }}>Email</div>
                  <a href={`mailto:${devis.client_email}`} style={{ fontSize: 14 }}>{devis.client_email}</a>
                </div>
              )}
              {devis.client_tel && (
                <div>
                  <div style={{ fontSize: 13, color: 'var(--fg2)', marginBottom: 2 }}>Téléphone</div>
                  <a href={`tel:${devis.client_tel}`} style={{ fontSize: 14 }}>{devis.client_tel}</a>
                </div>
              )}
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
      </div>
    </div>
  )
}
