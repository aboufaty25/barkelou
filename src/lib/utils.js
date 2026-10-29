export const uid = (p = '') =>
  p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

export const slugify = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)

const nf = new Intl.NumberFormat('fr-FR')
export const fcfa = (n) => `${nf.format(Math.round(n || 0)).replace(/ | /g, ' ')} F`
export const fcfaLong = (n) => `${nf.format(Math.round(n || 0)).replace(/ | /g, ' ')} FCFA`
export const compact = (n) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace('.', ',')} M`
  if (n >= 1_000) return `${Math.round(n / 1000)} k`
  return String(n)
}

export const pct = (raised, goal) => (goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0)

export const daysLeft = (deadline) => {
  if (!deadline) return null
  const d = Math.ceil((new Date(deadline).setHours(23, 59, 59) - Date.now()) / 86400000)
  return d
}

export const daysLeftLabel = (deadline) => {
  const d = daysLeft(deadline)
  if (d === null) return 'Sans date limite'
  if (d < 0) return 'Terminée'
  if (d === 0) return "Dernier jour"
  if (d === 1) return '1 jour restant'
  return `${d} jours restants`
}

export const timeAgo = (date) => {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (s < 60) return "à l'instant"
  const m = Math.floor(s / 60)
  if (m < 60) return `il y a ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `il y a ${h} h`
  const d = Math.floor(h / 24)
  if (d < 30) return `il y a ${d} j`
  return new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export const formatDate = (date) =>
  new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

export const initials = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('') || '?'

const AVATAR_COLORS = ['#0B5D43', '#C2410C', '#7C3AED', '#0369A1', '#B45309', '#BE185D', '#15803D', '#4338CA']
export const colorFor = (s = '') => {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

/** Normalise un numéro sénégalais : 77 123 45 67 */
export const formatPhone = (v = '') => {
  const d = v.replace(/\D/g, '').replace(/^221/, '').slice(0, 9)
  return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(' ')
}
export const isValidSnPhone = (v = '') => /^(7[05678]|76)\d{7}$/.test(v.replace(/\D/g, '').replace(/^221/, ''))

export const sha256 = async (text) => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Réduit une image choisie par l'utilisateur (JPEG ~1200px) pour le stockage local */
export const compressImage = (file, max = 1200, quality = 0.8) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = () => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })

export const haptic = (ms = 8) => {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* ignore */
  }
}

export const siteUrl = (path = '') => `${window.location.origin}${path}`
