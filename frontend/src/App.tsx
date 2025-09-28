import React from 'react'
import MainLayout from './components/MainLayout'
import EnhancedMainLayout from './components/EnhancedMainLayout'
import './styles/pictorigo.css'
import './styles/enhanced-workspace.css'

function App() {
  // Enhanced layout should now be fixed
  const useEnhancedLayout = true

  return useEnhancedLayout ? <EnhancedMainLayout /> : <MainLayout />
}

export default App