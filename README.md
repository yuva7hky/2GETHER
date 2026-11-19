# 🎬 2GETHER
> *"Two Hearts. One Theatre. One Movie."*

**2GETHER** is a bespoke, real-time multiplayer 3D virtual cinema experience designed strictly for couples, long-distance partners, and close friends (strictly 2 people maximum per room).

---

## ✨ Features (Phase 1 Foundation)

1. **Strictly 2-Player Capacity**
   - Cryptographically random 6-character room codes (e.g., `HEART2`).
   - Server-enforced capacity and PostgreSQL database trigger (`check_room_capacity`) preventing race conditions.
   - Any 3rd player is automatically and gracefully rejected.

2. **Adorable 3D Avatars & Real-time Animation**
   - Procedural stylized characters with expressive eyes, blush cheeks, customizable sweaters, hair colors, and accessories.
   - Animation states: `IDLE`, `WALK`, `RUN`, `SIT`.
   - Third-person smooth follow camera with zoom and angle controls.

3. **Immersive 3D Theatre Architecture**
   - High-fidelity cinema hall with velvet acoustic walls, warm golden sconces, and entrance doors.
   - VIP Couple Armchairs front-and-center with proximity prompt: `[E] to Sit Together`.
   - Giant 16:9 cinema projection screen powered by Three.js `VideoTexture`.

4. **Movie System Architecture**
   - Creator-only upload pipeline with strict 700 MB limit.
   - Cloudflare R2 S3-compatible multipart upload architecture with presigned URLs.
   - Synchronized play, pause, and seek timeline controls.
   - Automatic 30-minute inactivity room garbage collection.

5. **Theatre Whispers (Live Chat)**
   - Real-time scoped room messaging with timestamps and sender badges.
   - Cute quick reaction emojis (♥, 🍿, 🎬, ✨, 😍, 🥺).

6. **Responsive Multiplatform Controls**
   - Keyboard: `W A S D` to move, `Shift` to sprint, `Space` to hop, `E` to sit/stand.
   - Mobile: Virtual floating joystick, sprint toggle, jump button, sit button.

---

## 🏗️ Project Architecture

```
2GETHER/
  client/                  # Frontend (React 18 + Vite + Three.js + R3F + Zustand + Tailwind)
    src/
      characters/          # StylizedAvatar.tsx (procedural animations & materials)
      components/          # ChatDrawer, MoviePlayerOverlay, SettingsModal, MobileControls
      game/                # PlayerController.tsx, RemotePlayer.tsx
      pages/               # LandingPage, CharacterCreation, HomeDashboard, VirtualTheatre
      services/            # socketService.ts
      store/               # useAppStore.ts (Zustand state store)
      styles/              # index.css (glassmorphic theme & golden glow)
      theatre/             # TheatreScene.tsx, ScreenMesh.tsx, CoupleSeats.tsx
      types/               # TypeScript data models
  server/                  # Backend (Node.js 22 + Express + TypeScript + Socket.IO)
    src/
      config/              # Environment config validation with Zod
      controllers/         # Room & Movie controllers
      middleware/          # Rate limiting & error handlers
      routes/              # /api/rooms & /api/movies
      services/            # roomService.ts & movieService.ts (R2 S3 Client)
      socket/              # socketHandler.ts (Strict 2-player state machine & sync)
      types/               # Server types
  database/
    migrations/            # 001_initial_schema.sql (PostgreSQL schema & capacity trigger)
    policies/              # 002_rls_policies.sql (Supabase Row-Level Security)
  docs/
    ARCHITECTURE.md        # Complete system architecture & ADRs
  package.json             # Root workspace scripts
  README.md
```

---

## 🚀 Quickstart & Setup Guide

### Prerequisites
- Node.js v18+ or v20+ or v22+
- npm v9+

### 1. Install Dependencies
Run the installation commands for both the client and server:

```bash
# Install Server dependencies
cd server
npm install

# Install Client dependencies
cd ../client
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` in the `server` directory:

```bash
cd server
cp .env.example .env
```

*(Note: The server includes zero-friction local development fallback mode. If Cloudflare R2 and Supabase credentials are not provided, it automatically operates in local in-memory session mode for local development and testing).*

### 3. Launch Development Environment
You can run the frontend and backend in separate terminal windows:

**Terminal 1 (Backend Server on Port 4000):**
```bash
cd server
npm run dev
```

**Terminal 2 (Frontend Client on Port 5173):**
```bash
cd client
npm run dev
```

Open your browser at `http://localhost:5173`.

---

## 🧪 Testing the Strictly 2-Player Multiplayer Flow

1. Open `http://localhost:5173` in Browser Window 1 (Host).
2. Click **Open Private Cinema** -> Click **Create Room & Get Code**.
3. Note the generated 6-letter room code (or click **Copy Share Link**).
4. Click **Enter 3D Theatre**.
5. Open an Incognito window or Browser Window 2 (Partner).
6. Navigate to `http://localhost:5173` -> Click **Enter Lobby** -> Enter the 6-character room code -> Click **Join Room**.
7. Both characters will spawn in the 3D cinema hall.
8. Walk together using `W A S D`, walk up to the VIP Couple Armchairs, and press `[E]` to sit side-by-side.
9. Open the Chat drawer to whisper sweet messages in real time.
10. If a 3rd incognito tab attempts to enter with the same room code, the server strictly rejects the connection with:
   *"This private theatre room is already at maximum capacity (STRICTLY 2 players)."*

