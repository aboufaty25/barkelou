/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { seedState } from '../data/seed'
import { sha256, slugify, uid } from '../lib/utils'

const KEY = 'barkelou:v1'

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed?.version === 1) return { withdrawals: [], ...parsed }
    }
  } catch {
    /* stockage indisponible */
  }
  return { ...seedState(), withdrawals: [] }
}

function reducer(state, action) {
  switch (action.type) {
    case 'register':
      return { ...state, users: [...state.users, action.user], sessionUserId: action.user.id }
    case 'login':
      return { ...state, sessionUserId: action.id }
    case 'logout':
      return { ...state, sessionUserId: null }
    case 'updateUser':
      return {
        ...state,
        users: state.users.map((u) => (u.id === action.id ? { ...u, ...action.patch } : u)),
        campaigns: action.patch.name
          ? state.campaigns.map((c) => (c.ownerId === action.id ? { ...c, ownerName: action.patch.name } : c))
          : state.campaigns,
      }
    case 'createCampaign':
      return { ...state, campaigns: [action.campaign, ...state.campaigns] }
    case 'updateCampaign':
      return {
        ...state,
        campaigns: state.campaigns.map((c) => (c.id === action.id ? { ...c, ...action.patch } : c)),
      }
    case 'deleteCampaign':
      return {
        ...state,
        campaigns: state.campaigns.filter((c) => c.id !== action.id),
        contributions: state.contributions.filter((k) => k.campaignId !== action.id),
      }
    case 'contribute':
      return { ...state, contributions: [action.contribution, ...state.contributions] }
    case 'toggleFavorite': {
      const has = state.favorites.includes(action.id)
      return { ...state, favorites: has ? state.favorites.filter((f) => f !== action.id) : [...state.favorites, action.id] }
    }
    case 'withdraw':
      return { ...state, withdrawals: [action.withdrawal, ...state.withdrawals] }
    case 'reset':
      return { ...seedState(), withdrawals: [] }
    default:
      return state
  }
}

const StoreCtx = createContext(null)

export function AppStoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, load)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      /* quota dépassé : on ignore */
    }
  }, [state])

  const user = useMemo(() => state.users.find((u) => u.id === state.sessionUserId) || null, [state])

  const stats = useMemo(() => {
    const map = {}
    for (const k of state.contributions) {
      const s = (map[k.campaignId] ||= { raised: 0, count: 0 })
      s.raised += k.amount
      s.count += 1
    }
    return map
  }, [state.contributions])

  const withStats = useCallback(
    (c) => ({ ...c, raised: stats[c.id]?.raised || 0, count: stats[c.id]?.count || 0 }),
    [stats]
  )

  const campaigns = useMemo(() => state.campaigns.map(withStats), [state.campaigns, withStats])

  const api = useMemo(
    () => ({
      async register({ name, phone, email, password }) {
        const cleanPhone = phone.replace(/\D/g, '').replace(/^221/, '')
        if (state.users.some((u) => u.phone === cleanPhone)) throw new Error('Un compte existe déjà avec ce numéro.')
        const user = {
          id: uid('u_'),
          name: name.trim(),
          phone: cleanPhone,
          email: email?.trim() || '',
          password: await sha256(password),
          createdAt: new Date().toISOString(),
        }
        dispatch({ type: 'register', user })
        return user
      },
      async login({ phone, password }) {
        const cleanPhone = phone.replace(/\D/g, '').replace(/^221/, '')
        const u = state.users.find((x) => x.phone === cleanPhone)
        if (!u || u.password !== (await sha256(password))) throw new Error('Numéro ou mot de passe incorrect.')
        dispatch({ type: 'login', id: u.id })
        return u
      },
      logout: () => dispatch({ type: 'logout' }),
      updateUser: (patch) => user && dispatch({ type: 'updateUser', id: user.id, patch }),
      createCampaign(data) {
        let slug = slugify(data.title) || 'cagnotte'
        if (state.campaigns.some((c) => c.slug === slug)) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`
        const campaign = {
          id: uid('c_'),
          slug,
          ...data,
          ownerId: user.id,
          ownerName: user.name,
          createdAt: new Date().toISOString(),
          status: 'active',
        }
        dispatch({ type: 'createCampaign', campaign })
        return campaign
      },
      updateCampaign: (id, patch) => dispatch({ type: 'updateCampaign', id, patch }),
      deleteCampaign: (id) => dispatch({ type: 'deleteCampaign', id }),
      contribute(data) {
        const contribution = { id: uid('k_'), createdAt: new Date().toISOString(), userId: user?.id || null, ...data }
        dispatch({ type: 'contribute', contribution })
        return contribution
      },
      toggleFavorite: (id) => dispatch({ type: 'toggleFavorite', id }),
      requestWithdrawal(data) {
        const withdrawal = { id: uid('w_'), createdAt: new Date().toISOString(), status: 'pending', ...data }
        dispatch({ type: 'withdraw', withdrawal })
        return withdrawal
      },
      resetDemo: () => dispatch({ type: 'reset' }),
    }),
    [state.users, state.campaigns, user]
  )

  const value = useMemo(() => ({ state, user, campaigns, withStats, ...api }), [state, user, campaigns, withStats, api])

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}

export const useStore = () => useContext(StoreCtx)

/* ---------- Toasts ---------- */
const ToastCtx = createContext(() => {})

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef({})
  const push = useCallback((message, tone = 'default') => {
    const id = uid()
    setToasts((t) => [...t.slice(-2), { id, message, tone }])
    timers.current[id] = setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800)
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
