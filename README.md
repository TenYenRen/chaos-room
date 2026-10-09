# Activity: Chaos Room Ψ

A multi-device, real-time synchronized event and psychological experiment controller built with **Node.js**, **Express**, and **Socket.io**.

Designed specifically for dual-device deployments:
- **Projector / Spectator Screen (`/`)**: High-contrast, aesthetic dark-mode cyberpunk interface featuring the Greek Psychology Psi symbol (`Ψ`), dynamic "Stage x" banner, synchronized digital stopwatch, point-time leaderboard, and backend-controlled secret code chamber.
- **Operator / Admin Console (`/admin`)**: Complete host console with session PIN security, stopwatch controls with player targeting, tabbed player lap recorder, 0-5 point scoring counter, non-semantic random code generator with history and manual deletion, frontend code reveal toggles, and dual leaderboards.

---

## 🌟 Key Features

### 1. Synchronized Master Stopwatch
- **Sub-millisecond Server Authoritative Timing**: The server tracks authoritative epoch timestamps and elapsed milliseconds. Frontend and backend interpolate locally using `requestAnimationFrame` for buttery-smooth 60fps without desynchronization across network delays.
- **Player-Targeted Timing**: Select which player is actively running on the stopwatch (e.g., *Player 2*); the frontend dynamically displays the active player focus.
- **Controls**: Start, Pause, Resume, Reset, and Quick Lap Recording directly from the backend.

### 2. Tabbed Player Management & Lap Recorder
- **Player Management**: Dynamically add and remove players (e.g., *Player 1*, *Player 2*, or custom names).
- **Separate Tabs**: Dedicated tabs for each participant in `/admin`.
- **Lap Table**: Records precise split and elapsed lap times with lap numbers, timestamps, and manual lap deletion.
- **Point Counter (Out of 5)**: Instant scoring selector (0 to 5 points) with interactive pips and real-time reflection on the projector leaderboard.

### 3. Non-Semantic Abstract Code Generator (e.g., `F9X82`)
- **Abstract Alphanumeric Pattern**: Strict consonant-digit alternation algorithm that guarantees codes remain non-semantic (e.g., `F9X82`, `3K7PQ`, `B4R9J`), explicitly eliminating dictionary words, slang, or semantic tokens like `CAT81`.
- **History & Manual Deletion**: All generated codes are recorded in history; individual codes can be manually deleted or reactivated with one click.
- **Frontend Reveal / Hide Toggle**: The backend host controls whether the code is **VISIBLE** on the spectator screen or safely **ENCRYPTED/MASKED** (`•••••`).

### 4. Stage Controller ("Stage x")
- The host inputs any stage number and updates the live display.
- Renders dynamically as **"Stage 1"**, **"Stage 2"**, etc., on the frontend projector screen.
- Toggle visibility on/off at will.

### 5. Dual Leaderboards
1. **Frontend Leaderboard (Points + Time)**:
   - Displayed on both `/` and `/admin`.
   - Primary Sort: **Points** (out of 5, descending).
   - Tie-Breaker: **Best Lap Time** (fastest lap ascending).
2. **Pure Time Leaderboard**:
   - Displayed in `/admin`.
   - Ranks participants purely by fastest recorded lap time regardless of points.

### 6. Multi-Device Network Interception & Reconnection
- **Cross-Device Ready**: Host server automatically discovers local Wi-Fi / Ethernet LAN IP addresses (e.g., `http://192.168.1.50:3000/`) and shows a quick-copy URL in the admin header.
- **📱 Instant QR Code Modal**: The operator can click **"SCAN QR CODE"** to render a live SVG QR code so phones, tablets, or projector remotes can scan and open the screen instantly.
- **Instant State Resync**: If a spectator screen temporarily disconnects or reloads, Socket.io reconnects gracefully and immediately requests a complete state snapshot (`state:init`), with zero desynchronization or page reloads required.
- **Spectator Counter**: Real-time indicator of how many spectator screens are connected.

### 7. Zero-Dependency Web Audio Synthesizer (SFX)
- Built-in sound effects using standard Web Audio API (no external sound files required):
  - **Lap Chime**: Dual harmonious tone on lap recordings.
  - **Code Reveal Chord**: Futuristic 4-note chord when secret code is revealed on the projector.
  - **Stopwatch Beeps**: Tones on start and pause.
  - **Stage Update Pulse**: Audible cue when transitioning stages.
- Both Frontend and Admin have instant Mute/Unmute buttons.

### 8. Host Keyboard Hotkeys & Data Export
- **Hotkeys**:
  - `Space` - Start / Pause Stopwatch
  - `L` - Record Lap for active target player
  - `C` - Generate new abstract code
  - `V` - Toggle code reveal on frontend screen
  - `R` - Reset stopwatch
  - `F` - Toggle fullscreen on projector display
- **Data Export**:
  - Download full session results directly as **CSV** (`/api/export?format=csv`) or **JSON** (`/api/export?format=json`).

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)

### Installation & Launch
```bash
# Navigate to the project directory
cd chaos-room

# Install dependencies (Express & Socket.io)
npm install

# Start the server
npm start
```

### URLs
- **Spectator / Projector Display**: `http://localhost:3000/` (or `http://<YOUR_LAN_IP>:3000/`)
- **Host Admin Controller**: `http://localhost:3000/admin` (or `http://<YOUR_LAN_IP>:3000/admin`)

### Default Admin PIN
- Default: `chaos2026`
- Can be customized by setting the `ADMIN_PIN` environment variable:
  ```bash
  ADMIN_PIN="mySecretPin" npm start
  ```

---

## 📁 Project Structure

```
chaos-room/
├── package.json          # Dependencies & scripts
├── server.js             # Express + Socket.io server & authoritative state
├── README.md             # Documentation
└── public/
    ├── index.html        # Spectator / Projector frontend screen
    ├── admin.html        # Backend host controller console
    ├── css/
    │   ├── frontend.css  # Dark cyberpunk theme & glowing Psi emblem styles
    │   └── admin.css     # Clean, modular admin controller styling
    ├── js/
    │   ├── frontend.js   # Projector client logic & synced stopwatch animation
    │   └── admin.js      # Host controller client, tabbed laps, code generator & scoring
    └── assets/
        └── psi.svg       # Vector Psychology Psi symbol (Ψ)
```
