// Activity: Chaos Room - Frontend Projector Client Logic
(function () {
  'use strict';

  // State
  let currentState = {
    stopwatch: { isRunning: false, startTime: null, accumulatedTime: 0, activePlayerId: null },
    stage: { number: 1, visible: true },
    code: { activeCode: null, isVisibleOnFrontend: false },
    players: [],
    serverTimestamp: Date.now()
  };

  let clockOffset = 0; // Difference between server time and client time
  let animFrameId = null;

  // DOM Elements
  const connectionPill = document.getElementById('connectionPill');
  const statusDot = document.getElementById('statusDot');
  const connectionText = document.getElementById('connectionText');

  const stageBadge = document.getElementById('stageBadge');
  const stageText = document.getElementById('stageText');
  const fullscreenToggle = document.getElementById('fullscreenToggle');
  const frontendAudioToggle = document.getElementById('frontendAudioToggle');
  const frontendAudioIcon = document.getElementById('frontendAudioIcon');
  const frontendAudioLabel = document.getElementById('frontendAudioLabel');

  let sfxEnabled = true;
  let audioCtx = null;
  let previousCodeVisible = false;
  let previousStageNumber = null;

  function getAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playTone(freq, type = 'sine', duration = 0.15, gainVal = 0.12) {
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

  function sfxCodeReveal() {
    playTone(523.25, 'sine', 0.12, 0.15); // C5
    setTimeout(() => playTone(659.25, 'sine', 0.12, 0.15), 100); // E5
    setTimeout(() => playTone(783.99, 'sine', 0.15, 0.15), 200); // G5
    setTimeout(() => playTone(1046.50, 'sine', 0.25, 0.18), 300); // C6
  }

  function sfxStageUpdate() {
    playTone(440, 'triangle', 0.1, 0.15);
    setTimeout(() => playTone(880, 'sine', 0.2, 0.15), 120);
  }

  const timerDisplay = document.getElementById('timerDisplay');
  const stopwatchStatusTag = document.getElementById('stopwatchStatusTag');
  const activePlayerBanner = document.getElementById('activePlayerBanner');
  const activePlayerName = document.getElementById('activePlayerName');

  const codeVisibilityTag = document.getElementById('codeVisibilityTag');
  const lockedCodeBox = document.getElementById('lockedCodeBox');
  const revealedCodeBox = document.getElementById('revealedCodeBox');
  const codeCaption = document.getElementById('codeCaption');
  const glyphs = [
    document.getElementById('glyph0'),
    document.getElementById('glyph1'),
    document.getElementById('glyph2'),
    document.getElementById('glyph3'),
    document.getElementById('glyph4')
  ];

  const leaderboardList = document.getElementById('leaderboardList');

  // Socket Setup
  const socket = io({
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000
  });

  // Reconnection & LifeCycle handlers
  socket.on('connect', () => {
    statusDot.classList.remove('disconnected');
    connectionText.textContent = 'CONNECTED TO ENGINE';
    connectionPill.style.borderColor = 'rgba(0, 255, 136, 0.3)';
    socket.emit('client:register', { role: 'frontend' });
  });

  socket.on('disconnect', () => {
    statusDot.classList.add('disconnected');
    connectionText.textContent = 'RECONNECTING TO ENGINE...';
    connectionPill.style.borderColor = 'rgba(239, 68, 68, 0.5)';
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

    // Calculate clock skew with server
    if (state.serverTimestamp) {
      clockOffset = state.serverTimestamp - Date.now();
    }

    renderStage();
    renderStopwatchStatus();
    renderCode();
    renderLeaderboard();
  }

  // Time Formatter: milliseconds -> MM:SS.SS
  function formatTime(ms) {
    if (ms === null || ms === undefined || ms < 0) return '00:00.00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const hundredths = Math.floor((ms % 1000) / 10);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
  }

  // Stopwatch Animation Loop
  function updateStopwatchDisplay() {
    const sw = currentState.stopwatch;
    let elapsed = sw.accumulatedTime || 0;

    if (sw.isRunning && sw.startTime) {
      const adjustedNow = Date.now() + clockOffset;
      elapsed = sw.accumulatedTime + Math.max(0, adjustedNow - sw.startTime);
    }

    timerDisplay.textContent = formatTime(elapsed);
    animFrameId = requestAnimationFrame(updateStopwatchDisplay);
  }

  function renderStopwatchStatus() {
    const sw = currentState.stopwatch;
    if (sw.isRunning) {
      stopwatchStatusTag.className = 'status-tag running';
      stopwatchStatusTag.textContent = 'RUNNING';
    } else if (sw.accumulatedTime > 0) {
      stopwatchStatusTag.className = 'status-tag paused';
      stopwatchStatusTag.textContent = 'PAUSED';
    } else {
      stopwatchStatusTag.className = 'status-tag idle';
      stopwatchStatusTag.textContent = 'IDLE';
    }

    // Active Player Indicator
    if (sw.activePlayerId && currentState.players) {
      const activePlayer = currentState.players.find(p => p.id === sw.activePlayerId);
      if (activePlayer) {
        activePlayerBanner.style.display = 'inline-flex';
        activePlayerName.textContent = activePlayer.name.toUpperCase();
      } else {
        activePlayerBanner.style.display = 'none';
      }
    } else {
      activePlayerBanner.style.display = 'none';
    }
  }

  // Render Stage Indicator
  function renderStage() {
    const stage = currentState.stage;
    if (stage && stage.visible) {
      stageBadge.classList.remove('hidden-stage');
      stageText.textContent = `Stage ${stage.number}`;
      if (previousStageNumber !== null && previousStageNumber !== stage.number) {
        sfxStageUpdate();
      }
      previousStageNumber = stage.number;
    } else {
      stageBadge.classList.add('hidden-stage');
    }
  }

  // Render Random Code (Show / Hide Mechanism)
  function renderCode() {
    const codeObj = currentState.code;
    const isVisible = Boolean(codeObj && codeObj.isVisibleOnFrontend && codeObj.activeCode);

    if (isVisible) {
      const activeCode = String(codeObj.activeCode);
      lockedCodeBox.style.display = 'none';
      revealedCodeBox.style.display = 'flex';

      for (let i = 0; i < 5; i++) {
        if (glyphs[i]) {
          glyphs[i].textContent = activeCode[i] || '-';
        }
      }

      codeVisibilityTag.textContent = 'AUTHORIZED';
      codeVisibilityTag.style.background = 'rgba(0, 255, 136, 0.15)';
      codeVisibilityTag.style.color = 'var(--green-neon)';
      codeVisibilityTag.style.borderColor = 'rgba(0, 255, 136, 0.4)';
      codeCaption.textContent = 'AUTHENTICATION KEY REVEALED';
      codeCaption.style.color = 'var(--cyan-neon)';

      if (!previousCodeVisible) {
        sfxCodeReveal();
      }
    } else {
      revealedCodeBox.style.display = 'none';
      lockedCodeBox.style.display = 'flex';

      codeVisibilityTag.textContent = 'LOCKED / HIDDEN';
      codeVisibilityTag.style.background = 'rgba(255, 0, 122, 0.15)';
      codeVisibilityTag.style.color = 'var(--pink-neon)';
      codeVisibilityTag.style.borderColor = 'rgba(255, 0, 122, 0.3)';
      codeCaption.textContent = 'STANDBY FOR PROTOCOL AUTHORIZATION';
      codeCaption.style.color = 'var(--text-dark)';
    }

    previousCodeVisible = isVisible;
  }

  // Render Point-Time Leaderboard
  function renderLeaderboard() {
    const players = currentState.players || [];
    if (players.length === 0) {
      leaderboardList.innerHTML = '<div class="empty-leaderboard">No players added to session.</div>';
      return;
    }

    // Sort players:
    // 1. Primary: Points descending (5 -> 0)
    // 2. Secondary: Best Lap Time ascending (players with times rank higher than players without times)
    // 3. Tertiary: Player Number ascending
    const sorted = [...players].sort((a, b) => {
      // Primary: Points
      if (b.points !== a.points) {
        return b.points - a.points;
      }
      // Secondary: Best Lap Time
      const aTime = a.bestLapMs !== null && a.bestLapMs !== undefined ? a.bestLapMs : Infinity;
      const bTime = b.bestLapMs !== null && b.bestLapMs !== undefined ? b.bestLapMs : Infinity;
      if (aTime !== bTime) {
        return aTime - bTime;
      }
      // Tertiary: Player Number
      return a.number - b.number;
    });

    leaderboardList.innerHTML = '';

    sorted.forEach((player, index) => {
      const rank = index + 1;
      const rankClass = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : '';
      const medalIcon = rank === 1 ? '🥇 #1' : rank === 2 ? '🥈 #2' : rank === 3 ? '🥉 #3' : `#${rank}`;

      // Build 5 pips
      let pipsHtml = '';
      for (let p = 1; p <= 5; p++) {
        pipsHtml += `<div class="pip ${p <= player.points ? 'filled' : ''}"></div>`;
      }

      const displayTime = player.currentTimeFormatted || player.bestLapFormatted || '--:--.--';

      const row = document.createElement('div');
      row.className = `leaderboard-row ${rankClass}`;
      row.innerHTML = `
        <div>
          <span class="rank-badge">${medalIcon}</span>
        </div>
        <div class="player-col">
          <div class="player-avatar-num">${player.number}</div>
          <span class="player-name-text">${escapeHtml(player.name)}</span>
        </div>
        <div class="points-col">
          <div class="points-nodes">${pipsHtml}</div>
          <span class="points-fraction">${player.points} / 5</span>
        </div>
        <div class="time-col">
          ${displayTime}
        </div>
      `;
      leaderboardList.appendChild(row);
    });
  }

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

  // Fullscreen support
  fullscreenToggle.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  // Audio toggle
  if (frontendAudioToggle) {
    frontendAudioToggle.addEventListener('click', () => {
      sfxEnabled = !sfxEnabled;
      frontendAudioIcon.textContent = sfxEnabled ? '🔊' : '🔇';
      frontendAudioLabel.textContent = sfxEnabled ? 'SFX ON' : 'MUTED';
      if (sfxEnabled) {
        sfxStageUpdate();
      }
    });
  }


  // Start continuous loop
  updateStopwatchDisplay();

})();
