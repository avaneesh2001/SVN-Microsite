import { defineConfig } from 'vite'

export default defineConfig({
  base: '/SVN-Microsite/',
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
})