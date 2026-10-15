import api from './api'

const b64 = s => { const p = '='.repeat((4 - (s.length % 4)) % 4); const r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...r].map(c => c.charCodeAt(0))) }
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true

// État : 'unsupported' | 'ios-install' (iPhone : ajouter à l'écran d'accueil d'abord) | 'denied' | 'off' | 'on' | 'unavailable' (serveur non configuré)
export async function pushState() {
  if (isIOS() && !standalone()) return 'ios-install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  try {
    const { data } = await api.get('/api/push/key')
    if (!data.key) return 'unavailable'
    const reg = await navigator.serviceWorker.ready
    return (await reg.pushManager.getSubscription()) ? 'on' : 'off'
  } catch { return 'unsupported' }
}

export async function enablePush() {
  const { data } = await api.get('/api/push/key')
  if (!data.key) throw new Error('Notifications non configurées')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('Autorisation refusée')
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(data.key) })
  await api.post('/api/push/subscribe', { subscription: sub.toJSON() })
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub) { await api.delete('/api/push/subscribe', { data: { endpoint: sub.endpoint } }); await sub.unsubscribe() }
}
