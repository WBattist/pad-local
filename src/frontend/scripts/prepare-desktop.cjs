const { cpSync, mkdirSync, rmSync } = require("node:fs");
const { join } = require("node:path");

const frontendRoot = join(__dirname, "..");
const source = join(frontendRoot, "electron");
const destination = join(frontendRoot, "desktop-app", "electron");

rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
cpSync(source, destination, { recursive: true });
