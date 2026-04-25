// ═══════════════════════════════════════════════════
// client.js v2 — Munchkin Quest
// Sprint 1+2: Koordinaten-Fix, Touch-Fix, Phase-HUD,
//             Reachable-Highlights, Log-Strip, Layout
// ═══════════════════════════════════════════════════

const socket = io();

// ── STATE ──────────────────────────────────────────
let myId       = null;
let roomCode   = null;
let gameState  = null;
let myName     = '';
let isHost     = false;
let handOpen   = true;

// Kamera — in CSS-Pixeln
let cam = { x: 0, y: 0, zoom: 80 };

// Pointer-Tracking
let ptr = { down: false, startX: 0, startY: 0, startCX: 0, startCY: 0, moved: false, t: 0 };
const TAP_MAX_MOVE = 12;   // px
const TAP_MAX_MS   = 280;

// Canvas
const canvas = document.getElementById('dungeon-canvas');
const ctx    = canvas.getContext('2d');
let dpr      = 1;   // devicePixelRatio — gesetzt beim Setup

// NPC IDs
const NPC_IDS = ['npc_aldric','npc_zara','npc_glitch'];

// Animationsschleife
let rafId = null;
let animT = 0;

// ── INIT ───────────────────────────────────────────
function init() {
  setupCanvas();
  bindEvents();
  startRenderLoop();
  // URL-Code
  const p = new URLSearchParams(location.search);
  if (p.get('room')) document.getElementById('inp-code').value = p.get('room').toUpperCase();
}

// ── CANVAS SETUP (Hi-DPI Fix) ─────────────────────
function setupCanvas() {
  dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const wrap = document.getElementById('board-wrap');
  const w = wrap.clientWidth, h = wrap.clientHeight;
  // Backing-Store = CSS-Pixel × DPR
  canvas.width  = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  // CSS-Größe unverändert
  canvas.style.width  = w + 'px';
  canvas.style.height = h + 'px';
  // Context skalieren → alle draw-calls in CSS-Pixeln
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ── RENDER LOOP ────────────────────────────────────
function startRenderLoop() {
  function frame(ts) {
    animT = ts;
    if (gameState) drawBoard();
    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);
}

// ── SCREEN SWITCH ──────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.style.display = 'none';
  });
  const el = document.getElementById('screen-' + name);
  el.style.display = '';
  el.classList.add('active');
  if (name === 'game') {
    requestAnimationFrame(() => { setupCanvas(); });
  }
}

// ── EVENTS BINDEN ─────────────────────────────────
function bindEvents() {
  // Home
  document.getElementById('btn-create').onclick = () => {
    myName = document.getElementById('inp-name').value.trim();
    if (!myName) return showErr('home', 'Bitte Heldennamen eingeben!');
    socket.emit('create_room', { playerName: myName });
  };
  document.getElementById('btn-join').onclick = () => {
    myName = document.getElementById('inp-name').value.trim();
    const code = document.getElementById('inp-code').value.trim().toUpperCase();
    if (!myName) return showErr('home', 'Bitte Namen eingeben!');
    if (code.length !== 6) return showErr('home', 'Code muss 6 Zeichen haben!');
    socket.emit('join_room', { playerName: myName, roomCode: code });
  };
  // Lobby
  document.getElementById('btn-copy-link').onclick = () => {
    navigator.clipboard.writeText(`${location.origin}?room=${roomCode}`)
      .then(() => toast('🔗 Link kopiert!', 'success'));
  };
  document.getElementById('btn-start').onclick   = () => socket.emit('start_game');
  document.getElementById('btn-add-npcs').onclick = () => {
    socket.emit('add_npcs', { count: 3 });
    document.getElementById('btn-add-npcs').disabled = true;
    document.getElementById('btn-add-npcs').textContent = '✅ NPCs hinzugefügt';
  };
  // Winner
  document.getElementById('btn-new-game').onclick = () => location.reload();
  // Log
  document.getElementById('log-toggle').onclick = () => {
    document.getElementById('log-panel').classList.toggle('open');
  };
  document.getElementById('log-close').onclick = () => {
    document.getElementById('log-panel').classList.remove('open');
  };
  // Hand toggle
  document.getElementById('hand-toggle').onclick = () => {
    handOpen = !handOpen;
    document.getElementById('hand-cards').style.display = handOpen ? 'flex' : 'none';
    document.getElementById('hand-toggle').textContent = handOpen ? '▼' : '▲';
  };
  // Canvas — Pointer Events statt Touch+Mouse
  canvas.addEventListener('pointerdown',  onPointerDown,  { passive: false });
  canvas.addEventListener('pointermove',  onPointerMove,  { passive: false });
  canvas.addEventListener('pointerup',    onPointerUp,    { passive: false });
  canvas.addEventListener('pointercancel',() => { ptr.down = false; });
  // Pinch-Zoom
  let pinch = null;
  canvas.addEventListener('touchstart', e => {
    if (e.touches.length === 2) pinch = {
      dist: Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY),
      zoom: cam.zoom
    };
  }, { passive: true });
  canvas.addEventListener('touchmove', e => {
    if (e.touches.length === 2 && pinch) {
      const d = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
      cam.zoom = Math.max(40, Math.min(150, pinch.zoom * d / pinch.dist));
    }
  }, { passive: true });
  canvas.addEventListener('touchend', () => { pinch = null; });
  // Resize
  window.addEventListener('resize', () => { setupCanvas(); });
}

// ── POINTER HANDLING ──────────────────────────────
function onPointerDown(e) {
  e.preventDefault();
  ptr = { down: true, startX: e.clientX, startY: e.clientY,
          startCX: cam.x, startCY: cam.y, moved: false, t: performance.now() };
  canvas.setPointerCapture(e.pointerId);
}
function onPointerMove(e) {
  if (!ptr.down) return;
  const dx = e.clientX - ptr.startX, dy = e.clientY - ptr.startY;
  if (Math.hypot(dx, dy) > TAP_MAX_MOVE) ptr.moved = true;
  if (ptr.moved) {
    cam.x = ptr.startCX + dx;
    cam.y = ptr.startCY + dy;
  }
}
function onPointerUp(e) {
  if (!ptr.down) return;
  const dt = performance.now() - ptr.t;
  if (!ptr.moved && dt < TAP_MAX_MS) handleTap(e.clientX, e.clientY);
  ptr.down = false;
}

// ── TAP → TILE ─────────────────────────────────────
// KRITISCHER FIX: Korrekte Koordinaten-Pipeline
// screen(CSS-px) → world(CSS-px, camera-korrigiert) → tile(ganzzahlig)
function screenToTile(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  // CSS-Pixel relativ zur Canvas-Kante
  const cssX = clientX - rect.left;
  const cssY = clientY - rect.top;
  // CSS-Breite des Canvas (immer = rect.width dank style.width)
  const cw = rect.width, ch = rect.height;
  // Welt-Koordinaten: Zoom rückgängig, dann Camera-Offset abziehen
  // draw: screenX = cw/2 + cam.x + tile.x * cam.zoom
  // inverse: tile.x = (cssX - cw/2 - cam.x) / cam.zoom
  const wx = (cssX - cw / 2 - cam.x) / cam.zoom;
  const wy = (cssY - ch / 2 - cam.y) / cam.zoom;
  // Nächste ganze Zahl (Tile-Mittelpunkt-basiert)
  return { tx: Math.round(wx), ty: Math.round(wy) };
}

function handleTap(clientX, clientY) {
  if (!gameState) return;
  const phase = gameState.turnPhase;
  const isMyTurn = gameState.currentPlayerId === myId;
  // Nur in Bewegungsphase UND eigenem Zug auf Tipper reagieren
  if (!isMyTurn || phase !== 'move') return;
  const me = gameState.players.find(p => p.id === myId);
  if (!me || me.movesLeft <= 0) return;
  const { tx, ty } = screenToTile(clientX, clientY);
  // Adjazenz prüfen (Manhattan-Distanz == 1)
  if (Math.abs(tx - me.x) + Math.abs(ty - me.y) !== 1) return;
  // Nur senden wenn Ausgang vorhanden (client-seitige Pre-Validierung)
  const tile = gameState.board.tiles[`${me.x},${me.y}`];
  if (!tile) return;
  const dx = tx - me.x, dy = ty - me.y;
  const dir = dx===1?'E':dx===-1?'W':dy===1?'S':'N';
  if (!tile.exits || !tile.exits.includes(dir)) {
    toast('🧱 In diese Richtung gibt es keine Tür!', 'error');
    return;
  }
  socket.emit('game_action', { type: 'move', x: tx, y: ty });
  // Hint ausblenden nach erstem Move
  document.getElementById('board-hint').style.opacity = '0';
}

// ── SOCKET EVENTS ──────────────────────────────────
socket.on('connect', () => { myId = socket.id; });

socket.on('room_created', ({ code, lobbyState }) => {
  roomCode = code; isHost = true;
  document.getElementById('lbl-code').textContent = code;
  showScreen('lobby');
  renderLobby(lobbyState);
  document.getElementById('btn-start').classList.remove('hidden');
  document.getElementById('dev-mode-box').classList.remove('hidden');
});
socket.on('room_joined', ({ code, lobbyState }) => {
  roomCode = code;
  document.getElementById('lbl-code').textContent = code;
  showScreen('lobby');
  renderLobby(lobbyState);
});
socket.on('lobby_update', renderLobby);
socket.on('game_started', () => {
  showScreen('game');
  requestAnimationFrame(() => setupCanvas());
});
socket.on('game_update', state => {
  const prevTurn = gameState?.currentPlayerId;
  gameState = state;
  renderGame();
  // Toast wenn eigener Zug beginnt
  if (state.currentPlayerId === myId && prevTurn !== myId) {
    toast('🎮 Du bist dran!', 'info');
    if (navigator.vibrate) navigator.vibrate(200);
  }
});
socket.on('game_finished', ({ winnerId }) => {
  const w = gameState?.players?.find(p => p.id === winnerId);
  document.getElementById('winner-name').textContent = (w?.name || '???') + ' gewinnt!';
  showScreen('winner');
});
socket.on('error',        ({ message }) => toast('❌ ' + message, 'error'));
socket.on('action_error', ({ message }) => toast('⚠️ ' + message, 'error'));

// ── LOBBY RENDER ───────────────────────────────────
function renderLobby(state) {
  const list = document.getElementById('lobby-players');
  list.innerHTML = '';
  const COLORS = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c'];
  state.players.forEach((p, i) => {
    const c = COLORS[i % COLORS.length];
    const div = document.createElement('div');
    div.className = 'player-item';
    div.innerHTML = `
      <div class="player-avatar" style="background:${c}22;color:${c};border:2px solid ${c}">
        ${p.isNPC ? '🤖' : p.name.charAt(0).toUpperCase()}
      </div>
      <span style="flex:1;font-size:14px">${p.name}</span>
      ${p.isNPC  ? '<span class="badge badge-npc">KI</span>' : ''}
      ${p.isHost ? '<span class="badge badge-host">HOST</span>' : ''}
      ${p.id === myId ? '<span style="font-size:11px;color:var(--muted)">(Du)</span>' : ''}
    `;
    list.appendChild(div);
  });
  const amHost = state.players.find(p => p.id === myId)?.isHost;
  document.getElementById('btn-start').style.display = amHost ? 'block' : 'none';
  document.getElementById('btn-start').disabled = state.players.length < 2;
  document.getElementById('lobby-status').textContent =
    state.players.length < 2 ? '⏳ Mindestens 2 Spieler nötig' :
    amHost ? `✅ ${state.players.length} Spieler — bereit!` : '⏳ Warte auf Host...';
  if (amHost) document.getElementById('dev-mode-box').classList.remove('hidden');
  if (state.hasNPCs) {
    const b = document.getElementById('btn-add-npcs');
    b.disabled = true; b.textContent = '✅ NPCs im Raum';
  }
}

// ── GAME RENDER ────────────────────────────────────
function renderGame() {
  if (!gameState) return;
  renderHUD();
  renderPlayersBar();
  renderActions();
  renderHand();
  renderLog();
  renderCombat();
  renderNPCOverlay();
}

// HUD: Phase-Banner + Spieler + Runde
const PHASE_MAP = {
  roll_movement: { label: '🎲 Würfeln',     cls: 'phase-roll',   color: '#3498db' },
  move:          { label: '🏃 Bewegen',     cls: 'phase-move',   color: '#27ae60' },
  open_door:     { label: '🚪 Tür öffnen', cls: 'phase-door',   color: '#f39c12' },
  combat:        { label: '⚔️ Kampf!',     cls: 'phase-combat', color: '#e94560' },
  end_turn:      { label: '✅ Zug Ende',   cls: 'phase-end',    color: '#9b59b6' },
};
function renderHUD() {
  const ph = PHASE_MAP[gameState.turnPhase] || { label: gameState.turnPhase, cls: 'phase-roll', color: '#3498db' };
  const phEl  = document.getElementById('hud-phase');
  const bar   = document.getElementById('hud-bar');
  const curr  = gameState.players.find(p => p.id === gameState.currentPlayerId);
  phEl.textContent = ph.label;
  phEl.style.background = ph.color;
  bar.className = ph.cls;
  const me = gameState.players.find(p => p.id === myId);
  const moves = me?.movesLeft > 0 ? ` · ${me.movesLeft}🦶` : '';
  document.getElementById('hud-current').textContent =
    curr ? (curr.id === myId ? `🎮 Du bist dran${moves}!` : `🎯 ${curr.name}`) : '—';
  document.getElementById('hud-round').textContent = 'R' + gameState.roundNumber;
}

function renderNPCOverlay() {
  const curr = gameState.players.find(p => p.id === gameState.currentPlayerId);
  const ov = document.getElementById('npc-overlay');
  if (curr && NPC_IDS.includes(curr.id)) {
    ov.textContent = `${curr.name} überlegt...`;
    ov.style.display = 'block';
  } else {
    ov.style.display = 'none';
  }
}

function renderPlayersBar() {
  const bar = document.getElementById('players-bar');
  bar.innerHTML = '';
  gameState.players.forEach(p => {
    const chip = document.createElement('div');
    chip.className = 'player-chip'
      + (p.id === gameState.currentPlayerId ? ' active-turn' : '')
      + (NPC_IDS.includes(p.id) ? ' is-npc' : '');
    const eq = p.equipment ? Object.values(p.equipment).reduce((a,e) => a+(e?.bonus||0), 0) : 0;
    chip.innerHTML = `
      <div class="chip-dot" style="background:${p.color}"></div>
      <div class="chip-name">${p.id===myId?'Du':p.name}</div>
      <div class="chip-level">Lvl ${p.level}</div>
      ${eq>0?`<div class="chip-info">+${eq} Ausr.</div>`:''}
      ${p.class?`<div class="chip-info">${p.class.name}</div>`:''}
    `;
    bar.appendChild(chip);
  });
}

function renderActions() {
  const cont = document.getElementById('action-buttons');
  cont.innerHTML = '';
  const isMyTurn = gameState.currentPlayerId === myId;
  const phase = gameState.turnPhase;
  const me = gameState.players.find(p => p.id === myId);
  if (!me) return;

  if (isMyTurn) {
    if (phase === 'roll_movement')
      addBtn(cont, '🎲 Würfeln', 'primary', () => emit('roll_movement'));
    if (phase === 'open_door')
      addBtn(cont, '🚪 Tür öffnen', 'primary', () => emit('open_door'));
    if (phase === 'move' && me.movesLeft === 0)
      addBtn(cont, '⏭️ Weiter', 'primary', () => emit('open_door'));
    if (phase === 'end_turn') {
      addBtn(cont, '✅ Zug beenden', 'green', () => emit('end_turn'));
      // Verkaufen wenn ≥1000 Gold in Karten
      const sellable = (gameState.myHand||[]).filter(c => c.type==='equipment'||c.type==='potion');
      if (sellable.length >= 3)
        addBtn(cont, '💰 Items verkaufen', '', () => {
          const ids = sellable.slice(0,3).map(c => c.uid||c.id);
          socket.emit('game_action', { type:'sell_items', cardIds: ids });
        });
    }
  }

  // Kampf-Aktionen
  if (gameState.combat && !gameState.combat.resolved) {
    if (gameState.combat.fighterId === myId) {
      if (phase === 'combat') {
        addBtn(cont, '⚔️ Kämpfen!', 'primary', () => emit('fight'));
        addBtn(cont, '🏃 Fliehen', '', () => emit('flee'));
      }
    } else {
      if (!NPC_IDS.includes(myId)) {
        addBtn(cont, '🤝 Helfen', 'blue', () => emit('help_fight', { targetId: gameState.combat.fighterId }));
        addBtn(cont, '😈 Behindern', '', () => emit('hinder'));
      }
    }
  }
}

function addBtn(container, label, cls, handler) {
  const b = document.createElement('button');
  b.className = 'act-btn ' + cls;
  b.textContent = label;
  b.onclick = handler;
  container.appendChild(b);
}
function emit(type, extra) { socket.emit('game_action', { type, ...(extra||{}) }); }

function renderHand() {
  const hand = gameState.myHand || [];
  document.getElementById('hand-count').textContent = hand.length;
  const area = document.getElementById('hand-cards');
  area.innerHTML = '';
  hand.forEach(card => {
    const div = document.createElement('div');
    div.className = 'hand-card';
    const icon = cardIcon(card);
    const bonus = card.bonus ? `<span class="card-bonus">+${card.bonus}</span>` : '';
    const bad   = card.type==='curse' ? `<span class="card-bad">FLUCH</span>` : '';
    const lvl   = card.level ? `<span class="card-bad">Lvl${card.level}</span>` : '';
    div.innerHTML = `<span class="card-icon">${icon}</span><span class="card-name">${card.name}</span>${bonus}${lvl}${bad}`;
    div.onclick = () => {
      socket.emit('game_action', { type:'play_card', cardId: card.uid||card.id });
    };
    area.appendChild(div);
  });
}

function cardIcon(c) {
  if (c.type==='monster')  return '👹';
  if (c.type==='curse')    return '💀';
  if (c.type==='class')    return '🧙';
  if (c.type==='race')     return '🧝';
  if (c.type==='enhancer') return '🔺';
  if (c.type==='potion')   return '🧪';
  if (c.type==='level_up') return '⬆️';
  if (c.type==='hireling') return '🤺';
  if (c.slot==='weapon')   return '⚔️';
  if (c.slot==='armor')    return '🛡️';
  if (c.slot==='headgear') return '🪖';
  if (c.slot==='boots')    return '👢';
  return '🃏';
}

function renderLog() {
  if (!gameState.log || !gameState.log.length) return;
  const latest = gameState.log[gameState.log.length - 1];
  document.getElementById('log-latest').textContent = latest?.msg || '—';
  const panel = document.getElementById('log-entries');
  if (!document.getElementById('log-panel').classList.contains('open')) return;
  panel.innerHTML = '';
  [...gameState.log].reverse().forEach(e => {
    const div = document.createElement('div');
    div.className = 'log-entry' + (e.msg.includes('🏆')||e.msg.includes('✅')||e.msg.includes('⚔️') ? ' highlight' : '');
    div.textContent = e.msg;
    panel.appendChild(div);
  });
}

function renderCombat() {
  const modal = document.getElementById('combat-modal');
  if (!gameState.combat) { modal.classList.add('hidden'); return; }
  modal.classList.remove('hidden');
  const { monster, fighterId, helpers } = gameState.combat;
  document.getElementById('cbt-title').textContent = `⚔️ ${monster.name}`;
  const special = monster.special ? `<div class="monster-special">✨ Spezial: ${monster.special}</div>` : '';
  document.getElementById('cbt-monster').innerHTML = `
    <div class="monster-name">${monster.name}</div>
    <div class="monster-level">Stufe ${monster.level}</div>
    <div class="monster-bad">❌ Misserfolg: ${monster.bad_stuff||'—'}</div>
    ${special}
  `;
  const fighter = gameState.players.find(p => p.id === fighterId);
  const pStr = fighter ? fighter.level + Object.values(fighter.equipment||{}).reduce((a,e)=>a+(e?.bonus||0),0) : '?';
  document.getElementById('cbt-vs').innerHTML = `
    <div class="str-box"><div class="str-val player">${pStr}</div><div class="str-lbl">⚔️ Held</div></div>
    <div class="vs-sep">VS</div>
    <div class="str-box"><div class="str-val monster">${monster.level}</div><div class="str-lbl">👹 Monster</div></div>
  `;
  const hNames = helpers.map(hid => gameState.players.find(p=>p.id===hid)?.name||'?').join(', ');
  document.getElementById('cbt-helpers').textContent = helpers.length ? `🤝 Helfer: ${hNames}` : '';
  const cbtBtns = document.getElementById('cbt-buttons');
  cbtBtns.innerHTML = '';
  if (fighterId === myId) {
    const bFight = document.createElement('button');
    bFight.className = 'btn btn-primary'; bFight.textContent = '⚔️ Kämpfen!';
    bFight.onclick = () => emit('fight');
    const bFlee = document.createElement('button');
    bFlee.className = 'btn btn-secondary'; bFlee.textContent = '🏃 Fliehen';
    bFlee.onclick = () => emit('flee');
    cbtBtns.appendChild(bFight); cbtBtns.appendChild(bFlee);
  } else if (!NPC_IDS.includes(myId)) {
    const bHelp = document.createElement('button');
    bHelp.className = 'btn btn-primary'; bHelp.textContent = '🤝 Helfen';
    bHelp.onclick = () => emit('help_fight', { targetId: fighterId });
    const bHinder = document.createElement('button');
    bHinder.className = 'btn btn-secondary'; bHinder.textContent = '😈 Behindern';
    bHinder.onclick = () => emit('hinder');
    cbtBtns.appendChild(bHelp); cbtBtns.appendChild(bHinder);
  }
}

// ── BOARD ZEICHNEN ─────────────────────────────────
const TILE_COLORS = {
  start:   '#0d2e1e', corridor:'#111128', turn:'#111128', junction:'#12142e',
  treasure:'#2e2208', armory:'#2e1010',  library:'#0e2020', temple:'#2a2a08',
  torture: '#2e0808', throne:'#2a2205',  prison:'#08080e', altar:'#180d2a',
  deadend: '#0a0a14',
};

function drawBoard() {
  if (!gameState?.board?.tiles) return;
  const tiles   = gameState.board.tiles;
  const z       = cam.zoom;
  // Canvas-CSS-Breite/-Höhe (weil ctx nach DPR skaliert, in CSS-Pixeln rechnen)
  const CW = canvas.style.width  ? parseInt(canvas.style.width)  : canvas.width;
  const CH = canvas.style.height ? parseInt(canvas.style.height) : canvas.height;
  const OX = CW / 2 + cam.x;  // Weltmittelpunkt auf Canvas (CSS-px)
  const OY = CH / 2 + cam.y;

  ctx.clearRect(0, 0, CW, CH);

  // Hintergrund-Grid (dezent)
  ctx.fillStyle = '#0a0a12';
  ctx.fillRect(0, 0, CW, CH);

  // Reachable-Highlight berechnen
  let reachable = [];
  if (gameState.turnPhase === 'move') {
    const me = gameState.players.find(p => p.id === myId);
    if (me && me.movesLeft > 0) {
      const myTile = tiles[`${me.x},${me.y}`];
      if (myTile?.exits) {
        myTile.exits.forEach(dir => {
          const nx = me.x + (dir==='E'?1:dir==='W'?-1:0);
          const ny = me.y + (dir==='N'?-1:dir==='S'?1:0);
          const targetTile = tiles[`${nx},${ny}`];
          const opp = {N:'S',S:'N',E:'W',W:'E'}[dir];
          if (!targetTile || targetTile.exits?.includes(opp)) {
            reachable.push({ x:nx, y:ny });
          }
        });
      }
    }
  }

  // Kacheln zeichnen
  Object.values(tiles).forEach(tile => {
    const sx = OX + tile.x * z;
    const sy = OY + tile.y * z;
    // Frustrierungsschutz: nur zeichnen wenn auf Screen
    if (sx < -z || sx > CW+z || sy < -z || sy > CH+z) return;
    const isReachable = reachable.some(r => r.x===tile.x && r.y===tile.y);
    drawTile(tile, sx, sy, z, isReachable);
  });

  // Spieler-Sprites
  gameState.players.forEach(p => {
    const sx = OX + p.x * z;
    const sy = OY + p.y * z;
    drawPlayer(p, sx, sy, z);
  });
}

function drawTile(tile, sx, sy, z, isReachable) {
  const half = z / 2, pad = 3;
  const bg = TILE_COLORS[tile.type] || '#111128';

  // Kachel-Hintergrund
  ctx.fillStyle = bg;
  ctx.strokeStyle = isReachable ? 'rgba(80,220,120,.8)' : '#22224a';
  ctx.lineWidth = isReachable ? 2.5 : 1;
  ctx.beginPath();
  ctx.roundRect(sx-half+pad, sy-half+pad, z-pad*2, z-pad*2, 6);
  ctx.fill();
  ctx.stroke();

  // Pulsierender Reachable-Glow
  if (isReachable) {
    const pulse = 0.25 + 0.18 * Math.sin(animT / 350);
    ctx.fillStyle = `rgba(60,200,100,${pulse})`;
    ctx.beginPath();
    ctx.roundRect(sx-half+pad, sy-half+pad, z-pad*2, z-pad*2, 6);
    ctx.fill();
  }

  // Türen
  ctx.fillStyle = isReachable ? '#50dc78' : '#3a3a7a';
  const exits = tile.exits || [];
  const dw = Math.max(8, z*0.2), dh = Math.max(6, z*0.15);
  if (exits.includes('N')) ctx.fillRect(sx-dw/2, sy-half+pad,   dw, dh);
  if (exits.includes('S')) ctx.fillRect(sx-dw/2, sy+half-pad-dh,dw, dh);
  if (exits.includes('E')) ctx.fillRect(sx+half-pad-dh, sy-dw/2,dh, dw);
  if (exits.includes('W')) ctx.fillRect(sx-half+pad,    sy-dw/2,dh, dw);

  // Tile-Icon
  if (z >= 36) {
    ctx.font = `${Math.max(12, z*0.3)}px serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,.88)';
    ctx.fillText(tile.icon || '▪', sx, sy - (z >= 52 ? z*0.1 : 0));
  }
  // Tile-Name
  if (z >= 60) {
    ctx.font = `${Math.max(7, z*0.12)}px sans-serif`;
    ctx.fillStyle = 'rgba(160,160,220,.55)';
    ctx.fillText(tile.name || '', sx, sy + z*0.24);
  }
}

function drawPlayer(p, sx, sy, z) {
  const r = Math.max(10, z * 0.2);
  // Schatten
  ctx.beginPath(); ctx.arc(sx+1.5, sy+1.5, r, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fill();
  // Kreis
  ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI*2);
  ctx.fillStyle = p.color || '#aaa'; ctx.fill();
  // Border — eigener Spieler breiter
  ctx.strokeStyle = p.id === myId ? '#fff' : 'rgba(255,255,255,.3)';
  ctx.lineWidth = p.id === myId ? 2.5 : 1.5;
  ctx.stroke();
  // Level-Zahl
  ctx.font = `bold ${Math.max(9, r * 0.9)}px sans-serif`;
  ctx.fillStyle = '#000';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(p.level, sx, sy);
  // Aktiver Spieler: Pfeil oben
  if (p.id === gameState.currentPlayerId) {
    const pulse = 0.7 + 0.3 * Math.sin(animT / 400);
    ctx.fillStyle = `rgba(245,166,35,${pulse})`;
    ctx.beginPath();
    ctx.moveTo(sx, sy - r - 8);
    ctx.lineTo(sx - 5, sy - r - 2);
    ctx.lineTo(sx + 5, sy - r - 2);
    ctx.closePath(); ctx.fill();
  }
}

// ── TOAST ──────────────────────────────────────────
function toast(msg, type, ms) {
  const t = document.createElement('div');
  t.className = 'toast ' + (type||'');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity='0'; t.style.transition='opacity .3s'; }, (ms||2200)-300);
  setTimeout(() => t.remove(), ms||2200);
}

function showErr(screen, msg) {
  const el = document.getElementById(screen + '-error');
  if (!el) return;
  el.textContent = msg; el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
}

// ── START ──────────────────────────────────────────
init();
