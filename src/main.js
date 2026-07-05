const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');

let mainWindow;
let omniRouteProcess = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0a0a'
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

// Start OmniRoute
ipcMain.handle('omni-start', async () => {
  return new Promise((resolve) => {
    if (omniRouteProcess) {
      resolve({ success: false, message: 'Already running' });
      return;
    }

    const env = {
      ...process.env,
      NODE_OPTIONS: '--dns-result-order=ipv4first',
      HOST: '0.0.0.0',
      PORT: '20128'
    };

    omniRouteProcess = spawn('npx', ['omniroute'], {
      env,
      shell: true,
      stdio: 'pipe'
    });

    omniRouteProcess.stdout.on('data', (data) => {
      mainWindow?.webContents.send('omni-log', data.toString());
    });

    omniRouteProcess.stderr.on('data', (data) => {
      mainWindow?.webContents.send('omni-log', data.toString());
    });

    omniRouteProcess.on('close', (code) => {
      omniRouteProcess = null;
      mainWindow?.webContents.send('omni-status', { running: false, code });
    });

    omniRouteProcess.on('error', (err) => {
      omniRouteProcess = null;
      mainWindow?.webContents.send('omni-log', `Error: ${err.message}`);
    });

    mainWindow?.webContents.send('omni-status', { running: true });
    resolve({ success: true, message: 'Started' });
  });
});

// Stop OmniRoute
ipcMain.handle('omni-stop', async () => {
  return new Promise((resolve) => {
    if (!omniRouteProcess) {
      resolve({ success: false, message: 'Not running' });
      return;
    }

    omniRouteProcess.kill('SIGTERM');
    omniRouteProcess = null;
    mainWindow?.webContents.send('omni-status', { running: false });
    resolve({ success: true, message: 'Stopped' });
  });
});

// Check status
ipcMain.handle('omni-status', async () => {
  return { running: omniRouteProcess !== null };
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (omniRouteProcess) {
    omniRouteProcess.kill('SIGTERM');
  }
  app.quit();
});
