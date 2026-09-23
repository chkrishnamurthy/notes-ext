import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import { sidePanelHost } from '../lib/host';
import { App } from './App';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App host={sidePanelHost()} />
    </StrictMode>,
  );
}
