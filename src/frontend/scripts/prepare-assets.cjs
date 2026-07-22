const { cpSync, mkdirSync, rmSync } = require("node:fs");
const { join } = require("node:path");

const frontendRoot = join(__dirname, "..");
const copies = [
  {
    source: join(frontendRoot, "node_modules", "@atyrode", "excalidraw", "dist", "prod", "fonts"),
    destination: join(frontendRoot, "public", "fonts"),
  },
  {
    source: join(frontendRoot, "node_modules", "monaco-editor", "min", "vs"),
    destination: join(frontendRoot, "public", "assets", "monaco", "vs"),
  },
];

for (const { source, destination } of copies) {
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(destination, { recursive: true });
  cpSync(source, destination, { recursive: true });
}
