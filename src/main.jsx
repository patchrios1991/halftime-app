import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initNativeDeepLinks } from './lib/native'

// ── Native deep links (OAuth callback, app links) — no-op on web ──────────────
initNativeDeepLinks();

// ── Register service worker (enables PWA + push notifications) ────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
