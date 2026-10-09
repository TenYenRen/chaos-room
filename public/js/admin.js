// Activity: Chaos Room - Admin Host Controller Logic
(function () {
  'use strict';

  // Global Admin State
  let adminPin = localStorage.getItem('chaos_admin_pin') || '';
  let currentState = null;
  let selectedPlayerId = null;
  let codeMaskedInAdmin = false;
  let clockOffset = 0;
  let animFrameId = null;

  // Socket Setup
  const socket = io({
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000
  });

  // DOM Elements
  const pinAuthModal = document.getElementById('pinAuthModal');
  const pinAuthForm = document.getElementById('pinAuthForm');
  const pinInput = document.getElementById('pinInput');
  const pinErrorMsg = document.getElementById('pinErrorMsg');
  const lockAdminBtn = document.getElementById('lockAdminBtn');

  const socketStatusBadge = document.getElementById('socketStatusBadge');
  const spectatorsCount = document.getElementById('spectatorsCount');
  const networkUrlText = document.getElementById('networkUrlText');
  const copyUrlBtn = document.getElementById('copyUrlBtn');

  // Stopwatch & Simultaneous Recitation Elements
  const adminTimerDisplay = document.getElementById('adminTimerDisplay');
  const adminStopwatchStateBadge = document.getElementById('adminStopwatchStateBadge');
  const btnStartStopwatch = document.getElementById('btnStartStopwatch');
  const btnPauseStopwatch = document.getElementById('btnPauseStopwatch');
  const btnResetStopwatch = document.getElementById('btnResetStopwatch');
  const btnResetRoundTimes = document.getElementById('btnResetRoundTimes');
  const btnSubtractPlayer = document.getElementById('btnSubtractPlayer');
  const btnAddPlayerStep = document.getElementById('btnAddPlayerStep');
  const playerCountDisplay = document.getElementById('playerCountDisplay');
  const simultaneousTimingGrid = document.getElementById('simultaneousTimingGrid');
  let listeningPlayerId = null;

  // Stage Elements
  const stageVisibilityBadge = document.getElementById('stageVisibilityBadge');
  const inputStageNumber = document.getElementById('inputStageNumber');
  const btnStageDec = document.getElementById('btnStageDec');
  const btnStageInc = document.getElementById('btnStageInc');
  const btnApplyStage = document.getElementById('btnApplyStage');
  const btnToggleStageVisibility = document.getElementById('btnToggleStageVisibility');

  // Code Generator Elements
  const adminActiveCodeDisplay = document.getElementById('adminActiveCodeDisplay');
  const codeFrontendStatusBadge = document.getElementById('codeFrontendStatusBadge');
  const btnToggleFrontendCode = document.getElementById('btnToggleFrontendCode');
  const btnMaskCodeToggle = document.getElementById('btnMaskCodeToggle');
  const btnGenerateNewCode = document.getElementById('btnGenerateNewCode');
  const codeHistoryList = document.getElementById('codeHistoryList');
  const btnClearCodeHistory = document.getElementById('btnClearCodeHistory');

  // Player & Tabs Elements
  const inputNewPlayerName = document.getElementById('inputNewPlayerName');
  const btnAddPlayer = document.getElementById('btnAddPlayer');
  const playerTabsNav = document.getElementById('playerTabsNav');
  const playerTabContent = document.getElementById('playerTabContent');
  const currentPlayerTabTitle = document.getElementById('currentPlayerTabTitle');
  const currentPlayerStatsSubtitle = document.getElementById('currentPlayerStatsSubtitle');
  const btnSetActiveForStopwatch = document.getElementById('btnSetActiveForStopwatch');
  const btnDeleteCurrentPlayer = document.getElementById('btnDeleteCurrentPlayer');
  const pointsButtonGroup = document.getElementById('pointsButtonGroup');
  const btnRecordLapForCurrentTab = document.getElementById('btnRecordLapForCurrentTab');
  const btnClearLapsCurrentPlayer = document.getElementById('btnClearLapsCurrentPlayer');
  const playerLapTableBody = document.getElementById('playerLapTableBody');

  // Dual Leaderboard Elements
  const tabBtnPointsTimeLb = document.getElementById('tabBtnPointsTimeLb');
  const tabBtnPureTimeLb = document.getElementById('tabBtnPureTimeLb');
  const viewPointsTimeLb = document.getElementById('viewPointsTimeLb');
  const viewPureTimeLb = document.getElementById('viewPureTimeLb');
  const adminPointsTimeLbBody = document.getElementById('adminPointsTimeLbBody');
  const adminPureTimeLbBody = document.getElementById('adminPureTimeLbBody');
  const btnResetEntireGame = document.getElementById('btnResetEntireGame');

  // Extras: Sound, QR & Shortcuts
  const btnAudioToggleAdmin = document.getElementById('btnAudioToggleAdmin');
  const btnOpenShortcuts = document.getElementById('btnOpenShortcuts');
  const shortcutsModal = document.getElementById('shortcutsModal');
  const btnCloseShortcutsModal = document.getElementById('btnCloseShortcutsModal');
  const btnOpenQrModal = document.getElementById('btnOpenQrModal');
  const qrModal = document.getElementById('qrModal');
  const btnCloseQrModal = document.getElementById('btnCloseQrModal');
  const qrCodeImage = document.getElementById('qrCodeImage');
  const qrTargetUrlDisplay = document.getElementById('qrTargetUrlDisplay');
  const btnCopyQrUrl = document.getElementById('btnCopyQrUrl');

  let sfxEnabled = true;
  let audioCtx = null;

  function getAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playTone(freq, type = 'sine', duration = 0.15, gainVal = 0.1) {
    if (!sfxEnabled) return;
    try {
      const ctx = getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(gainVal, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {}
  }

  function sfxStart() { playTone(880, 'sine', 0.12, 0.15); }
  function sfxPause() { playTone(440, 'triangle', 0.15, 0.12); }
  function sfxLap() {
    playTone(660, 'sine', 0.08, 0.12);
    setTimeout(() => playTone(990, 'sine', 0.15, 0.12), 80);
  }
  function sfxCode() {
    playTone(523, 'sine', 0.1, 0.12);
    setTimeout(() => playTone(659, 'sine', 0.1, 0.12), 100);
    setTimeout(() => playTone(784, 'sine', 0.2, 0.15), 200);
  }

  // ------------------------------------------------------------------------
  // AUTHENTICATION & PIN
  // ------------------------------------------------------------------------
  function checkAuthentication() {
    if (!adminPin) {
      showPinModal();
      return;
    }
    // Verify PIN with server
    socket.emit('admin:verify_pin', adminPin, (res) => {
      if (res && res.success) {
        hidePinModal();
      } else {
        showPinModal(true);
      }
    });
  }

  function showPinModal(isError = false) {
    pinAuthModal.style.display = 'flex';
    pinErrorMsg.style.display = isError ? 'block' : 'none';
    pinInput.value = '';
    pinInput.focus();
  }

  function hidePinModal() {
    pinAuthModal.style.display = 'none';
    pinErrorMsg.style.display = 'none';
  }

  pinAuthForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const candidatePin = pinInput.value.trim();
    if (!candidatePin) return;

    socket.emit('admin:verify_pin', candidatePin, (res) => {
      if (res && res.success) {
        adminPin = candidatePin;
        localStorage.setItem('chaos_admin_pin', adminPin);
        hidePinModal();
      } else {
        pinErrorMsg.style.display = 'block';
      }
    });
  });

  lockAdminBtn.addEventListener('click', () => {
    adminPin = '';
    localStorage.removeItem('chaos_admin_pin');
    showPinModal();
  });

  // ------------------------------------------------------------------------
  // SOCKET CONNECTION & LIFECYCLE
  // ------------------------------------------------------------------------
  socket.on('connect', () => {
    socketStatusBadge.innerHTML = `<span style="width:6px;height:6px;border-radius:50%;background:#34d399;"></span> CONNECTED`;
    socketStatusBadge.className = 'badge badge-green';
    socket.emit('client:register', { role: 'admin' });
    checkAuthentication();
  });

  socket.on('disconnect', () => {
    socketStatusBadge.innerHTML = `<span style="width:6px;height:6px;border-radius:50%;background:#ef4444;"></span> DISCONNECTED`;
    socketStatusBadge.className = 'badge badge-red';
  });

  socket.on('clients:count', (data) => {
    if (data && data.frontendCount !== undefined) {
      spectatorsCount.textContent = data.frontendCount;
    }
  });

  socket.on('state:init', (state) => {
    handleStateSync(state);
  });

  socket.on('state:update', (state) => {
    handleStateSync(state);
  });

  function handleStateSync(state) {
    if (!state) return;
    currentState = state;

    if (state.serverTimestamp) {
      clockOffset = state.serverTimestamp - Date.now();
    }

    // Default selected player if not set
    if (!selectedPlayerId && state.players && state.players.length > 0) {
      selectedPlayerId = state.players[0].id;
    } else if (state.players && !state.players.some(p => p.id === selectedPlayerId)) {
      selectedPlayerId = state.players[0] ? state.players[0].id : null;
    }

    renderNetworkInfo();
    renderStopwatchControls();
    renderSimultaneousTimingGrid();
    renderStageControls();
    renderCodeControls();
    renderPlayerTabs();
    renderSelectedPlayerConsole();
    renderLeaderboards();
  }

  // ------------------------------------------------------------------------
  // NETWORK & MULTI-DEVICE HELPER
  // ------------------------------------------------------------------------
  function renderNetworkInfo() {
    if (currentState.networkAddresses && currentState.networkAddresses.length > 0) {
      const primary = currentState.networkAddresses[0];
      networkUrlText.textContent = primary.url + '/';
    } else {
      networkUrlText.textContent = `${window.location.origin}/`;
    }
  }

  copyUrlBtn.addEventListener('click', () => {
    const text = networkUrlText.textContent;
    navigator.clipboard.writeText(text).then(() => {
      copyUrlBtn.textContent = 'COPIED!';
      setTimeout(() => { copyUrlBtn.textContent = 'COPY URL'; }, 2000);
    }).catch(() => {
      prompt('Copy this URL to open on spectator screen:', text);
    });
  });

  // ------------------------------------------------------------------------
  // TIME FORMATTER
  // ------------------------------------------------------------------------
  function formatTime(ms) {
    if (ms === null || ms === undefined || ms < 0) return '00:00.00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const hundredths = Math.floor((ms % 1000) / 10);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
  }

  // ------------------------------------------------------------------------
  // STOPWATCH CONTROLLER
  // ------------------------------------------------------------------------
  function updateStopwatchTick() {
    if (!currentState) {
      animFrameId = requestAnimationFrame(updateStopwatchTick);
      return;
    }
    const sw = currentState.stopwatch;
    let elapsed = sw.accumulatedTime || 0;

    if (sw.isRunning && sw.startTime) {
      const adjustedNow = Date.now() + clockOffset;
      elapsed = sw.accumulatedTime + Math.max(0, adjustedNow - sw.startTime);
    }

    adminTimerDisplay.textContent = formatTime(elapsed);

    // Live tick for all currently reciting players
    if (sw.isRunning && currentState.players) {
      currentState.players.forEach(p => {
        if (!p.isFinished) {
          const el = document.getElementById(`timeDisplay_${p.id}`);
          if (el) el.textContent = formatTime(elapsed);
        }
      });
    }

    animFrameId = requestAnimationFrame(updateStopwatchTick);
  }

  function renderStopwatchControls() {
    const sw = currentState.stopwatch;

    // Play/Pause buttons
    if (sw.isRunning) {
      btnStartStopwatch.style.display = 'none';
      btnPauseStopwatch.style.display = 'inline-flex';
      adminStopwatchStateBadge.className = 'badge badge-green';
      adminStopwatchStateBadge.textContent = 'RUNNING';
    } else {
      btnStartStopwatch.style.display = 'inline-flex';
      btnPauseStopwatch.style.display = 'none';
      if (sw.accumulatedTime > 0) {
        adminStopwatchStateBadge.className = 'badge badge-amber';
        adminStopwatchStateBadge.textContent = 'PAUSED';
      } else {
        adminStopwatchStateBadge.className = 'badge badge-blue';
        adminStopwatchStateBadge.textContent = 'IDLE';
      }
    }
  }

  function renderSimultaneousTimingGrid() {
    if (!simultaneousTimingGrid || !currentState) return;
    const players = currentState.players || [];
    const sw = currentState.stopwatch;

    // Update Player count display in stepper
    if (playerCountDisplay) {
      playerCountDisplay.textContent = `👥 ${players.length} ${players.length === 1 ? 'PLAYER' : 'PLAYERS'}`;
    }

    simultaneousTimingGrid.innerHTML = '';
    if (players.length === 0) {
      simultaneousTimingGrid.innerHTML = '<div style="color:var(--text-muted); font-size:0.85rem; padding:12px;">No players. Use + to add players.</div>';
      return;
    }

    players.forEach(p => {
      const isTiming = sw.isRunning && !p.isFinished;
      const isFinished = Boolean(p.isFinished);
      const card = document.createElement('div');
      card.className = `player-timing-card ${isTiming ? 'timing' : ''} ${isFinished ? 'finished' : ''}`;

      const isListeningThis = listeningPlayerId === p.id;
      const keyLabel = isListeningThis ? 'PRESS KEY...' : `KEY: ${p.keybind || p.number}`;

      let displayTime = '--:--.--';
      if (isFinished && p.currentTimeFormatted) {
        displayTime = p.currentTimeFormatted;
      } else if (p.bestLapFormatted && p.bestLapFormatted !== '--:--.--') {
        displayTime = p.bestLapFormatted;
      }

      card.innerHTML = `
        <div class="card-top-row">
          <span class="card-player-title">${escapeHtml(p.name)}</span>
          <button class="keybind-pill ${isListeningThis ? 'listening' : ''}" data-playerid="${p.id}" title="Click to edit keybind">
            ${keyLabel} ✏️
          </button>
        </div>

        <div class="card-time-display ${isFinished ? 'finished-time' : ''}" id="timeDisplay_${p.id}">
          ${displayTime}
        </div>

        ${isFinished ? `
          <div style="display:flex; gap:6px;">
            <button class="btn-stop-player btn-finished" style="flex:1;">
              ✅ STOPPED (${displayTime})
            </button>
            <button class="btn btn-secondary btn-sm btn-reset-player-time" data-playerid="${p.id}" title="Reset round time for this player">
              ↺
            </button>
          </div>
        ` : `
          <button class="btn-stop-player btn-stop-player-action" data-playerid="${p.id}">
            🛑 STOP PLAYER ${p.number} (${p.keybind || p.number})
          </button>
        `}

        <!-- Quick scoring buttons on card -->
        <div style="display:flex; align-items:center; justify-content:space-between; margin-top:6px; font-size:0.75rem;">
          <span style="color:var(--text-muted); font-weight:600;">Score:</span>
          <div style="display:flex; gap:3px;">
            ${[0,1,2,3,4,5].map(pt => `
              <button class="point-pip-btn ${p.points === pt ? 'selected' : ''}" data-playerid="${p.id}" data-point="${pt}" style="width:24px; height:24px; font-size:0.72rem; padding:0; border-radius:4px;">${pt}</button>
            `).join('')}
          </div>
        </div>
      `;

      simultaneousTimingGrid.appendChild(card);
    });

    // Attach keybind pill listeners
    simultaneousTimingGrid.querySelectorAll('.keybind-pill').forEach(pill => {
      pill.addEventListener('click', (e) => {
        e.stopPropagation();
        const pId = pill.getAttribute('data-playerid');
        listeningPlayerId = (listeningPlayerId === pId) ? null : pId;
        renderSimultaneousTimingGrid();
      });
    });

    // Attach stop player action listeners
    simultaneousTimingGrid.querySelectorAll('.btn-stop-player-action').forEach(btn => {
      btn.addEventListener('click', () => {
        const pId = btn.getAttribute('data-playerid');
        sfxLap();
        socket.emit('player:stop_time', { pin: adminPin, playerId: pId });
      });
    });

    // Attach reset player time listeners
    simultaneousTimingGrid.querySelectorAll('.btn-reset-player-time').forEach(btn => {
      btn.addEventListener('click', () => {
        const pId = btn.getAttribute('data-playerid');
        socket.emit('player:reset_time', { pin: adminPin, playerId: pId });
      });
    });

    // Attach quick point scoring listeners
    simultaneousTimingGrid.querySelectorAll('.point-pip-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const pId = btn.getAttribute('data-playerid');
        const pt = parseInt(btn.getAttribute('data-point'), 10);
        socket.emit('player:set_points', { pin: adminPin, playerId: pId, points: pt });
      });
    });
  }

  // Stepper handlers
  btnSubtractPlayer.addEventListener('click', () => {
    socket.emit('player:adjust_count', { pin: adminPin, action: 'subtract' });
  });

  btnAddPlayerStep.addEventListener('click', () => {
    socket.emit('player:adjust_count', { pin: adminPin, action: 'add' });
  });

  btnResetRoundTimes.addEventListener('click', () => {
    if (confirm('Reset round recitation times for all players?')) {
      socket.emit('player:reset_all_times', { pin: adminPin });
    }
  });

  btnStartStopwatch.addEventListener('click', () => {
    socket.emit('stopwatch:start', { pin: adminPin });
  });

  btnPauseStopwatch.addEventListener('click', () => {
    socket.emit('stopwatch:pause', { pin: adminPin });
  });

  btnResetStopwatch.addEventListener('click', () => {
    if (confirm('Reset stopwatch to 00:00.00?')) {
      socket.emit('stopwatch:reset', { pin: adminPin });
    }
  });


  // ------------------------------------------------------------------------
  // STAGE CONTROLLER
  // ------------------------------------------------------------------------
  function renderStageControls() {
    const stage = currentState.stage;
    inputStageNumber.value = stage.number;
    if (stage.visible) {
      stageVisibilityBadge.className = 'badge badge-green';
      stageVisibilityBadge.textContent = `VISIBLE ("Stage ${stage.number}")`;
      btnToggleStageVisibility.textContent = '👁️ HIDE STAGE ON FRONTEND';
    } else {
      stageVisibilityBadge.className = 'badge badge-red';
      stageVisibilityBadge.textContent = 'HIDDEN ON FRONTEND';
      btnToggleStageVisibility.textContent = '👁️ SHOW STAGE ON FRONTEND';
    }
  }

  btnStageDec.addEventListener('click', () => {
    const current = parseInt(inputStageNumber.value, 10) || 1;
    if (current > 1) {
      inputStageNumber.value = current - 1;
      socket.emit('stage:update', { pin: adminPin, number: current - 1 });
    }
  });

  btnStageInc.addEventListener('click', () => {
    const current = parseInt(inputStageNumber.value, 10) || 1;
    inputStageNumber.value = current + 1;
    socket.emit('stage:update', { pin: adminPin, number: current + 1 });
  });

  btnApplyStage.addEventListener('click', () => {
    const num = parseInt(inputStageNumber.value, 10) || 1;
    socket.emit('stage:update', { pin: adminPin, number: num });
  });

  btnToggleStageVisibility.addEventListener('click', () => {
    const stage = currentState.stage;
    socket.emit('stage:update', { pin: adminPin, visible: !stage.visible });
  });

  // ------------------------------------------------------------------------
  // ABSTRACT CODE GENERATOR CONTROLLER
  // ------------------------------------------------------------------------
  function renderCodeControls() {
    const codeObj = currentState.code;
    const activeCode = codeObj.activeCode || '-----';

    // Mask/Unmask in admin controller
    if (codeMaskedInAdmin) {
      adminActiveCodeDisplay.textContent = '•••••';
      btnMaskCodeToggle.textContent = '👁️ REVEAL IN CONTROLLER';
    } else {
      adminActiveCodeDisplay.textContent = activeCode;
      btnMaskCodeToggle.textContent = '👁️ HIDE IN CONTROLLER';
    }

    // Frontend Visibility status
    if (codeObj.isVisibleOnFrontend) {
      codeFrontendStatusBadge.textContent = 'STATUS ON FRONTEND: VISIBLE';
      codeFrontendStatusBadge.style.background = 'rgba(16, 185, 129, 0.15)';
      codeFrontendStatusBadge.style.color = '#34d399';
      codeFrontendStatusBadge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
      btnToggleFrontendCode.textContent = '🔒 HIDE CODE ON FRONTEND SCREEN';
      btnToggleFrontendCode.className = 'btn btn-danger btn-sm';
    } else {
      codeFrontendStatusBadge.textContent = 'STATUS ON FRONTEND: HIDDEN';
      codeFrontendStatusBadge.style.background = 'rgba(239, 68, 68, 0.15)';
      codeFrontendStatusBadge.style.color = '#f87171';
      codeFrontendStatusBadge.style.borderColor = 'rgba(239, 68, 68, 0.3)';
      btnToggleFrontendCode.textContent = '👁️ SHOW CODE ON FRONTEND SCREEN';
      btnToggleFrontendCode.className = 'btn btn-primary btn-sm';
      btnToggleFrontendCode.style.background = 'var(--accent-pink)';
    }

    // History list with manual removal
    codeHistoryList.innerHTML = '';
    const history = codeObj.history || [];
    if (history.length === 0) {
      codeHistoryList.innerHTML = '<div style="font-size:0.8rem; color:var(--text-muted); text-align:center; padding:10px;">No code history yet.</div>';
      return;
    }

    history.forEach(item => {
      const itemEl = document.createElement('div');
      itemEl.className = 'history-item';
      const isActive = item.code === activeCode;
      itemEl.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="history-code">${escapeHtml(item.code)}</span>
          ${isActive ? '<span class="badge badge-green" style="font-size:0.65rem; padding:2px 6px;">ACTIVE</span>' : ''}
        </div>
        <div style="display:flex; gap:6px;">
          ${!isActive ? `<button class="btn btn-secondary btn-sm btn-activate-code" data-code="${escapeHtml(item.code)}" style="padding:2px 8px; font-size:0.72rem;">SET ACTIVE</button>` : ''}
          <button class="btn btn-danger btn-sm btn-del-code" data-id="${item.id}" style="padding:2px 8px; font-size:0.72rem;" title="Delete code">🗑️</button>
        </div>
      `;
      codeHistoryList.appendChild(itemEl);
    });

    // Attach event listeners for history actions
    codeHistoryList.querySelectorAll('.btn-activate-code').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const code = e.target.getAttribute('data-code');
        socket.emit('code:set_active', { pin: adminPin, code });
      });
    });

    codeHistoryList.querySelectorAll('.btn-del-code').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const codeId = e.target.getAttribute('data-id');
        socket.emit('code:delete_from_history', { pin: adminPin, codeId });
      });
    });
  }

  btnGenerateNewCode.addEventListener('click', () => {
    socket.emit('code:generate', { pin: adminPin });
  });

  btnMaskCodeToggle.addEventListener('click', () => {
    codeMaskedInAdmin = !codeMaskedInAdmin;
    renderCodeControls();
  });

  btnToggleFrontendCode.addEventListener('click', () => {
    const isVis = currentState.code.isVisibleOnFrontend;
    socket.emit('code:toggle_frontend_visibility', { pin: adminPin, isVisible: !isVis });
  });

  btnClearCodeHistory.addEventListener('click', () => {
    if (confirm('Clear entire code history?')) {
      socket.emit('code:clear_history', { pin: adminPin });
    }
  });

  // ------------------------------------------------------------------------
  // PLAYER MANAGEMENT & TABBED LAPS
  // ------------------------------------------------------------------------
  btnAddPlayer.addEventListener('click', () => {
    const name = inputNewPlayerName.value.trim();
    socket.emit('player:add', { pin: adminPin, name });
    inputNewPlayerName.value = '';
  });

  inputNewPlayerName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      btnAddPlayer.click();
    }
  });

  function renderPlayerTabs() {
    const players = currentState.players || [];
    playerTabsNav.innerHTML = '';

    if (players.length === 0) {
      playerTabsNav.innerHTML = '<span style="font-size:0.8rem; color:var(--text-muted); padding:6px;">No players yet</span>';
      return;
    }

    players.forEach(p => {
      const tab = document.createElement('button');
      tab.className = `tab-btn ${p.id === selectedPlayerId ? 'active' : ''}`;
      tab.textContent = `${p.name} (Pts: ${p.points})`;
      tab.addEventListener('click', () => {
        selectedPlayerId = p.id;
        renderPlayerTabs();
        renderSelectedPlayerConsole();
      });
      playerTabsNav.appendChild(tab);
    });
  }

  function renderSelectedPlayerConsole() {
    const players = currentState.players || [];
    const player = players.find(p => p.id === selectedPlayerId);

    if (!player) {
      playerTabContent.style.display = 'none';
      return;
    }
    playerTabContent.style.display = 'flex';

    currentPlayerTabTitle.textContent = `${player.name} (Player #${player.number})`;

    // Calculate best lap
    const bestMs = player.laps.length > 0 ? Math.min(...player.laps.map(l => l.timeMs)) : null;
    currentPlayerStatsSubtitle.textContent = `Best Lap: ${formatTime(bestMs)} | Total Recorded Laps: ${player.laps.length}`;

    // Highlight points buttons (0 to 5)
    const pBtns = pointsButtonGroup.querySelectorAll('.point-pip-btn');
    pBtns.forEach(btn => {
      const val = parseInt(btn.getAttribute('data-point'), 10);
      if (val === player.points) {
        btn.classList.add('selected');
      } else {
        btn.classList.remove('selected');
      }
    });

    // Populate Laps table
    playerLapTableBody.innerHTML = '';
    if (player.laps.length === 0) {
      playerLapTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:16px;">No laps recorded yet. Click "Record Lap" above!</td></tr>';
    } else {
      player.laps.forEach(lap => {
        const tr = document.createElement('tr');
        const timeStr = new Date(lap.timestamp).toLocaleTimeString();
        tr.innerHTML = `
          <td><strong>Lap ${lap.lapNum}</strong></td>
          <td style="font-family:var(--font-mono); font-weight:700; color:var(--accent-cyan);">${lap.formatted}</td>
          <td style="color:var(--text-muted); font-size:0.8rem;">${timeStr}</td>
          <td style="text-align:right;">
            <button class="btn btn-danger btn-sm btn-delete-lap" data-lapid="${lap.id}" style="padding:2px 8px; font-size:0.75rem;">🗑️</button>
          </td>
        `;
        playerLapTableBody.appendChild(tr);
      });

      playerLapTableBody.querySelectorAll('.btn-delete-lap').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const lapId = e.currentTarget.getAttribute('data-lapid');
          socket.emit('lap:delete', { pin: adminPin, playerId: player.id, lapId });
        });
      });
    }
  }

  // Points Click Listeners
  pointsButtonGroup.querySelectorAll('.point-pip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!selectedPlayerId) return;
      const pts = parseInt(btn.getAttribute('data-point'), 10);
      socket.emit('player:set_points', { pin: adminPin, playerId: selectedPlayerId, points: pts });
    });
  });

  btnSetActiveForStopwatch.addEventListener('click', () => {
    if (!selectedPlayerId) return;
    socket.emit('stopwatch:set_active_player', { pin: adminPin, playerId: selectedPlayerId });
  });

  btnRecordLapForCurrentTab.addEventListener('click', () => {
    if (!selectedPlayerId) return;
    socket.emit('lap:record', { pin: adminPin, playerId: selectedPlayerId });
  });

  btnClearLapsCurrentPlayer.addEventListener('click', () => {
    if (!selectedPlayerId) return;
    if (confirm('Clear all laps for this player?')) {
      socket.emit('lap:clear_all', { pin: adminPin, playerId: selectedPlayerId });
    }
  });

  btnDeleteCurrentPlayer.addEventListener('click', () => {
    if (!selectedPlayerId) return;
    if (confirm('Delete this player from the game session?')) {
      socket.emit('player:remove', { pin: adminPin, playerId: selectedPlayerId });
    }
  });

  // ------------------------------------------------------------------------
  // DUAL LEADERBOARDS
  // ------------------------------------------------------------------------
  tabBtnPointsTimeLb.addEventListener('click', () => {
    tabBtnPointsTimeLb.classList.add('active');
    tabBtnPureTimeLb.classList.remove('active');
    viewPointsTimeLb.style.display = 'block';
    viewPureTimeLb.style.display = 'none';
  });

  tabBtnPureTimeLb.addEventListener('click', () => {
    tabBtnPureTimeLb.classList.add('active');
    tabBtnPointsTimeLb.classList.remove('active');
    viewPureTimeLb.style.display = 'block';
    viewPointsTimeLb.style.display = 'none';
  });

  function renderLeaderboards() {
    const players = currentState.players || [];

    // Leaderboard 1: Points + Time
    const sortedPointsTime = [...players].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      const aTime = a.laps.length > 0 ? Math.min(...a.laps.map(l => l.timeMs)) : Infinity;
      const bTime = b.laps.length > 0 ? Math.min(...b.laps.map(l => l.timeMs)) : Infinity;
      if (aTime !== bTime) return aTime - bTime;
      return a.number - b.number;
    });

    adminPointsTimeLbBody.innerHTML = '';
    if (sortedPointsTime.length === 0) {
      adminPointsTimeLbBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:14px;">No players</td></tr>';
    } else {
      sortedPointsTime.forEach((p, idx) => {
        const tr = document.createElement('tr');
        const bestMs = p.laps.length > 0 ? Math.min(...p.laps.map(l => l.timeMs)) : null;
        tr.innerHTML = `
          <td><strong>#${idx + 1}</strong></td>
          <td>${escapeHtml(p.name)}</td>
          <td><span style="color:var(--accent-cyan); font-weight:700;">${p.points} / 5</span></td>
          <td style="font-family:var(--font-mono);">${formatTime(bestMs)}</td>
        `;
        adminPointsTimeLbBody.appendChild(tr);
      });
    }

    // Leaderboard 2: Pure Time Only
    const sortedPureTime = [...players].sort((a, b) => {
      const aTime = a.laps.length > 0 ? Math.min(...a.laps.map(l => l.timeMs)) : Infinity;
      const bTime = b.laps.length > 0 ? Math.min(...b.laps.map(l => l.timeMs)) : Infinity;
      if (aTime !== bTime) return aTime - bTime;
      return a.number - b.number;
    });

    adminPureTimeLbBody.innerHTML = '';
    if (sortedPureTime.length === 0) {
      adminPureTimeLbBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:14px;">No players</td></tr>';
    } else {
      sortedPureTime.forEach((p, idx) => {
        const tr = document.createElement('tr');
        const bestMs = p.laps.length > 0 ? Math.min(...p.laps.map(l => l.timeMs)) : null;
        tr.innerHTML = `
          <td><strong>#${idx + 1}</strong></td>
          <td>${escapeHtml(p.name)}</td>
          <td style="font-family:var(--font-mono); font-weight:700; color:${bestMs !== null ? 'var(--accent-cyan)' : 'var(--text-muted)'};">${formatTime(bestMs)}</td>
          <td>${p.laps.length}</td>
        `;
        adminPureTimeLbBody.appendChild(tr);
      });
    }
  }

  // ------------------------------------------------------------------------
  // RESET ALL
  // ------------------------------------------------------------------------
  btnResetEntireGame.addEventListener('click', () => {
    if (confirm('Are you sure you want to RESET THE ENTIRE SESSION? All stopwatch, laps, and player scores will be cleared!')) {
      socket.emit('game:reset_all', { pin: adminPin });
    }
  });

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, function (m) {
      return ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      })[m];
    });
  }

  // ------------------------------------------------------------------------
  // MODALS & SHORTCUTS & AUDIO TOGGLE
  // ------------------------------------------------------------------------
  btnAudioToggleAdmin.addEventListener('click', () => {
    sfxEnabled = !sfxEnabled;
    btnAudioToggleAdmin.textContent = sfxEnabled ? '🔊 SFX: ON' : '🔇 SFX: OFF';
    if (sfxEnabled) sfxStart();
  });

  btnOpenShortcuts.addEventListener('click', () => {
    shortcutsModal.style.display = 'flex';
  });

  btnCloseShortcutsModal.addEventListener('click', () => {
    shortcutsModal.style.display = 'none';
  });

  btnOpenQrModal.addEventListener('click', () => {
    const targetUrl = networkUrlText.textContent || window.location.origin;
    qrCodeImage.src = `/api/qr?url=${encodeURIComponent(targetUrl)}`;
    qrTargetUrlDisplay.textContent = targetUrl;
    qrModal.style.display = 'flex';
  });

  btnCloseQrModal.addEventListener('click', () => {
    qrModal.style.display = 'none';
  });

  btnCopyQrUrl.addEventListener('click', () => {
    const targetUrl = qrTargetUrlDisplay.textContent;
    navigator.clipboard.writeText(targetUrl).then(() => {
      btnCopyQrUrl.textContent = 'COPIED!';
      setTimeout(() => { btnCopyQrUrl.textContent = '📋 COPY SPECTATOR URL'; }, 2000);
    });
  });

  // Global Keyboard Shortcuts & Player Keybind Interception
  window.addEventListener('keydown', (e) => {
    // 1. If currently editing a player's keybind:
    if (listeningPlayerId) {
      e.preventDefault();
      e.stopPropagation();
      let keyName = (e.key === ' ' ? 'SPACE' : e.key).toUpperCase();
      // Allow letters, numbers, functional keys
      if (keyName.length === 1 || keyName === 'SPACE' || keyName.startsWith('NUMPAD') || keyName.startsWith('DIGIT')) {
        socket.emit('player:set_keybind', { pin: adminPin, playerId: listeningPlayerId, keybind: keyName });
        sfxLap();
      }
      listeningPlayerId = null;
      renderSimultaneousTimingGrid();
      return;
    }

    // If typing in an input field or modal is active, skip hotkeys
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
      return;
    }
    if (pinAuthModal.style.display === 'flex') return;

    const pressedKey = (e.key === ' ' ? 'SPACE' : e.key).toUpperCase();

    // 2. Check if key matches ANY player's assigned recitation keybind!
    if (currentState && currentState.stopwatch && currentState.stopwatch.isRunning && currentState.players) {
      const matchedPlayer = currentState.players.find(p => {
        const pKey = (p.keybind || String(p.number)).toUpperCase();
        return pKey === pressedKey || pKey === e.code.toUpperCase();
      });

      if (matchedPlayer && !matchedPlayer.isFinished) {
        e.preventDefault();
        sfxLap();
        socket.emit('player:stop_time', { pin: adminPin, playerId: matchedPlayer.id });
        return;
      }
    }

    // 3. Master controller hotkeys
    if (e.code === 'Space') {
      e.preventDefault();
      if (currentState && currentState.stopwatch.isRunning) {
        btnPauseStopwatch.click();
      } else {
        btnStartStopwatch.click();
      }
    } else if (e.code === 'KeyC') {
      e.preventDefault();
      btnGenerateNewCode.click();
    } else if (e.code === 'KeyV') {
      e.preventDefault();
      btnToggleFrontendCode.click();
    } else if (e.code === 'KeyR') {
      e.preventDefault();
      btnResetStopwatch.click();
    } else if (e.key === 'Escape') {
      listeningPlayerId = null;
      renderSimultaneousTimingGrid();
      shortcutsModal.style.display = 'none';
      qrModal.style.display = 'none';
    }
  });

  // Sound hooks into buttons
  btnStartStopwatch.addEventListener('click', sfxStart);
  btnPauseStopwatch.addEventListener('click', sfxPause);
  btnRecordLapForCurrentTab.addEventListener('click', sfxLap);
  btnGenerateNewCode.addEventListener('click', sfxCode);
  btnToggleFrontendCode.addEventListener('click', sfxCode);

  // Start stopwatch animation loop
  updateStopwatchTick();

})();
