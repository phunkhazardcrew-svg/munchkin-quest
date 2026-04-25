// ═══════════════════════════════════════════════════
// GameRoom.js — Raum & Lobby + NPC Dev-Mode
// ═══════════════════════════════════════════════════
const { GameState }     = require('./GameState');
const { NPCController, NPC_PROFILES } = require('./NPCController');

const MAX_PLAYERS  = 6;
const MIN_PLAYERS  = 2;
const ROOM_TTL_MS  = 4 * 60 * 60 * 1000;
const NPC_TICK_MS  = 1500; // NPC-Reaktionszeit (ms)

class GameRoom {
  constructor(code, hostSocketId, hostName) {
    this.code         = code;
    this.lobbyPlayers = [{ id: hostSocketId, name: hostName, ready: false, isHost: true, isNPC: false }];
    this.gameState    = null;
    this.createdAt    = Date.now();
    this.lastActivity = Date.now();
    this.npcControllers = {};   // socketId → NPCController
    this._npcTimer    = null;
    this._onBroadcast = null;   // Callback: (room) => void
  }

  get playerCount() { return this.lobbyPlayers.length; }

  // ── SPIELER HINZUFÜGEN ────────────────────────────
  addPlayer(socketId, name) {
    if (this.gameState)                    return { success: false, error: 'Spiel läuft bereits!' };
    if (this.lobbyPlayers.length >= MAX_PLAYERS) return { success: false, error: 'Raum ist voll!' };
    if (this.lobbyPlayers.find(p => p.id === socketId)) return { success: false, error: 'Bereits im Raum!' };
    this.lobbyPlayers.push({ id: socketId, name, ready: false, isHost: false, isNPC: false });
    this.lastActivity = Date.now();
    return { success: true };
  }

  // ── NPCs HINZUFÜGEN (Dev-Mode) ────────────────────
  addNPCs(count = 3) {
    const profiles = NPC_PROFILES.slice(0, count);
    profiles.forEach(profile => {
      if (this.lobbyPlayers.length >= MAX_PLAYERS) return;
      const controller = new NPCController(profile);
      this.lobbyPlayers.push({
        id:     profile.id,
        name:   `${profile.emoji} ${profile.name}`,
        ready:  true,
        isHost: false,
        isNPC:  true,
      });
      this.npcControllers[profile.id] = controller;
    });
    return { success: true, added: Object.keys(this.npcControllers).length };
  }

  // ── SPIELER ENTFERNEN ─────────────────────────────
  removePlayer(socketId) {
    const idx = this.lobbyPlayers.findIndex(p => p.id === socketId);
    if (idx === -1) return;
    const wasHost = this.lobbyPlayers[idx].isHost;
    this.lobbyPlayers.splice(idx, 1);
    if (wasHost && this.lobbyPlayers.length > 0) {
      this.lobbyPlayers[0].isHost = true;
    }
    // NPC-Timer stoppen wenn alle weg
    if (this.lobbyPlayers.filter(p=>!p.isNPC).length === 0) {
      this._stopNPCTimer();
    }
    this.lastActivity = Date.now();
  }

  // ── SPIEL STARTEN ─────────────────────────────────
  startGame(hostSocketId) {
    if (this.gameState) return { success: false, error: 'Spiel läuft schon!' };
    const host = this.lobbyPlayers.find(p => p.id === hostSocketId);
    if (!host?.isHost) return { success: false, error: 'Nur der Host kann starten!' };
    if (this.lobbyPlayers.length < MIN_PLAYERS) return { success: false, error: `Mindestens ${MIN_PLAYERS} Spieler nötig!` };

    this.gameState = new GameState(
      this.lobbyPlayers.map(p => ({ id: p.id, name: p.name }))
    );
    this.lastActivity = Date.now();

    // NPC-Timer starten wenn NPCs vorhanden
    if (Object.keys(this.npcControllers).length > 0) {
      this._startNPCTimer();
    }
    return { success: true };
  }

  // ── NPC TIMER ─────────────────────────────────────
  _startNPCTimer() {
    this._stopNPCTimer();
    this._npcTimer = setInterval(() => this._tickNPCs(), NPC_TICK_MS);
  }

  _stopNPCTimer() {
    if (this._npcTimer) { clearInterval(this._npcTimer); this._npcTimer = null; }
  }

  _tickNPCs() {
    if (!this.gameState || this.gameState.winner) {
      this._stopNPCTimer();
      return;
    }

    const currentId = this.gameState.currentPlayer?.id;
    const controller = this.npcControllers[currentId];
    if (!controller) return; // Mensch ist dran

    // Kampfphase: Alle NPCs können reagieren (nicht nur aktueller)
    if (this.gameState.turnPhase === 'combat' && this.gameState.combat) {
      this._handleNPCCombatReactions();
      return;
    }

    // Aktion berechnen
    const stateSnapshot = this.gameState.getStateFor(currentId);
    const action = controller.decideAction(stateSnapshot, currentId);
    if (!action) return;

    const result = this.gameState.handleAction(currentId, action);
    if (result.success && this._onBroadcast) {
      this._onBroadcast(this);
    }
  }

  _handleNPCCombatReactions() {
    // Nicht-kämpfende NPCs können helfen/behindern
    Object.entries(this.npcControllers).forEach(([npcId, ctrl]) => {
      if (npcId === this.gameState.combat?.fighterId) return;
      if (!this.gameState.combat || this.gameState.combat.resolved) return;
      const snap = this.gameState.getStateFor(npcId);
      const action = ctrl.decideAction(snap, npcId);
      if (action && ['help_fight','hinder'].includes(action.type)) {
        this.gameState.handleAction(npcId, action);
      }
    });
  }

  // Broadcast-Callback registrieren (vom Server)
  onBroadcast(cb) { this._onBroadcast = cb; }

  // ── AKTION WEITERLEITEN ───────────────────────────
  handleAction(socketId, action) {
    if (!this.gameState) return { success: false, error: 'Kein laufendes Spiel!' };
    this.lastActivity = Date.now();
    const result = this.gameState.handleAction(socketId, action);
    if (result.success && this._onBroadcast) this._onBroadcast(this);
    return result;
  }

  getGameStateFor(socketId) {
    if (!this.gameState) return null;
    return this.gameState.getStateFor(socketId);
  }

  getLobbyState() {
    return {
      code:    this.code,
      players: this.lobbyPlayers.map(p => ({
        id:     p.id,
        name:   p.name,
        isHost: p.isHost,
        isNPC:  p.isNPC,
      })),
      started:  !!this.gameState,
      hasNPCs:  Object.keys(this.npcControllers).length > 0,
    };
  }

  isExpired() { return Date.now() - this.lastActivity > ROOM_TTL_MS; }
}

module.exports = { GameRoom };
