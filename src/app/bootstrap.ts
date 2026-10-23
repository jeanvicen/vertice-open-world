import '@fontsource/cormorant-garamond/latin-300.css';
import '@fontsource-variable/manrope/wght.css';
import '@fontsource/dm-mono/latin-400.css';
import '../styles.css';
import { App } from './App';
import { BASE_URL } from './config';
import { watchInstallability } from './install';

watchInstallability();
const app = new App();
app.start();

// Offline support and installability for production builds only; development stays uncached.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${BASE_URL}sw.js`, { scope: BASE_URL })
      .catch((error: unknown) => console.warn('[VÉRTICE] Offline support is unavailable.', error));
  });
}
