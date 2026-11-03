const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const cortex = require('./cortex');

const ENV_PATH = path.join(__dirname, '.env');

function loadEnv() {
  if (fs.existsSync(ENV_PATH)) {
    const lines = fs.readFileSync(ENV_PATH, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = match[2] || '';
        val = val.trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnv();

const PORT = process.env.PORT || 3847;
const TUNNEL_TOKEN = process.env.CLOUDFLARE_TUNNEL_TOKEN || process.env.TUNNEL_TOKEN;
const LOG_FILE = path.join(__dirname, 'supervisor.log');

function log(msg) {
  const line = `[${new Date().toISOString()}] [Supervisor] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
  } catch (e) {}
}

let serverProcess = null;
let tunnelProcess = null;
let isShuttingDown = false;

function startServer() {
  if (isShuttingDown) return;
  log("Starting Uncle Hoggle Node.js Server (server.js)...");

  serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  serverProcess.stdout.on('data', data => {
    const str = data.toString().trim();
    if (str) log(`[Server] ${str}`);
  });

  serverProcess.stderr.on('data', data => {
    const str = data.toString().trim();
    if (str) log(`[Server ERR] ${str}`);
  });

  serverProcess.on('exit', (code, signal) => {
    log(`Server process exited with code=${code}, signal=${signal}`);
    serverProcess = null;
    if (!isShuttingDown) {
      log("Restarting server in 2 seconds...");
      setTimeout(startServer, 2000);
    }
  });
}

function startTunnel() {
  if (isShuttingDown) return;
  const cloudflaredBin = path.join(__dirname, 'cloudflared.exe');

  if (!fs.existsSync(cloudflaredBin)) {
    log("cloudflared.exe not found in workspace; skipping tunnel spawn.");
    return;
  }

  let tunnelArgs;
  const configPath = path.join(__dirname, 'config.yml');
  if (TUNNEL_TOKEN) {
    log("Starting Cloudflare Named Tunnel using configured token...");
    tunnelArgs = ['tunnel', 'run', '--token', TUNNEL_TOKEN];
  } else if (fs.existsSync(configPath)) {
    log("Starting Cloudflare Named Tunnel for UncleHoggle.com using config.yml...");
    tunnelArgs = ['tunnel', '--config', configPath, 'run'];
  } else {
    log(`Starting Cloudflare Quick Tunnel forwarding to http://127.0.0.1:${PORT}...`);
    tunnelArgs = ['tunnel', '--url', `http://127.0.0.1:${PORT}`];
  }

  tunnelProcess = spawn(cloudflaredBin, tunnelArgs, {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  tunnelProcess.stdout.on('data', data => {
    const text = data.toString();
    log(`[Tunnel] ${text.trim()}`);
    parseTunnelOutput(text);
  });

  tunnelProcess.stderr.on('data', data => {
    const text = data.toString();
    log(`[Tunnel] ${text.trim()}`);
    parseTunnelOutput(text);
  });

  tunnelProcess.on('exit', (code, signal) => {
    log(`Tunnel process exited with code=${code}, signal=${signal}`);
    tunnelProcess = null;
    if (!isShuttingDown) {
      log("Restarting tunnel in 5 seconds...");
      setTimeout(startTunnel, 5000);
    }
  });
}

function parseTunnelOutput(text) {
  // Check for trycloudflare.com URL
  const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
  if (match) {
    const url = match[0];
    log(`>>> PUBLIC TUNNEL READY: ${url} <<<`);
    cortex.update(s => {
      if (!s.shared_memory) s.shared_memory = {};
      s.shared_memory.live_tunnel_url = url;
      s.shared_memory.tunnel_status = "active";
    });
  }
}

function shutdown() {
  isShuttingDown = true;
  log("Shutting down Uncle Hoggle supervisor and child processes...");

  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }
  if (tunnelProcess) {
    tunnelProcess.kill('SIGTERM');
  }

  setTimeout(() => {
    process.exit(0);
  }, 1000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

log("Uncle Hoggle 24/7 Resilience Supervisor starting up.");
startServer();
startTunnel();
