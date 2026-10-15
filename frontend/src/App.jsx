import Cgu from './pages/Cgu'
import Confidentialite from './pages/Confidentialite'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import NewDevis from './pages/NewDevis'
import DevisDetail from './pages/DevisDetail'
import Equipe from './pages/Equipe'
import Profil from './pages/Profil'
import ClientPage from './pages/ClientPage'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading"><div className="spinner" /></div>
  return user ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/cgu" element={<Cgu />} />
      <Route path="/confidentialite" element={<Confidentialite />} />
      <Route path="/p/:token" element={<ClientPage />} />

      {/* Pro — authentifié */}
      <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
      <Route path="/equipe" element={<PrivateRoute><Equipe /></PrivateRoute>} />
      <Route path="/profil" element={<PrivateRoute><Profil /></PrivateRoute>} />
      <Route path="/devis/new" element={<PrivateRoute><NewDevis /></PrivateRoute>} />
      <Route path="/devis/:id" element={<PrivateRoute><DevisDetail /></PrivateRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
