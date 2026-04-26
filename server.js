// ════════════════════════════════════════════════════════════════
// server.js — Munchkin Quest mit Persistenz & Reconnect
// ════════════════════════════════════════════════════════════════
const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');
const fs      = require('fs');
const { GameRoom } = require('./src/game/GameRoom');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin:'*', methods:['GET','POST'] },
  pingTimeout:  60000,   // 60s (längere Toleranz für Mobile)
  pingInterval: 15000,   // 15s Ping
  transports:   ['websocket','polling'],
});
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'rooms_snapshot.json');

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ── STATE ──────────────────────────────────────────────────────────
const rooms         = new Map();  // code → GameRoom
const socketToRoom  = new Map();  // socketId → roomCode
const socketToName  = new Map();  // socketId → playerName
// Reconnect-Registry: "roomCode:playerName" → { oldSocketId, playerState }
const pendingReconnect = new Map();

// ── PERSISTENZ (Lobby-State speichern) ────────────────────────────
function saveSnapshot() {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    const snapshot = {};
    for (const [code, room] of rooms.entries()) {
      if (room.gameState) {
        snapshot[code] = {
          code,
          hostId: room.lobbyPlayers.find(p=>p.isHost)?.id,
          players: room.lobbyPlayers.map(p => ({
            id: p.id, name: p.name, isHost: p.isHost, isNPC: p.isNPC
          })),
          hasNPCs: Object.keys(room.npcControllers||{}).length > 0,
          savedAt: Date.now(),
        };
      }
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(snapshot, null, 2));
  } catch(e) { /* Fehler ignorieren */ }
}

// ── CODE GENERATOR ────────────────────────────────────────────────
function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do { code = Array.from({length:6}, () => chars[Math.floor(Math.random()*chars.length)]).join(''); }
  while (rooms.has(code));
  return code;
}

// ── BROADCAST ─────────────────────────────────────────────────────
function broadcast(room) {
  room.lobbyPlayers.forEach(lp => {
    if (lp.isNPC) return;
    const sock = io.sockets.sockets.get(lp.id);
    if (sock) sock.emit('game_update', room.getGameStateFor(lp.id));
  });
  // Auch Reconnect-pending Spieler benachrichtigen
  for (const [key, rec] of pendingReconnect.entries()) {
    if (key.startsWith(room.code + ':')) {
      const sock = io.sockets.sockets.get(rec.newSocketId);
      if (sock) {
        const pName = key.split(':')[1];
        const player = room.lobbyPlayers.find(p => p.name === pName && !p.isNPC);
        if (player) sock.emit('game_update', room.getGameStateFor(player.id));
      }
    }
  }
}

function lobbyBroadcast(room) {
  io.to(room.code).emit('lobby_update', room.getLobbyState());
}

// ── RECONNECT ─────────────────────────────────────────────────────
function tryReconnect(socket, roomCode, playerName) {
  const room = rooms.get(roomCode);
  if (!room) return false;

  // Spieler mit diesem Namen im Raum suchen
  const existing = room.lobbyPlayers.find(p => p.name === playerName && !p.isNPC);
  if (!existing) return false;

  const oldId = existing.id;
  const newId = socket.id;

  if (oldId === newId) return true; // Bereits verbunden

  // Socket-ID aktualisieren
  existing.id = newId;
  if (room.gameState) {
    const gp = room.gameState.players.find(p => p.id === oldId);
    if (gp) gp.id = newId;
    // GameState.handleAction prüft socketId — updatePlayerMap
  }

  // Mappings aktualisieren
  socketToRoom.set(newId, roomCode);
  socketToName.set(newId, playerName);
  socketToRoom.delete(oldId);
  socket.join(roomCode);

  console.log(`🔄 Reconnect: ${playerName} → ${roomCode} (${oldId.slice(0,6)} → ${newId.slice(0,6)})`);
  return true;
}

// ── SOCKET.IO ─────────────────────────────────────────────────────
io.on('connection', socket => {
  console.log('✅ Connect:', socket.id.slice(0,8));

  socket.on('create_room', ({ playerName }) => {
    const name = (playerName||'Held').trim().slice(0,20);
    const code = genCode();
    const room = new GameRoom(code, socket.id, name);
    room.onBroadcast(r => {
      broadcast(r);
      saveSnapshot();
      if (r.gameState?.winner) io.to(r.code).emit('game_finished', { winnerId: r.gameState.winner });
    });
    rooms.set(code, room);
    socketToRoom.set(socket.id, code);
    socketToName.set(socket.id, name);
    socket.join(code);
    socket.emit('room_created', { code, lobbyState: room.getLobbyState() });
    console.log(`🏠 Raum ${code} erstellt von ${name}`);
  });

  socket.on('join_room', ({ roomCode, playerName }) => {
    const code = roomCode?.toUpperCase().trim();
    const name = (playerName||'Held').trim().slice(0,20);
    const room = rooms.get(code);
    if (!room) { socket.emit('error', { message:`Raum ${code} nicht gefunden!` }); return; }

    // Reconnect-Versuch: gleicher Name bereits im Raum?
    if (tryReconnect(socket, code, name)) {
      socket.emit('room_joined', { code, lobbyState: room.getLobbyState(), reconnected: true });
      if (room.gameState) {
        socket.emit('game_started');
        broadcast(room);
      }
      lobbyBroadcast(room);
      return;
    }

    const r = room.addPlayer(socket.id, name);
    if (!r.success) { socket.emit('error', { message: r.error }); return; }
    socketToRoom.set(socket.id, code);
    socketToName.set(socket.id, name);
    socket.join(code);
    socket.emit('room_joined', { code, lobbyState: room.getLobbyState() });
    lobbyBroadcast(room);
  });

  socket.on('rejoin_room', ({ roomCode, playerName }) => {
    const code = roomCode?.toUpperCase().trim();
    const name = (playerName||'').trim();
    if (!code || !name) { socket.emit('rejoin_failed'); return; }
    const room = rooms.get(code);
    if (!room) { socket.emit('rejoin_failed', { message: 'Raum nicht mehr vorhanden' }); return; }
    if (tryReconnect(socket, code, name)) {
      socket.emit('room_joined', { code, lobbyState: room.getLobbyState(), reconnected: true });
      if (room.gameState) {
        socket.emit('game_started');
        const gs = room.getGameStateFor(room.lobbyPlayers.find(p=>p.name===name&&!p.isNPC)?.id);
        if (gs) socket.emit('game_update', gs);
      }
      lobbyBroadcast(room);
    } else {
      socket.emit('rejoin_failed', { message: 'Spieler nicht gefunden' });
    }
  });

  socket.on('add_npcs', ({ count }) => {
    const room = rooms.get(socketToRoom.get(socket.id));
    if (!room) return;
    if (!room.lobbyPlayers.find(p=>p.id===socket.id)?.isHost) { socket.emit('error',{message:'Nur Host!'}); return; }
    room.addNPCs(count||3);
    lobbyBroadcast(room);
  });

  socket.on('start_game', () => {
    const room = rooms.get(socketToRoom.get(socket.id));
    if (!room) return;
    const r = room.startGame(socket.id);
    if (!r.success) { socket.emit('error', { message: r.error }); return; }
    io.to(room.code).emit('game_started');
    broadcast(room);
    saveSnapshot();
  });

  // ── NEUSTART (nur Host, Sicherheitsabfrage auf Client) ──────────
  socket.on('restart_game', ({ confirmed }) => {
    const room = rooms.get(socketToRoom.get(socket.id));
    if (!room) return;
    const player = room.lobbyPlayers.find(p=>p.id===socket.id);
    if (!player?.isHost) { socket.emit('error', { message:'Nur der Host kann neu starten!' }); return; }
    if (!confirmed) { socket.emit('restart_confirm'); return; }

    // Spiel zurücksetzen, Spieler behalten
    room.gameState = null;
    room._stopNPC?.();
    room.npcControllers = {};
    io.to(room.code).emit('game_restarted');
    lobbyBroadcast(room);
    console.log(`🔄 Spiel ${room.code} neu gestartet`);
  });

  socket.on('game_action', action => {
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (!room?.gameState) { socket.emit('action_error', { message:'Kein Spiel!' }); return; }

    // SocketId → PlayerId Mapping (nach Reconnect könnte sich socketId geändert haben)
    const name = socketToName.get(socket.id);
    const player = name ? room.lobbyPlayers.find(p=>p.name===name&&!p.isNPC) : null;
    const effectiveId = player?.id || socket.id;

    const r = room.handleAction(effectiveId, action);
    if (!r.success) { socket.emit('action_error', { message: r.error||'Ungültig' }); return; }
    broadcast(room);
    if (room.gameState?.winner) io.to(room.code).emit('game_finished', { winnerId: room.gameState.winner });
  });

  socket.on('disconnect', () => {
    const code = socketToRoom.get(socket.id);
    const name = socketToName.get(socket.id);
    socketToRoom.delete(socket.id);
    socketToName.delete(socket.id);

    if (code) {
      const room = rooms.get(code);
      if (room) {
        // NICHT sofort entfernen — Reconnect-Fenster 5 Minuten
        const humanCount = room.lobbyPlayers.filter(p=>!p.isNPC).length;
        if (humanCount <= 1) {
          // Letzter Spieler — Raum nach 5 Min löschen falls keine Reconnect
          room._disconnectTimer = setTimeout(() => {
            rooms.delete(code);
            console.log(`🗑️ Raum ${code} nach Disconnect gelöscht`);
          }, 5 * 60 * 1000);
        } else {
          // Mehrere Spieler — Spieler "offline" markieren, nicht entfernen
          const p = room.lobbyPlayers.find(lp => lp.id === socket.id);
          if (p) p.offline = true;
          lobbyBroadcast(room);
        }
        console.log(`📵 ${name||'?'} aus ${code} getrennt (Reconnect-Fenster offen)`);
      }
    }
    console.log('❌ Disconnect:', socket.id.slice(0,8));
  });

  // Keep-Alive vom Client
  socket.on('keep_alive', () => {
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (room) {
      room.lastActivity = Date.now();
      if (room._disconnectTimer) {
        clearTimeout(room._disconnectTimer);
        room._disconnectTimer = null;
      }
    }
  });

  socket.on('ping_server', () => socket.emit('pong_server'));
});

// ── CLEANUP (inaktive Räume) ───────────────────────────────────────
setInterval(() => {
  for (const [code, room] of rooms.entries()) {
    if (room.isExpired()) { rooms.delete(code); console.log(`⏰ ${code} expired`); }
  }
}, 15 * 60 * 1000);

// ── START ──────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n🎲 Munchkin Quest läuft auf :${PORT}`);
});
