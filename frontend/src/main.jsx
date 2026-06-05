import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Always open at the top of the page — don't let the browser restore the last
// scroll position on reload.
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual'
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
