// ════════════════════════════════════════════════════════
// server.js — Munchkin Quest Server (vollständig)
// ════════════════════════════════════════════════════════
const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');
const { GameRoom } = require('./src/game/GameRoom');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin:'*', methods:['GET','POST'] },
  pingTimeout: 30000, pingInterval: 10000
});
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const rooms = new Map();
const playerRoomMap = new Map();

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do { code = Array.from({length:6}, () => chars[Math.floor(Math.random()*chars.length)]).join(''); }
  while (rooms.has(code));
  return code;
}

function broadcast(room) {
  room.lobbyPlayers.forEach(lp => {
    if (lp.isNPC) return;
    const sock = io.sockets.sockets.get(lp.id);
    if (sock) sock.emit('game_update', room.getGameStateFor(lp.id));
  });
}

function lobbyBroadcast(room) {
  io.to(room.code).emit('lobby_update', room.getLobbyState());
}

io.on('connection', socket => {
  console.log('✅ Verbunden:', socket.id);

  socket.on('create_room', ({ playerName }) => {
    const name = (playerName||'Held').trim().slice(0,20);
    const code = genCode();
    const room = new GameRoom(code, socket.id, name);
    room.onBroadcast(r => {
      broadcast(r);
      if (r.gameState?.winner) io.to(r.code).emit('game_finished', { winnerId: r.gameState.winner });
    });
    rooms.set(code, room);
    playerRoomMap.set(socket.id, code);
    socket.join(code);
    socket.emit('room_created', { code, lobbyState: room.getLobbyState() });
    console.log(`🏠 Raum ${code} von ${name}`);
  });

  socket.on('join_room', ({ roomCode, playerName }) => {
    const code = roomCode?.toUpperCase().trim();
    const name = (playerName||'Held').trim().slice(0,20);
    const room = rooms.get(code);
    if (!room) { socket.emit('error', { message:`Raum ${code} nicht gefunden!` }); return; }
    const r = room.addPlayer(socket.id, name);
    if (!r.success) { socket.emit('error', { message: r.error }); return; }
    playerRoomMap.set(socket.id, code);
    socket.join(code);
    socket.emit('room_joined', { code, lobbyState: room.getLobbyState() });
    lobbyBroadcast(room);
    console.log(`👋 ${name} → Raum ${code}`);
  });

  socket.on('add_npcs', ({ count }) => {
    const room = rooms.get(playerRoomMap.get(socket.id));
    if (!room) return;
    const host = room.lobbyPlayers.find(p=>p.id===socket.id);
    if (!host?.isHost) { socket.emit('error', { message:'Nur Host!' }); return; }
    room.addNPCs(count||3);
    lobbyBroadcast(room);
  });

  socket.on('start_game', () => {
    const room = rooms.get(playerRoomMap.get(socket.id));
    if (!room) return;
    const r = room.startGame(socket.id);
    if (!r.success) { socket.emit('error', { message: r.error }); return; }
    console.log(`🎮 Spiel in Raum ${room.code} gestartet`);
    io.to(room.code).emit('game_started');
    broadcast(room);
  });

  socket.on('game_action', action => {
    const room = rooms.get(playerRoomMap.get(socket.id));
    if (!room?.gameState) { socket.emit('action_error', { message:'Kein Spiel!' }); return; }
    const r = room.handleAction(socket.id, action);
    if (!r.success) { socket.emit('action_error', { message: r.error||'Ungültige Aktion' }); return; }
    broadcast(room);
    if (room.gameState?.winner) {
      io.to(room.code).emit('game_finished', { winnerId: room.gameState.winner });
    }
  });

  socket.on('disconnect', () => {
    const code = playerRoomMap.get(socket.id);
    if (code) {
      const room = rooms.get(code);
      if (room) {
        room.removePlayer(socket.id);
        if (room.lobbyPlayers.filter(p=>!p.isNPC).length === 0) {
          rooms.delete(code); console.log(`🗑️ Raum ${code} gelöscht`);
        } else {
          lobbyBroadcast(room);
          if (room.gameState) broadcast(room);
        }
      }
      playerRoomMap.delete(socket.id);
    }
    console.log('❌ Getrennt:', socket.id);
  });

  socket.on('ping', () => socket.emit('pong'));
});

setInterval(() => {
  for (const [code, room] of rooms.entries()) {
    if (room.isExpired()) { rooms.delete(code); console.log(`⏰ Raum ${code} abgelaufen`); }
  }
}, 10*60*1000);

server.listen(PORT, () => {
  console.log(`\n🎲 Munchkin Quest v3 läuft!`);
  console.log(`   → http://localhost:${PORT}`);
  console.log(`   → 1:1 Regelwerk-Implementierung\n`);
});
