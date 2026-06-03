import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { postMessage } from './vscodeApi';
import './styles.css';

// Surface any webview-side runtime error in the host's output channel.
window.addEventListener('error', (e) => {
  postMessage({ type: 'log', text: `window error: ${e.message}` });
});
window.addEventListener('unhandledrejection', (e) => {
  postMessage({ type: 'log', text: `unhandled rejection: ${String(e.reason)}` });
});

postMessage({ type: 'log', text: 'webview script loaded' });

const container = document.getElementById('root');
if (!container) {
  postMessage({ type: 'log', text: 'ERROR: #root element not found' });
} else {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
  postMessage({ type: 'log', text: 'React mounted' });
}
