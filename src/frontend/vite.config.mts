import { defineConfig, loadEnv } from "vite";
import { fileURLToPath } from "node:url";
import { dirname, resolve as pathResolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// Resolve Code-OSS monaco-vscode-api internal subpath imports
// (`@codingame/monaco-vscode-api/vscode/...`) directly to source files.
// Their package.json exports map substitutes `./vscode/*` -> `./vscode/src/*.js`,
// which Node honors but Rollup sometimes fails to apply for transitive
// cross-package imports. This resolver short-circuits that resolution.
const monacoVscodeApiRoot = pathResolve(
  dirname(require.resolve('@codingame/monaco-vscode-api')),
  'vscode',
  'src'
);

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    base: './',
    plugins: [
      {
        name: 'pad-local-excalidraw-offline',
        enforce: 'pre',
        transform(code, id) {
          if (!id.includes('@atyrode/excalidraw') || !code.includes('ASSETS_FALLBACK_URL') || !code.includes('esm.sh')) return null;
          const fallbackPush = /return ([A-Za-z_$][\w$]*)\.push\(new URL\(([A-Za-z_$][\w$]*),([A-Za-z_$][\w$]*)\.ASSETS_FALLBACK_URL\)\),\1/;
          const patched = code.replace(fallbackPush, 'return $1');
          if (patched === code) throw new Error('Could not remove Excalidraw CDN font fallback.');
          return { code: patched, map: null };
        },
      },
      {
        // Resolve Code-OSS monaco-vscode-api internal subpath imports
        // (`@codingame/monaco-vscode-api/vscode/<rest>`) directly to the
        // matching source file at `<api>/vscode/src/<rest>.js` (or `.css`).
        // The package exports map defines this exact substitution but Rollup
        // fails to apply it for transitive cross-package imports. This
        // resolver short-circuits that resolution. We compute the absolute
        // target path with pathResolve so it is correct on Windows AND Linux.
        name: 'pad-local-monaco-vscode-api-subpath-resolver',
        enforce: 'pre',
        async resolveId(source, importer, options) {
          if (!source.startsWith('@codingame/monaco-vscode-api/vscode/')) return undefined;
          const sub = source.slice('@codingame/monaco-vscode-api/vscode/'.length);
          // Preserve any `?query` suffix (e.g. `?inline` from the css plugin below).
          let query = '';
          let stem = sub;
          const qIndex = sub.indexOf('?');
          if (qIndex >= 0) { query = sub.slice(qIndex); stem = sub.slice(0, qIndex); }
          // The package exports map exposes both `./vscode/*.css` and `./vscode/*`
          // (the latter substituting to `./vscode/src/*.js`). Pick the extension
          // accordingly so we don't append `.js` onto a `.css` import.
          const cssMatch = stem.match(/\.css$/);
          const target = cssMatch
            ? pathResolve(monacoVscodeApiRoot, stem)
            : pathResolve(monacoVscodeApiRoot, stem + '.js');
          const resolved = await this.resolve(target + query, importer, { ...options, skipSelf: true });
          if (resolved) return resolved;
          // Fall back to returning the absolute path directly; Rollup accepts
          // an {id} with an absolute filesystem path.
          return query ? { id: target + query } : { id: target };
        },
      },
      {
        // Code-OSS monaco-vscode ships CSS via ESM imports; inline them as strings
        // so they pass through the VSCode style injection path instead of <link>.
        name: 'load-vscode-css-as-string',
        enforce: 'pre',
        async resolveId(source, importer, options) {
          const resolved = await this.resolve(source, importer, options);
          if (!resolved) return undefined;
          if (resolved.id.match(/node_modules[\\/](?:@codingame[\\/]monaco-vscode|vscode|monaco-editor)[^]*\.css$/)) {
            return { ...resolved, id: `${resolved.id}?inline` };
          }
          return undefined;
        },
      },
    ],
    resolve: {
      dedupe: ['vscode', 'monaco-editor'],
    },
    worker: {
      format: 'es',
    },
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
      include: [
        '@codingame/monaco-vscode-api',
        '@codingame/monaco-vscode-api/monaco',
        '@codingame/monaco-vscode-api/extensions',
        'vscode/localExtensionHost',
        'marked',
        '@codingame/monaco-vscode-configuration-service-override',
        '@codingame/monaco-vscode-extensions-service-override',
        '@codingame/monaco-vscode-extension-gallery-service-override',
        '@codingame/monaco-vscode-files-service-override',
        '@codingame/monaco-vscode-keybindings-service-override',
        '@codingame/monaco-vscode-quickaccess-service-override',
        '@codingame/monaco-vscode-theme-service-override',
      ],
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
