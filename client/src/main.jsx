import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Auto-reload on deployment chunk rotation to eliminate blank screen
window.addEventListener('vite:preloadError', (event) => {
  console.warn('Vite chunk hash updated on server, refreshing page...', event);
  window.location.reload();
});

class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('Fatal application error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a', color: '#ffffff', fontFamily: 'sans-serif', padding: 24, textAlign: 'center' }}>
          <div style={{ backgroundColor: '#1e293b', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 20, padding: 32, maxWidth: 460, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⚡</div>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 8px 0', color: '#f8fafc' }}>Workspace Encountered An Issue</h2>
            <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 20px 0', lineHeight: 1.5 }}>
              The application encountered an unexpected state. You can reload to restore your active session.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{ padding: '10px 20px', backgroundColor: '#10b981', color: '#0f172a', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
              >
                Reload Workspace
              </button>
              <button
                type="button"
                onClick={() => { localStorage.clear(); window.location.href = '/'; }}
                style={{ padding: '10px 16px', backgroundColor: '#334155', color: '#e2e8f0', border: 'none', borderRadius: 10, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}
              >
                Clear Cache &amp; Reset
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>,
)

// Register PWA Service Worker for Mobile App Installation & Offline Caching
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // Actively check for Service Worker updates on every launch
      reg.update().catch(() => {});
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'activated') {
              console.log('Eco Green CMS updated to latest version');
            }
          });
        }
      });
    }).catch((err) => {
      console.log('SW registration note:', err);
    });
  });
}
