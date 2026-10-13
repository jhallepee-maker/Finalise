import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../api'

export default function NewDevis() {
  const nav = useNavigate()
  const [form, setForm] = useState({
    client_nom: '', client_email: '', client_tel: '',
    description: '', montant_ht: '', tva_pct: '20',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const ht  = parseFloat(form.montant_ht) || 0
  const tva = parseFloat(form.tva_pct) || 0
  const ttc = ht * (1 + tva / 100)

  const fmt = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)

  const submit = async e => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/api/devis', {
        ...form,
        montant_ht: parseFloat(form.montant_ht),
        tva_pct: parseFloat(form.tva_pct),
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

          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ marginBottom: 16 }}>Client</h3>

            <div className="form-group">
              <label>Nom du client</label>
              <input type="text" value={form.client_nom} onChange={set('client_nom')} placeholder="Jean Martin" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Email <span style={{color:'var(--fg3)',fontWeight:400}}>(optionnel)</span></label>
                <input type="email" value={form.client_email} onChange={set('client_email')} placeholder="jean@exemple.fr" />
              </div>
              <div className="form-group">
                <label>Téléphone <span style={{color:'var(--fg3)',fontWeight:400}}>(optionnel)</span></label>
                <input type="tel" value={form.client_tel} onChange={set('client_tel')} placeholder="06 12 34 56 78" />
              </div>
            </div>
          </div>

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

          <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
            {loading ? 'Création…' : 'Créer le devis et générer le lien'}
          </button>
        </form>
      </div>
    </div>
  )
}
