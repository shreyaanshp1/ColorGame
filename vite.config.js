import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function productionBase() {
  const raw = process.env.VITE_BASE_PATH
  if (raw === '/' || raw === '') return '/'
  if (typeof raw === 'string' && raw.trim() !== '') {
    const s = raw.trim()
    return s.endsWith('/') ? s : `${s}/`
  }
  // GitHub Pages project site: https://<user>.github.io/ColorGame/
  return '/ColorGame/'
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? productionBase() : '/',
  plugins: [react()],
}))
