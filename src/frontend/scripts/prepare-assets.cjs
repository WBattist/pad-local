const { cpSync, mkdirSync, rmSync } = require("node:fs");
const { join } = require("node:path");

const frontendRoot = join(__dirname, "..");
const source = join(frontendRoot, "node_modules", "@atyrode", "excalidraw", "dist", "prod", "fonts");
const destination = join(frontendRoot, "public", "fonts");

rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
cpSync(source, destination, { recursive: true });
