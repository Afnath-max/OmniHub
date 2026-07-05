const btnStart = document.getElementById('btnStart');
const btnStop = document.getElementById('btnStop');
const statusBadge = document.getElementById('statusBadge');
const statusText = document.getElementById('statusText');
const logsOutput = document.getElementById('logsOutput');
const btnClearLogs = document.getElementById('btnClearLogs');
const btnDashboard = document.getElementById('btnDashboard');
const openDashboard = document.getElementById('openDashboard');

// Tab navigation
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// Update UI based on status
function updateStatus(running) {
  if (running) {
    statusBadge.classList.add('running');
    statusText.textContent = 'Running';
    btnStart.disabled = true;
    btnStop.disabled = false;
  } else {
    statusBadge.classList.remove('running');
    statusText.textContent = 'Stopped';
    btnStart.disabled = false;
    btnStop.disabled = true;
  }
}

// Start OmniRoute
btnStart.addEventListener('click', async () => {
  const result = await window.omni.start();
  if (!result.success) {
    addLog(`[ERROR] ${result.message}`);
  }
});

// Stop OmniRoute
btnStop.addEventListener('click', async () => {
  const result = await window.omni.stop();
  if (!result.success) {
    addLog(`[ERROR] ${result.message}`);
  }
});

// Clear logs
btnClearLogs.addEventListener('click', () => {
  logsOutput.innerHTML = '<div class="log-empty">Logs cleared.</div>';
});

// Open dashboard
btnDashboard.addEventListener('click', () => {
  window.omni.start().then(() => {
    window.open('http://192.168.1.2:20128');
  });
});

openDashboard.addEventListener('click', (e) => {
  e.preventDefault();
  window.open('http://192.168.1.2:20128');
});

// Add log entry
function addLog(text) {
  const empty = logsOutput.querySelector('.log-empty');
  if (empty) empty.remove();
  
  const line = document.createElement('div');
  line.textContent = text;
  line.style.color = text.includes('[ERROR]') ? '#ff4444' : '#00ff88';
  logsOutput.appendChild(line);
  logsOutput.scrollTop = logsOutput.scrollHeight;
}

// Listen for logs from main process
window.omni.onLog((data) => {
  addLog(data.trim());
});

// Listen for status updates
window.omni.onStatus((data) => {
  updateStatus(data.running);
});

// Check initial status
window.omni.status().then((status) => {
  updateStatus(status.running);
});
