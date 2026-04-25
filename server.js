// ═══════════════════════════════════════════════════
// server.js — Munchkin Quest Online Server
// Express + Socket.io, server-authoritative
// ═══════════════════════════════════════════════════
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { GameRoom } = require('./src/game/GameRoom');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 30000,
  pingInterval: 10000
});

const PORT = process.env.PORT || 3000;

// Statische Dateien aus public/
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ─── Raum-Verwaltung ──────────────────────────────
const rooms = new Map();            // roomCode → GameRoom
const playerRoomMap = new Map();    // socketId → roomCode

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do { code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''); }
  while (rooms.has(code));
  return code;
}

function getRoom(code) { return rooms.get(code?.toUpperCase()); }

function broadcastGameState(room) {
  room.lobbyPlayers.forEach(lp => {
    const socket = io.sockets.sockets.get(lp.id);
    if (socket) {
      socket.emit('game_update', room.getGameStateFor(lp.id));
    }
  });
}

function broadcastLobby(room) {
  io.to(room.code).emit('lobby_update', room.getLobbyState());
}

// ── Socket.io Events ─────────────────────────────
io.on('connection', (socket) => {
  console.log(`✅ Verbunden: ${socket.id}`);

  // ── Raum erstellen ───────────────────────────────
  socket.on('create_room', ({ playerName }) => {
    const name = (playerName || 'Spieler').trim().slice(0, 20);
    const code = generateRoomCode();
    const room = new GameRoom(code, socket.id, name);
    rooms.set(code, room);
    playerRoomMap.set(socket.id, code);
    socket.join(code);
    socket.emit('room_created', { code, lobbyState: room.getLobbyState() });
    console.log(`🏠 Raum erstellt: ${code} von ${name}`);
  });

  // ── Raum beitreten ──────────────────────────────
  socket.on('join_room', ({ roomCode, playerName }) => {
    const code = roomCode?.toUpperCase().trim();
    const name = (playerName || 'Spieler').trim().slice(0, 20);
    const room = getRoom(code);

    if (!room) {
      socket.emit('error', { message: `Raum ${code} nicht gefunden!` });
      return;
    }

    const result = room.addPlayer(socket.id, name);
    if (!result.success) {
      socket.emit('error', { message: result.error });
      return;
    }

    playerRoomMap.set(socket.id, code);
    socket.join(code);
    socket.emit('room_joined', { code, lobbyState: room.getLobbyState() });
    broadcastLobby(room);
    console.log(`👋 ${name} tritt Raum ${code} bei`);
  });

  // ── Spiel starten ────────────────────────────────
  socket.on('start_game', () => {
    const code = playerRoomMap.get(socket.id);
    const room = getRoom(code);
    if (!room) { socket.emit('error', { message: 'Nicht in einem Raum!' }); return; }

    const result = room.startGame(socket.id);
    if (!result.success) { socket.emit('error', { message: result.error }); return; }

    console.log(`🎮 Spiel gestartet in Raum ${code}`);
    io.to(code).emit('game_started');

    // Initiale Spielzustände senden
    broadcastGameState(room);
  });

  // ── Spielaktion ──────────────────────────────────
  socket.on('game_action', (action) => {
    const code = playerRoomMap.get(socket.id);
    const room = getRoom(code);
    if (!room?.gameState) {
      socket.emit('error', { message: 'Kein laufendes Spiel!' });
      return;
    }

    const result = room.handleAction(socket.id, action);

    if (!result.success) {
      socket.emit('action_error', { message: result.error || 'Ungültige Aktion!' });
      return;
    }

    // Neuen Zustand an alle senden
    broadcastGameState(room);

    // Spiel beendet?
    if (room.gameState?.winner) {
      io.to(code).emit('game_finished', { winnerId: room.gameState.winner });
    }
  });

  // ── Trennung ────────────────────────────────────
  socket.on('disconnect', () => {
    const code = playerRoomMap.get(socket.id);
    if (code) {
      const room = getRoom(code);
      if (room) {
        room.removePlayer(socket.id);
        if (room.playerCount === 0) {
          rooms.delete(code);
          console.log(`🗑️ Leerer Raum ${code} gelöscht`);
        } else {
          broadcastLobby(room);
          if (room.gameState) broadcastGameState(room);
        }
      }
      playerRoomMap.delete(socket.id);
    }
    console.log(`❌ Getrennt: ${socket.id}`);
  });

  // ── Ping (Verbindungstest) ───────────────────────
  socket.on('ping', () => socket.emit('pong'));
});

// ─── Aufräumen abgelaufener Räume ─────────────────
setInterval(() => {
  for (const [code, room] of rooms.entries()) {
    if (room.isExpired()) {
      rooms.delete(code);
      console.log(`🧹 Abgelaufener Raum ${code} entfernt`);
    }
  }
}, 10 * 60 * 1000); // Alle 10 Minuten

// ─── Server starten ──────────────────────────────
server.listen(PORT, () => {
  console.log(`\n🎲 Munchkin Quest Online läuft!`);
  console.log(`   → http://localhost:${PORT}`);
  console.log(`   → Teile den Link mit Freunden!\n`);
});
