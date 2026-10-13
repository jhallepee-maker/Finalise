import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'

export default function Login() {
  const { login } = useAuth()
  const nav = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async e => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(form.email, form.password)
      nav('/')
    } catch (err) {
      setError(err.response?.data?.error || 'Identifiants incorrects')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-box">
        <div className="auth-logo">Finalise</div>
        <div className="auth-tagline">Connectez-vous à votre espace pro</div>

        <div className="card">
          <form onSubmit={submit}>
            {error && <div className="error-msg">{error}</div>}

            <div className="form-group">
              <label>Email</label>
              <input
                type="email" required autoFocus
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="vous@exemple.fr"
              />
            </div>

            <div className="form-group">
              <label>Mot de passe</label>
              <input
                type="password" required
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="••••••••"
              />
            </div>

            <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
              {loading ? 'Connexion…' : 'Se connecter'}
            </button>
          </form>
        </div>

        <div className="auth-footer">
          Pas encore de compte ? <Link to="/register">Créer un compte</Link>
        </div>
      </div>
    </div>
  )
}
