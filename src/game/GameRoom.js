// ════════════════════════════════════════════════════════
// GameRoom.js — Raum-Verwaltung mit NPC-Support
// ════════════════════════════════════════════════════════
const { GameState } = require('./GameState');

const NPC_PROFILES = [
  { id:'npc_aldric', name:'🧙 Aldric', personality:'strategic' },
  { id:'npc_zara',   name:'⚔️ Zara',   personality:'strategic' },
  { id:'npc_glitch', name:'🎲 Glitch', personality:'random'    },
];

class NPCController {
  constructor(profile) {
    this.id          = profile.id;
    this.name        = profile.name;
    this.personality = profile.personality;
  }

  decide(state, myId) {
    const me = state.players.find(p => p.id === myId);
    if (!me) return null;
    const isMyTurn = state.currentPlayerId === myId;
    const phase = state.phase;

    if (this.personality === 'random') return this._random(state, me, isMyTurn, phase);
    return this._strategic(state, me, isMyTurn, phase);
  }

  _strategic(state, me, isMyTurn, phase) {
    // Kampf: behindern wenn jemand führt
    if (state.combat && !state.combat.resolved && state.combat.fighterId !== me.id) {
      const fighter = state.players.find(p => p.id === state.combat.fighterId);
      if (fighter && fighter.level >= me.level + 2) return { type:'hinder' };
      return null;
    }
    if (!isMyTurn) return null;

    switch (phase) {
      case 'draw_dxm':      return { type:'draw_dxm' };
      case 'movement': {
        if (me.movesLeft > 0) {
          const board = state.board?.tiles;
          if (!board) return { type:'skip_to_search' };
          const tile = board[`${me.x},${me.y}`];
          if (!tile) return { type:'skip_to_search' };
          // Bewege zum besten benachbarten Feld
          const best = this._bestMove(board, tile, me);
          if (best) return { type:'move', x: best.x, y: best.y };
        }
        return { type:'skip_to_search' };
      }
      case 'combat':
      case 'combat_roll':
        if (state.combat?.fighterId === me.id) {
          // Trank spielen wenn nötig
          const potion = (state.myHand||[]).find(c => c.type === 'potion' && c.bonus > 0);
          if (potion && (state.combat.monsters[0]?.level||0) > (me.level||1) + 3) {
            return { type:'play_card', cardId: potion.uid||potion.id };
          }
          return { type:'roll_combat' };
        }
        return null;
      case 'flee':
        if (state.combat?.fighterId === me.id) {
          // Fliehe zum Eingang
          return { type:'flee', targetTile: { x:0, y:0 } };
        }
        return null;
      case 'charity': {
        // Gib Karten an schwächsten
        const myHand = (state.myHand||[]);
        if (myHand.length > 5) {
          const target = state.players.reduce((a,b) => a.level<=b.level ? a : b);
          const card = myHand[myHand.length-1];
          return { type:'charity_give', cardId: card.uid||card.id, targetId: target.id };
        }
        return { type:'charity_done' };
      }
      default: return null;
    }
  }

  _bestMove(board, tile, me) {
    if (!tile?.exits) return null;
    const dirs = { N:{dx:0,dy:-1}, S:{dx:0,dy:1}, E:{dx:1,dy:0}, W:{dx:-1,dy:0} };
    const scored = tile.exits.map(dir => {
      const {dx,dy} = dirs[dir];
      const nx = me.x+dx, ny = me.y+dy;
      const t = board[`${nx},${ny}`];
      if (!t) return { x:nx, y:ny, score:5 }; // Unbekannt = gut!
      if (t.type === 'treasure') return { x:nx, y:ny, score:10 };
      if (t.type === 'throne')   return { x:nx, y:ny, score:9 };
      if (t.type === 'prison')   return { x:nx, y:ny, score:0 };
      if (t.type === 'deadend')  return { x:nx, y:ny, score:1 };
      return { x:nx, y:ny, score:3 };
    });
    scored.sort((a,b) => b.score - a.score);
    return scored[0];
  }

  _random(state, me, isMyTurn, phase) {
    if (state.combat && !state.combat.resolved && state.combat.fighterId !== me.id) {
      const r = Math.random();
      if (r < 0.2) return { type:'hinder' };
      if (r < 0.35) return { type:'help_fight', targetId: state.combat.fighterId };
      return null;
    }
    if (!isMyTurn) return null;
    switch (phase) {
      case 'draw_dxm':  return { type:'draw_dxm' };
      case 'movement':
        if (me.movesLeft > 0) {
          const board = state.board?.tiles;
          const tile = board?.[`${me.x},${me.y}`];
          if (tile?.exits?.length > 0) {
            const dir = tile.exits[Math.floor(Math.random()*tile.exits.length)];
            const DIRS = { N:{x:0,y:-1},S:{x:0,y:1},E:{x:1,y:0},W:{x:-1,y:0} };
            const d = DIRS[dir];
            return { type:'move', x: me.x+d.x, y: me.y+d.y };
          }
        }
        return { type:'skip_to_search' };
      case 'combat':
      case 'combat_roll':
        if (state.combat?.fighterId === me.id) {
          return Math.random() < 0.75 ? { type:'roll_combat' } : { type:'flee', targetTile:{x:0,y:0} };
        }
        return null;
      case 'flee':
        if (state.combat?.fighterId === me.id) return { type:'flee', targetTile:{x:0,y:0} };
        return null;
      case 'charity':  return { type:'charity_done' };
      default:         return null;
    }
  }
}

class GameRoom {
  constructor(code, hostId, hostName) {
    this.code         = code;
    this.lobbyPlayers = [{ id:hostId, name:hostName, isHost:true, isNPC:false }];
    this.gameState    = null;
    this.createdAt    = Date.now();
    this.lastActivity = Date.now();
    this.npcControllers = {};
    this._npcTimer    = null;
    this._onBroadcast = null;
  }

  get playerCount() { return this.lobbyPlayers.length; }

  addPlayer(socketId, name) {
    if (this.gameState)                          return { success:false, error:'Spiel läuft!' };
    if (this.lobbyPlayers.length >= 6)           return { success:false, error:'Raum voll!' };
    if (this.lobbyPlayers.find(p=>p.id===socketId)) return { success:false, error:'Bereits im Raum!' };
    this.lobbyPlayers.push({ id:socketId, name, isHost:false, isNPC:false });
    this.lastActivity = Date.now();
    return { success:true };
  }

  addNPCs(count = 3) {
    NPC_PROFILES.slice(0, count).forEach(p => {
      if (this.lobbyPlayers.length >= 6) return;
      this.lobbyPlayers.push({ id:p.id, name:p.name, isHost:false, isNPC:true });
      this.npcControllers[p.id] = new NPCController(p);
    });
    return { success:true, added: Object.keys(this.npcControllers).length };
  }

  removePlayer(socketId) {
    const idx = this.lobbyPlayers.findIndex(p=>p.id===socketId);
    if (idx === -1) return;
    const wasHost = this.lobbyPlayers[idx].isHost;
    this.lobbyPlayers.splice(idx, 1);
    if (wasHost && this.lobbyPlayers.length > 0) this.lobbyPlayers[0].isHost = true;
    if (this.lobbyPlayers.filter(p=>!p.isNPC).length === 0) this._stopNPC();
    this.lastActivity = Date.now();
  }

  startGame(hostId) {
    if (this.gameState) return { success:false, error:'Läuft schon!' };
    if (!this.lobbyPlayers.find(p=>p.id===hostId)?.isHost) return { success:false, error:'Nur Host!' };
    if (this.lobbyPlayers.length < 2) return { success:false, error:'Min. 2 Spieler!' };
    this.gameState = new GameState(this.lobbyPlayers.map(p=>({ id:p.id, name:p.name })));
    if (Object.keys(this.npcControllers).length > 0) this._startNPC();
    return { success:true };
  }

  _startNPC() {
    this._stopNPC();
    this._npcTimer = setInterval(() => this._tickNPC(), 1800);
  }
  _stopNPC() {
    if (this._npcTimer) { clearInterval(this._npcTimer); this._npcTimer = null; }
  }

  _tickNPC() {
    if (!this.gameState || this.gameState.winner) { this._stopNPC(); return; }
    const currentId = this.gameState.currentPlayer?.id;
    const ctrl = this.npcControllers[currentId];
    if (!ctrl) return;

    const state = this.gameState.getStateFor(currentId);
    const action = ctrl.decide(state, currentId);
    if (!action) return;

    const result = this.gameState.handleAction(currentId, action);
    if (result.ok && this._onBroadcast) this._onBroadcast(this);
  }

  handleAction(socketId, action) {
    if (!this.gameState) return { success:false, error:'Kein Spiel!' };
    this.lastActivity = Date.now();
    const result = this.gameState.handleAction(socketId, action);
    if (result.ok && this._onBroadcast) this._onBroadcast(this);
    return { success: result.ok, error: result.error, data: result };
  }

  onBroadcast(cb) { this._onBroadcast = cb; }
  getGameStateFor(socketId) { return this.gameState?.getStateFor(socketId) || null; }
  getLobbyState() {
    return {
      code: this.code,
      players: this.lobbyPlayers.map(p => ({ id:p.id, name:p.name, isHost:p.isHost, isNPC:p.isNPC })),
      started: !!this.gameState,
      hasNPCs: Object.keys(this.npcControllers).length > 0,
    };
  }
  isExpired() { return Date.now() - this.lastActivity > 4*60*60*1000; }
}

module.exports = { GameRoom, NPC_PROFILES };
