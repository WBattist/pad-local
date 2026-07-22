const { cpSync, existsSync, mkdirSync, rmSync } = require("node:fs");
const { dirname, join } = require("node:path");

const frontendRoot = join(__dirname, "..");
const source = join(frontendRoot, "electron");
const destination = join(frontendRoot, "desktop-app", "electron");

rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
cpSync(source, destination, { recursive: true });

// electron-builder packages desktop-app as a deliberately small app directory.
// Copy the platform-specific node-pty package installed by pnpm into that app so
// the embedded terminal has a real PTY without requiring anything from users.
const ptySource = join(dirname(require.resolve("node-pty")), "..");
const ptyDestination = join(frontendRoot, "desktop-app", "node_modules", "node-pty");
rmSync(ptyDestination, { recursive: true, force: true });
mkdirSync(ptyDestination, { recursive: true });
for (const item of ["lib", "build", "package.json", "LICENSE"]) {
  const itemSource = join(ptySource, item);
  if (existsSync(itemSource)) cpSync(itemSource, join(ptyDestination, item), { recursive: true, dereference: true });
}
const platformPrebuild = join(ptySource, "prebuilds", `${process.platform}-${process.arch}`);
if (existsSync(platformPrebuild)) {
  cpSync(platformPrebuild, join(ptyDestination, "prebuilds", `${process.platform}-${process.arch}`), { recursive: true, dereference: true });
}

const napiSource = join(ptySource, "..", "node-addon-api");
const napiDestination = join(frontendRoot, "desktop-app", "node_modules", "node-addon-api");
rmSync(napiDestination, { recursive: true, force: true });
if (existsSync(napiSource)) cpSync(napiSource, napiDestination, { recursive: true, dereference: true });
