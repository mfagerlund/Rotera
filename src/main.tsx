import React from 'react'
import ReactDOM from 'react-dom/client'
import { configure } from 'mobx'
import './styles/pictorigo.css'
import './utils/componentNameOverlay'
import App from './App'

// Configure MobX for Angular-like behavior: allow direct mutations
configure({
  enforceActions: 'never',
  computedRequiresReaction: false,
  reactionRequiresObservable: false,
  observableRequiresReaction: false,
  disableErrorBoundaries: false
})

// Update document title with worktree identifier
document.title = __WORKTREE_NAME__ === 'main'
  ? 'Pictorigo'
  : __WORKTREE_NAME__

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
