#!/usr/bin/env node

const { spawn } = require("child_process");
const os = require("os");

const PLATFORMS = {
  "darwin-arm64": "@doku-app/darwin-arm64",
  "darwin-x64": "@doku-app/darwin-x64",
  "linux-x64": "@doku-app/linux-x64",
  "linux-arm64": "@doku-app/linux-arm64",
};

const key = `${os.platform()}-${os.arch()}`;
const pkg = PLATFORMS[key];

if (!pkg) {
  console.error(`Unsupported platform: ${key}`);
  process.exit(1);
}

let binPath;
try {
  binPath = require.resolve(`${pkg}/bin/doku`);
} catch {
  console.error(
    `Platform package ${pkg} is not installed. Try reinstalling doku-app.`
  );
  process.exit(1);
}

const child = spawn(binPath, process.argv.slice(2), { stdio: "inherit" });

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 1);
  }
});

// Forward signals to child
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => child.kill(sig));
}
