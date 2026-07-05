const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');
const http = require('http');
const fs = require('fs');

let mainWindow;
let omniRouteProcess = null;
let omniRouteOwned = false;

// Store config
const configPath = path.join(app.getPath('userData'), 'config.json');
let config = {
  port: 20128,
  host: '127.0.0.1',
  password: 'CHANGEME',
  autoStart: false
};

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      config = { ...config, ...saved };
    }
  } catch (e) {
    console.error('Config load error:', e);
  }
}

function saveConfig() {
  try {
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (e) {
    console.error('Config save error:', e);
  }
}

// Logs
let logs = [];
function captureLog(type, message) {
  const entry = { time: new Date().toISOString(), type, message: message.trim() };
  logs.push(entry);
  if (logs.length > 1000) logs = logs.slice(-500);
  mainWindow?.webContents.send('omni-log', entry);
}

// HTTP check on a single host
function httpCheck(host, port, timeout) {
  return new Promise((resolve) => {
    const req = http.get(`http://${host}:${port}/v1/models`, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ running: true, models: parsed.data?.length || 0 });
        } catch {
          resolve({ running: false, models: 0 });
        }
      });
    });
    req.on('error', () => resolve({ running: false, models: 0 }));
    req.setTimeout(timeout, () => { req.destroy(); resolve({ running: false, models: 0 }); });
  });
}

// Find PID listening on port (Windows netstat)
function findPidOnPort(port) {
  try {
    const output = execSync(`netstat -ano | findstr ":${port} " | findstr "LISTENING"`, { encoding: 'utf8', timeout: 3000 });
    const lines = output.trim().split('\n').filter(l => l.includes('LISTENING'));
    if (lines.length > 0) {
      const parts = lines[0].trim().split(/\s+/);
      const pid = parseInt(parts[parts.length - 1]);
      if (pid > 0) return pid;
    }
  } catch {}
  return null;
}

// Check if OmniRoute is running — tries multiple hosts
async function checkOmniRouteStatus() {
  const hosts = [...new Set(['127.0.0.1', 'localhost', config.host])];

  for (const host of hosts) {
    const result = await httpCheck(host, config.port, 1500);
    if (result.running) {
      // Find actual PID from netstat
      const pid = findPidOnPort(config.port);
      return { running: true, models: result.models, host, pid };
    }
  }
  return { running: false, models: 0, pid: null };
}

// Start OmniRoute
async function startOmniRoute() {
  if (omniRouteProcess) {
    return { success: false, message: 'Already running (owned by app)' };
  }

  // Check if already running externally
  const status = await checkOmniRouteStatus();
  if (status.running) {
    captureLog('info', `OmniRoute detected on port ${config.port} (PID: ${status.pid || '?'})`);
    omniRouteOwned = false;
    mainWindow?.webContents.send('omni-started');
    return { success: true, message: 'Detected running instance', pid: status.pid };
  }

  // Nothing running — spawn new instance
  try {
    omniRouteOwned = true;
    const env = {
      ...process.env,
      NODE_OPTIONS: '--dns-result-order=ipv4first',
      HOST: '0.0.0.0',
      PORT: String(config.port)
    };

    omniRouteProcess = spawn('npx', ['omniroute'], {
      env, shell: true, stdio: 'pipe', detached: false
    });

    omniRouteProcess.stdout.on('data', (d) => captureLog('stdout', d.toString()));
    omniRouteProcess.stderr.on('data', (d) => captureLog('stderr', d.toString()));

    omniRouteProcess.on('close', (code) => {
      omniRouteProcess = null;
      omniRouteOwned = false;
      captureLog('info', `Process exited with code ${code}`);
      mainWindow?.webContents.send('omni-stopped', { code });
    });

    omniRouteProcess.on('error', (err) => {
      omniRouteProcess = null;
      omniRouteOwned = false;
      captureLog('error', `Spawn error: ${err.message}`);
      mainWindow?.webContents.send('omni-stopped', { code: -1 });
    });

    captureLog('info', `Spawning OmniRoute on port ${config.port}...`);

    // Wait up to 8s for it to become ready
    for (let i = 0; i < 16; i++) {
      await new Promise(r => setTimeout(r, 500));
      const check = await httpCheck('127.0.0.1', config.port, 1000);
      if (check.running) {
        captureLog('info', `OmniRoute ready (${check.models} models)`);
        mainWindow?.webContents.send('omni-started');
        return { success: true, message: 'Started', pid: omniRouteProcess?.pid };
      }
    }

    // Didn't start in time — might have crashed
    if (omniRouteProcess) {
      captureLog('error', 'OmniRoute did not respond in 8s — check logs');
      mainWindow?.webContents.send('omni-started');
      return { success: true, message: 'Spawned (waiting...)', pid: omniRouteProcess?.pid };
    }
    return { success: false, message: 'Process exited immediately' };
  } catch (err) {
    captureLog('error', `Start failed: ${err.message}`);
    return { success: false, message: err.message };
  }
}

// Stop OmniRoute
async function stopOmniRoute() {
  // We own the process — kill it
  if (omniRouteProcess && omniRouteOwned) {
    try {
      const pid = omniRouteProcess.pid;
      captureLog('info', `Killing OmniRoute (PID: ${pid})...`);
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { shell: true });
      } else {
        omniRouteProcess.kill('SIGTERM');
      }
      return { success: true, message: 'Stop signal sent' };
    } catch (err) {
      captureLog('error', `Stop failed: ${err.message}`);
      return { success: false, message: err.message };
    }
  }

  // External process — find PID and kill it
  const pid = findPidOnPort(config.port);
  if (pid) {
    try {
      captureLog('info', `Killing external OmniRoute (PID: ${pid})...`);
      spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { shell: true });
      omniRouteProcess = null;
      omniRouteOwned = false;
      return { success: true, message: `Killed external process (PID: ${pid})` };
    } catch (err) {
      captureLog('error', `Stop failed: ${err.message}`);
      return { success: false, message: err.message };
    }
  }

  return { success: false, message: 'Not running' };
}

// Restart
async function restartOmniRoute() {
  await stopOmniRoute();
  await new Promise(r => setTimeout(r, 2000));
  return await startOmniRoute();
}

// IPC
ipcMain.handle('omni-start', () => startOmniRoute());
ipcMain.handle('omni-stop', () => stopOmniRoute());
ipcMain.handle('omni-restart', () => restartOmniRoute());

ipcMain.handle('omni-status', async () => {
  const status = await checkOmniRouteStatus();
  return {
    running: status.running,
    models: status.models,
    pid: status.pid || omniRouteProcess?.pid || null,
    owned: omniRouteOwned
  };
});

ipcMain.handle('omni-models', async () => {
  const hosts = [...new Set(['127.0.0.1', 'localhost', config.host])];
  for (const host of hosts) {
    const result = await new Promise((resolve) => {
      const req = http.get(`http://${host}:${config.port}/v1/models`, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            resolve({ success: true, models: JSON.parse(data).data || [] });
          } catch {
            resolve({ success: false, models: [] });
          }
        });
      });
      req.on('error', () => resolve({ success: false, models: [] }));
      req.setTimeout(5000, () => { req.destroy(); resolve({ success: false, models: [] }); });
    });
    if (result.success) return result;
  }
  return { success: false, models: [] };
});

ipcMain.handle('config-get', () => config);
ipcMain.handle('config-set', (event, key, value) => {
  config[key] = value;
  saveConfig();
  return { success: true };
});

ipcMain.handle('open-dashboard', () => {
  shell.openExternal(`http://${config.host}:${config.port}`);
  return { success: true };
});

ipcMain.handle('open-url', (event, url) => {
  shell.openExternal(url);
  return { success: true };
});

ipcMain.handle('logs-get', () => logs.slice(-500));
ipcMain.handle('logs-clear', () => { logs = []; return { success: true }; });

// Window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#000000',
    show: false
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  loadConfig();
  createWindow();
  if (config.autoStart) setTimeout(() => startOmniRoute(), 2000);
});

app.on('window-all-closed', async () => {
  if (omniRouteProcess && omniRouteOwned) {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(omniRouteProcess.pid), '/t', '/f'], { shell: true });
    } else {
      omniRouteProcess.kill('SIGTERM');
    }
  }
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
