/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api'
import { uid } from '../lib/utils'

const DEFAULT_SETTINGS = {
  site_name: 'Barkelou',
  contact_email: 'contact@barkelou.com',
  contact_whatsapp: '221770000000',
  maintenance_mode: false,
  allow_signups: true,
  commission_rate: 5,
  commission_fixed: 0,
  fee_payer: 'organizer',
  min_contribution: 500,
  max_contribution: 2_000_000,
  max_campaign_goal: 100_000_000,
  channels: { wave: true, orange: true, free: true, card: true },
  withdrawal_mode: 'automatic',
  withdrawal_fee_rate: 0,
  withdrawal_fee_fixed: 0,
  min_withdrawal: 1000,
  max_withdrawal_per_day: 5_000_000,
  withdraw_to_account_phone_only: true,
  withdrawal_methods: { wave: true, orange: true, free: true },
  payments_ready: true,
  payments_simulated: false,
}

const StoreCtx = createContext(null)

export function AppStoreProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [favorites, setFavorites] = useState(() => new Set())

  const loadFavorites = useCallback(async () => {
    try {
      const { campaigns } = await api.get('/favorites')
      setFavorites(new Set(campaigns.map((c) => c.id)))
    } catch {
      setFavorites(new Set())
    }
  }, [])

  useEffect(() => {
    let alive = true
    Promise.allSettled([api.get('/auth/me'), api.get('/settings')]).then(([me, st]) => {
      if (!alive) return
      if (me.status === 'fulfilled') setUser(me.value.user)
      if (st.status === 'fulfilled') setSettings({ ...DEFAULT_SETTINGS, ...st.value })
      setReady(true)
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (user) loadFavorites()
    else setFavorites(new Set())
  }, [user, loadFavorites])

  const value = useMemo(
    () => ({
      user,
      ready,
      settings,
      favorites,
      refreshSettings: async () => setSettings({ ...DEFAULT_SETTINGS, ...(await api.get('/settings')) }),
      async register(form) {
        const { user } = await api.post('/auth/register', form)
        setUser(user)
        return user
      },
      async login(form) {
        const { user } = await api.post('/auth/login', form)
        setUser(user)
        return user
      },
      async logout() {
        await api.post('/auth/logout').catch(() => {})
        setUser(null)
      },
      async logoutAll() {
        await api.post('/auth/logout-all')
        setUser(null)
      },
      async updateUser(patch) {
        const { user } = await api.patch('/auth/me', patch)
        setUser(user)
        return user
      },
      async toggleFavorite(id) {
        const on = favorites.has(id)
        setFavorites((f) => {
          const n = new Set(f)
          if (on) n.delete(id)
          else n.add(id)
          return n
        })
        try {
          if (on) await api.del(`/campaigns/${id}/favorite`)
          else await api.put(`/campaigns/${id}/favorite`)
        } catch {
          loadFavorites()
        }
      },
      sessionExpired: () => setUser(null),
    }),
    [user, ready, settings, favorites, loadFavorites]
  )

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}

export const useStore = () => useContext(StoreCtx)

/** Charge une ressource de l'API : { data, error, loading, reload, setData } */
export function useApi(path, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: !!path })
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!path) return
    let alive = true
    setState((s) => ({ ...s, loading: true, error: null }))
    api
      .get(path)
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((error) => alive && setState({ data: null, error, loading: false }))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, n, ...deps])
  const reload = useCallback(() => setN((x) => x + 1), [])
  const setData = useCallback((fn) => setState((s) => ({ ...s, data: typeof fn === 'function' ? fn(s.data) : fn })), [])
  return { ...state, reload, setData }
}

/* ---------- Toasts ---------- */
const ToastCtx = createContext(() => {})

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef({})
  const push = useCallback((message, tone = 'default') => {
    const id = uid()
    setToasts((t) => [...t.slice(-2), { id, message, tone }])
    timers.current[id] = setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.tone}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)
