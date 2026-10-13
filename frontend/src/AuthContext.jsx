import { createContext, useContext, useState, useEffect } from 'react'
import api from './api'

const Ctx = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { setLoading(false); return }
    api.get('/api/auth/me')
      .then(r => setUser(r.data))
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false))
  }, [])

  const login = async (email, password) => {
    const { data } = await api.post('/api/auth/login', { email, password })
    localStorage.setItem('token', data.token)
    // Charger le profil complet (inclut stripe_account_id)
    const me = await api.get('/api/auth/me')
    setUser(me.data)
    return data
  }

  const register = async (form) => {
    const { data } = await api.post('/api/auth/register', form)
    localStorage.setItem('token', data.token)
    const me = await api.get('/api/auth/me')
    setUser(me.data)
    return data
  }

  const refreshUser = async () => {
    const me = await api.get('/api/auth/me')
    setUser(me.data)
  }

  const logout = () => {
    localStorage.removeItem('token')
    setUser(null)
  }

  return (
    <Ctx.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
