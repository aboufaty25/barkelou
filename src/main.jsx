import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'

// Thème mémorisé (auto / clair / sombre) appliqué avant le premier rendu
try {
  const t = localStorage.getItem('barkelou:theme')
  if (t && t !== 'auto') document.documentElement.setAttribute('data-theme', t)
} catch {
  /* ignore */
}

registerSW({ immediate: true })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
