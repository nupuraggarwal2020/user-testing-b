import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { openaiProxyPlugin } from './vite-plugins/openai-proxy.js'

// Resolve the GitHub Pages base path.
// GitHub Actions auto-populates GITHUB_REPOSITORY as "owner/repo-name"; for a
// Pages site under https://owner.github.io/repo-name/, vite needs base = /repo-name/.
// Falling back to '/' lets local `vite build` (no GITHUB_PAGES env) work too.
function resolveBase() {
  if (process.env.BASE_PATH) return process.env.BASE_PATH
  if (!process.env.GITHUB_PAGES) return '/'
  const repo = process.env.GITHUB_REPOSITORY?.split('/').pop()
  return repo ? `/${repo}/` : '/'
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    base: resolveBase(),
    plugins: [react(), openaiProxyPlugin(env)],
    build: {
      outDir: '../dist',
      emptyOutDir: true,
    },
  }
})
