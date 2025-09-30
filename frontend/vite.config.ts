import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Determine worktree identifier from the grandparent directory (frontend's parent's parent)
const rootDir = path.basename(path.resolve(process.cwd(), '..'))
const worktreeName = rootDir

// Assign unique port based on worktree
const portMap: Record<string, number> = {
  'Pictorigo-worktree': 5174,
  'Pictorigo': 5173,
}

const port = portMap[worktreeName] || 5173

export default defineConfig({
  plugins: [react()],
  server: {
    port: port,
    strictPort: true, // Fail if port is already in use instead of trying next port
  },
  define: {
    __WORKTREE_NAME__: JSON.stringify(worktreeName),
  }
})