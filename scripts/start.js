#!/usr/bin/env node
const { spawn } = require('node:child_process');
const { join } = require('node:path');

const project = process.argv[2] || 'main';
const PORTS = {
  'main': 4200,
  'sample-reflect': 4201,
  'sharing-menu': 4202,
};

if (!PORTS[project]) {
  console.error(`Unknown project: ${project}. Use 'main', 'sample-reflect', or 'sharing-menu'.`);
  process.exit(1);
}

const ngBin = join(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'ng.cmd' : 'ng');
const args = [
  'serve',
  project,
  '--port', String(PORTS[project]),
  '--host', '0.0.0.0',
  '--proxy-config', 'proxy.conf.json',
];

const child = spawn(ngBin, args, { stdio: 'inherit' });

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`ng serve terminated due to signal: ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 0);
});
