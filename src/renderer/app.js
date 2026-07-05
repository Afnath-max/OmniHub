// State
let currentTab = 'dashboard';
let isRunning = false;
let startTime = null;
let models = [];

// Tab switching
function switchTab(tab) {
  currentTab = tab;

  // Hide all tabs, show selected
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.getElementById(`tab-${tab}`).classList.remove('hidden');
  document.getElementById(`tab-${tab}`).classList.add('fade-in');

  // Reset all nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('active', 'bg-zinc-800', 'text-white');
    btn.classList.add('text-zinc-400');
  });

  // Highlight selected nav
  const navBtn = document.getElementById(`nav-${tab}`);
  navBtn.classList.add('active', 'bg-zinc-800', 'text-white');
  navBtn.classList.remove('text-zinc-400');
}

// Update UI based on status
function updateUI(running, pid) {
  isRunning = running;

  // Header status badge
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

  // Dashboard status
  document.getElementById('dashStatus').textContent = running ? 'Running' : 'Stopped';
  document.getElementById('dashStatus').className = running ? 'text-2xl font-bold text-green-500' : 'text-2xl font-bold text-zinc-500';

  // Enable/disable buttons
  ['dashStartBtn', 'controlStartBtn'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = running;
  });
  ['dashStopBtn', 'controlStopBtn'].forEach(id => {
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

  // PID
  document.getElementById('processPid').textContent = pid || '--';

  // Uptime
  if (running && startTime) {
    updateUptime();
  } else {
    document.getElementById('dashUptime').textContent = '--';
  }
}

// Update uptime display
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
  }
}

// Stop OmniRoute
async function stopOmni() {
  await window.omni.stop();
  // Don't reset startTime here — wait for 'omni-stopped' event
}

// Restart OmniRoute
async function restartOmni() {
  startTime = Date.now();
  await window.omni.restart();
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
            ${(m.id || 'XX').substring(0, 2).toUpperCase()}
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

// Add log entry to UI
function addLog(type, message) {
  const container = document.getElementById('logsContainer');
  if (!container) return;

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

  // Keep max 500 entries in DOM
  while (container.children.length > 500) {
    container.removeChild(container.firstChild);
  }

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

// Refresh logs from main process
async function refreshLogs() {
  const result = await window.omni.getLogs();
  const container = document.getElementById('logsContainer');
  if (!container) return;

  if (result && result.length > 0) {
    container.innerHTML = '';
    result.forEach(log => addLog(log.type, log.message));
  }
}

// Clear logs
async function clearLogs() {
  await window.omni.clearLogs();
  const container = document.getElementById('logsContainer');
  if (container) {
    container.innerHTML = '<div class="text-zinc-500 text-center py-10">Logs cleared.</div>';
  }
}

// Load settings
async function loadSettings() {
  const cfg = await window.omni.getConfig();
  document.getElementById('settingHost').value = cfg.host || '127.0.0.1';
  document.getElementById('settingPort').value = cfg.port || 20128;
  document.getElementById('settingPassword').value = cfg.password || 'CHANGEME';
  document.getElementById('settingAutoStart').checked = cfg.autoStart || false;
  document.getElementById('dashPort').textContent = cfg.port || 20128;
  document.getElementById('processPort').textContent = cfg.port || 20128;
}

// Save settings
async function saveSettings() {
  const host = document.getElementById('settingHost').value.trim();
  const port = parseInt(document.getElementById('settingPort').value) || 20128;
  const password = document.getElementById('settingPassword').value;
  const autoStart = document.getElementById('settingAutoStart').checked;

  await window.omni.setConfig('host', host);
  await window.omni.setConfig('port', port);
  await window.omni.setConfig('password', password);
  await window.omni.setConfig('autoStart', autoStart);

  document.getElementById('dashPort').textContent = port;
  document.getElementById('processPort').textContent = port;
}

// Event listeners from main process
window.omni.onLog((data) => {
  addLog(data.type, data.message);
});

window.omni.onStarted(() => {
  updateUI(true);
  // Wait for OmniRoute to be ready, then fetch models
  setTimeout(refreshModels, 3000);
});

window.omni.onStopped((data) => {
  updateUI(false);
  startTime = null;
  models = [];
  document.getElementById('dashModels').textContent = '0';
  document.getElementById('modelsContainer').innerHTML =
    '<div class="text-zinc-500 text-center py-10 col-span-full">Start OmniRoute to view models</div>';
});

// Initialize
async function init() {
  await loadSettings();

  const status = await window.omni.status();
  updateUI(status.running, status.pid);

  if (status.running) {
    startTime = Date.now() - 1000;
    refreshModels();
  }

  // Update uptime every second
  setInterval(updateUptime, 1000);

  // Poll status every 5 seconds
  setInterval(async () => {
    const status = await window.omni.status();
    updateUI(status.running, status.pid);
  }, 5000);
}

// Start
init();
