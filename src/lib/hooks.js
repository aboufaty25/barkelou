import { useCallback, useEffect, useState } from 'react'
import { useToast } from '../store/AppStore'
import { siteUrl } from './utils'

let deferredPrompt = null
const listeners = new Set()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e
    listeners.forEach((l) => l())
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    listeners.forEach((l) => l())
  })
}

export const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true)

export const isIOS = () =>
  typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream

export function useInstallPrompt() {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force((n) => n + 1)
    listeners.add(l)
    return () => listeners.delete(l)
  }, [])
  const install = useCallback(async () => {
    if (!deferredPrompt) return false
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    deferredPrompt = null
    force((n) => n + 1)
    return outcome === 'accepted'
  }, [])
  return {
    canInstall: !!deferredPrompt,
    installed: isStandalone(),
    ios: isIOS(),
    install,
  }
}

export function useShare() {
  const toast = useToast()
  return useCallback(
    async ({ title, text, path }) => {
      const url = siteUrl(path)
      if (navigator.share) {
        try {
          await navigator.share({ title, text, url })
          return
        } catch (e) {
          if (e?.name === 'AbortError') return
        }
      }
      try {
        await navigator.clipboard.writeText(url)
        toast('Lien copié ✓', 'success')
      } catch {
        toast(url)
      }
    },
    [toast]
  )
}

export function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · Barkelou` : 'Barkelou — Cagnottes en ligne au Sénégal'
  }, [title])
}
