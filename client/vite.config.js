import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const tawkSources = ['https://*.tawk.to']

export function createContentSecurityPolicy({ allowLocalApi = false, allowViteHmr = false } = {}) {
  const connectSources = ["'self'", ...tawkSources, 'wss://*.tawk.to']
  if (allowLocalApi) connectSources.push('http://localhost:5000')
  if (allowViteHmr) connectSources.push('ws://localhost:5173')

  const directives = {
    'default-src': ["'self'"],
    'script-src': ["'self'", ...tawkSources, 'https://cdn.jsdelivr.net'],
    'style-src': ["'self'", ...tawkSources, 'https://cdn.jsdelivr.net', 'https://fonts.googleapis.com'],
    'img-src': ["'self'", ...tawkSources, 'https://cdn.jsdelivr.net', 'https://tawk.link', 'https://s3.amazonaws.com'],
    'font-src': ["'self'", ...tawkSources, 'https://fonts.gstatic.com'],
    'connect-src': connectSources,
    'frame-src': ["'self'", ...tawkSources, 'https://www.youtube-nocookie.com'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'", ...tawkSources],
    'frame-ancestors': ["'none'"],
  }

  return Object.entries(directives)
    .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
    .join('; ')
}

const developmentCsp = createContentSecurityPolicy({ allowLocalApi: true, allowViteHmr: true })
const previewCsp = createContentSecurityPolicy({ allowLocalApi: true })

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    headers: { 'Content-Security-Policy-Report-Only': developmentCsp },
  },
  preview: {
    headers: { 'Content-Security-Policy-Report-Only': previewCsp },
  },
})
