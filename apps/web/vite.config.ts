import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  const plugins = [react(), tailwindcss()];
  try {
    // @ts-expect-error -- optional file injected by the visual tooling environment
    const m = await import('./.vite-source-tags.js');
    plugins.push(m.sourceTags());
  } catch {
    // The optional visual-tooling plugin is not present in normal development/CI.
  }

  const env = loadEnv(mode, process.cwd(), ['VITE_', 'NEXT_PUBLIC_']);
  const processEnvDefines: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    processEnvDefines[`process.env.${key}`] = JSON.stringify(value);
  }

  return {
    plugins,
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    define: processEnvDefines,
    // Dev only. The storefront calls the API with a same-origin relative path, so
    // the dev server has to forward `/api` to the API process; without this the
    // request hits Vite, comes back as the SPA HTML and every catalog call fails
    // as an invalid response. Production is served behind the same origin by the
    // reverse proxy, so this mapping must never reach a build.
    server: {
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${env.VITE_DEV_API_TARGET_PORT ?? process.env.API_PORT ?? 4000}`,
          changeOrigin: false,
        },
      },
    },
  }
})
