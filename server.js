const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');
const QRCode = require('qrcode');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;
const DEFAULT_PIN = process.env.ADMIN_PIN || 'chaos2026';

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Network interfaces helper to show local LAN IP for multi-device setup
function getLocalNetworkAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // IPv4 and not internal loopback
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push({
          interface: name,
          address: iface.address,
          url: `http://${iface.address}:${PORT}`
        });
      }
    }
  }
  return addresses;
}

// Helper to generate abstract 5-character alphanumeric code
// Strictly avoids semantic English words (e.g. CAT81) using consonants + digits patterns (e.g. F9X82)
function generateAbstractCode() {
  // Consonants only (no vowels A, E, I, O, U) + digits (0-9)
  // This completely eliminates any English dictionary words, slang, or offensive words
  const consonants = 'BCDFGHJKLMNPQRSTVWXYZ';
  const digits = '0123456789';

  // Patterns for strictly abstract 5-char codes:
  // e.g. C-D-C-D-D (like F9X82), D-C-D-C-C, C-C-D-C-D, etc.
  const patterns = [
    ['C', 'D', 'C', 'D', 'D'], // e.g. F9X82
    ['C', 'D', 'C', 'D', 'C'], // e.g. K4M7W
    ['D', 'C', 'D', 'C', 'D'], // e.g. 7B4M9
    ['D', 'C', 'D', 'C', 'C'], // e.g. 3K7PQ
    ['C', 'C', 'D', 'C', 'D']  // e.g. RT5X8
  ];

  const chosenPattern = patterns[Math.floor(Math.random() * patterns.length)];
  let code = '';
  for (const type of chosenPattern) {
    if (type === 'C') {
      code += consonants[Math.floor(Math.random() * consonants.length)];
    } else {
      code += digits[Math.floor(Math.random() * digits.length)];
    }
  }
  return code;
}

const DEFAULT_KEYBINDS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'];

// Master Authoritative Game State
let gameState = {
  stopwatch: {
    isRunning: false,
    startTime: null,          // ms epoch
    accumulatedTime: 0,       // ms elapsed before current run
    activePlayerId: 'p1'      // active focus
  },
  stage: {
    number: 1,
    visible: true
  },
  code: {
    activeCode: 'F9X82',
    isVisibleOnFrontend: false,
    history: [
      { id: 'code_initial', code: 'F9X82', timestamp: Date.now() }
    ]
  },
  players: [
    {
      id: 'p1',
      number: 1,
      name: 'Player 1',
      points: 0,
      keybind: '1',
      currentTimeMs: null,
      currentTimeFormatted: null,
      isFinished: false,
      laps: []
    },
    {
      id: 'p2',
      number: 2,
      name: 'Player 2',
      points: 0,
      keybind: '2',
      currentTimeMs: null,
      currentTimeFormatted: null,
      isFinished: false,
      laps: []
    }
  ],
  adminPin: DEFAULT_PIN
};

// Compute current stopwatch time (authoritative)
function getElapsedStopwatchTime() {
  if (!gameState.stopwatch.isRunning) {
    return gameState.stopwatch.accumulatedTime;
  }
  return gameState.stopwatch.accumulatedTime + (Date.now() - gameState.stopwatch.startTime);
}

// Format milliseconds to MM:SS.SS
function formatTime(ms) {
  if (ms === null || ms === undefined || ms < 0) return '--:--.--';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const hundredths = Math.floor((ms % 1000) / 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

// Helper to broadcast sanitized public state or admin state
function getPublicState() {
  return {
    stopwatch: {
      isRunning: gameState.stopwatch.isRunning,
      startTime: gameState.stopwatch.startTime,
      accumulatedTime: gameState.stopwatch.accumulatedTime,
      activePlayerId: gameState.stopwatch.activePlayerId
    },
    stage: gameState.stage,
    code: {
      activeCode: gameState.code.isVisibleOnFrontend ? gameState.code.activeCode : null,
      isVisibleOnFrontend: gameState.code.isVisibleOnFrontend
    },
    players: gameState.players.map(p => {
      const bestHistoryMs = p.laps.length > 0 ? Math.min(...p.laps.map(l => l.timeMs)) : null;
      const effectiveMs = p.currentTimeMs !== null ? p.currentTimeMs : bestHistoryMs;
      return {
        id: p.id,
        number: p.number,
        name: p.name,
        points: p.points,
        keybind: p.keybind,
        currentTimeMs: p.currentTimeMs,
        currentTimeFormatted: p.currentTimeFormatted,
        isFinished: p.isFinished,
        lapsCount: p.laps.length,
        bestLapMs: effectiveMs,
        bestLapFormatted: effectiveMs !== null ? formatTime(effectiveMs) : '--:--.--',
        lastLapFormatted: p.laps.length > 0 ? p.laps[p.laps.length - 1].formatted : '--:--.--'
      };
    }),
    serverTimestamp: Date.now()
  };
}

function getAdminState() {
  return {
    ...gameState,
    serverTimestamp: Date.now(),
    networkAddresses: getLocalNetworkAddresses()
  };
}

// Routes
// Frontend display route (Projector / Spectator screen)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Admin controller route
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Network info API
app.get('/api/info', (req, res) => {
  res.json({
    title: 'Activity: Chaos Room',
    port: PORT,
    addresses: getLocalNetworkAddresses(),
    frontendUrl: `http://localhost:${PORT}/`,
    adminUrl: `http://localhost:${PORT}/admin`
  });
});

// QR Code API for scanning on mobile devices / projectors
app.get('/api/qr', async (req, res) => {
  try {
    const addresses = getLocalNetworkAddresses();
    const defaultUrl = addresses.length > 0 ? addresses[0].url : `http://localhost:${PORT}/`;
    const targetUrl = req.query.url || defaultUrl;
    const svg = await QRCode.toString(targetUrl, {
      type: 'svg',
      margin: 2,
      color: {
        dark: '#00f3ff',
        light: '#0b0f17'
      }
    });
    res.type('image/svg+xml').send(svg);
  } catch (err) {
    res.status(500).send('Error generating QR code');
  }
});

// Session Results Export API (CSV & JSON)
app.get('/api/export', (req, res) => {
  const format = req.query.format || 'json';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  if (format === 'csv') {
    let csv = 'Rank,Player Number,Player Name,Points (Out of 5),Best Lap Time,Total Laps,Recorded Lap Times\n';
    const sorted = [...gameState.players].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      const aTime = a.laps.length > 0 ? Math.min(...a.laps.map(l => l.timeMs)) : Infinity;
      const bTime = b.laps.length > 0 ? Math.min(...b.laps.map(l => l.timeMs)) : Infinity;
      return aTime - bTime;
    });

    sorted.forEach((p, idx) => {
      const bestMs = p.laps.length > 0 ? Math.min(...p.laps.map(l => l.timeMs)) : null;
      const lapTimes = p.laps.map(l => l.formatted).join(' | ');
      csv += `${idx + 1},${p.number},"${p.name}",${p.points},${formatTime(bestMs)},${p.laps.length},"${lapTimes}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="chaos-room-results-${timestamp}.csv"`);
    return res.send(csv);
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="chaos-room-session-${timestamp}.json"`);
  res.json({
    activity: 'Activity: Chaos Room',
    exportedAt: new Date().toISOString(),
    stage: gameState.stage,
    stopwatch: {
      totalElapsed: getElapsedStopwatchTime(),
      formatted: formatTime(getElapsedStopwatchTime())
    },
    players: gameState.players
  });
});

// Socket.io Real-Time Synchronization & Interception
let connectedClients = {
  frontend: new Set(),
  admin: new Set()
};

function broadcastState() {
  io.to('frontend_room').emit('state:update', getPublicState());
  io.to('admin_room').emit('state:update', getAdminState());
  io.to('admin_room').emit('clients:count', {
    frontendCount: connectedClients.frontend.size,
    adminCount: connectedClients.admin.size
  });
}

io.on('connection', (socket) => {
  let clientRole = null;

  // Handshake & registration
  socket.on('client:register', (data) => {
    clientRole = data && data.role === 'admin' ? 'admin' : 'frontend';

    if (clientRole === 'admin') {
      connectedClients.admin.add(socket.id);
      socket.join('admin_room');
      socket.emit('state:init', getAdminState());
    } else {
      connectedClients.frontend.add(socket.id);
      socket.join('frontend_room');
      socket.emit('state:init', getPublicState());
    }

    // Inform admin room of active viewer counts
    io.to('admin_room').emit('clients:count', {
      frontendCount: connectedClients.frontend.size,
      adminCount: connectedClients.admin.size
    });
  });

  // Admin PIN verification
  socket.on('admin:verify_pin', (pin, callback) => {
    const isValid = pin === gameState.adminPin;
    if (typeof callback === 'function') {
      callback({ success: isValid });
    }
  });

  // Middleware check for admin actions
  function checkAuth(authPin) {
    return authPin === gameState.adminPin;
  }

  // STOPWATCH CONTROLS
  socket.on('stopwatch:start', ({ pin }) => {
    if (!checkAuth(pin)) return;
    if (!gameState.stopwatch.isRunning) {
      gameState.stopwatch.isRunning = true;
      gameState.stopwatch.startTime = Date.now();
      broadcastState();
    }
  });

  socket.on('stopwatch:pause', ({ pin }) => {
    if (!checkAuth(pin)) return;
    if (gameState.stopwatch.isRunning) {
      gameState.stopwatch.accumulatedTime += (Date.now() - gameState.stopwatch.startTime);
      gameState.stopwatch.isRunning = false;
      gameState.stopwatch.startTime = null;
      broadcastState();
    }
  });

  socket.on('stopwatch:reset', ({ pin }) => {
    if (!checkAuth(pin)) return;
    gameState.stopwatch.isRunning = false;
    gameState.stopwatch.startTime = null;
    gameState.stopwatch.accumulatedTime = 0;
    broadcastState();
  });

  socket.on('stopwatch:set_active_player', ({ pin, playerId }) => {
    if (!checkAuth(pin)) return;
    gameState.stopwatch.activePlayerId = playerId;
    broadcastState();
  });

  // LAP RECORDING
  socket.on('lap:record', ({ pin, playerId }) => {
    if (!checkAuth(pin)) return;
    const player = gameState.players.find(p => p.id === playerId);
    if (!player) return;

    const currentElapsed = getElapsedStopwatchTime();
    const lapNum = player.laps.length + 1;
    const newLap = {
      id: `lap_${playerId}_${Date.now()}`,
      lapNum,
      timeMs: currentElapsed,
      formatted: formatTime(currentElapsed),
      timestamp: Date.now()
    };
    player.laps.push(newLap);
    broadcastState();
  });

  socket.on('lap:delete', ({ pin, playerId, lapId }) => {
    if (!checkAuth(pin)) return;
    const player = gameState.players.find(p => p.id === playerId);
    if (!player) return;

    player.laps = player.laps.filter(l => l.id !== lapId);
    // Re-index laps
    player.laps.forEach((l, idx) => {
      l.lapNum = idx + 1;
    });
    broadcastState();
  });

  socket.on('lap:clear_all', ({ pin, playerId }) => {
    if (!checkAuth(pin)) return;
    const player = gameState.players.find(p => p.id === playerId);
    if (!player) return;
    player.laps = [];
    broadcastState();
  });

  // PLAYER MANAGEMENT & RECITATION TIMING
  socket.on('player:adjust_count', ({ pin, action }) => {
    if (!checkAuth(pin)) return;
    if (action === 'add') {
      const nextNumber = gameState.players.length > 0 
        ? Math.max(...gameState.players.map(p => p.number)) + 1 
        : 1;
      const keyIndex = (nextNumber - 1) % DEFAULT_KEYBINDS.length;
      const newPlayer = {
        id: `p${Date.now()}`,
        number: nextNumber,
        name: `Player ${nextNumber}`,
        points: 0,
        keybind: DEFAULT_KEYBINDS[keyIndex] || String(nextNumber),
        currentTimeMs: null,
        currentTimeFormatted: null,
        isFinished: false,
        laps: []
      };
      gameState.players.push(newPlayer);
    } else if (action === 'subtract') {
      if (gameState.players.length > 1) {
        gameState.players.pop();
      }
    }
    broadcastState();
  });

  socket.on('player:add', ({ pin, name }) => {
    if (!checkAuth(pin)) return;
    const nextNumber = gameState.players.length > 0 
      ? Math.max(...gameState.players.map(p => p.number)) + 1 
      : 1;
    const keyIndex = (nextNumber - 1) % DEFAULT_KEYBINDS.length;
    const newPlayer = {
      id: `p${Date.now()}`,
      number: nextNumber,
      name: name && name.trim() ? name.trim() : `Player ${nextNumber}`,
      points: 0,
      keybind: DEFAULT_KEYBINDS[keyIndex] || String(nextNumber),
      currentTimeMs: null,
      currentTimeFormatted: null,
      isFinished: false,
      laps: []
    };
    gameState.players.push(newPlayer);
    if (!gameState.stopwatch.activePlayerId) {
      gameState.stopwatch.activePlayerId = newPlayer.id;
    }
    broadcastState();
  });

  socket.on('player:remove', ({ pin, playerId }) => {
    if (!checkAuth(pin)) return;
    gameState.players = gameState.players.filter(p => p.id !== playerId);
    if (gameState.stopwatch.activePlayerId === playerId) {
      gameState.stopwatch.activePlayerId = gameState.players[0] ? gameState.players[0].id : null;
    }
    broadcastState();
  });

  // SIMULTANEOUS RECITATION STOPWATCH STOPPING
  socket.on('player:stop_time', ({ pin, playerId, timeMs }) => {
    if (!checkAuth(pin)) return;
    const player = gameState.players.find(p => p.id === playerId);
    if (!player) return;

    // Use passed time or authoritative server elapsed stopwatch time
    const stoppedTime = timeMs !== undefined ? timeMs : getElapsedStopwatchTime();
    player.currentTimeMs = stoppedTime;
    player.currentTimeFormatted = formatTime(stoppedTime);
    player.isFinished = true;

    // Record into lap history as well
    const lapNum = player.laps.length + 1;
    player.laps.push({
      id: `lap_${playerId}_${Date.now()}`,
      lapNum,
      timeMs: stoppedTime,
      formatted: formatTime(stoppedTime),
      timestamp: Date.now()
    });

    broadcastState();
  });

  socket.on('player:reset_time', ({ pin, playerId }) => {
    if (!checkAuth(pin)) return;
    const player = gameState.players.find(p => p.id === playerId);
    if (!player) return;
    player.currentTimeMs = null;
    player.currentTimeFormatted = null;
    player.isFinished = false;
    broadcastState();
  });

  socket.on('player:reset_all_times', ({ pin }) => {
    if (!checkAuth(pin)) return;
    gameState.players.forEach(p => {
      p.currentTimeMs = null;
      p.currentTimeFormatted = null;
      p.isFinished = false;
    });
    broadcastState();
  });

  socket.on('player:set_keybind', ({ pin, playerId, keybind }) => {
    if (!checkAuth(pin)) return;
    const player = gameState.players.find(p => p.id === playerId);
    if (!player) return;
    player.keybind = String(keybind).trim().toUpperCase();
    broadcastState();
  });

  socket.on('player:set_points', ({ pin, playerId, points }) => {
    if (!checkAuth(pin)) return;
    const player = gameState.players.find(p => p.id === playerId);
    if (!player) return;
    // Ensure points are strictly between 0 and 5
    const clampedPoints = Math.max(0, Math.min(5, parseInt(points, 10) || 0));
    player.points = clampedPoints;
    broadcastState();
  });

  // STAGE CONTROLS
  socket.on('stage:update', ({ pin, number, visible }) => {
    if (!checkAuth(pin)) return;
    if (number !== undefined) {
      gameState.stage.number = Math.max(1, parseInt(number, 10) || 1);
    }
    if (visible !== undefined) {
      gameState.stage.visible = Boolean(visible);
    }
    broadcastState();
  });

  // RANDOM CODE GENERATOR
  socket.on('code:generate', ({ pin }) => {
    if (!checkAuth(pin)) return;
    const newCode = generateAbstractCode();
    gameState.code.activeCode = newCode;
    gameState.code.history.unshift({
      id: `code_${Date.now()}`,
      code: newCode,
      timestamp: Date.now()
    });
    // Keep max 25 in history
    if (gameState.code.history.length > 25) {
      gameState.code.history.pop();
    }
    broadcastState();
  });

  socket.on('code:set_active', ({ pin, code }) => {
    if (!checkAuth(pin)) return;
    gameState.code.activeCode = code;
    broadcastState();
  });

  socket.on('code:toggle_frontend_visibility', ({ pin, isVisible }) => {
    if (!checkAuth(pin)) return;
    gameState.code.isVisibleOnFrontend = Boolean(isVisible);
    broadcastState();
  });

  socket.on('code:delete_from_history', ({ pin, codeId }) => {
    if (!checkAuth(pin)) return;
    gameState.code.history = gameState.code.history.filter(c => c.id !== codeId);
    broadcastState();
  });

  socket.on('code:clear_history', ({ pin }) => {
    if (!checkAuth(pin)) return;
    gameState.code.history = [];
    broadcastState();
  });

  // RESET ALL GAME STATE
  socket.on('game:reset_all', ({ pin }) => {
    if (!checkAuth(pin)) return;
    gameState.stopwatch = {
      isRunning: false,
      startTime: null,
      accumulatedTime: 0,
      activePlayerId: 'p1'
    };
    gameState.stage = {
      number: 1,
      visible: true
    };
    const newCode = generateAbstractCode();
    gameState.code = {
      activeCode: newCode,
      isVisibleOnFrontend: false,
      history: [{ id: `code_${Date.now()}`, code: newCode, timestamp: Date.now() }]
    };
    gameState.players = [
      { id: 'p1', number: 1, name: 'Player 1', points: 0, laps: [] },
      { id: 'p2', number: 2, name: 'Player 2', points: 0, laps: [] }
    ];
    broadcastState();
  });

  // Disconnect handler
  socket.on('disconnect', () => {
    if (clientRole === 'admin') {
      connectedClients.admin.delete(socket.id);
    } else if (clientRole === 'frontend') {
      connectedClients.frontend.delete(socket.id);
    }
    io.to('admin_room').emit('clients:count', {
      frontendCount: connectedClients.frontend.size,
      adminCount: connectedClients.admin.size
    });
  });
});

// Start Server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`Activity: Chaos Room is running!`);
  console.log(`Local Access: http://localhost:${PORT}`);
  console.log(`Admin Panel:  http://localhost:${PORT}/admin`);
  const addresses = getLocalNetworkAddresses();
  if (addresses.length > 0) {
    console.log(`\nNetwork Access for other devices (Projector / Mobile):`);
    addresses.forEach(addr => {
      console.log(`- ${addr.interface}: ${addr.url} (Admin: ${addr.url}/admin)`);
    });
  }
  console.log(`====================================================`);
});
