import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { execSync } from 'node:child_process'

function getGitSha() {
  // Vercel sets this during CI builds
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)
  }
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'dev'
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5180 },
  define: {
    __BUILD_SHA__: JSON.stringify(getGitSha()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
})
