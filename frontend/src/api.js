import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL || ''

const api = axios.create({ baseURL: BASE })

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  // Mode bureau : agir pour un guide (devis en lecture/écriture, profil en lecture seule uniquement)
  try {
    const a = JSON.parse(localStorage.getItem('actAs') || 'null')
    const url = cfg.url || ''
    const m = (cfg.method || 'get').toLowerCase()
    if (a?.id && (url.startsWith('/api/devis') || (url === '/api/profil' && m === 'get'))) cfg.headers['X-Act-As'] = a.id
  } catch { /* stockage indisponible : on agit pour soi */ }
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
