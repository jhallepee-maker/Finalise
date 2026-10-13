import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'

function pwStrength(pw) {
  if (!pw) return 0
  let s = 0
  if (pw.length >= 8)  s++
  if (pw.length >= 12) s++
  if (/[A-Z]/.test(pw)) s++
  if (/[0-9]/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw)) s++
  return s
}

const PW_LABELS = ['', 'Faible', 'Faible', 'Moyen', 'Fort', 'Très fort']
const PW_COLORS = ['', 'var(--red)', 'var(--amber)', 'var(--amber)', 'var(--green)', 'var(--green)']

export default function Register() {
  const { register } = useAuth()
  const nav = useNavigate()
  const [form, setForm] = useState({
    nom: '', prenom: '', email: '', password: '',
    activite: '', siret: ''
  })
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const strength = pwStrength(form.password)

  const submit = async e => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await register(form)
      nav('/')
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la création du compte')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-box">
        <div className="auth-logo">Finalise</div>
        <div className="auth-tagline">Créez votre espace professionnel</div>

        <div className="card">
          <form onSubmit={submit}>
            {error && <div className="error-msg">{error}</div>}

            <div className="form-row">
              <div className="form-group">
                <label>Prénom</label>
                <input type="text" required autoFocus value={form.prenom} onChange={set('prenom')} placeholder="Marie" />
              </div>
              <div className="form-group">
                <label>Nom</label>
                <input type="text" required value={form.nom} onChange={set('nom')} placeholder="Dupont" />
              </div>
            </div>

            <div className="form-group">
              <label>Email professionnel</label>
              <input type="email" required value={form.email} onChange={set('email')} placeholder="marie@dupont.fr" />
            </div>

            <div className="form-group">
              <label>Mot de passe</label>
              <input
                type="password" required minLength={8}
                value={form.password}
                onChange={set('password')}
                placeholder="8 caractères minimum"
              />
              {form.password && (
                <div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                    {[1,2,3,4,5].map(i => (
                      <div key={i} style={{
                        flex: 1, height: 3, borderRadius: 2,
                        background: i <= strength ? PW_COLORS[strength] : 'var(--border)',
                        transition: 'background .2s',
                      }} />
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: PW_COLORS[strength], marginTop: 4 }}>
                    {PW_LABELS[strength]}
                  </div>
                </div>
              )}
            </div>

            <div className="form-group">
              <label>Activité</label>
              <input type="text" value={form.activite} onChange={set('activite')} placeholder="Guide de montagne, photographe…" />
            </div>

            <div className="form-group">
              <label>SIRET <span style={{ color: 'var(--fg3)', fontWeight: 400 }}>(optionnel)</span></label>
              <input type="text" maxLength={14} value={form.siret} onChange={set('siret')} placeholder="12345678901234" />
            </div>

            <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
              {loading ? 'Création…' : 'Créer mon compte'}
            </button>
          </form>
        </div>

        <div className="auth-footer">
          Déjà un compte ? <Link to="/login">Se connecter</Link>
        </div>
      </div>
    </div>
  )
}
