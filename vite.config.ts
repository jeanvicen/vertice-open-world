import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: env.GITHUB_PAGES === 'true' ? '/vertice-open-world/' : '/',
    build: { target: 'es2022', sourcemap: true },
    server: { host: '0.0.0.0' },
  };
});
