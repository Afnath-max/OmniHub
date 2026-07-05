const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');
const http = require('http');
const fs = require('fs');

let mainWindow;
let omniRouteProcess = null;
let omniRoutePort = 20128;
let omniRouteHost = '127.0.0.1';

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
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (e) {
    console.error('Config load error:', e);
  }
}

// Save config
function saveConfig() {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (e) {
    console.error('Config save error:', e);
  }
}

// Check if OmniRoute is running
async function checkOmniRouteStatus() {
  return new Promise((resolve) => {
    const req = http.get(`http://${config.host}:${config.port}/v1/models`, (res) => {
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
    req.setTimeout(2000, () => { req.destroy(); resolve({ running: false, models: 0 }); });
  });
}

// Start OmniRoute
ipcMain.handle('omni-start', async () => {
  if (omniRouteProcess) {
    return { success: false, message: 'Already running' };
  }

  try {
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
      mainWindow?.webContents.send('omni-log', { type: 'stdout', data: data.toString() });
    });

    omniRouteProcess.stderr.on('data', (data) => {
      mainWindow?.webContents.send('omni-log', { type: 'stderr', data: data.toString() });
    });

    omniRouteProcess.on('close', (code) => {
      omniRouteProcess = null;
      mainWindow?.webContents.send('omni-stopped', { code });
    });

    omniRouteProcess.on('error', (err) => {
      omniRouteProcess = null;
      mainWindow?.webContents.send('omni-log', { type: 'error', data: err.message });
    });

    mainWindow?.webContents.send('omni-started');
    return { success: true, message: 'Started' };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

// Stop OmniRoute
ipcMain.handle('omni-stop', async () => {
  if (!omniRouteProcess) {
    return { success: false, message: 'Not running' };
  }

  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(omniRouteProcess.pid), '/t', '/f'], { shell: true });
    } else {
      omniRouteProcess.kill('SIGTERM');
    }
    omniRouteProcess = null;
    mainWindow?.webContents.send('omni-stopped', { code: 0 });
    return { success: true, message: 'Stopped' };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

// Restart OmniRoute
ipcMain.handle('omni-restart', async () => {
  await ipcMain.handle('omni-stop');
  await new Promise(r => setTimeout(r, 1000));
  return await ipcMain.handle('omni-start');
});

// Get status
ipcMain.handle('omni-status', async () => {
  const status = await checkOmniRouteStatus();
  return { ...status, pid: omniRouteProcess?.pid || null };
});

// Get models list
ipcMain.handle('omni-models', async () => {
  return new Promise((resolve) => {
    const req = http.get(`http://${config.host}:${config.port}/v1/models`, (res) => {
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
});

// Get config
ipcMain.handle('config-get', async () => {
  return config;
});

// Set config
ipcMain.handle('config-set', async (event, key, value) => {
  config[key] = value;
  saveConfig();
  return { success: true };
});

// Open dashboard in browser
ipcMain.handle('open-dashboard', async () => {
  shell.openExternal(`http://${config.host}:${config.port}`);
  return { success: true };
});

// Open external URL
ipcMain.handle('open-url', async (event, url) => {
  shell.openExternal(url);
  return { success: true };
});

// Get logs (stored in memory)
let logs = [];
ipcMain.handle('logs-get', async () => {
  return logs.slice(-500);
});

ipcMain.handle('logs-clear', async () => {
  logs = [];
  return { success: true };
});

// Capture logs
function captureLog(type, data) {
  const entry = {
    time: new Date().toISOString(),
    type,
    message: data.trim()
  };
  logs.push(entry);
  if (logs.length > 1000) logs = logs.slice(-500);
}

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
    titleBarStyle: 'hiddenInset',
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
    setTimeout(() => {
      ipcMain.handle('omni-start');
    }, 2000);
  }
});

app.on('window-all-closed', () => {
  if (omniRouteProcess) {
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
