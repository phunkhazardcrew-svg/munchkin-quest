// ═══════════════════════════════════════════════════
// client.js — Munchkin Quest Frontend (mit Dev-Mode)
// ═══════════════════════════════════════════════════

const socket = io();

let myId      = null;
let roomCode  = null;
let gameState = null;
let myName    = '';
let isHost    = false;
let camera    = { x: 0, y: 0, zoom: 64 };
let dragStart = null;
let isDragging = false;
let hintHidden = false;

const canvas = document.getElementById('dungeon-canvas');
const ctx    = canvas.getContext('2d');

// ── SCREEN SWITCH ──────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.add('hidden'); s.classList.remove('active');
  });
  const el = document.getElementById('screen-' + name);
  el.classList.remove('hidden');
  el.classList.add('active');
}

// ── HOME ───────────────────────────────────────────
document.getElementById('btn-create').onclick = () => {
  myName = document.getElementById('inp-name').value.trim();
  if (!myName) return showError('home', 'Bitte Heldennamen eingeben!');
  socket.emit('create_room', { playerName: myName });
};
document.getElementById('btn-join').onclick = () => {
  myName = document.getElementById('inp-name').value.trim();
  const code = document.getElementById('inp-code').value.trim().toUpperCase();
  if (!myName) return showError('home', 'Bitte Heldennamen eingeben!');
  if (code.length !== 6) return showError('home', 'Raumcode muss 6 Zeichen haben!');
  socket.emit('join_room', { playerName: myName, roomCode: code });
};
window.addEventListener('load', () => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('room');
  if (code) document.getElementById('inp-code').value = code.toUpperCase();
});

// ── LOBBY ──────────────────────────────────────────
document.getElementById('btn-copy-link').onclick = () => {
  navigator.clipboard.writeText(`${location.origin}?room=${roomCode}`)
    .then(() => showToast('🔗 Einladungslink kopiert!'));
};
document.getElementById('btn-start').onclick = () => socket.emit('start_game');
document.getElementById('btn-add-npcs').onclick = () => {
  socket.emit('add_npcs', { count: 3 });
  document.getElementById('btn-add-npcs').disabled = true;
  document.getElementById('btn-add-npcs').textContent = '✅ NPCs hinzugefügt';
};
document.getElementById('btn-new-game').onclick = () => location.reload();

// ── SOCKET EVENTS ──────────────────────────────────
socket.on('connect', () => { myId = socket.id; });

socket.on('room_created', ({ code, lobbyState }) => {
  roomCode = code;
  isHost = true;
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
socket.on('game_started', () => { showScreen('game'); resizeCanvas(); });
socket.on('game_update', (state) => { gameState = state; renderGame(); });
socket.on('game_finished', ({ winnerId }) => {
  const w = gameState?.players?.find(p => p.id === winnerId);
  document.getElementById('winner-name').textContent = (w?.name || '???') + ' gewinnt!';
  showScreen('winner');
});
socket.on('error', ({ message }) => showToast('❌ ' + message));
socket.on('action_error', ({ message }) => showToast('⚠️ ' + message));

// ── LOBBY RENDER ───────────────────────────────────
function renderLobby(state) {
  const list = document.getElementById('lobby-players');
  list.innerHTML = '';
  const colors = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c'];
  state.players.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'player-item';
    div.innerHTML = `
      <div class="player-avatar" style="background:${colors[i]}20;color:${colors[i]};border:2px solid ${colors[i]}">
        ${p.isNPC ? '🤖' : p.name.charAt(0).toUpperCase()}
      </div>
      <span style="flex:1;font-size:${p.isNPC?'13px':'15px'}">${p.name}</span>
      ${p.isNPC ? '<span class="player-host-badge" style="background:#4a4a8a;color:#c8c8ff">KI</span>' : ''}
      ${p.isHost ? '<span class="player-host-badge">HOST</span>' : ''}
      ${p.id === myId ? '<span style="color:var(--muted);font-size:12px">(Du)</span>' : ''}
    `;
    list.appendChild(div);
  });

  const amHost = state.players.find(p => p.id === myId)?.isHost;
  const canStart = amHost && state.players.length >= 2;
  document.getElementById('btn-start').style.display = amHost ? 'block' : 'none';
  document.getElementById('btn-start').disabled = !canStart;
  document.getElementById('lobby-status').textContent =
    state.players.length < 2 ? 'Warte auf Spieler... (oder NPCs hinzufügen)' :
    amHost ? `${state.players.length} Spieler bereit — Los!` : 'Warte auf Host...';

  // Dev-Box nur für Host
  if (amHost && !state.started) {
    document.getElementById('dev-mode-box').classList.remove('hidden');
    // NPCs bereits drin? Button deaktivieren
    if (state.hasNPCs) {
      document.getElementById('btn-add-npcs').disabled = true;
      document.getElementById('btn-add-npcs').textContent = '✅ NPCs hinzugefügt';
    }
  }
}

// ── GAME RENDER ────────────────────────────────────
function renderGame() {
  if (!gameState) return;
  renderTopBar();
  renderPlayersBar();
  renderActionPanel();
  renderHand();
  renderLog();
  renderCombat();
  drawBoard();
}

function renderTopBar() {
  document.getElementById('lbl-round').textContent = 'Runde ' + gameState.roundNumber;
  document.getElementById('lbl-phase').textContent = phaseLabel(gameState.turnPhase);
  const curr = gameState.players.find(p => p.id === gameState.currentPlayerId);
  const isNPC = curr && curr.id !== myId && !gameState.players.find(p=>p.id===myId && p.id===curr.id);
  const npcIds = ['npc_aldric','npc_zara','npc_glitch'];
  const currIsNPC = curr && npcIds.includes(curr.id);

  // NPC-Overlay anzeigen wenn NPC dran ist
  document.querySelectorAll('.npc-turn-overlay').forEach(e=>e.remove());
  if (currIsNPC) {
    const ov = document.createElement('div');
    ov.className = 'npc-turn-overlay';
    ov.textContent = `🤖 ${curr.name} denkt nach...`;
    document.body.appendChild(ov);
  }

  document.getElementById('lbl-current').textContent = curr
    ? (curr.id === myId ? '🎮 Du bist dran!' : `${curr.name}`)
    : '—';
}

function phaseLabel(p) {
  return {'roll_movement':'🎲 Würfeln','move':'🏃 Bewegen','open_door':'🚪 Tür öffnen',
          'combat':'⚔️ Kampf!','end_turn':'✅ Zug beenden'}[p] || p;
}

function renderPlayersBar() {
  const bar = document.getElementById('players-bar');
  bar.innerHTML = '';
  const npcIds = ['npc_aldric','npc_zara','npc_glitch'];
  gameState.players.forEach(p => {
    const chip = document.createElement('div');
    chip.className = 'player-chip'
      + (p.id === gameState.currentPlayerId ? ' active-turn' : '')
      + (npcIds.includes(p.id) ? ' is-npc' : '');
    chip.innerHTML = `
      <div class="chip-dot" style="background:${p.color}"></div>
      <div class="chip-name">${p.id===myId?'👤 Du':p.name}</div>
      <div class="chip-level">Lvl ${p.level}</div>
      ${p.class?`<div style="font-size:9px;color:var(--muted)">${p.class.name}</div>`:''}
    `;
    bar.appendChild(chip);
  });
}

function renderActionPanel() {
  const btns = document.getElementById('action-buttons');
  btns.innerHTML = '';
  const isMyTurn = gameState.currentPlayerId === myId;
  const phase    = gameState.turnPhase;

  if (isMyTurn) {
    if (phase === 'roll_movement') addActBtn(btns,'🎲 Würfeln','primary',()=>socket.emit('game_action',{type:'roll_movement'}));
    if (phase === 'open_door')     addActBtn(btns,'🚪 Tür öffnen','primary',()=>socket.emit('game_action',{type:'open_door'}));
    if (phase === 'end_turn')      addActBtn(btns,'✅ Zug beenden','primary',()=>socket.emit('game_action',{type:'end_turn'}));
    if (phase === 'move' && gameState.players.find(p=>p.id===myId)?.movesLeft === 0) {
      addActBtn(btns,'⏭️ Weiter','',()=>socket.emit('game_action',{type:'open_door'}));
    }
  }

  if (gameState.combat && !gameState.combat.resolved) {
    if (gameState.combat.fighterId === myId) {
      if (phase === 'combat') {
        addActBtn(btns,'⚔️ Kämpfen!','primary',()=>socket.emit('game_action',{type:'fight'}));
        addActBtn(btns,'🏃 Fliehen','',()=>socket.emit('game_action',{type:'flee'}));
      }
    } else {
      addActBtn(btns,'🤝 Helfen','',()=>socket.emit('game_action',{type:'help_fight',targetId:gameState.combat.fighterId}));
      addActBtn(btns,'😈 Behindern','',()=>socket.emit('game_action',{type:'hinder'}));
    }
  }
}

function addActBtn(container, label, cls, handler) {
  const b = document.createElement('button');
  b.className = 'act-btn ' + cls;
  b.textContent = label;
  b.onclick = handler;
  container.appendChild(b);
}

function renderHand() {
  const hand = gameState.myHand || [];
  document.getElementById('hand-count').textContent = hand.length;
  const area = document.getElementById('hand-cards');
  area.innerHTML = '';
  hand.forEach(card => {
    const div = document.createElement('div');
    div.className = 'hand-card';
    div.innerHTML = `
      <span class="card-icon">${cardIcon(card)}</span>
      <span class="card-name">${card.name}</span>
      ${card.bonus ? `<span class="card-bonus">+${card.bonus}</span>` : ''}
      ${card.level ? `<span style="color:#e74c3c;font-weight:700">Lvl ${card.level}</span>` : ''}
      ${card.type==='curse'?`<span style="color:#c0392b;font-size:9px">FLUCH</span>`:''}
    `;
    div.onclick = () => socket.emit('game_action', { type:'play_card', cardId: card.uid||card.id });
    area.appendChild(div);
  });
}

function cardIcon(c) {
  const icons = { monster:'👹', curse:'💀', class:'🧙', race:'🧝', enhancer:'🔺',
    potion:'🧪', level_up:'⬆️', hireling:'🤺' };
  if (c.type==='equipment') {
    return {weapon:'⚔️',armor:'🛡️',headgear:'🪖',boots:'👢'}[c.slot] || '🃏';
  }
  return icons[c.type] || '🃏';
}

function renderCombat() {
  const modal = document.getElementById('combat-modal');
  if (!gameState.combat) { modal.classList.add('hidden'); return; }
  modal.classList.remove('hidden');
  const { monster, fighterId, helpers } = gameState.combat;
  document.getElementById('cbt-title').textContent = `⚔️ vs ${monster.name}`;
  document.getElementById('cbt-monster').innerHTML = `
    <div class="monster-name">${monster.name}</div>
    <div class="monster-level">Stufe ${monster.level}${monster.special?` · ${monster.special}`:''}</div>
    <div class="monster-bad">❌ ${monster.bad_stuff || '—'}</div>
  `;
  const fighter = gameState.players.find(p=>p.id===fighterId);
  const pStr = fighter ? fighter.level + (fighter.equipment ? Object.values(fighter.equipment).reduce((a,e)=>a+(e?.bonus||0),0) : 0) : '?';
  document.getElementById('cbt-strengths').innerHTML = `
    <div class="strength-box">
      <div class="strength-val player-strength">${pStr}${helpers.length>0?'+?':''}</div>
      <div class="strength-lbl">⚔️ ${fighter?.name||'Held'}${helpers.length>0?' +Helfer':''}</div>
    </div>
    <div style="font-size:20px;align-self:center;color:var(--muted)">VS</div>
    <div class="strength-box">
      <div class="strength-val monster-strength">${monster.level}</div>
      <div class="strength-lbl">👹 Monster</div>
    </div>
  `;
  document.getElementById('cbt-buttons').innerHTML = '';
}

function renderLog() {
  const logDiv = document.getElementById('log-entries');
  if (!gameState.log) return;
  logDiv.innerHTML = '';
  [...gameState.log].reverse().slice(0, 7).forEach(entry => {
    const div = document.createElement('div');
    div.className = 'log-entry';
    div.textContent = entry.msg;
    logDiv.appendChild(div);
  });
}

// ── CANVAS ─────────────────────────────────────────
function resizeCanvas() {
  const wrap = document.getElementById('board-wrap');
  canvas.width  = wrap.clientWidth;
  canvas.height = wrap.clientHeight;
  drawBoard();
}
window.addEventListener('resize', resizeCanvas);

function drawBoard() {
  if (!gameState?.board?.tiles) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const tiles = gameState.board.tiles;
  const z  = camera.zoom;
  const cx = canvas.width  / 2 + camera.x;
  const cy = canvas.height / 2 + camera.y;
  Object.values(tiles).forEach(tile => drawTile(tile, cx + tile.x * z, cy + tile.y * z, z));
  gameState.players?.forEach(p => drawPlayer(p, cx + p.x * z, cy + p.y * z, z));
}

const tileColors = {
  start:'#1a3a2e',corridor:'#1a1a35',turn:'#1a1a35',junction:'#1a2035',
  treasure:'#3a2e10',armory:'#2e1a1a',library:'#1a2e2e',temple:'#2e2e10',
  torture:'#2e1010',throne:'#2e2810',prison:'#101020',altar:'#201830',deadend:'#0d0d18'
};

function drawTile(tile, sx, sy, z) {
  const half = z/2, pad = 3;
  ctx.fillStyle = tileColors[tile.type] || '#1a1a35';
  ctx.strokeStyle = '#2a2a5a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(sx-half+pad, sy-half+pad, z-pad*2, z-pad*2, 6);
  ctx.fill(); ctx.stroke();

  // Türen
  ctx.fillStyle = '#4a6aaa';
  const exits = tile.exits||[];
  if (exits.includes('N')) ctx.fillRect(sx-6, sy-half+pad, 12, 10);
  if (exits.includes('S')) ctx.fillRect(sx-6, sy+half-pad-10, 12, 10);
  if (exits.includes('E')) ctx.fillRect(sx+half-pad-10, sy-6, 10, 12);
  if (exits.includes('W')) ctx.fillRect(sx-half+pad, sy-6, 10, 12);

  ctx.font = `${Math.max(12,z*0.28)}px serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  ctx.fillText(tile.icon||'▪', sx, sy-3);

  if (z >= 52) {
    ctx.font = `${Math.max(8,z*0.13)}px sans-serif`;
    ctx.fillStyle = 'rgba(180,180,255,.55)';
    ctx.fillText(tile.name||'', sx, sy+z*0.22);
  }
}

function drawPlayer(p, sx, sy, z) {
  const r = Math.max(9, z*0.19);
  // Schatten
  ctx.beginPath(); ctx.arc(sx+2, sy+2, r, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fill();
  // Kreis
  ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI*2);
  ctx.fillStyle = p.color||'#fff'; ctx.fill();
  ctx.strokeStyle = p.id===myId ? '#fff' : 'rgba(255,255,255,.25)';
  ctx.lineWidth = p.id===myId ? 2.5 : 1; ctx.stroke();
  // Level
  ctx.font = `bold ${Math.max(9,r*0.95)}px sans-serif`;
  ctx.fillStyle = '#000'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(p.level, sx, sy);
}

// ── TOUCH/DRAG ─────────────────────────────────────
canvas.addEventListener('pointerdown', e => {
  dragStart = { x:e.clientX, y:e.clientY, cx:camera.x, cy:camera.y };
  isDragging = false;
});
canvas.addEventListener('pointermove', e => {
  if (!dragStart) return;
  const dx = e.clientX-dragStart.x, dy = e.clientY-dragStart.y;
  if (Math.abs(dx)>5||Math.abs(dy)>5) isDragging = true;
  if (isDragging) { camera.x=dragStart.cx+dx; camera.y=dragStart.cy+dy; drawBoard(); }
});
canvas.addEventListener('pointerup', e => {
  if (!isDragging && gameState?.turnPhase==='move') handleBoardTap(e.clientX, e.clientY);
  dragStart=null; isDragging=false;
});

let lastDist=null;
canvas.addEventListener('touchmove', e => {
  if (e.touches.length===2) {
    const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
    if (lastDist) camera.zoom=Math.max(32,Math.min(130,camera.zoom*d/lastDist));
    lastDist=d; drawBoard();
  }
},{passive:true});
canvas.addEventListener('touchend',()=>{lastDist=null;});

function handleBoardTap(clientX, clientY) {
  if (gameState.currentPlayerId!==myId) return;
  const rect=canvas.getBoundingClientRect();
  const px=clientX-rect.left, py=clientY-rect.top;
  const z=camera.zoom, cx=canvas.width/2+camera.x, cy=canvas.height/2+camera.y;
  const tx=Math.round((px-cx)/z), ty=Math.round((py-cy)/z);
  const me=gameState.players.find(p=>p.id===myId);
  if (!me) return;
  if (Math.abs(tx-me.x)+Math.abs(ty-me.y)===1) {
    socket.emit('game_action',{type:'move',x:tx,y:ty});
    if (!hintHidden) {
      document.getElementById('board-hint').style.opacity='0';
      hintHidden=true;
    }
  }
}

// ── UTILS ──────────────────────────────────────────
function showError(screen, msg) {
  const el=document.getElementById(`${screen}-error`);
  if(!el) return;
  el.textContent=msg; el.classList.remove('hidden');
  setTimeout(()=>el.classList.add('hidden'),3000);
}
function showToast(msg) {
  const t=document.createElement('div');
  t.style.cssText=`position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
    background:#1a1a2e;border:1px solid #2a2a4a;color:#e8e8f0;
    padding:12px 20px;border-radius:8px;z-index:999;font-size:14px;pointer-events:none;`;
  t.textContent=msg; document.body.appendChild(t);
  setTimeout(()=>t.remove(),2800);
}

resizeCanvas();
