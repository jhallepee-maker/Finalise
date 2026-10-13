import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../api'

const fmt = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)

const EXPIRE_OPTIONS = [
  { label: '7 jours',  value: 7 },
  { label: '14 jours', value: 14 },
  { label: '30 jours', value: 30 },
  { label: '60 jours', value: 60 },
]

export default function NewDevis() {
  const nav = useNavigate()
  const [form, setForm] = useState({
    client_nom: '', client_email: '', client_tel: '',
    description: '', montant_ht: '', tva_pct: '20',
    expire_days: '30',
  })
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const ht  = parseFloat(form.montant_ht) || 0
  const tva = parseFloat(form.tva_pct) || 0
  const ttc = ht * (1 + tva / 100)

  const expireLabel = (() => {
    const days = parseInt(form.expire_days)
    const d = new Date(Date.now() + days * 86400000)
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  })()

  const submit = async e => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/api/devis', {
        ...form,
        montant_ht:  parseFloat(form.montant_ht),
        tva_pct:     parseFloat(form.tva_pct),
        expire_days: parseInt(form.expire_days),
      })
      nav(`/devis/${data.id}`)
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la création')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <div className="container">
        <div className="topbar">
          <Link to="/" className="logo">Finalise</Link>
          <Link to="/" className="btn btn-ghost">← Retour</Link>
        </div>

        <h1 style={{ marginBottom: 24 }}>Nouveau devis</h1>

        <form onSubmit={submit}>
          {error && <div className="error-msg">{error}</div>}

          {/* Client */}
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ marginBottom: 16 }}>Client</h3>
            <div className="form-group">
              <label>Nom du client</label>
              <input
                type="text"
                value={form.client_nom}
                onChange={set('client_nom')}
                placeholder="Jean Martin"
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Email <span style={{ color: 'var(--fg3)', fontWeight: 400 }}>(optionnel)</span></label>
                <input
                  type="email"
                  value={form.client_email}
                  onChange={set('client_email')}
                  placeholder="jean@exemple.fr"
                />
              </div>
              <div className="form-group">
                <label>Téléphone <span style={{ color: 'var(--fg3)', fontWeight: 400 }}>(optionnel)</span></label>
                <input
                  type="tel"
                  value={form.client_tel}
                  onChange={set('client_tel')}
                  placeholder="06 12 34 56 78"
                />
              </div>
            </div>
          </div>

          {/* Prestation */}
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ marginBottom: 16 }}>Prestation</h3>

            <div className="form-group">
              <label>Description de la prestation</label>
              <textarea
                required
                value={form.description}
                onChange={set('description')}
                placeholder="Journée d'escalade en falaise — initiation niveau débutant, matériel fourni…"
                rows={4}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Montant HT (€)</label>
                <input
                  type="number" required min="0.01" step="0.01"
                  value={form.montant_ht}
                  onChange={set('montant_ht')}
                  placeholder="450.00"
                />
              </div>
              <div className="form-group">
                <label>TVA (%)</label>
                <select value={form.tva_pct} onChange={set('tva_pct')}>
                  <option value="0">0% (exonéré)</option>
                  <option value="5.5">5,5%</option>
                  <option value="10">10%</option>
                  <option value="20">20%</option>
                </select>
              </div>
            </div>

            {ht > 0 && (
              <div style={{ padding: '12px 0', borderTop: '1px solid var(--border)', marginTop: 8 }}>
                <div className="line-item">
                  <span className="line-item-label">HT</span>
                  <span className="line-item-value">{fmt(ht)}</span>
                </div>
                <div className="line-item">
                  <span className="line-item-label">TVA {tva}%</span>
                  <span className="line-item-value">{fmt(ttc - ht)}</span>
                </div>
                <div className="line-item line-item-total">
                  <span className="line-item-label">Total TTC</span>
                  <span className="line-item-value">{fmt(ttc)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Validité */}
          <div className="card" style={{ marginBottom: 24 }}>
            <h3 style={{ marginBottom: 16 }}>Validité du devis</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {EXPIRE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  className={`btn ${form.expire_days == opt.value ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ minWidth: 90 }}
                  onClick={() => setForm(f => ({ ...f, expire_days: String(opt.value) }))}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="form-hint" style={{ marginTop: 10 }}>
              Le lien expirera le <strong>{expireLabel}</strong>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-lg"
            disabled={loading}
          >
            {loading ? 'Création…' : 'Créer le devis et générer le lien'}
          </button>
        </form>
      </div>
    </div>
  )
}
