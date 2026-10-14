import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { showTtc, lineTotal } from '../pricing'
import { buildMessage, waLink, mailLink } from '../share'
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
  const nav = useNavigate()
  const [devis, setDevis]         = useState(null)
  const [copied, setCopied]       = useState(false)
  const [error, setError]         = useState('')
  const [deleting, setDeleting]   = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [pro, setPro]           = useState(null)
  const [msg, setMsg]           = useState(null)

  useEffect(() => {
    api.get(`/api/devis/${id}`)
      .then(r => setDevis(r.data))
      .catch(() => setError('Devis introuvable.'))
    api.get('/api/profil').then(r => setPro(r.data)).catch(() => {})
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

  const texte = msg ?? buildMessage(devis, pro, publicUrl)
  const tvaNA = devis.tva_mode ? devis.tva_mode === 'non_applicable' : Number(devis.tva_pct) === 0

  const pv = { prix_mode: devis.prix_mode, tva_franchise: tvaNA }
  const isPaid    = devis.statut === 'paye'
  const isSigned  = devis.statut === 'signe' || isPaid
  const isExpire  = devis.statut === 'expire'
  const isWaiting = devis.statut === 'en_attente'

  const deleteDevis = async () => {
    setDeleting(true)
    try {
      await api.delete(`/api/devis/${id}`)
      nav('/')
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la suppression')
      setDeleting(false)
      setConfirmDel(false)
    }
  }

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

        {/* Envoi au client */}
        {!isExpire && (
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ marginBottom: 4 }}>Envoyer au client</h3>
            <div className="form-hint" style={{ marginBottom: 10 }}>Message prêt à envoyer — modifiez-le si besoin. Le lien affiche un aperçu propre dans WhatsApp et les emails.</div>
            <textarea value={texte} onChange={e => setMsg(e.target.value)} rows={8} style={{ width: '100%', fontSize: 14, lineHeight: 1.5 }} aria-label="Message" />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              <a href={waLink(devis.client_tel, texte)} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ textDecoration: 'none' }}>WhatsApp</a>
              <a href={mailLink(devis, pro, texte)} className="btn btn-secondary" style={{ textDecoration: 'none' }}>Email</a>
              <button className="btn btn-secondary" onClick={copyLink}>{copied ? '✓ Lien copié' : 'Copier le lien'}</button>
              {msg !== null && <button className="btn btn-ghost" onClick={() => setMsg(null)}>Réinitialiser</button>}
            </div>
            <input id="lien-client" readOnly value={publicUrl} style={{ marginTop: 10, fontSize: 12 }} onFocus={e => e.target.select()} aria-label="Lien" />
            {!devis.client_tel && !devis.client_email && (
              <div className="form-hint" style={{ marginTop: 8 }}>Le client n'a pas de téléphone ni d'email renseigné : WhatsApp et Email s'ouvriront sans destinataire, vous le choisirez à l'envoi.</div>
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

        {devis.facture && (
          <div className="card" style={{ marginBottom: 16 }}>
            <strong style={{ fontSize: 14 }}>Facture {devis.facture.numero}</strong>{' '}
            <a href={`${import.meta.env.VITE_API_URL || ''}/api/paiement/facture/${devis.token_unique}`} target="_blank" rel="noreferrer" style={{ fontSize: 14 }}>Télécharger (PDF)</a>
          </div>
        )}

        {/* Suppression */}
        {isWaiting && (
          <div style={{ marginBottom: 16 }}>
            {!confirmDel ? (
              <button
                className="btn btn-ghost"
                style={{ color: 'var(--fg3)', fontSize: 13 }}
                onClick={() => setConfirmDel(true)}
              >
                Supprimer ce devis
              </button>
            ) : (
              <div className="card" style={{ borderColor: 'var(--red)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, flex: 1 }}>Supprimer définitivement ce devis ?</span>
                <button className="btn btn-danger" onClick={deleteDevis} disabled={deleting} style={{ fontSize: 13, padding: '7px 14px' }}>
                  {deleting ? 'Suppression…' : 'Confirmer'}
                </button>
                <button className="btn btn-ghost" onClick={() => setConfirmDel(false)} style={{ fontSize: 13 }}>
                  Annuler
                </button>
              </div>
            )}
          </div>
        )}

        {/* Détails prestation */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 16 }}>Prestation</h3>

          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{devis.objet || 'Prestation'}</div>
              {devis.numero && <div style={{ fontSize: 12, color: 'var(--fg3)', fontFamily: 'monospace' }}>{devis.numero}</div>}
            </div>
            {devis.date_prestation && <div style={{ fontSize: 13, color: 'var(--fg2)', marginTop: 4 }}>{devis.date_prestation}</div>}
            {devis.participants_max > 0 && (
              <div style={{ fontSize: 13, color: 'var(--fg2)', marginTop: 2 }}>
                {devis.participants_nb ? `${devis.participants_nb} participant${devis.participants_nb > 1 ? 's' : ''}` : 'Participants : à indiquer par le client'} · maximum {devis.participants_max}
              </div>
            )}
            {(devis.lignes || []).length > 1 && devis.lignes.map((l, i) => (
              <div className="line-item" key={i}>
                <span className="line-item-label">{l.description}{Number(l.quantite) !== 1 ? ` × ${Number(l.quantite)}` : ''}</span>
                <span className="line-item-value">{fmt(lineTotal(l, pv))}</span>
              </div>
            ))}
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

          {pv.tva_franchise ? (
            <div className="line-item line-item-total"><span className="line-item-label">Total à payer (sans TVA)</span><span className="line-item-value">{fmt(devis.montant_ttc)}</span></div>
          ) : showTtc(pv) ? (
            <>
              <div className="line-item line-item-total"><span className="line-item-label">Total TTC</span><span className="line-item-value">{fmt(devis.montant_ttc)}</span></div>
              <div className="form-hint">dont TVA {Number(devis.tva_pct)} % : {fmt(devis.montant_ttc - devis.montant_ht)}</div>
            </>
          ) : (
            <>
              <div className="line-item"><span className="line-item-label">Montant HT</span><span className="line-item-value">{fmt(devis.montant_ht)}</span></div>
              <div className="line-item"><span className="line-item-label">TVA {Number(devis.tva_pct)} %</span><span className="line-item-value">{fmt(devis.montant_ttc - devis.montant_ht)}</span></div>
              <div className="line-item line-item-total"><span className="line-item-label">Total TTC</span><span className="line-item-value">{fmt(devis.montant_ttc)}</span></div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
