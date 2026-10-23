import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    // GitHub Pages serves the repository subpath; Vercel and local builds serve the root.
    base: env.GITHUB_PAGES === 'true' ? '/vertice-open-world/' : '/',
    build: {
      target: 'es2022',
      sourcemap: true,
      // Fingerprinted bundles live apart from public/assets, so they can be cached forever.
      assetsDir: 'static',
      rollupOptions: {
        // Three.js changes far less often than game code: a separate file stays cached.
        output: { manualChunks: { three: ['three'] } },
      },
      // The Three.js chunk alone is ~560 kB minified (~140 kB gzip).
      chunkSizeWarningLimit: 700,
    },
    server: { host: '0.0.0.0' },
  };
});
