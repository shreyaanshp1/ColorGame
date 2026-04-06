import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// GitHub project Pages: https://<user>.github.io/<repo>/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/ColorGame/' : '/',
  plugins: [react()],
}))
