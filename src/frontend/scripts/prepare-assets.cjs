const { cpSync, mkdirSync, rmSync } = require("node:fs");
const { join } = require("node:path");

const frontendRoot = join(__dirname, "..");
const { existsSync, readdirSync } = require("node:fs");
const pnpmDir = join(frontendRoot, "node_modules", ".pnpm");

// Locate the pnpm-prefixed directory for the extensions service override.
// The actual package folder name is @codingame+monaco-vscode-extensions-service-override@<version>.
const extPkgDir = readdirSync(pnpmDir).find(name => name.startsWith('@codingame+monaco-vscode-extensions-service-override@'));
const extensionsWorkerSrc = extPkgDir
  ? join(pnpmDir, extPkgDir, "node_modules", "@codingame", "monaco-vscode-extensions-service-override", "vscode", "src", "vs", "workbench", "services", "extensions", "worker")
  : null;

const copies = [
  {
    source: join(frontendRoot, "node_modules", "@atyrode", "excalidraw", "dist", "prod", "fonts"),
    destination: join(frontendRoot, "public", "fonts"),
  },
  {
    source: join(frontendRoot, "node_modules", ".pnpm", "@codingame+monaco-vscode-api@36.0.0", "node_modules", "@codingame", "monaco-vscode-api", "workers", "extensionHost.worker.js"),
    destination: join(frontendRoot, "public", "workers", "extensionHost.worker.js"),
  },
  ...(extensionsWorkerSrc && existsSync(join(extensionsWorkerSrc, "webWorkerExtensionHostIframe.html"))
    ? [{
        source: join(extensionsWorkerSrc, "webWorkerExtensionHostIframe.html"),
        destination: join(frontendRoot, "public", "workers", "webWorkerExtensionHostIframe.html"),
      }]
    : []),
];

const { dirname } = require("node:path");
for (const { source, destination } of copies) {
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination, { recursive: true });
}
