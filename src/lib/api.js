/** Client de l'API Barkelou (même domaine, cookie de session httpOnly) */
export class ApiError extends Error {
  constructor(message, status, details) {
    super(message)
    this.status = status
    this.details = details
  }
}

async function request(method, path, body) {
  let res
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(method !== 'GET' ? { 'X-Barkelou': '1' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError('Connexion impossible. Vérifiez votre réseau.', 0)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data.error || 'Une erreur est survenue.', res.status, data.details)
  return data
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b = {}) => request('POST', p, b),
  put: (p, b = {}) => request('PUT', p, b),
  patch: (p, b = {}) => request('PATCH', p, b),
  del: (p) => request('DELETE', p),
}

export const qs = (o) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, v)
  const s = p.toString()
  return s ? `?${s}` : ''
}
