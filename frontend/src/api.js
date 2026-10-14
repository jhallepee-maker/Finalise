import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL || ''

const api = axios.create({ baseURL: BASE })

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

api.interceptors.response.use(
  r => r,
  err => {
    // Pas de redirection sur /login ou /register : on laisse la page afficher l'erreur (mauvais mot de passe…)
    const onAuthPage = ['/login', '/register'].includes(window.location.pathname)
    if (err.response?.status === 401 && !onAuthPage) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
