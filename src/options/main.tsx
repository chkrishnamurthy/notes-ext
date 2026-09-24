import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import { Options } from './Options';
import { applyCachedTheme } from '../lib/theme';
import { applyLanguage, t } from '../lib/i18n';

// Before the first render, so the page opens in the user's palette rather
// than flashing the default one while settings load.
applyCachedTheme();
applyLanguage();
document.title = t('settingsPageTitle');

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <Options />
    </StrictMode>,
  );
}
