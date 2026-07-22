import { defineConfig, loadEnv } from "vite";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    base: './',
    plugins: [{
      name: 'pad-local-excalidraw-offline',
      enforce: 'pre',
      transform(code, id) {
        if (!id.includes('@atyrode/excalidraw') || !code.includes('ASSETS_FALLBACK_URL') || !code.includes('esm.sh')) return null;
        const fallbackPush = /return ([A-Za-z_$][\w$]*)\.push\(new URL\(([A-Za-z_$][\w$]*),([A-Za-z_$][\w$]*)\.ASSETS_FALLBACK_URL\)\),\1/;
        const patched = code.replace(fallbackPush, 'return $1');
        if (patched === code) throw new Error('Could not remove Excalidraw CDN font fallback.');
        return { code: patched, map: null };
      },
    }],
    server: {
      port: 3003,
      open: false, // open the browser where app is started
      proxy: {
        // Proxy PostHog requests to avoid CORS issues
        '/posthog': {
          target: 'https://eu.i.posthog.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/posthog/, ''),
        },
      },
    },
    publicDir: "public",
    optimizeDeps: {
      esbuildOptions: {
        // Bumping to 2022 due to "Arbitrary module namespace identifier names" not being
        // supported in Vite's default browser target https://github.com/vitejs/vite/issues/13556
        target: "es2022",
        treeShaking: true,
      },
    },
    build: {
      outDir: 'desktop-app/dist',
      emptyOutDir: true,
      target: 'es2022',
    },
  };
});
