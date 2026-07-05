// State
let currentTab = 'dashboard';
let isRunning = false;
let startTime = null;
let models = [];

// Tab switching
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active', 'bg-zinc-800', 'text-white'));
  
  document.getElementById(`tab-${tab}`).classList.remove('hidden');
  document.getElementById(`tab-${tab}`).classList.add('fade-in');
  
  const navBtn = document.getElementById(`nav-${tab}`);
  navBtn.classList.add('active', 'bg-zinc-800', 'text-white');
  navBtn.classList.remove('text-zinc-400');
}

// Update UI based on status
function updateUI(running) {
  isRunning = running;
  
  // Status indicator
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const statusIndicator = document.getElementById('statusIndicator');
  
  if (running) {
    statusDot.className = 'w-2 h-2 bg-green-500 rounded-full pulse-dot';
    statusText.textContent = 'Running';
    statusText.className = 'text-sm text-green-500';
    statusIndicator.className = 'flex items-center gap-2 px-3 py-1.5 bg-green-500/10 rounded-full';
  } else {
    statusDot.className = 'w-2 h-2 bg-zinc-500 rounded-full';
    statusText.textContent = 'Stopped';
    statusText.className = 'text-sm text-zinc-400';
    statusIndicator.className = 'flex items-center gap-2 px-3 py-1.5 bg-zinc-800 rounded-full';
  }
  
  // Dashboard
  document.getElementById('dashStatus').textContent = running ? 'Running' : 'Stopped';
  document.getElementById('dashStatus').className = running ? 'text-2xl font-bold text-green-500' : 'text-2xl font-bold text-zinc-500';
  
  // Control buttons
  const startBtns = ['dashStartBtn', 'controlStartBtn'];
  const stopBtns = ['dashStopBtn', 'controlStopBtn'];
  
  startBtns.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = running;
  });
  
  stopBtns.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = !running;
  });
  
  // Service status
  const serviceStatusDot = document.getElementById('serviceStatusDot');
  const serviceStatusText = document.getElementById('serviceStatusText');
  
  if (running) {
    serviceStatusDot.className = 'w-3 h-3 bg-green-500 rounded-full pulse-dot';
    serviceStatusText.textContent = 'Service is running';
    serviceStatusText.className = 'font-medium text-green-500';
  } else {
    serviceStatusDot.className = 'w-3 h-3 bg-zinc-500 rounded-full';
    serviceStatusText.textContent = 'Service is stopped';
    serviceStatusText.className = 'font-medium text-zinc-400';
  }
  
  // Uptime
  if (running && startTime) {
    updateUptime();
  } else {
    document.getElementById('dashUptime').textContent = '--';
  }
}

// Update uptime
function updateUptime() {
  if (!startTime || !isRunning) return;
  
  const diff = Math.floor((Date.now() - startTime) / 1000);
  const hours = Math.floor(diff / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const seconds = diff % 60;
  
  let text = '';
  if (hours > 0) text += `${hours}h `;
  if (minutes > 0) text += `${minutes}m `;
  text += `${seconds}s`;
  
  document.getElementById('dashUptime').textContent = text;
}

// Start OmniRoute
async function startOmni() {
  const result = await window.omni.start();
  if (result.success) {
    startTime = Date.now();
    addLog('info', 'Starting OmniRoute...');
  } else {
    addLog('error', `Failed to start: ${result.message}`);
  }
}

// Stop OmniRoute
async function stopOmni() {
  const result = await window.omni.stop();
  if (result.success) {
    startTime = null;
    addLog('info', 'Stopping OmniRoute...');
  } else {
    addLog('error', `Failed to stop: ${result.message}`);
  }
}

// Restart OmniRoute
async function restartOmni() {
  const result = await window.omni.restart();
  if (result.success) {
    startTime = Date.now();
    addLog('info', 'Restarting OmniRoute...');
  } else {
    addLog('error', `Failed to restart: ${result.message}`);
  }
}

// Refresh models
async function refreshModels() {
  const container = document.getElementById('modelsContainer');
  container.innerHTML = '<div class="text-zinc-500 text-center py-10 col-span-full">Loading models...</div>';
  
  const result = await window.omni.models();
  
  if (result.success && result.models.length > 0) {
    models = result.models;
    document.getElementById('dashModels').textContent = models.length;
    
    container.innerHTML = models.map(m => `
      <div class="bg-zinc-900 rounded-xl p-4 border border-zinc-800 hover:border-zinc-700 transition-all">
        <div class="flex items-center gap-3 mb-2">
          <div class="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center text-sm font-bold">
            ${m.id.substring(0, 2).toUpperCase()}
          </div>
          <div class="flex-1 min-w-0">
            <div class="font-medium text-sm truncate">${m.name || m.id}</div>
            <div class="text-xs text-zinc-500 truncate">${m.owned_by || 'unknown'}</div>
          </div>
        </div>
        <div class="text-xs text-zinc-400 font-mono">${m.id}</div>
        ${m.context_length ? `<div class="text-xs text-zinc-500 mt-1">Context: ${(m.context_length / 1000).toFixed(0)}k</div>` : ''}
      </div>
    `).join('');
  } else {
    container.innerHTML = '<div class="text-zinc-500 text-center py-10 col-span-full">No models available. Start OmniRoute first.</div>';
  }
}

// Add log entry
function addLog(type, message) {
  const container = document.getElementById('logsContainer');
  const empty = container.querySelector('.text-center');
  if (empty) empty.remove();
  
  const time = new Date().toLocaleTimeString();
  const colors = {
    stdout: 'text-green-400',
    stderr: 'text-yellow-400',
    error: 'text-red-400',
    info: 'text-cyan-400'
  };
  
  const entry = document.createElement('div');
  entry.className = `log-entry py-1 ${colors[type] || 'text-zinc-400'}`;
  entry.innerHTML = `<span class="text-zinc-600">[${time}]</span> ${escapeHtml(message)}`;
  
  container.appendChild(entry);
  
  if (document.getElementById('autoScroll')?.checked) {
    container.scrollTop = container.scrollHeight;
  }
}

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Refresh logs
async function refreshLogs() {
  const result = await window.omni.getLogs();
  const container = document.getElementById('logsContainer');
  
  if (result && result.length > 0) {
    container.innerHTML = '';
    result.forEach(log => addLog(log.type, log.message));
  }
}

// Clear logs
async function clearLogs() {
  await window.omni.clearLogs();
  document.getElementById('logsContainer').innerHTML = '<div class="text-zinc-500 text-center py-10">Logs cleared.</div>';
}

// Load settings
async function loadSettings() {
  const config = await window.omni.getConfig();
  document.getElementById('settingHost').value = config.host || '127.0.0.1';
  document.getElementById('settingPort').value = config.port || 20128;
  document.getElementById('settingPassword').value = config.password || 'CHANGEME';
  document.getElementById('settingAutoStart').checked = config.autoStart || false;
  document.getElementById('dashPort').textContent = config.port || 20128;
  document.getElementById('processPort').textContent = config.port || 20128;
}

// Save settings
async function saveSettings() {
  const host = document.getElementById('settingHost').value;
  const port = parseInt(document.getElementById('settingPort').value);
  const password = document.getElementById('settingPassword').value;
  const autoStart = document.getElementById('settingAutoStart').checked;
  
  await window.omni.setConfig('host', host);
  await window.omni.setConfig('port', port);
  await window.omni.setConfig('password', password);
  await window.omni.setConfig('autoStart', autoStart);
  
  document.getElementById('dashPort').textContent = port;
  document.getElementById('processPort').textContent = port;
  
  addLog('info', 'Settings saved');
}

// Event listeners
window.omni.onLog((data) => {
  addLog(data.type, data.data);
});

window.omni.onStarted(() => {
  updateUI(true);
  setTimeout(refreshModels, 2000);
});

window.omni.onStopped((data) => {
  updateUI(false);
  startTime = null;
  models = [];
  document.getElementById('dashModels').textContent = '0';
});

// Initialize
async function init() {
  await loadSettings();
  
  const status = await window.omni.status();
  updateUI(status.running);
  
  if (status.running) {
    startTime = Date.now() - 1000;
    refreshModels();
  }
  
  setInterval(updateUptime, 1000);
  setInterval(async () => {
    const status = await window.omni.status();
    updateUI(status.running);
  }, 5000);
}

// Nav button styles
document.querySelectorAll('.nav-btn').forEach(btn => {
  if (!btn.classList.contains('active')) {
    btn.classList.add('text-zinc-400', 'hover:bg-zinc-800', 'hover:text-white');
  }
});

// Start
init();
