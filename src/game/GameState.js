// ═══════════════════════════════════════════════════
// GameState.js — Spielzustands-Engine
// ═══════════════════════════════════════════════════
const { createDoorDeck, createTreasureDeck } = require('../data/cardData');
const { DungeonBoard } = require('./DungeonBoard');
const { CombatSystem } = require('./CombatSystem');

class GameState {
  constructor(players) {
    // players: [{ id: socketId, name: string }]
    this.players     = players.map((p, i) => this._createPlayer(p, i));
    this.doorDeck    = createDoorDeck();
    this.treasureDeck= createTreasureDeck();
    this.doorDiscard = [];
    this.treasureDiscard = [];
    this.board       = new DungeonBoard();
    this.roundNumber = 1;
    this.currentPlayerIndex = 0;
    this.turnPhase   = 'roll_movement'; // Phasen-Automat
    this.combat      = null;            // Aktiver Kampf
    this.winner      = null;
    this.log         = [];

    // Startkarten austeilen
    this.players.forEach(p => {
      for (let i = 0; i < 2; i++) p.hand.push(this._drawDoor());
      for (let i = 0; i < 2; i++) p.hand.push(this._drawTreasure());
    });
  }

  _createPlayer(p, index) {
    const colors = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c'];
    return {
      id:        p.id,
      name:      p.name,
      level:     1,
      x:         0, y: 0,
      color:     colors[index] || '#fff',
      hand:      [],         // Private Handkarten
      equipment: { weapon: null, armor: null, headgear: null, boots: null },
      class:     null,
      race:      null,
      movesLeft: 0,
      activeCurses: [],
      combatBonuses: [],
    };
  }

  get currentPlayer() { return this.players[this.currentPlayerIndex]; }

  _drawDoor()    { return this.doorDeck.length    > 0 ? this.doorDeck.pop()    : null; }
  _drawTreasure(){ return this.treasureDeck.length > 0 ? this.treasureDeck.pop() : null; }

  _addLog(msg) {
    this.log.push({ msg, round: this.roundNumber, ts: Date.now() });
    if (this.log.length > 50) this.log.shift();
  }

  // ── AKTION DISPATCHER ────────────────────────────
  handleAction(socketId, action) {
    const player = this.players.find(p => p.id === socketId);
    if (!player) return { success: false, error: 'Spieler nicht gefunden' };

    const isCurrent = socketId === this.currentPlayer.id;

    switch (action.type) {
      case 'roll_movement':   return this._rollMovement(player, isCurrent);
      case 'move':            return this._move(player, isCurrent, action.x, action.y);
      case 'open_door':       return this._openDoor(player, isCurrent);
      case 'fight':           return this._startFight(player, isCurrent);
      case 'flee':            return this._flee(player, isCurrent);
      case 'help_fight':      return this._helpFight(player, action.targetId);
      case 'hinder':          return this._hinder(player, action.card);
      case 'play_card':       return this._playCard(player, action.cardId, action.targetId);
      case 'end_turn':        return this._endTurn(player, isCurrent);
      case 'sell_items':      return this._sellItems(player, isCurrent, action.cardIds);
      default: return { success: false, error: 'Unbekannte Aktion: ' + action.type };
    }
  }

  // ── BEWEGUNGSWÜRFELN ──────────────────────────────
  _rollMovement(player, isCurrent) {
    if (!isCurrent) return { success: false, error: 'Nicht dein Zug!' };
    if (this.turnPhase !== 'roll_movement') return { success: false, error: `Phase ist "${this.turnPhase}"` };
    const roll = CombatSystem.rollD6();
    player.movesLeft = roll;
    this.turnPhase = 'move';
    this._addLog(`🎲 ${player.name} würfelt ${roll}`);
    return { success: true, roll };
  }

  // ── BEWEGUNG ─────────────────────────────────────
  _move(player, isCurrent, toX, toY) {
    if (!isCurrent) return { success: false, error: 'Nicht dein Zug!' };
    if (this.turnPhase !== 'move') return { success: false, error: 'Jetzt ist keine Bewegung möglich' };
    if (player.movesLeft <= 0) return { success: false, error: 'Keine Bewegungspunkte mehr!' };
    if (!this.board.canMove(player.x, player.y, toX, toY)) return { success: false, error: 'Ungültige Bewegung!' };

    // Neue Kachel aufdecken?
    const fromDir = toX > player.x ? 'E' : toX < player.x ? 'W' : toY > player.y ? 'S' : 'N';
    let tile = this.board.getTile(toX, toY);
    if (!tile) tile = this.board.revealTile(toX, toY, fromDir);

    player.x = toX;
    player.y = toY;
    player.movesLeft--;

    this._addLog(`🏃 ${player.name} → (${toX},${toY}) [${tile.name}]`);

    // Sonderraum-Effekt
    let specialEffect = null;
    if (tile.special) specialEffect = this._applyRoomEffect(player, tile);

    if (player.movesLeft === 0) this.turnPhase = 'open_door';
    return { success: true, tile: { x:toX, y:toY, ...tile }, movesLeft: player.movesLeft, specialEffect };
  }

  _applyRoomEffect(player, tile) {
    switch (tile.special) {
      case 'extra_treasure': {
        const t = this._drawTreasure();
        if (t) { player.hand.push(t); this._addLog(`💰 ${player.name} findet Schatz: ${t.name}`); }
        return { type:'treasure', card: t };
      }
      case 'weapon_bonus':
        player.combatBonuses.push(2);
        this._addLog(`⚔️ ${player.name} bekommt +2 im nächsten Kampf`);
        return { type:'weapon_bonus' };
      case 'draw_door': {
        const d = this._drawDoor();
        if (d) { player.hand.push(d); this._addLog(`📚 ${player.name} zieht Türkarte: ${d.name}`); }
        return { type:'door', card: d };
      }
      case 'heal':
        player.activeCurses = [];
        this._addLog(`⛪ ${player.name} wird geheilt (Flüche weg)`);
        return { type:'heal' };
      case 'throne':
        player._throneBonus = true;
        this._addLog(`👑 ${player.name} bekommt 2 Stufen beim nächsten Sieg`);
        return { type:'throne' };
      case 'curse_removal':
        if (player.activeCurses.length > 0) {
          const removed = player.activeCurses.pop();
          this._addLog(`🕯️ ${player.name} entfernt Fluch: ${removed.name}`);
          return { type:'curse_removed', curse: removed };
        }
        return null;
      default: return null;
    }
  }

  // ── TÜR ÖFFNEN ────────────────────────────────────
  _openDoor(player, isCurrent) {
    if (!isCurrent) return { success: false, error: 'Nicht dein Zug!' };
    if (this.turnPhase !== 'open_door') return { success: false, error: 'Noch nicht Tür-Phase' };

    const card = this._drawDoor();
    if (!card) {
      this.turnPhase = 'end_turn';
      return { success: true, card: null, msg: 'Türstapel leer!' };
    }
    this._addLog(`🚪 ${player.name} öffnet Tür: ${card.name}`);

    if (card.type === 'monster') {
      this.combat = {
        monster: card,
        fighterId: player.id,
        helpers: [],
        hinderers: [],
        enhancers: [],
        roomBonus: player.combatBonuses.reduce((a,b)=>a+b,0),
        resolved: false,
        tileSpecial: this.board.getTile(player.x, player.y)?.special,
      };
      player.combatBonuses = [];
      this.turnPhase = 'combat';
      return { success: true, card, phase: 'combat' };
    }
    if (card.type === 'curse') {
      this._applyCurse(player, card);
      this.turnPhase = 'end_turn';
      return { success: true, card, phase: 'cursed' };
    }
    // Sonstige Karte: auf Hand
    player.hand.push(card);
    this.turnPhase = 'end_turn';
    return { success: true, card, phase: 'loot' };
  }

  _applyCurse(player, curse) {
    player.activeCurses.push(curse);
    switch (curse.effect) {
      case 'lose_level': if (player.level > 1) player.level--; break;
      case 'lose_class': player.class = null; break;
      case 'lose_race':  player.race  = null; break;
      case 'lose_boots': player.equipment.boots = null; break;
      case 'lose_item': {
        const slots = ['weapon','armor','headgear','boots'].filter(s => player.equipment[s]);
        if (slots.length) {
          const best = slots.reduce((a,b) =>
            (player.equipment[a]?.bonus||0) >= (player.equipment[b]?.bonus||0) ? a : b);
          player.equipment[best] = null;
        }
        break;
      }
      case 'lose_cards':
        player.hand = player.hand.slice(0, Math.max(0, player.hand.length - 2));
        break;
    }
    this._addLog(`💀 ${player.name} ist verflucht: ${curse.name}`);
  }

  // ── KAMPF STARTEN ────────────────────────────────
  _startFight(player, isCurrent) {
    if (!isCurrent || !this.combat) return { success: false, error: 'Kein aktiver Kampf' };
    const result = CombatSystem.resolve(
      player, this.combat.monster,
      this.combat.helpers.map(id => this.players.find(p=>p.id===id)).filter(Boolean),
      this.combat.hinderers,
      this.combat.roomBonus,
      this.combat.usedPotions || []
    );
    this.combat.resolved = true;
    this.combat.result = result;

    if (result.playerWins) {
      const lvlUp = player._throneBonus ? 2 : 1;
      player.level += lvlUp;
      player._throneBonus = false;
      this._addLog(`✅ ${player.name} besiegt ${this.combat.monster.name}! Stufe ${player.level}`);
      // Schätze austeilen
      const lootCount = result.loot?.solo || (result.loot?.total || 1);
      for (let i = 0; i < lootCount; i++) {
        const t = this._drawTreasure();
        if (t) player.hand.push(t);
      }
      this._checkWin(player);
    } else {
      this._addLog(`❌ ${player.name} verliert gegen ${this.combat.monster.name}!`);
    }
    this.combat = null;
    this.turnPhase = 'end_turn';
    return { success: true, result };
  }

  // ── FLUCHT ───────────────────────────────────────
  _flee(player, isCurrent) {
    if (!isCurrent || !this.combat) return { success: false, error: 'Kein aktiver Kampf' };
    // Kerker-Spezial: Flucht unmöglich
    if (this.combat.tileSpecial === 'trap') {
      return { success: false, error: '🔒 Im Kerker kann man nicht fliehen!' };
    }
    const flee = CombatSystem.rollFlee(player);
    if (flee.success) {
      this._addLog(`🏃 ${player.name} flieht erfolgreich! (${flee.roll})`);
      this.combat = null;
      this.turnPhase = 'end_turn';
      return { success: true, fled: true, roll: flee.roll };
    } else {
      const monster = this.combat.monster;
      this._applyCurse(player, { name: monster.bad_stuff, effect: 'custom', desc: monster.bad_stuff });
      this._addLog(`😱 ${player.name} flieht nicht (${flee.roll}) — ${monster.bad_stuff}`);
      this.combat = null;
      this.turnPhase = 'end_turn';
      return { success: true, fled: false, roll: flee.roll, badStuff: monster.bad_stuff };
    }
  }

  // ── HELFEN ───────────────────────────────────────
  _helpFight(helper, targetId) {
    if (!this.combat || this.combat.resolved) return { success: false, error: 'Kein aktiver Kampf' };
    if (this.combat.fighterId === helper.id) return { success: false, error: 'Du kämpfst selbst!' };
    if (this.combat.helpers.includes(helper.id)) return { success: false, error: 'Hilfst schon!' };
    this.combat.helpers.push(helper.id);
    this._addLog(`🤝 ${helper.name} hilft ${this.players.find(p=>p.id===targetId)?.name}`);
    return { success: true };
  }

  // ── BEHINDERN ────────────────────────────────────
  _hinder(player, card) {
    if (!this.combat || this.combat.resolved) return { success: false, error: 'Kein aktiver Kampf' };
    if (this.combat.fighterId === player.id) return { success: false, error: 'Dein eigener Kampf!' };
    this.combat.hinderers.push({ level_bonus: 2, from: player.id });
    this._addLog(`😈 ${player.name} behindert!`);
    return { success: true };
  }

  // ── KARTE SPIELEN ────────────────────────────────
  _playCard(player, cardId, targetId) {
    const idx = player.hand.findIndex(c => c.id === cardId || c.uid === cardId);
    if (idx === -1) return { success: false, error: 'Karte nicht auf der Hand!' };
    const card = player.hand[idx];
    player.hand.splice(idx, 1);

    if (card.type === 'equipment') {
      const old = player.equipment[card.slot];
      player.equipment[card.slot] = card;
      if (old) player.hand.push(old); // Alte Ausrüstung zurück auf Hand
      this._addLog(`🛡️ ${player.name} legt an: ${card.name}`);
      return { success: true };
    }
    if (card.type === 'class') { player.class = card; this._addLog(`🧙 ${player.name} wird ${card.name}`); return { success: true }; }
    if (card.type === 'race')  { player.race  = card; this._addLog(`🧝 ${player.name} ist jetzt ${card.name}`); return { success: true }; }
    if (card.type === 'level_up') { player.level++; this._addLog(`⬆️ ${player.name}: Stufe ${player.level}`); this._checkWin(player); return { success: true }; }
    if (card.type === 'potion' && this.combat && !this.combat.resolved) {
      if (!this.combat.usedPotions) this.combat.usedPotions = [];
      this.combat.usedPotions.push(card);
      this._addLog(`🧪 ${player.name} benutzt Trank: ${card.name}`);
      return { success: true };
    }
    // Unbekannte Karte: ablegen
    this.doorDiscard.push(card);
    return { success: true };
  }

  // ── ITEMS VERKAUFEN ──────────────────────────────
  _sellItems(player, isCurrent, cardIds) {
    if (!isCurrent) return { success: false, error: 'Nicht dein Zug!' };
    let gold = 0;
    cardIds.forEach(id => {
      const idx = player.hand.findIndex(c => c.id===id||c.uid===id);
      if (idx !== -1) {
        gold += player.hand[idx].value || 100;
        this.treasureDiscard.push(player.hand.splice(idx,1)[0]);
      }
    });
    const levels = Math.floor(gold / 1000);
    if (levels > 0) {
      player.level += levels;
      this._addLog(`💸 ${player.name} verkauft für ${levels} Stufe(n)`);
      this._checkWin(player);
    }
    return { success: true, gold, levels };
  }

  // ── ZUG BEENDEN ──────────────────────────────────
  _endTurn(player, isCurrent) {
    if (!isCurrent) return { success: false, error: 'Nicht dein Zug!' };
    // Max 5 Handkarten
    while (player.hand.length > 5) {
      this.doorDiscard.push(player.hand.pop());
    }
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    if (this.currentPlayerIndex === 0) this.roundNumber++;
    this.turnPhase = 'roll_movement';
    this.currentPlayer.movesLeft = 0;
    this._addLog(`➡️ Zug: ${this.currentPlayer.name}`);
    return { success: true };
  }

  // ── SIEGBEDINGUNG ────────────────────────────────
  _checkWin(player) {
    if (player.level >= 10) {
      this.winner = player.id;
      this._addLog(`🏆 ${player.name} GEWINNT mit Stufe 10!`);
    }
  }

  // ── SERIALISIERUNG (spieler-spezifisch) ──────────
  getStateFor(socketId) {
    return {
      roundNumber:  this.roundNumber,
      turnPhase:    this.turnPhase,
      currentPlayerId: this.currentPlayer.id,
      board:        this.board.serialize(),
      combat:       this.combat ? {
        monster:    this.combat.monster,
        fighterId:  this.combat.fighterId,
        helpers:    this.combat.helpers,
        hinderers:  this.combat.hinderers.length,
        resolved:   this.combat.resolved,
      } : null,
      players:      this.players.map(p => ({
        id:         p.id,
        name:       p.name,
        level:      p.level,
        x:          p.x, y: p.y,
        color:      p.color,
        equipment:  p.equipment,
        class:      p.class,
        race:       p.race,
        movesLeft:  p.movesLeft,
        handCount:  p.hand.length, // Anderen Spielern: nur Anzahl
      })),
      myHand:       this.players.find(p=>p.id===socketId)?.hand || [],
      winner:       this.winner,
      log:          this.log.slice(-10),
    };
  }
}

module.exports = { GameState };
