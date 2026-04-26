// ════════════════════════════════════════════════════════════════
// Munchkin Quest v3 — Vollständiger Client
// Würfelanimation · Phasenübergänge · Kampf-UI · Canvas-Renderer
// ════════════════════════════════════════════════════════════════
'use strict';

// ── GLOBAL STATE ─────────────────────────────────────────────────
const STATE = {
  socket: null, myId: null, roomCode: null, game: null,
  selectedCard: null, phase: '', dpr: window.devicePixelRatio || 1,
  camera: { x: 0, y: 0, scale: 1 }, drag: { active: false, sx: 0, sy: 0 },
  prevPhase: '', prevLevel: 1,
};
const TILE_PX = 90; // px pro Tile auf 1.0 zoom

// ── SETUP ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupSocket();
  setupHomeUI();
  setupLogUI();
  setupCanvas();
  window.addEventListener('resize', resizeCanvas);
});

// ── SOCKET ────────────────────────────────────────────────────────
function setupSocket() {
  STATE.socket = io({ transports: ['websocket', 'polling'] });
  const s = STATE.socket;

  s.on('connect', () => { STATE.myId = s.id; });

  s.on('room_created', ({ code, lobbyState }) => {
    STATE.roomCode = code;
    showScreen('lobby');
    document.getElementById('lbl-code').textContent = code;
    updateLobby(lobbyState);
    const devBox = document.getElementById('dev-box');
    if (devBox) devBox.classList.remove('hidden');
    const btnStart = document.getElementById('btn-start');
    if (btnStart) btnStart.classList.remove('hidden');
  });

  s.on('room_joined', ({ code, lobbyState }) => {
    STATE.roomCode = code;
    showScreen('lobby');
    document.getElementById('lbl-code').textContent = code;
    updateLobby(lobbyState);
  });

  s.on('lobby_update', lobbyState => updateLobby(lobbyState));

  s.on('game_started', () => { showScreen('game'); resizeCanvas(); });

  s.on('game_update', gameState => {
    const prev = STATE.game;
    STATE.game = gameState;
    STATE.phase = gameState.phase;
    handleAnimations(prev, gameState);
    renderGame(gameState);
  });

  s.on('game_finished', ({ winnerId }) => {
    const winner = STATE.game?.players.find(p => p.id === winnerId);
    document.getElementById('winner-name').textContent =
      (winner?.name || 'Jemand') + ' gewinnt! 🏆';
    setTimeout(() => showScreen('winner'), 800);
  });

  s.on('action_error', ({ message }) => toast(message, 'error'));
  s.on('error', ({ message }) => {
    toast(message, 'error');
    showError(message);
  });
}

function send(action) { STATE.socket?.emit('game_action', action); }

// ── HOME UI ───────────────────────────────────────────────────────
function setupHomeUI() {
  document.getElementById('btn-create').onclick = () => {
    const name = document.getElementById('inp-name').value.trim();
    if (!name) { showError('Bitte Heldennamen eingeben!'); return; }
    STATE.socket.emit('create_room', { playerName: name });
  };
  document.getElementById('btn-join').onclick = () => {
    const name = document.getElementById('inp-name').value.trim();
    const code = document.getElementById('inp-code').value.trim().toUpperCase();
    if (!name) { showError('Bitte Heldennamen eingeben!'); return; }
    if (!code || code.length !== 6) { showError('6-stelligen Code eingeben!'); return; }
    STATE.socket.emit('join_room', { roomCode: code, playerName: name });
  };
  document.getElementById('btn-add-npcs')?.addEventListener('click', () => {
    STATE.socket.emit('add_npcs', { count: 3 });
  });
  document.getElementById('btn-start')?.addEventListener('click', () => {
    STATE.socket.emit('start_game');
  });
  document.getElementById('btn-copy-link')?.addEventListener('click', () => {
    const code = document.getElementById('lbl-code').textContent;
    navigator.clipboard?.writeText(`${location.origin}?join=${code}`)
      .then(() => toast('Link kopiert!', 'success'))
      .catch(() => toast(code, 'info'));
  });
  document.getElementById('btn-new-game')?.addEventListener('click', () => {
    showScreen('home');
  });
  // Auto-join über URL
  const urlCode = new URLSearchParams(location.search).get('join');
  if (urlCode) document.getElementById('inp-code').value = urlCode.toUpperCase();
}

// ── SCREEN ────────────────────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + name)?.classList.add('active');
}
function showError(msg) {
  const el = document.getElementById('home-error') || document.getElementById('lobby-error');
  if (el) { el.textContent = msg; el.classList.remove('hidden'); setTimeout(() => el.classList.add('hidden'), 3000); }
}

// ── LOBBY ─────────────────────────────────────────────────────────
function updateLobby(state) {
  const list = document.getElementById('lobby-players');
  const COLORS = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c'];
  if (!list) return;
  list.innerHTML = state.players.map((p, i) => `
    <div class="lobby-player">
      <div class="lobby-avatar" style="background:${COLORS[i]};color:#fff">${p.name.charAt(0).toUpperCase()}</div>
      <div style="flex:1">
        <div style="font-weight:700;font-size:14px">${p.name}</div>
        <div style="font-size:11px;color:var(--muted)">${p.isNPC ? '🤖 KI-Spieler' : '👤 Menschlich'}</div>
      </div>
      ${p.isHost ? '<span class="badge badge-host">HOST</span>' : ''}
      ${p.isNPC  ? '<span class="badge badge-npc">NPC</span>'  : ''}
    </div>`).join('');
  const status = document.getElementById('lobby-status');
  if (status) status.textContent = `${state.players.length} Spieler bereit`;
  const btnStart = document.getElementById('btn-start');
  if (btnStart) {
    const isHost = state.players.find(p => p.id === STATE.myId)?.isHost;
    btnStart.classList.toggle('hidden', !isHost || state.players.length < 2);
  }
}

// ── LOG ───────────────────────────────────────────────────────────
function setupLogUI() {
  document.getElementById('log-toggle-btn')?.addEventListener('click', () => {
    document.getElementById('log-panel').classList.toggle('open');
  });
  document.getElementById('log-close-btn')?.addEventListener('click', () => {
    document.getElementById('log-panel').classList.remove('open');
  });
}
function updateLog(entries) {
  const latest = entries[entries.length - 1]?.msg || '—';
  const el = document.getElementById('log-latest');
  if (el) el.textContent = latest;
  const panel = document.getElementById('log-entries');
  if (panel) {
    panel.innerHTML = [...entries].reverse().map(e =>
      `<div class="log-entry">${formatLogMsg(e.msg)}</div>`).join('');
  }
}
function formatLogMsg(msg) {
  return msg.replace(/⬆️|✅|💰|⚔️|💀|🏃|📜|🎲|⬇️|💔|👹|🏆/g, m => `<b>${m}</b>`);
}

// ── TOAST ─────────────────────────────────────────────────────────
let _toastTimer;
function toast(msg, type = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  clearTimeout(_toastTimer);
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  _toastTimer = setTimeout(() => el.remove(), 2800);
}

// ══════════════════════════════════════════════════════════════════
// CANVAS RENDERER
// ══════════════════════════════════════════════════════════════════
let canvas, ctx;
function setupCanvas() {
  canvas = document.getElementById('dungeon-canvas');
  if (!canvas) return;
  ctx = canvas.getContext('2d');
  resizeCanvas();
  canvas.addEventListener('click', onCanvasClick);
  canvas.addEventListener('touchstart', onTouchStart, { passive: true });
  canvas.addEventListener('touchmove', onTouchMove, { passive: true });
  canvas.addEventListener('touchend', onTouchEnd, { passive: true });
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup', onMouseUp);
}
function resizeCanvas() {
  if (!canvas) return;
  const wrap = document.getElementById('board-wrap');
  if (!wrap) return;
  const r = wrap.getBoundingClientRect();
  STATE.dpr = window.devicePixelRatio || 1;
  canvas.width  = r.width  * STATE.dpr;
  canvas.height = r.height * STATE.dpr;
  canvas.style.width  = r.width  + 'px';
  canvas.style.height = r.height + 'px';
  ctx.scale(STATE.dpr, STATE.dpr);
  if (STATE.game) renderGame(STATE.game);
}

function screenToTile(sx, sy) {
  const wrap = document.getElementById('board-wrap');
  const r = wrap.getBoundingClientRect();
  const cx = r.width / 2 + STATE.camera.x;
  const cy = r.height / 2 + STATE.camera.y;
  const px = (sx - cx) / (TILE_PX * STATE.camera.scale);
  const py = (sy - cy) / (TILE_PX * STATE.camera.scale);
  return { x: Math.round(px), y: Math.round(py) };
}
function tileToScreen(tx, ty) {
  const wrap = document.getElementById('board-wrap');
  const r = wrap.getBoundingClientRect();
  const cx = r.width / 2 + STATE.camera.x;
  const cy = r.height / 2 + STATE.camera.y;
  const sc = TILE_PX * STATE.camera.scale;
  return { x: cx + tx * sc, y: cy + ty * sc };
}

// ── HAUPT-RENDER ──────────────────────────────────────────────────
function renderGame(g) {
  if (!ctx || !canvas) return;
  const wrap = document.getElementById('board-wrap');
  const W = wrap.getBoundingClientRect().width;
  const H = wrap.getBoundingClientRect().height;
  ctx.clearRect(0, 0, W, H);

  // Dungeon-Hintergrund
  ctx.fillStyle = '#04040c';
  ctx.fillRect(0, 0, W, H);

  if (!g?.board?.tiles) return;

  const myPlayer = g.players.find(p => p.id === STATE.myId);
  const sc = TILE_PX * STATE.camera.scale;

  // Bestimme begehbare Tiles für Highlighting
  const reachable = getReachableTiles(g, myPlayer);

  // Tiles zeichnen
  Object.values(g.board.tiles).forEach(tile => {
    const s = tileToScreen(tile.x, tile.y);
    drawTile(tile, s.x, s.y, sc, reachable.has(`${tile.x},${tile.y}`));
  });

  // Verbindungslinien zwischen Tiles
  Object.values(g.board.tiles).forEach(tile => {
    const dirs = { N:{dx:0,dy:-1}, S:{dx:0,dy:1}, E:{dx:1,dy:0}, W:{dx:-1,dy:0} };
    (tile.exits || []).forEach(dir => {
      const nb = g.board.tiles[`${tile.x+dirs[dir].dx},${tile.y+dirs[dir].dy}`];
      if (nb) drawConnection(tile, nb, sc);
    });
  });

  // Spieler zeichnen
  g.players.forEach(p => drawPlayer(p, sc, p.id === STATE.myId));

  // HUD & UI updaten
  updateHUD(g);
  updatePlayersBar(g);
  updateActionPanel(g, myPlayer);
  updateHandCards(g.myHand || []);
  updateLog(g.log || []);
  if (g.log?.length) {
    const latest = g.log[g.log.length - 1]?.msg;
    if (latest) document.getElementById('log-latest').textContent = latest;
  }
  // Kampf-Modal
  updateCombatModal(g, myPlayer);
  // Gold anzeigen
  if (myPlayer) document.getElementById('my-gold').textContent = myPlayer.gold || 0;
}

// ── TILE ZEICHNEN ─────────────────────────────────────────────────
function drawTile(tile, cx, cy, sc, isReachable) {
  const half = sc * 0.48;
  const r = Math.max(4, sc * 0.12);
  ctx.save();

  // Schatten
  ctx.shadowColor = 'rgba(0,0,0,.7)';
  ctx.shadowBlur = sc * 0.12;

  // Hintergrund
  const bgColor = tile.color || '#10102a';
  if (isReachable) {
    ctx.shadowColor = 'rgba(46,204,113,.6)';
    ctx.shadowBlur = sc * 0.18;
    ctx.fillStyle = '#0e2820';
  } else {
    ctx.fillStyle = bgColor;
  }
  roundRect(ctx, cx - half, cy - half, sc * 0.96, sc * 0.96, r);
  ctx.fill();

  // Rand
  ctx.shadowBlur = 0;
  ctx.strokeStyle = isReachable ? 'rgba(46,204,113,.8)' : 'rgba(42,42,80,.9)';
  ctx.lineWidth = isReachable ? 2 : 1;
  roundRect(ctx, cx - half, cy - half, sc * 0.96, sc * 0.96, r);
  ctx.stroke();

  // Grüner Pulse-Rand für begehbar
  if (isReachable) {
    const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 300);
    ctx.strokeStyle = `rgba(46,204,113,${pulse})`;
    ctx.lineWidth = 2.5;
    roundRect(ctx, cx - half + 2, cy - half + 2, sc * 0.96 - 4, sc * 0.96 - 4, r);
    ctx.stroke();
    requestAnimationFrame(() => renderGame(STATE.game));
  }

  // Türen zeichnen (kleine Symbole an den Rändern)
  if (sc > 50) drawDoors(tile, cx, cy, sc);

  // Icon & Name
  const fontSize = Math.max(10, sc * 0.28);
  const nameFontSize = Math.max(8, sc * 0.1);
  ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 4;
  ctx.font = `${fontSize}px serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(tile.icon || '🗺️', cx, cy - nameFontSize * 0.8);

  ctx.font = `bold ${nameFontSize}px sans-serif`;
  ctx.fillStyle = tile.type === 'start' ? '#4aff9a' : (tile.special ? '#e8c86a' : 'rgba(180,180,220,.8)');
  ctx.fillText(tile.name || '', cx, cy + fontSize * 0.42);

  // Such-Status
  if (tile.searched || tile.looted) {
    ctx.font = `${Math.max(8, sc * 0.12)}px sans-serif`;
    ctx.fillStyle = tile.looted ? '#ff7070' : '#70a0ff';
    ctx.fillText(tile.looted ? '🔴' : '🔵', cx + half * 0.55, cy - half * 0.55);
  }

  // Monster-Badges
  if (tile.monsters?.length > 0) {
    ctx.shadowColor = 'rgba(233,69,96,.8)'; ctx.shadowBlur = 8;
    ctx.font = `${Math.max(12, sc * 0.3)}px serif`;
    tile.monsters.slice(0, 3).forEach((m, i) => {
      ctx.fillText(m.icon || '👹',
        cx + (i - 1) * sc * 0.28,
        cy + half * 0.5);
    });
    if (tile.monsters.length > 3) {
      ctx.font = `bold ${Math.max(8, sc * 0.12)}px sans-serif`;
      ctx.fillStyle = var_red;
      ctx.fillText(`+${tile.monsters.length - 3}`, cx + sc * 0.35, cy + half * 0.5);
    }
  }

  ctx.restore();
}
const var_red = '#e74c3c';

function drawDoors(tile, cx, cy, sc) {
  const half = sc * 0.48;
  const doorSize = Math.max(4, sc * 0.07);
  const dirs = { N:{x:0,y:-1}, S:{x:0,y:1}, E:{x:1,y:0}, W:{x:-1,y:0} };
  (tile.exits || []).forEach(dir => {
    const d = dirs[dir];
    ctx.fillStyle = 'rgba(120,120,200,.6)';
    ctx.fillRect(
      cx + d.x * half - doorSize / 2,
      cy + d.y * half - doorSize / 2,
      doorSize, doorSize);
  });
}

function drawConnection(from, to, sc) {
  const fs = tileToScreen(from.x, from.y);
  const ts = tileToScreen(to.x, to.y);
  ctx.save();
  ctx.strokeStyle = 'rgba(42,42,80,.5)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(fs.x, fs.y);
  ctx.lineTo(ts.x, ts.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

// ── SPIELER ZEICHNEN ──────────────────────────────────────────────
function drawPlayer(p, sc, isMe) {
  if (!p.alive) return;
  const s = tileToScreen(p.x, p.y);
  const allHere = STATE.game?.players.filter(pl => pl.x === p.x && pl.y === p.y && pl.alive) || [];
  const idx = allHere.findIndex(pl => pl.id === p.id);
  const total = allHere.length;
  const offsetX = total > 1 ? (idx - (total - 1) / 2) * sc * 0.26 : 0;
  const px = s.x + offsetX;
  const py = s.y - sc * 0.05;
  const r = Math.max(12, sc * 0.22);

  ctx.save();
  ctx.shadowColor = isMe ? p.color : 'rgba(0,0,0,.5)';
  ctx.shadowBlur = isMe ? sc * 0.2 : 4;

  // Kreis
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fillStyle = p.color;
  ctx.fill();
  if (isMe) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Initiale
  ctx.shadowBlur = 0;
  ctx.font = `bold ${Math.max(10, sc * 0.16)}px sans-serif`;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(p.name.charAt(0).toUpperCase(), px, py);

  // Level-Badge
  const lvlSize = Math.max(9, sc * 0.13);
  ctx.beginPath();
  ctx.arc(px + r * 0.7, py - r * 0.7, lvlSize, 0, Math.PI * 2);
  ctx.fillStyle = '#f5a623';
  ctx.fill();
  ctx.font = `bold ${Math.max(7, sc * 0.1)}px sans-serif`;
  ctx.fillStyle = '#000';
  ctx.fillText(p.level, px + r * 0.7, py - r * 0.7);

  ctx.restore();
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.arcTo(x + w, y, x + w, y + r, r);
  c.lineTo(x + w, y + h - r);
  c.arcTo(x + w, y + h, x + w - r, y + h, r);
  c.lineTo(x + r, y + h);
  c.arcTo(x, y + h, x, y + h - r, r);
  c.lineTo(x, y + r);
  c.arcTo(x, y, x + r, y, r);
  c.closePath();
}

// ── BEGEHBARE TILES ───────────────────────────────────────────────
function getReachableTiles(g, me) {
  const set = new Set();
  if (!me || g.phase !== 'movement' || me.movesLeft <= 0) return set;
  if (g.currentPlayerId !== me.id) return set;
  if (g.combat) return set;
  const DIRS = { N:{dx:0,dy:-1}, S:{dx:0,dy:1}, E:{dx:1,dy:0}, W:{dx:-1,dy:0} };
  const myTile = g.board.tiles[`${me.x},${me.y}`];
  if (!myTile?.exits) return set;
  myTile.exits.forEach(dir => {
    const d = DIRS[dir];
    const nx = me.x + d.dx, ny = me.y + d.dy;
    const target = g.board.tiles[`${nx},${ny}`];
    if (!target) {
      set.add(`${nx},${ny}_unexplored`);
      set.add(`${nx},${ny}`);
    } else {
      const opp = {N:'S',S:'N',E:'W',W:'E'}[dir];
      if (target.exits?.includes(opp)) set.add(`${nx},${ny}`);
    }
  });
  return set;
}

// ── CANVAS INPUT ──────────────────────────────────────────────────
let _touchStartTime = 0;
function onTouchStart(e) {
  _touchStartTime = Date.now();
  STATE.drag = { active: false, sx: e.touches[0].clientX, sy: e.touches[0].clientY };
}
function onTouchMove(e) {
  if (!STATE.drag.active && Math.abs(e.touches[0].clientX - STATE.drag.sx) < 5
      && Math.abs(e.touches[0].clientY - STATE.drag.sy) < 5) return;
  STATE.drag.active = true;
  STATE.camera.x += e.touches[0].clientX - STATE.drag.sx;
  STATE.camera.y += e.touches[0].clientY - STATE.drag.sy;
  STATE.drag.sx = e.touches[0].clientX;
  STATE.drag.sy = e.touches[0].clientY;
  if (STATE.game) renderGame(STATE.game);
}
function onTouchEnd(e) {
  if (!STATE.drag.active && Date.now() - _touchStartTime < 400) {
    const rect = canvas.getBoundingClientRect();
    const cx = e.changedTouches[0].clientX - rect.left;
    const cy = e.changedTouches[0].clientY - rect.top;
    handleTileClick(cx, cy);
  }
  STATE.drag.active = false;
}
function onCanvasClick(e) {
  if (STATE.drag.active) return;
  const rect = canvas.getBoundingClientRect();
  handleTileClick(e.clientX - rect.left, e.clientY - rect.top);
}
let _mouseDown = false;
function onMouseDown(e) { _mouseDown = true; STATE.drag = { active: false, sx: e.clientX, sy: e.clientY }; }
function onMouseMove(e) {
  if (!_mouseDown) return;
  const dx = e.clientX - STATE.drag.sx, dy = e.clientY - STATE.drag.sy;
  if (!STATE.drag.active && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
  STATE.drag.active = true;
  STATE.camera.x += dx; STATE.camera.y += dy;
  STATE.drag.sx = e.clientX; STATE.drag.sy = e.clientY;
  if (STATE.game) renderGame(STATE.game);
}
function onMouseUp(e) { _mouseDown = false; STATE.drag.active = false; }

function handleTileClick(sx, sy) {
  const g = STATE.game;
  if (!g) return;
  const me = g.players.find(p => p.id === STATE.myId);
  if (!me || g.currentPlayerId !== STATE.myId) return;
  if (g.phase !== 'movement') return;
  if (g.combat) return;
  const { x, y } = screenToTile(sx, sy);
  send({ type: 'move', x, y });
}

// ══════════════════════════════════════════════════════════════════
// HUD & ACTION PANEL
// ══════════════════════════════════════════════════════════════════
const PHASE_INFO = {
  draw_dxm:    { icon:'📜', label:'DxM Karte', color:'--col-draw'   },
  movement:    { icon:'🏃', label:'Bewegen',   color:'--col-move'   },
  combat:      { icon:'⚔️',  label:'Kampf!',   color:'--col-combat' },
  combat_roll: { icon:'🎲', label:'Würfeln',   color:'--col-roll'   },
  flee:        { icon:'💨', label:'Fliehen!',  color:'--col-flee'   },
  charity:     { icon:'🃏', label:'Milde Gabe',color:'--col-charity'},
};

function updateHUD(g) {
  const hud = document.getElementById('hud');
  const phaseEl = document.getElementById('hud-phase');
  const curEl = document.getElementById('hud-current');
  const roundEl = document.getElementById('hud-round');
  if (!hud) return;
  const pi = PHASE_INFO[g.phase] || { icon:'🎲', label: g.phase };
  hud.dataset.phase = g.phase;
  const curPlayer = g.players.find(p => p.id === g.currentPlayerId);
  const isMe = g.currentPlayerId === STATE.myId;
  phaseEl.textContent = `${pi.icon} ${pi.label}`;
  curEl.textContent = isMe ? '🎮 Du bist dran!' : `🎯 ${curPlayer?.name || '—'} ist dran`;
  roundEl.textContent = `R${g.round}`;
}

function updatePlayersBar(g) {
  const bar = document.getElementById('players-bar');
  if (!bar) return;
  bar.innerHTML = g.players.map(p => {
    const isActive = p.id === g.currentPlayerId;
    const isMe = p.id === STATE.myId;
    const hpDots = Array.from({length: p.maxLife}, (_, i) =>
      `<span class="chip-hp-dot ${i < p.lifePoints ? 'alive' : 'dead'}">❤</span>`).join('');
    const equip = [];
    if (p.equipment?.weapon)  equip.push(p.equipment.weapon.icon  || '⚔️');
    if (p.equipment?.armor)   equip.push(p.equipment.armor.icon   || '🛡️');
    if (p.equipment?.headgear)equip.push(p.equipment.headgear.icon|| '🪖');
    if (p.equipment?.boots)   equip.push(p.equipment.boots.icon   || '👢');
    return `<div class="player-chip${isActive?' active-turn':''}${!p.alive?' is-dead':''}${isMe?'':' is-npc'}">
      <div class="chip-dot" style="background:${p.color}"></div>
      <div class="chip-name">${isMe ? '👤 Du' : p.name}</div>
      <div class="chip-level">Lvl ${p.level}</div>
      <div style="font-size:9px">${hpDots}</div>
      <div class="chip-equip">${equip.slice(0,3).join(' ')}</div>
    </div>`;
  }).join('');
}

function updateActionPanel(g, me) {
  const btns = document.getElementById('action-buttons');
  if (!btns) return;
  btns.innerHTML = '';
  if (!me) return;
  const isMyTurn = g.currentPlayerId === STATE.myId;
  const inCombat = !!g.combat;

  // Bewegungsmarker anzeigen
  let movesBar = document.querySelector('.moves-bar');
  if (!movesBar) {
    movesBar = document.createElement('div');
    movesBar.className = 'moves-bar';
    btns.parentElement.insertBefore(movesBar, btns);
  }
  if (g.phase === 'movement' && isMyTurn && me) {
    movesBar.style.display = 'flex';
    movesBar.innerHTML = `<span class="moves-label">🦶</span>` +
      Array.from({length: 3}, (_, i) =>
        `<span class="move-marker ${i < me.movesLeft ? 'active' : 'used'}">🦶</span>`
      ).join('');
  } else {
    movesBar.style.display = 'none';
  }

  if (!isMyTurn) {
    const cur = g.players.find(p => p.id === g.currentPlayerId);
    btns.innerHTML = `<div style="padding:8px;color:var(--muted);font-size:12px;text-align:center;width:100%">⏳ Warten auf ${cur?.name || '—'}...</div>`;
    // Auch in nicht-eigenem Zug: Helfen/Behindern im Kampf möglich
    if (inCombat && !g.combat.resolved && g.combat.fighterId !== STATE.myId) {
      addBtn(btns, '🤝 Helfen', 'green',  () => send({ type:'help_fight' }), g.combat.helpers?.length > 0);
      addBtn(btns, '😈 Behindern','primary',() => send({ type:'hinder', bonus:2 }));
      // Karte spielen (Fluch/Verstärker)
      if (me.handCount > 0) {
        addBtn(btns, '🃏 Karte spielen','blue', () => openHandForPlay(g));
      }
    }
    return;
  }

  // Meine Aktionen je nach Phase
  switch(g.phase) {
    case 'draw_dxm':
      addBtn(btns, '📜 DxM Karte ziehen', 'blue', () => send({ type:'draw_dxm' }));
      break;
    case 'movement':
      if (!inCombat) {
        if (me.movesLeft > 0) {
          addBtn(btns, `🏃 Tippe Feld zum Bewegen`, 'green', null, true);
          const tile = g.board?.tiles[`${me.x},${me.y}`];
          if (tile?.special === 'heal' && !inCombat) {
            addBtn(btns, '⛪ Heilen (500G)', 'gold', () => send({ type:'make_deal', dealType:'heal' }));
          }
          if ((tile?.type === 'tavern' || tile?.special === 'draw_dxm') && !inCombat) {
            addBtn(btns, '🍺 DxM Deal', 'purple', () => send({ type:'make_deal', dealType:'draw_dxm' }));
          }
          if (tile?.search !== null && !inCombat && !tile?.looted) {
            addBtn(btns, '🔍 Durchsuchen', 'blue', () => send({ type:'search_room' }));
          }
        }
        addBtn(btns, '✅ Zug beenden', 'gold', () => send({ type:'skip_to_search' }));
        // Items verkaufen
        const sellableItems = (me.handCount > 0) ? true : false;
        if (!inCombat) {
          addBtn(btns, '💰 Verkaufen (1000G=Stufe)', 'gray', () => openSellPanel(g), me.level >= 9);
        }
      }
      // Boss-Kampf?
      if (g.bossActive && me.x === 0 && me.y === 0 && me.level >= 10) {
        addBtn(btns, '⚡ BOSS BEKÄMPFEN!', 'primary', () => send({ type:'fight_boss' }));
      }
      break;
    case 'combat':
      if (g.combat?.fighterId === STATE.myId) {
        if (!g.combat.announced) {
          addBtn(btns, '⚔️ "Ich würfle jetzt!"', 'primary', () => send({ type:'announce_roll' }));
          addBtn(btns, '💨 Fliehen', 'gray', () => openFleePanel(g));
        } else {
          addBtn(btns, '🎲 WÜRFELN!', 'primary', () => send({ type:'roll_combat' }));
        }
        // Tränke zeigen
        const potions = (g.myHand || []).filter(c => c.type === 'potion' && c.bonus > 0);
        potions.forEach(p => {
          addBtn(btns, `${p.icon} ${p.name} (+${p.bonus})`, 'green',
            () => send({ type:'play_card', cardId: p.uid || p.id }));
        });
        // Zauberer: Karte abwerfen
        if (me.class?.ability === 'wizard') {
          addBtn(btns, '🧙 Karte für +3', 'purple', () => openWizardDiscard(g));
        }
      } else {
        // Nicht-Kämpfer im Kampf
        addBtn(btns, '🤝 Helfen', 'green', () => send({ type:'help_fight' }), g.combat?.helpers?.length > 0);
        addBtn(btns, '😈 Behindern', 'primary', () => send({ type:'hinder', bonus:2 }));
      }
      break;
    case 'combat_roll':
      if (g.combat?.fighterId === STATE.myId) {
        addBtn(btns, '🎲 WÜRFELN!', 'primary', () => send({ type:'roll_combat' }));
      }
      break;
    case 'flee':
      if (g.combat?.fighterId === STATE.myId || true) {
        addBtn(btns, '💨 Zum Eingang fliehen', 'primary', () => send({ type:'flee', targetTile:{x:0,y:0} }));
        // Andere Räume aus Exits
        const curTile = g.board?.tiles[`${me.x},${me.y}`];
        (curTile?.exits || []).forEach(dir => {
          const DIRS = {N:{dx:0,dy:-1},S:{dx:0,dy:1},E:{dx:1,dy:0},W:{dx:-1,dy:0}};
          const d = DIRS[dir];
          const nx = me.x+d.dx, ny = me.y+d.dy;
          const nt = g.board?.tiles[`${nx},${ny}`];
          if (nt && !(nx===0&&ny===0)) {
            addBtn(btns, `💨 → ${nt.name}`, 'gray',
              () => send({ type:'flee', targetTile:{x:nx,y:ny} }));
          }
        });
      }
      break;
    case 'charity':
      const excess = (g.myHand || []).slice(5);
      if (excess.length > 0) {
        const lowestPlayer = g.players.reduce((a, b) => a.level <= b.level ? a : b);
        excess.slice(0, 1).forEach(c => {
          addBtn(btns, `🎁 Gib ${c.name} → ${lowestPlayer.name}`, 'gold',
            () => send({ type:'charity_give', cardId: c.uid||c.id, targetId: lowestPlayer.id }));
        });
      } else {
        addBtn(btns, '✅ Milde Gabe fertig', 'gold', () => send({ type:'charity_done' }));
      }
      break;
  }
}

function addBtn(container, label, style, onClick, disabled = false) {
  const b = document.createElement('button');
  b.className = `act-btn ${style}`;
  b.textContent = label;
  b.disabled = !!disabled || !onClick;
  if (onClick) b.onclick = onClick;
  container.appendChild(b);
}

function openFleePanel(g) {
  const me = g.players.find(p => p.id === STATE.myId);
  if (!me) return;
  send({ type: 'flee', targetTile: { x: 0, y: 0 } }); // Zum Eingang
}

function openWizardDiscard(g) {
  const cards = g.myHand || [];
  if (cards.length === 0) { toast('Keine Karten zum Abwerfen!', 'error'); return; }
  toast('Tippe eine Handkarte zum Abwerfen für +3!', 'info');
  // Karten hervorheben
  document.querySelectorAll('.hand-card').forEach(el => {
    el.classList.add('glowing');
    const oldClick = el.onclick;
    el.onclick = () => {
      const cardId = el.dataset.cardId;
      if (cardId) {
        send({ type: 'discard_for_wizard', cardId });
        document.querySelectorAll('.hand-card').forEach(c => {
          c.classList.remove('glowing');
          c.onclick = null;
        });
        setupHandCardClicks(g.myHand || []);
      }
    };
  });
}

function openSellPanel(g) {
  const items = (g.myHand || []).filter(c => c.type === 'equipment' && c.value > 0);
  if (items.length === 0) { toast('Keine verkaufbaren Items auf der Hand!', 'error'); return; }
  const ids = items.map(c => c.uid || c.id);
  const totalVal = items.reduce((a, c) => a + (c.value || 0), 0);
  send({ type: 'sell_items', cardIds: ids });
}

function openHandForPlay(g) {
  toast('Tippe eine Karte zum Spielen!', 'info');
  document.querySelectorAll('.hand-card').forEach(el => {
    el.classList.add('glowing');
  });
}

// ── HANDKARTEN ────────────────────────────────────────────────────
function updateHandCards(hand) {
  const container = document.getElementById('hand-cards');
  const countEl = document.getElementById('hand-count');
  if (!container) return;
  if (countEl) countEl.textContent = hand.length;
  container.innerHTML = hand.map(c => {
    const bonus = c.bonus ? `<div class="card-bonus">+${c.bonus}</div>` : '';
    const lvl = c.level ? `<div class="card-lvl">Stufe ${c.level}</div>` : '';
    const label = c.desc ? `<div class="card-label">${c.desc.slice(0,28)}</div>` : '';
    return `<div class="hand-card type-${c.type}" data-card-id="${c.uid||c.id}">
      <span class="card-icon">${c.icon || '🃏'}</span>
      <span class="card-name">${c.name}</span>
      ${bonus}${lvl}${label}
    </div>`;
  }).join('');
  setupHandCardClicks(hand);

  const toggleBtn = document.getElementById('hand-toggle-btn');
  if (toggleBtn) {
    toggleBtn.onclick = () => {
      container.style.display = container.style.display === 'none' ? 'flex' : 'none';
      toggleBtn.textContent = container.style.display === 'none' ? '▲' : '▼';
    };
  }
}

function setupHandCardClicks(hand) {
  document.querySelectorAll('.hand-card').forEach(el => {
    const cardId = el.dataset.cardId;
    const card = hand.find(c => (c.uid || c.id) === cardId);
    if (!card) return;
    el.onclick = () => {
      const g = STATE.game;
      if (!g) return;
      // Direkt spielen je nach Typ
      send({ type: 'play_card', cardId });
    };
  });
}

// ══════════════════════════════════════════════════════════════════
// KAMPF-MODAL
// ══════════════════════════════════════════════════════════════════
function updateCombatModal(g, me) {
  const modal = document.getElementById('combat-modal');
  if (!modal) return;
  if (!g.combat) { modal.classList.add('hidden'); return; }
  modal.classList.remove('hidden');

  const c = g.combat;
  const isMyFight = c.fighterId === STATE.myId;
  const fighter = g.players.find(p => p.id === c.fighterId);

  // Header
  document.getElementById('cbt-title').textContent =
    isMyFight ? '⚔️ Du kämpfst!' : `⚔️ ${fighter?.name || '?'} kämpft!`;

  const announceBadge = document.getElementById('cbt-announce-badge');
  if (c.announced && !c.resolved) {
    announceBadge.classList.remove('hidden');
  } else {
    announceBadge.classList.add('hidden');
  }

  // Monster
  const monstersEl = document.getElementById('cbt-monsters');
  if (monstersEl) {
    monstersEl.innerHTML = c.monsters.map(m => {
      const enhancers = (m.enhancers || []).map(e =>
        `<span class="cbt-enhancer-tag">${e.icon||''} ${e.name}</span>`).join('');
      const eLvl = (m.enhancers || []).reduce((a, e) => a + (e.level_bonus||0), 0);
      const totalLvl = m.level + eLvl;
      return `<div class="cbt-monster-card">
        <div class="cbt-monster-head">
          <span class="cbt-monster-emoji">${m.icon||'👹'}</span>
          <div class="cbt-monster-info">
            <div class="cbt-monster-name">${m.isBoss ? '⚡ BOSS: ':''}<b>${m.name}</b></div>
            <div class="cbt-monster-level">Stufe ${totalLvl}${eLvl !== 0 ? ` (${m.level}${eLvl>0?'+'+eLvl:eLvl})` : ''} · ${m.dice||1}W6 · ${m.treasures||1} Schatz${(m.treasures||1)>1?'e':''}</div>
            <div class="cbt-monster-bad">☠️ ${m.bad_stuff || '?'}</div>
          </div>
        </div>
        ${enhancers ? `<div class="cbt-enhancers">${enhancers}</div>` : ''}
      </div>`;
    }).join('');
  }

  // Stärkenvergleich
  const playerStr = calcPlayerStrDisplay(g, me, c);
  const monsterStr = c.monsters.reduce((a, m) => {
    const eLvl = (m.enhancers||[]).reduce((s,e) => s+(e.level_bonus||0), 0);
    return a + m.level + eLvl;
  }, 0) + c.hinderers * 2;

  document.getElementById('cbt-player-str').textContent = playerStr;
  document.getElementById('cbt-monster-str').textContent = monsterStr;
  document.getElementById('cbt-player-emoji').textContent = me?.class?.icon || me?.race?.icon || '👤';
  document.getElementById('cbt-monster-emoji').textContent = c.monsters[0]?.icon || '👹';

  // Details
  const detailsEl = document.getElementById('cbt-details');
  if (detailsEl && me) {
    const equipBonus = calcEquipBonus(me);
    const rows = [
      ['Meine Stufe', me.level],
      ['Ausrüstung', equipBonus > 0 ? `+${equipBonus}` : 0],
    ];
    if (me.class) rows.push([`${me.class.icon} ${me.class.name}`, me.class.bonus_combat > 0 ? `+${me.class.bonus_combat}` : '—']);
    if (c.helpers?.length > 0) {
      c.helpers.forEach(h => rows.push([`🤝 ${h.name}`, `+${h.level}`]));
    }
    if (c.potionBonus > 0) rows.push(['🧪 Tränke', `+${c.potionBonus}`]);
    rows.push(['+ 1 × W6', '?']);
    rows.push(['Monster gesamt', `${monsterStr} + W6`]);
    detailsEl.innerHTML = rows.map(([k,v]) =>
      `<div class="cbt-row"><span>${k}</span><span>${v}</span></div>`).join('');
  }

  // Helfer anzeigen
  const helpersEl = document.getElementById('cbt-helpers');
  if (helpersEl) {
    helpersEl.innerHTML = (c.helpers || []).map(h =>
      `<span class="cbt-helper-chip">🤝 ${h.name} +${h.level}</span>`).join('');
  }

  // Buttons
  const cbtBtns = document.getElementById('cbt-buttons');
  if (cbtBtns) {
    cbtBtns.innerHTML = '';
    if (isMyFight && !c.resolved) {
      if (!c.announced) {
        addCbtBtn(cbtBtns, '⚔️ "Ich würfle jetzt!"', 'red',  () => send({ type:'announce_roll' }));
        addCbtBtn(cbtBtns, '💨 Fliehen',              'gray', () => send({ type:'flee', targetTile:{x:0,y:0} }));
      } else {
        addCbtBtn(cbtBtns, '🎲 WÜRFELN!', 'red', () => send({ type:'roll_combat' }));
      }
    } else if (!c.resolved && c.fighterId !== STATE.myId) {
      const alreadyHelping = c.helpers?.find(h => h.id === STATE.myId);
      if (!alreadyHelping && c.helpers?.length === 0) {
        addCbtBtn(cbtBtns, '🤝 Helfen', 'blue', () => send({ type:'help_fight' }));
      }
      addCbtBtn(cbtBtns, '😈 Behindern (+2 Monster)', 'gray', () => send({ type:'hinder', bonus:2 }));
    }
    if (!c.resolved && g.phase === 'flee' && c.fighterId === STATE.myId) {
      addCbtBtn(cbtBtns, '💨 Zum Eingang fliehen', 'gold', () => send({ type:'flee', targetTile:{x:0,y:0} }));
    }
  }
}

function addCbtBtn(container, label, style, onClick) {
  const b = document.createElement('button');
  b.className = `cbt-btn ${style}`;
  b.textContent = label;
  b.onclick = onClick;
  container.appendChild(b);
}

function calcPlayerStrDisplay(g, me, c) {
  if (!me) return '?';
  let str = me.level;
  if (me.class?.bonus_combat) str += me.class.bonus_combat;
  str += calcEquipBonus(me);
  if (c.helpers) c.helpers.forEach(h => { str += h.level || 1; });
  return str;
}

function calcEquipBonus(me) {
  if (!me) return 0;
  let b = 0;
  const eq = me.equipment || {};
  ['weapon','armor','headgear','boots'].forEach(s => { if (eq[s]?.bonus) b += eq[s].bonus; });
  (eq.klunker || []).forEach(k => { if (k?.bonus) b += k.bonus; });
  return b;
}

// ══════════════════════════════════════════════════════════════════
// ANIMATIONEN: Phase, LevelUp, Dice, Boss
// ══════════════════════════════════════════════════════════════════
function handleAnimations(prev, next) {
  if (!prev) return;

  // Phase gewechselt?
  const phaseChanged = prev.phase !== next.phase;
  if (phaseChanged && next.currentPlayerId === STATE.myId) {
    showPhaseOverlay(next.phase);
  }

  // Level-Up?
  const myPrev = prev.players?.find(p => p.id === STATE.myId);
  const myNext = next.players?.find(p => p.id === STATE.myId);
  if (myPrev && myNext && myNext.level > myPrev.level) {
    showLevelUp(myNext.level);
  }

  // Würfelwurf?
  const events = next.events || [];
  const rollEvt = events.find(e => e.type === 'combat_roll' && (!prev.events || !prev.events.find(pe => pe.type==='combat_roll' && pe.ts===e.ts)));
  if (rollEvt) {
    showDiceAnimation(rollEvt.data);
  }

  // Boss spawned?
  const bossEvt = events.find(e => e.type === 'boss_spawn' && (!prev.events || !prev.events.find(pe => pe.type==='boss_spawn' && pe.ts===e.ts)));
  if (bossEvt) {
    showBossIntro(bossEvt.data.boss);
  }

  // Fluch?
  const curseEvt = events.find(e => e.type === 'curse' && e.data.playerId === STATE.myId && (!prev.events || !prev.events.find(pe => pe.type==='curse' && pe.ts===e.ts)));
  if (curseEvt) {
    toast(`💀 Verflucht: ${curseEvt.data.curse.name}`, 'error');
  }
}

// ── PHASEN-OVERLAY ────────────────────────────────────────────────
let _phaseOverlayTimer;
function showPhaseOverlay(phase) {
  const overlay = document.getElementById('phase-overlay');
  if (!overlay) return;
  clearTimeout(_phaseOverlayTimer);
  const pi = PHASE_INFO[phase] || { icon:'🎲', label: phase };
  document.getElementById('phase-overlay-icon').textContent = pi.icon;
  document.getElementById('phase-overlay-text').textContent = pi.label.toUpperCase();
  overlay.classList.remove('hidden');
  _phaseOverlayTimer = setTimeout(() => overlay.classList.add('hidden'), 800);
}

// ── WÜRFEL-ANIMATION ──────────────────────────────────────────────
function showDiceAnimation(data) {
  const overlay = document.getElementById('dice-overlay');
  if (!overlay) return;
  const container = document.querySelector('.dice-container');
  const verdictEl = document.getElementById('dice-verdict');
  if (!container || !verdictEl) return;

  overlay.classList.remove('hidden');

  const pRoll = data.playerRolls;
  const mRolls = data.monsterRolls;

  container.innerHTML = `
    <div class="dice-row">
      <span class="dice-row-label">Held</span>
      <div class="dice rolling" id="da1">${pRoll?.roll || '?'}</div>
      <div class="dice-total" style="font-size:28px;color:var(--blue)">= ${pRoll?.total || '?'}</div>
    </div>
    <div class="dice-vs">VS</div>
    <div class="dice-row">
      <span class="dice-row-label">Monster</span>
      ${(mRolls || []).map(mr =>
        `<div class="dice rolling">${mr.rolls?.[0] || '?'}</div>`).join('')}
      <div class="dice-total" style="font-size:28px;color:var(--accent)">= ${data.monsterTotal || '?'}</div>
    </div>`;

  // Dice roll animation
  overlay.querySelectorAll('.dice').forEach(d => {
    d.classList.add('rolling');
    setTimeout(() => d.classList.remove('rolling'), 700);
  });

  setTimeout(() => {
    if (data.playerWins) {
      verdictEl.textContent = '⚔️ SIEG!';
      verdictEl.className = 'dice-verdict win';
    } else {
      verdictEl.textContent = '💀 NIEDERLAGE!';
      verdictEl.className = 'dice-verdict lose';
    }
    verdictEl.classList.remove('hidden');
  }, 750);

  setTimeout(() => {
    overlay.classList.add('hidden');
    verdictEl.classList.add('hidden');
    container.innerHTML = '';
  }, 2600);
}

// ── LEVEL-UP ──────────────────────────────────────────────────────
function showLevelUp(level) {
  const overlay = document.getElementById('levelup-overlay');
  if (!overlay) return;
  document.getElementById('levelup-num').textContent = level;
  const sub = overlay.querySelector('.levelup-sub');
  if (sub) sub.textContent = level >= 10 ? '⚡ ZUM EINGANG — BOSS ERWARTET DICH!' : '';
  overlay.classList.remove('hidden');
  setTimeout(() => overlay.classList.add('hidden'), 950);
  toast(`⬆️ Stufe ${level}!`, 'gold');
}

// ── BOSS-INTRO ────────────────────────────────────────────────────
function showBossIntro(boss) {
  const el = document.createElement('div');
  el.className = 'boss-intro';
  el.innerHTML = `<div class="boss-intro-content">
    <span class="boss-emoji">${boss.icon || '👹'}</span>
    <div class="boss-title">⚡ DER BOSS ERSCHEINT! ⚡</div>
    <div class="boss-sub">${boss.name} · Stufe 20</div>
    <div style="color:var(--red);font-size:13px;margin-top:8px">Kein Entkommen! Kämpfe in der Eingangshalle!</div>
  </div>`;
  document.body.appendChild(el);
  el.onclick = () => el.remove();
  setTimeout(() => el.remove(), 3500);
}
