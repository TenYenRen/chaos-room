const { io } = require('socket.io-client');

const SOCKET_URL = 'http://localhost:3000';
const ADMIN_PIN = 'chaos2026';

console.log('--- Starting Chaos Room Full-Stack Integration Test ---');

const frontendSocket = io(SOCKET_URL);
const adminSocket = io(SOCKET_URL);

let frontendState = null;
let adminState = null;

frontendSocket.on('connect', () => {
  console.log('✅ Frontend socket connected');
  frontendSocket.emit('client:register', { role: 'frontend' });
});

frontendSocket.on('state:init', (state) => {
  console.log('✅ Frontend received state:init');
  frontendState = state;
});

frontendSocket.on('state:update', (state) => {
  frontendState = state;
});

adminSocket.on('connect', () => {
  console.log('✅ Admin socket connected');
  adminSocket.emit('client:register', { role: 'admin' });

  // 1. Verify PIN
  adminSocket.emit('admin:verify_pin', ADMIN_PIN, (res) => {
    console.log('✅ Admin PIN Verification result:', res.success ? 'SUCCESS' : 'FAILED');

    // 2. Add player count
    adminSocket.emit('player:adjust_count', { pin: ADMIN_PIN, action: 'add' });
    console.log('✅ Dispatched player:adjust_count (add)');

    // 3. Update Stage to 3
    setTimeout(() => {
      adminSocket.emit('stage:update', { pin: ADMIN_PIN, number: 3, visible: true });
      console.log('✅ Dispatched stage:update (Stage 3)');
    }, 200);

    // 4. Generate abstract code
    setTimeout(() => {
      adminSocket.emit('code:generate', { pin: ADMIN_PIN });
      console.log('✅ Dispatched code:generate');
    }, 400);

    // 5. Toggle code visibility on frontend
    setTimeout(() => {
      adminSocket.emit('code:toggle_frontend_visibility', { pin: ADMIN_PIN, isVisible: true });
      console.log('✅ Dispatched code:toggle_frontend_visibility (true)');
    }, 600);

    // 6. Set custom keybind for Player 1
    setTimeout(() => {
      if (adminState && adminState.players.length > 0) {
        const p1 = adminState.players[0];
        adminSocket.emit('player:set_keybind', { pin: ADMIN_PIN, playerId: p1.id, keybind: 'Q' });
        console.log(`✅ Dispatched player:set_keybind ('Q' for ${p1.name})`);
      }
    }, 700);

    // 7. Stop recitation time for Player 1 (e.g. 4.28s)
    setTimeout(() => {
      if (adminState && adminState.players.length > 0) {
        const p1 = adminState.players[0];
        adminSocket.emit('player:stop_time', { pin: ADMIN_PIN, playerId: p1.id, timeMs: 4280 });
        console.log(`✅ Dispatched player:stop_time (4280ms for ${p1.name})`);
      }
    }, 800);

    // 8. Set points
    setTimeout(() => {
      if (adminState && adminState.players.length > 0) {
        const p1 = adminState.players[0];
        adminSocket.emit('player:set_points', { pin: ADMIN_PIN, playerId: p1.id, points: 5 });
        console.log(`✅ Dispatched player:set_points (5/5 for ${p1.name})`);
      }
    }, 900);

    // 9. Verify sync
    setTimeout(() => {
      console.log('\n--- Checking Frontend Synchronized State ---');
      console.log('Stage on Frontend:', `Stage ${frontendState.stage.number} (visible: ${frontendState.stage.visible})`);
      console.log('Code on Frontend:', frontendState.code.activeCode, '(visible:', frontendState.code.isVisibleOnFrontend, ')');
      console.log('Players on Frontend:');
      frontendState.players.forEach(p => {
        console.log(` - ${p.name} (#${p.number}): Points=${p.points}/5, Time=${p.currentTimeFormatted || p.bestLapFormatted}, Keybind=${p.keybind}`);
      });

      // Validations
      const p1 = frontendState.players[0];
      if (frontendState.stage.number === 3 &&
          frontendState.code.isVisibleOnFrontend === true &&
          frontendState.code.activeCode.length === 5 &&
          p1 && p1.points === 5 &&
          p1.keybind === 'Q' &&
          p1.currentTimeFormatted === '00:04.28') {
        console.log('\n🎉 ALL UPGRADED INTEGRATION TESTS PASSED PERFECTLY!');
        process.exit(0);
      } else {
        console.error('❌ Validation assertion failed!', frontendState);
        process.exit(1);
      }
    }, 1400);

  });
});

adminSocket.on('state:init', (state) => {
  adminState = state;
});

adminSocket.on('state:update', (state) => {
  adminState = state;
});
