// ═══════════════════════════════════════════════════
// GameRoom.js — Raum & Lobby Verwaltung
// ═══════════════════════════════════════════════════
const { GameState } = require('./GameState');

const MAX_PLAYERS   = 6;
const MIN_PLAYERS   = 2;
const ROOM_TTL_MS   = 4 * 60 * 60 * 1000; // 4 Stunden

class GameRoom {
  constructor(code, hostSocketId, hostName) {
    this.code         = code;
    this.lobbyPlayers = [{ id: hostSocketId, name: hostName, ready: false, isHost: true }];
    this.gameState    = null;
    this.createdAt    = Date.now();
    this.lastActivity = Date.now();
  }

  get playerCount() { return this.lobbyPlayers.length; }

  // ── SPIELER HINZUFÜGEN ───────────────────────────
  addPlayer(socketId, name) {
    if (this.gameState) return { success: false, error: 'Spiel läuft bereits!' };
    if (this.lobbyPlayers.length >= MAX_PLAYERS) return { success: false, error: 'Raum ist voll (max. 6)!' };
    if (this.lobbyPlayers.find(p => p.id === socketId)) return { success: false, error: 'Bereits im Raum!' };
    this.lobbyPlayers.push({ id: socketId, name, ready: false, isHost: false });
    this.lastActivity = Date.now();
    return { success: true };
  }

  // ── SPIELER ENTFERNEN ────────────────────────────
  removePlayer(socketId) {
    const idx = this.lobbyPlayers.findIndex(p => p.id === socketId);
    if (idx === -1) return;
    const wasHost = this.lobbyPlayers[idx].isHost;
    this.lobbyPlayers.splice(idx, 1);
    // Host-Wechsel
    if (wasHost && this.lobbyPlayers.length > 0) {
      this.lobbyPlayers[0].isHost = true;
    }
    this.lastActivity = Date.now();
  }

  // ── SPIEL STARTEN ────────────────────────────────
  startGame(hostSocketId) {
    if (this.gameState) return { success: false, error: 'Spiel läuft schon!' };
    const host = this.lobbyPlayers.find(p => p.id === hostSocketId);
    if (!host?.isHost) return { success: false, error: 'Nur der Host kann starten!' };
    if (this.lobbyPlayers.length < MIN_PLAYERS) return { success: false, error: `Mindestens ${MIN_PLAYERS} Spieler nötig!` };
    this.gameState = new GameState(
      this.lobbyPlayers.map(p => ({ id: p.id, name: p.name }))
    );
    this.lastActivity = Date.now();
    return { success: true };
  }

  // ── AKTION WEITERLEITEN ──────────────────────────
  handleAction(socketId, action) {
    if (!this.gameState) return { success: false, error: 'Kein laufendes Spiel!' };
    this.lastActivity = Date.now();
    return this.gameState.handleAction(socketId, action);
  }

  // ── SPIELZUSTAND FÜR SPIELER ─────────────────────
  getGameStateFor(socketId) {
    if (!this.gameState) return null;
    return this.gameState.getStateFor(socketId);
  }

  // ── LOBBY-ZUSTAND ────────────────────────────────
  getLobbyState() {
    return {
      code:    this.code,
      players: this.lobbyPlayers.map(p => ({
        id:     p.id,
        name:   p.name,
        isHost: p.isHost,
      })),
      started: !!this.gameState,
    };
  }

  // ── RAUM ABGELAUFEN? ─────────────────────────────
  isExpired() {
    return Date.now() - this.lastActivity > ROOM_TTL_MS;
  }
}

module.exports = { GameRoom };
