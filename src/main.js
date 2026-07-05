const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

let mainWindow;
let omniRouteProcess = null;
let omniRouteOwned = false; // true if we spawned it

// Store config
const configPath = path.join(app.getPath('userData'), 'config.json');
let config = {
  port: 20128,
  host: '127.0.0.1',
  password: 'CHANGEME',
  autoStart: false
};

// Load config
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

// Save config
function saveConfig() {
  try {
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (e) {
    console.error('Config save error:', e);
  }
}

// Logs storage
let logs = [];
function captureLog(type, message) {
  const entry = { time: new Date().toISOString(), type, message: message.trim() };
  logs.push(entry);
  if (logs.length > 1000) logs = logs.slice(-500);
  mainWindow?.webContents.send('omni-log', entry);
}

// Check if OmniRoute is running via HTTP (tries both localhost and configured host)
async function checkOmniRouteStatus() {
  const hosts = ['127.0.0.1', config.host];
  // Deduplicate
  const uniqueHosts = [...new Set(hosts)];

  for (const host of uniqueHosts) {
    const result = await new Promise((resolve) => {
      const req = http.get(`http://${host}:${config.port}/v1/models`, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve({ running: true, models: parsed.data?.length || 0, host });
          } catch {
            resolve({ running: false, models: 0, host });
          }
        });
      });
      req.on('error', () => resolve({ running: false, models: 0, host }));
      req.setTimeout(2000, () => { req.destroy(); resolve({ running: false, models: 0, host }); });
    });
    if (result.running) return result;
  }
  return { running: false, models: 0 };
}

// Start OmniRoute
async function startOmniRoute() {
  if (omniRouteProcess) {
    return { success: false, message: 'Already running' };
  }

  // Check if OmniRoute is already running externally (e.g. from terminal)
  const status = await checkOmniRouteStatus();
  if (status.running) {
    captureLog('info', `OmniRoute already running on port ${config.port} (external process)`);
    omniRouteOwned = false;
    mainWindow?.webContents.send('omni-started');
    return { success: true, message: 'Already running externally' };
  }

  try {
    omniRouteOwned = true;
    const env = {
      ...process.env,
      NODE_OPTIONS: '--dns-result-order=ipv4first',
      HOST: config.host,
      PORT: String(config.port)
    };

    omniRouteProcess = spawn('npx', ['omniroute'], {
      env,
      shell: true,
      stdio: 'pipe',
      detached: false
    });

    omniRouteProcess.stdout.on('data', (data) => {
      captureLog('stdout', data.toString());
    });

    omniRouteProcess.stderr.on('data', (data) => {
      captureLog('stderr', data.toString());
    });

    omniRouteProcess.on('close', (code) => {
      omniRouteProcess = null;
      captureLog('info', `Process exited with code ${code}`);
      mainWindow?.webContents.send('omni-stopped', { code });
    });

    omniRouteProcess.on('error', (err) => {
      omniRouteProcess = null;
      captureLog('error', `Spawn error: ${err.message}`);
      mainWindow?.webContents.send('omni-stopped', { code: -1 });
    });

    captureLog('info', 'OmniRoute starting...');
    mainWindow?.webContents.send('omni-started');
    return { success: true, message: 'Started' };
  } catch (err) {
    captureLog('error', `Start failed: ${err.message}`);
    return { success: false, message: err.message };
  }
}

// Stop OmniRoute
async function stopOmniRoute() {
  if (!omniRouteProcess && !omniRouteOwned) {
    // Check if running externally
    const status = await checkOmniRouteStatus();
    if (!status.running) {
      return { success: false, message: 'Not running' };
    }
    // Running externally - can't kill it
    captureLog('info', 'OmniRoute is running externally — cannot stop from app');
    return { success: false, message: 'Running externally — stop it from terminal' };
  }

  if (!omniRouteProcess) {
    return { success: false, message: 'Not running' };
  }

  try {
    const pid = omniRouteProcess.pid;
    captureLog('info', 'Stopping OmniRoute...');

    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { shell: true });
    } else {
      omniRouteProcess.kill('SIGTERM');
    }

    // Don't set omniRouteProcess = null here — let 'close' event handle it
    return { success: true, message: 'Stop signal sent' };
  } catch (err) {
    captureLog('error', `Stop failed: ${err.message}`);
    return { success: false, message: err.message };
  }
}

// Restart OmniRoute
async function restartOmniRoute() {
  const stopResult = await stopOmniRoute();
  // Wait for process to fully exit
  await new Promise(r => setTimeout(r, 1500));
  return await startOmniRoute();
}

// IPC Handlers
ipcMain.handle('omni-start', () => startOmniRoute());
ipcMain.handle('omni-stop', () => stopOmniRoute());
ipcMain.handle('omni-restart', () => restartOmniRoute());

ipcMain.handle('omni-status', async () => {
  const status = await checkOmniRouteStatus();
  return { ...status, pid: omniRouteProcess?.pid || null };
});

ipcMain.handle('omni-models', async () => {
  const hosts = ['127.0.0.1', config.host];
  const uniqueHosts = [...new Set(hosts)];

  for (const host of uniqueHosts) {
    const result = await new Promise((resolve) => {
      const req = http.get(`http://${host}:${config.port}/v1/models`, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve({ success: true, models: parsed.data || [] });
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

ipcMain.handle('logs-clear', () => {
  logs = [];
  return { success: true };
});

// Create window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#000000',
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  loadConfig();
  createWindow();

  // Auto-start if configured
  if (config.autoStart) {
    setTimeout(() => startOmniRoute(), 2000);
  }
});

app.on('window-all-closed', () => {
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
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
