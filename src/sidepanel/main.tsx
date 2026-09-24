import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import { sidePanelHost } from '../lib/host';
import { App } from './App';
import { applyCachedTheme } from '../lib/theme';

// Before the first render, so the page opens in the user's palette rather
// than flashing the default one while settings load.
applyCachedTheme();

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App host={sidePanelHost()} />
    </StrictMode>,
  );
}
