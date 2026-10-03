import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Import console error fixer for cleaner development experience
import consoleErrorFixer from './utils/consoleErrorFixer.js'
import './utils/globalErrorHandler.js'
import { guardedReload } from './utils/guardedReload.js'
import { clearAllAndSignOut } from './utils/sessionCleanup.js'
import { needsDeploymentReset } from './utils/deploymentVersion.js'

/* global __APP_BUILD_ID__ */
const APP_BUILD_ID = typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : 'dev'

// After a redeploy, a stale open tab lazy-loading an old hashed chunk gets a
// 404 rewritten to index.html (text/html) → module MIME error. Vite reports
// the failed dynamic import via this event; reload once to pick up the new
// bundle. If the guard blocks (second failure within 60s), let the error
// propagate so the ErrorBoundary shows its manual-refresh screen.
window.addEventListener('vite:preloadError', (event) => {
  if (guardedReload('chunk')) event.preventDefault()
})

// Temporarily disable console error suppression to debug registration issues
// if (import.meta.env.DEV) {
//   consoleErrorFixer.init();
// }

const render = () => ReactDOM.createRoot(document.getElementById('root')).render(
  import.meta.env.PROD ? (
    <React.StrictMode>
      <App />
    </React.StrictMode>
  ) : (
    <App />
  )
)

const start = async () => {
  if (import.meta.env.PROD && needsDeploymentReset(localStorage.getItem('app_build_id'), APP_BUILD_ID)) {
    await clearAllAndSignOut({ preserveRemembered: false });
    localStorage.setItem('app_build_id', APP_BUILD_ID);
  }
  render();
}

void start()
