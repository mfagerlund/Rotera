import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/pictorigo.css'
import './utils/componentNameOverlay'
import App from './App'

// Update document title with worktree identifier
document.title = __WORKTREE_NAME__ === 'main'
  ? 'Pictorigo'
  : `Pictorigo [${__WORKTREE_NAME__}]`

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
