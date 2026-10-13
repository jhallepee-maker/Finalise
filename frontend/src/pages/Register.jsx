import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'

export default function Register() {
  const { register } = useAuth()
  const nav = useNavigate()
  const [form, setForm] = useState({
    nom: '', prenom: '', email: '', password: '',
    activite: '', siret: ''
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

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
                <input type="text" required value={form.prenom} onChange={set('prenom')} placeholder="Marie" />
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
              <input type="password" required minLength={8} value={form.password} onChange={set('password')} placeholder="8 caractères minimum" />
            </div>

            <div className="form-group">
              <label>Activité</label>
              <input type="text" value={form.activite} onChange={set('activite')} placeholder="Guide de montagne, photographe…" />
            </div>

            <div className="form-group">
              <label>SIRET <span style={{color:'var(--fg3)',fontWeight:400}}>(optionnel)</span></label>
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
