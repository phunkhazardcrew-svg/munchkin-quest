// ════════════════════════════════════════════════════════════════
// GameState.js — Munchkin Quest 1:1 Regelwerk Implementierung
// Alle Phasen, Kampfsystem mit Würfeln, Sieg via Boss
// ════════════════════════════════════════════════════════════════
const { createMonsterDeck, createTreasureDeck, createDxmDeck } = require('../data/cardData');
const { createTileDeck, getOpposite } = require('../data/tileData');

// W6 würfeln
function d6() { return Math.floor(Math.random() * 6) + 1; }
function rollMultiple(n) {
  const rolls = [];
  for (let i = 0; i < n; i++) rolls.push(d6());
  return rolls;
}

// ── SPIELER ──────────────────────────────────────────────────────
function createPlayer(socketId, name, index) {
  const COLORS = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c'];
  return {
    id:           socketId,
    name:         name,
    color:        COLORS[index] || '#aaa',
    level:        1,
    lifePoints:   4,        // 4 Herzmarker (rote Seite oben = lebendig)
    maxLife:      4,
    movesLeft:    0,        // Bewegungsmarker für diesen Zug (max 3)
    gold:         300,
    hand:         [],       // Handkarten (max 5 am Zugende)
    equipment: {            // Angelegte Ausrüstung
      weapon:   null,
      armor:    null,
      headgear: null,
      boots:    null,
      klunker:  [],         // unbegrenzt viele Klunker
    },
    backpack:     [],       // Rucksack (max 2 Gegenstände)
    class:        null,     // Klassenkarte
    race:         null,     // Rassenkarte
    activeEffects:[],       // Temporäre Effekte (Flüche etc.)
    x: 0, y: 0,            // Position
    alive:        true,
    deathRoom:    null,     // Wo gestorben
    wantsToFight: false,    // Im Kampf
    hasLeveledThisKill: false,
    throneBonus:  false,    // Thronsaal-Bonus aktiv
  };
}

// ── DUNGEON BOARD ────────────────────────────────────────────────
class DungeonBoard {
  constructor() {
    this.tiles = {};        // "x,y" → TileObjekt mit monsters[]
    this.tileDeck = createTileDeck();
    this._placeEntrance();
  }

  _placeEntrance() {
    this.tiles['0,0'] = {
      id:'start', uid:'start_0', name:'Eingangshalle',
      exits:['N','E','S','W'], type:'start', icon:'🚪',
      search:null, special:'entrance',
      rule:'Kein Monster darf hier seinen Zug beenden.',
      color:'#0d2e1e', x:0, y:0,
      monsters: [], searched: false, looted: false,
    };
  }

  getTile(x, y) { return this.tiles[`${x},${y}`] || null; }

  // Neuen Raum aufdecken
  revealTile(x, y, fromDir) {
    if (this.tiles[`${x},${y}`]) return this.tiles[`${x},${y}`];
    const needed = getOpposite(fromDir);
    let tile = null;
    for (let i = 0; i < this.tileDeck.length; i++) {
      if (this.tileDeck[i].exits.includes(needed)) {
        tile = this.tileDeck.splice(i, 1)[0];
        break;
      }
    }
    if (!tile && this.tileDeck.length > 0) tile = this.tileDeck.shift();
    if (!tile) {
      tile = { id:'d_fallback', uid:`dead_${x}_${y}`, name:'Sackgasse',
               exits:[needed], type:'deadend', icon:'🧱', search:1,
               special:null, color:'#0a0a14' };
    }
    this.tiles[`${x},${y}`] = { ...tile, x, y, monsters:[], searched:false, looted:false };
    return this.tiles[`${x},${y}`];
  }

  canMove(fromX, fromY, toX, toY) {
    const dx = toX - fromX, dy = toY - fromY;
    if (Math.abs(dx) + Math.abs(dy) !== 1) return { ok: false, reason: 'Nur 1 Schritt möglich' };
    const dir = dx===1?'E':dx===-1?'W':dy===1?'S':'N';
    const from = this.getTile(fromX, fromY);
    if (!from || !from.exits.includes(dir)) return { ok: false, reason: 'Keine Tür in diese Richtung!' };
    const to = this.getTile(toX, toY);
    if (to) {
      const opp = getOpposite(dir);
      if (!to.exits.includes(opp)) return { ok: false, reason: 'Kein Eingang von dieser Seite!' };
    }
    return { ok: true, dir };
  }

  getExits(x, y) {
    const t = this.getTile(x, y);
    if (!t) return [];
    return t.exits.map(dir => {
      const nx = x + (dir==='E'?1:dir==='W'?-1:0);
      const ny = y + (dir==='N'?-1:dir==='S'?1:0);
      return { dir, x:nx, y:ny, revealed: !!this.tiles[`${nx},${ny}`] };
    });
  }

  addMonsterToTile(x, y, monster) {
    const t = this.getTile(x, y);
    if (t) t.monsters.push(monster);
  }

  removeMonsterFromTile(x, y, monsterId) {
    const t = this.getTile(x, y);
    if (t) t.monsters = t.monsters.filter(m => m.uid !== monsterId);
  }

  serialize() {
    const tiles = {};
    Object.entries(this.tiles).forEach(([k, t]) => {
      tiles[k] = { ...t, monsters: t.monsters.map(m => ({
        uid: m.uid, name: m.name, level: m.level, icon: m.icon, special: m.special
      }))};
    });
    return { tiles, deckSize: this.tileDeck.length };
  }
}

// ── GAME STATE ───────────────────────────────────────────────────
class GameState {
  constructor(playerList) {
    // playerList: [{ id, name }]
    this.players      = playerList.map((p, i) => createPlayer(p.id, p.name, i));
    this.monsterDeck  = createMonsterDeck();
    this.treasureDeck = createTreasureDeck();
    this.dxmDeck      = createDxmDeck();
    this.monsterDiscard  = [];
    this.treasureDiscard = [];
    this.dxmDiscard      = [];
    this.board        = new DungeonBoard();
    this.round        = 1;
    this.currentIdx   = 0;
    this.phase        = 'draw_dxm';   // Zustandsautomat
    this.winner       = null;
    this.bossActive   = false;
    this.bossMonster  = null;
    this.log          = [];
    this.combat       = null;         // Aktiver Kampf
    this.events       = [];           // Animationsereignisse für Client

    // Startkarten austeilen (3 Schatz + 3 DxM = 6)
    this.players.forEach(p => {
      for (let i = 0; i < 3; i++) { const c = this._drawTreasure(); if (c) p.hand.push(c); }
      for (let i = 0; i < 3; i++) { const c = this._drawDxm();     if (c) p.hand.push(c); }
    });

    this._log(`🎲 Munchkin Quest beginnt mit ${this.players.length} Spielern!`);
    this._log(`📜 Phase 1: ${this.currentPlayer.name} zieht eine DxM-Karte`);
  }

  get currentPlayer() { return this.players[this.currentIdx]; }

  // ── ZEICHNEN ─────────────────────────────────────────────────
  _drawMonster() {
    if (this.monsterDeck.length === 0) {
      this.monsterDeck = this._shuffled(this.monsterDiscard);
      this.monsterDiscard = [];
    }
    return this.monsterDeck.pop() || null;
  }
  _drawTreasure() {
    if (this.treasureDeck.length === 0) {
      this.treasureDeck = this._shuffled(this.treasureDiscard);
      this.treasureDiscard = [];
    }
    return this.treasureDeck.pop() || null;
  }
  _drawDxm() {
    if (this.dxmDeck.length === 0) {
      this.dxmDeck = this._shuffled(this.dxmDiscard);
      this.dxmDiscard = [];
    }
    return this.dxmDeck.pop() || null;
  }
  _shuffled(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ── LOG & EVENTS ─────────────────────────────────────────────
  _log(msg) {
    this.log.push({ msg, round: this.round, ts: Date.now() });
    if (this.log.length > 80) this.log.shift();
  }
  _event(type, data) {
    this.events.push({ type, data, ts: Date.now() });
    if (this.events.length > 20) this.events.shift();
  }

  // ── AKTION DISPATCHER ────────────────────────────────────────
  handleAction(socketId, action) {
    const player = this.players.find(p => p.id === socketId);
    if (!player) return { ok: false, error: 'Spieler nicht gefunden' };

    // Karten können immer gespielt werden (Flüche, Verstärker, Stufen-Karten, Rassen/Klassen)
    if (action.type === 'play_card') return this._playCard(player, action.cardId);
    if (action.type === 'discard_for_wizard') return this._wizardDiscard(player, action.cardId);

    const isMyTurn = socketId === this.currentPlayer.id;

    switch (action.type) {
      // ── PHASE: DxM Karte ziehen ───────────────────────────
      case 'draw_dxm':
        if (!isMyTurn || this.phase !== 'draw_dxm') return this._err('Jetzt nicht!');
        return this._phaseDxmDraw();

      // ── PHASE: Bewegen ────────────────────────────────────
      case 'move':
        if (!isMyTurn || this.phase !== 'movement') return this._err('Jetzt nicht!');
        return this._phaseMove(player, action.x, action.y);

      // ── PHASE: Tür öffnen (skip Movement ohne zu bewegen) ─
      case 'skip_to_search':
        if (!isMyTurn || this.phase !== 'movement') return this._err('Jetzt nicht!');
        this.phase = 'end_movement';
        return this._endMovement(player);

      // ── PHASE: Kampf ──────────────────────────────────────
      case 'announce_roll':  // "Ich würfle jetzt" — 2.6 Sek Fenster
        if (!isMyTurn || this.phase !== 'combat') return this._err('Jetzt nicht!');
        return this._announceRoll(player);

      case 'roll_combat':    // Würfeln ausführen (combat + combat_roll Phase)
        if (!isMyTurn) return this._err('Nicht dein Zug!');
        if (this.phase !== 'combat_roll' && this.phase !== 'combat') return this._err('Kein aktiver Kampf!');
        // Auto-announce falls noch nicht gesetzt
        if (this.phase === 'combat' && this.combat) {
          this.combat.announced = true;
          this.phase = 'combat_roll';
        }
        return this._rollCombat(player);

      // ── PHASE: Fliehen ────────────────────────────────────
      case 'flee':
        if (!isMyTurn) return this._err('Nicht dein Zug!');
        if (this.phase !== 'combat' && this.phase !== 'flee') return this._err('Nicht flüchten!');
        return this._flee(player, action.targetTile);

      // ── PHASE: Helfen ─────────────────────────────────────
      case 'help_fight':
        if (this.phase !== 'combat' && this.phase !== 'combat_roll') return this._err('Kein Kampf!');
        return this._helpFight(player, socketId);

      // ── PHASE: Behindern / Rücken fallen ─────────────────
      case 'hinder':
        if (this.phase !== 'combat' && this.phase !== 'combat_roll') return this._err('Kein Kampf!');
        return this._hinder(player, action.bonus || 2);

      // ── PHASE: Milde Gabe ─────────────────────────────────
      case 'charity_done':
        if (!isMyTurn || this.phase !== 'charity') return this._err('Jetzt nicht!');
        return this._endCharity();

      case 'charity_give':
        if (!isMyTurn || this.phase !== 'charity') return this._err('Jetzt nicht!');
        return this._giveCharity(player, action.cardId, action.targetId);

      // ── ITEMS VERKAUFEN ───────────────────────────────────
      case 'sell_items':
        if (!isMyTurn || this.combat) return this._err('Im Kampf nicht möglich!');
        return this._sellItems(player, action.cardIds);

      // ── DEAL MACHEN (Sonderraum) ──────────────────────────
      case 'make_deal':
        if (!isMyTurn || this.phase !== 'movement') return this._err('Jetzt nicht!');
        return this._makeDeal(player, action.dealType);

      // ── RAUM DURCHSUCHEN ──────────────────────────────────
      case 'search_room':
        if (!isMyTurn || this.phase !== 'movement') return this._err('Jetzt nicht!');
        return this._searchRoom(player);

      // ── BOSS KAMPF STARTEN ────────────────────────────────
      case 'fight_boss':
        if (!isMyTurn || !this.bossActive) return this._err('Kein Boss!');
        return this._startBossFight(player);

      default:
        return this._err('Unbekannte Aktion: ' + action.type);
    }
  }

  _err(msg) { return { ok: false, error: msg }; }

  // ══════════════════════════════════════════════════════════════
  // PHASE 1: DxM-KARTE ZIEHEN
  // ══════════════════════════════════════════════════════════════
  _phaseDxmDraw() {
    const p = this.currentPlayer;
    const card = this._drawDxm();
    if (card) {
      p.hand.push(card);
      this._log(`📜 ${p.name} zieht DxM: ${card.name}`);
      this._event('draw_dxm', { playerId: p.id, card: { name: card.name, icon: card.icon } });
    }
    // Bewegungsmarker: Basis 3, -1 pro großem Gegenstand über dem ersten
    const bigCount = this._countBigItems(p);
    const movePenalty = Math.max(0, bigCount - 1); // Erster großer Gegenstand kostenlos
    p.movesLeft = Math.max(1, 3 - movePenalty);
    this.phase = 'movement';
    this._log(`🏃 ${p.name} hat 3 Bewegungsmarker`);
    return { ok: true, card, movesLeft: 3 };
  }

  // ══════════════════════════════════════════════════════════════
  // PHASE 2: SPIELERBEWEGUNG
  // ══════════════════════════════════════════════════════════════
  _phaseMove(player, toX, toY) {
    if (player.movesLeft <= 0) return this._err('Keine Bewegungsmarker mehr!');
    if (this.combat) return this._err('Im Kampf kann man sich nicht bewegen!');

    const moveCheck = this.board.canMove(player.x, player.y, toX, toY);
    if (!moveCheck.ok) return this._err(moveCheck.reason);

    // Verbindungskosten nach Regelwerk:
    // Offener Gang = 1 | Normale Tür = 1 | Verschlossene Tür = 3 | Geheimtür = 3
    const moveCost = this._getConnectionCost(player.x, player.y, toX, toY);
    if (player.movesLeft < moveCost) return this._err(`Zu wenig Bewegungsmarker! (braucht ${moveCost})`);

    const fromDir = moveCheck.dir;
    const isNewTile = !this.board.getTile(toX, toY);

    // Kachel aufdecken falls neu
    let tile = this.board.getTile(toX, toY);
    if (!tile) tile = this.board.revealTile(toX, toY, fromDir);

    player.x = toX;
    player.y = toY;
    player.movesLeft -= moveCost;

    this._log(`🏃 ${player.name} → (${toX},${toY}) [${tile.name}] | ${player.movesLeft}🦶 übrig`);
    this._event('player_move', { playerId: player.id, x: toX, y: toY, tileName: tile.name });

    // Sonderraum-Effekt
    let roomEffect = null;
    if (tile.special && tile.special !== 'entrance') {
      roomEffect = this._applyRoomEffect(player, tile);
    }

    // === Neuer Raum → DxM-Karte + Monster spawnen ===
    if (isNewTile) {
      // DxM-Karte als Erkundungsbonus
      const dxmCard = this._drawDxm();
      if (dxmCard) {
        player.hand.push(dxmCard);
        this._log(`📜 ${player.name} erhält DxM für Erkundung: ${dxmCard.name}`);
      }
      // Monster spawnen
      const monster = this._drawMonster();
      if (monster) {
        const monsterInst = { ...monster, uid: monster.id + '_inst_' + Date.now() };
        this.board.addMonsterToTile(toX, toY, monsterInst);
        this._log(`👹 Monster erscheint: ${monster.name} (Stufe ${monster.level})`);
        this._event('monster_spawn', { monster: monsterInst, x: toX, y: toY });
        // Kampf beginnt sofort!
        return this._initCombat(player, [monsterInst], tile, { roomCard: dxmCard, roomEffect });
      }
    }

    // === Bestehender Raum mit Monster → Kampf ===
    if (tile.monsters && tile.monsters.length > 0) {
      this._log(`⚔️ Monster in ${tile.name}: ${tile.monsters.map(m=>m.name).join(', ')}`);
      return this._initCombat(player, [...tile.monsters], tile);
    }

    // Eingang: Boss-Check
    if (tile.type === 'start' && player.level >= 10 && !this.bossActive) {
      this._spawnBoss(player);
    }

    return { ok: true, tile: { ...tile, x: toX, y: toY }, movesLeft: player.movesLeft, roomEffect };
  }

  _applyRoomEffect(player, tile) {
    switch (tile.special) {
      case 'heal':
        this._log(`⛪ ${player.name} kann hier Lebenspunkte heilen (Deal)`);
        return { type: 'heal_available', tileName: tile.name };
      case 'draw_dxm': {
        const card = this._drawDxm();
        if (card) {
          player.hand.push(card);
          this._log(`📚 ${player.name} zieht extra DxM: ${card.name}`);
          this._event('draw_dxm', { playerId: player.id, card: { name: card.name, icon: card.icon } });
        }
        return { type: 'drew_dxm', card };
      }
      case 'throne':
        player.throneBonus = true;
        this._log(`👑 ${player.name} bekommt Thron-Bonus (nächster Monster-Kill: +2 Stufen)`);
        return { type: 'throne' };
      case 'extra_treasure': {
        const t = this._drawTreasure();
        if (t) { player.hand.push(t); this._log(`💰 ${player.name} findet extra Schatz: ${t.name}`); }
        return { type: 'treasure', card: t };
      }
      default: return null;
    }
  }

  _endMovement(player) {
    player.movesLeft = 0;
    this._beginCharity(player);
    return { ok: true };
  }

  // ══════════════════════════════════════════════════════════════
  // KAMPFSYSTEM
  // ══════════════════════════════════════════════════════════════
  _initCombat(player, monsters, tile) {
    // Kerker = kein Fliehen
    const noFlee = tile.special === 'trap';
    this.combat = {
      fighterId:    player.id,
      monsters:     monsters.map(m => ({ ...m, enhancers: [] })),
      helpers:      [],      // [{ id, name, level, equipment, class, race }]
      hinderers:    [],      // [{ level_bonus }]
      usedPotions:  [],
      roomBonus:    this._calcRoomBonus(player, tile),
      roomMalus:    this._calcRoomMalus(player, tile),
      noFlee:       noFlee,
      tile:         { x: tile.x, y: tile.y, special: tile.special },
      announced:    false,
      playerRolls:  null,
      monsterRolls: null,
      resolved:     false,
      tileSpecial:  tile.special,
    };
    this.phase = 'combat';
    this._log(`⚔️ Kampf: ${player.name} vs ${monsters.map(m=>m.name).join(' + ')}`);
    this._event('combat_start', {
      fighterId: player.id,
      monsters: this.combat.monsters,
      playerStrength: this._calcPlayerStr(player),
    });
    return { ok: true, combat: this._getCombatState() };
  }

  _calcRoomBonus(player, tile) {
    // TODO: Raumsymbole (Krieger, Zauberer etc.)
    if (tile.special === 'armory' && player.class?.ability === 'warrior') return 2;
    return 0;
  }
  _calcRoomMalus(player, tile) { return 0; }

  _calcPlayerStr(player, includeHelpers = false) {
    let str = player.level;
    if (player.class?.bonus_combat) str += player.class.bonus_combat;
    Object.values(player.equipment).forEach(item => {
      if (Array.isArray(item)) item.forEach(k => { if (k?.bonus) str += k.bonus; });
      else if (item?.bonus) str += item.bonus;
    });
    // Aktive Effekte
    player.activeEffects.forEach(e => {
      if (e.type === 'minus2_fight') str -= 2;
    });
    if (includeHelpers && this.combat) {
      this.combat.helpers.forEach(h => {
        str += h.level || 1;
        if (h.class?.bonus_combat) str += h.class.bonus_combat;
        Object.values(h.equipment || {}).forEach(item => {
          if (Array.isArray(item)) item.forEach(k => { if (k?.bonus) str += k.bonus; });
          else if (item?.bonus) str += item.bonus;
        });
      });
    }
    return Math.max(0, str);
  }

  _calcMonsterStr(monster) {
    let str = monster.level;
    if (monster.enhancers) monster.enhancers.forEach(e => { str += e.level_bonus || 0; });
    if (this.combat) this.combat.hinderers.forEach(h => { str += h.level_bonus || 2; });
    return Math.max(1, str);
  }

  // Spieler kündigt Würfeln an — 2.6 Sek Fenster für andere
  _announceRoll(player) {
    if (!this.combat || this.combat.fighterId !== player.id) return this._err('Du bist nicht der Kämpfer!');
    if (this.combat.announced) return this._err('Bereits angekündigt!');
    this.combat.announced = true;
    this.phase = 'combat_roll'; // Jetzt können andere noch Karten spielen, dann roll_combat
    this._log(`🎲 ${player.name}: "Ich würfle jetzt!" (2,6 Sek Fenster...)`);
    this._event('combat_announce', { fighterId: player.id });
    return { ok: true };
  }

  // Würfeln ausführen
  _rollCombat(player) {
    if (!this.combat || this.combat.fighterId !== player.id) return this._err('Nicht dein Kampf!');

    const pBase = this._calcPlayerStr(player, true);
    const pRoll = d6(); // Spieler würfelt 1 W6
    const helperRolls = this.combat.helpers.map(() => d6()); // Helfer auch je 1 W6
    let potionBonus = 0;
    this.combat.usedPotions.forEach(po => { potionBonus += po.bonus || 0; });
    const pTotal = pBase + pRoll + helperRolls.reduce((a,b) => a+b, 0)
                 + this.combat.roomBonus - this.combat.roomMalus + potionBonus;

    // Monster würfeln
    const monsterResults = this.combat.monsters.map(m => {
      const mBase = this._calcMonsterStr(m);
      const mRolls = rollMultiple(m.dice || 1);
      const mTotal = mBase + mRolls.reduce((a,b) => a+b, 0);
      return { monster: m, base: mBase, rolls: mRolls, total: mTotal };
    });
    const mTotal = monsterResults.reduce((a, r) => a + r.total, 0);

    this.combat.playerRolls = { base: pBase, roll: pRoll, helperRolls, potionBonus, total: pTotal };
    this.combat.monsterRolls = monsterResults;

    const playerWins = pTotal > mTotal; // Strikt größer (Unentschieden = Monster gewinnt, außer Krieger)
    const isWarrior = player.class?.ability === 'warrior';
    const finalWin = playerWins || (isWarrior && pTotal === mTotal);

    this._log(`🎲 ${player.name}: ${pBase}+${pRoll}=${pTotal} vs Monster: ${mTotal} → ${finalWin ? '✅ SIEG!' : '❌ Niederlage!'}`);
    this._event('combat_roll', {
      playerRolls: this.combat.playerRolls,
      monsterRolls: monsterResults,
      playerTotal: pTotal,
      monsterTotal: mTotal,
      playerWins: finalWin,
    });

    this.combat.resolved = true;

    if (finalWin) {
      return this._combatWin(player);
    } else {
      return this._combatLose(player);
    }
  }

  _combatWin(player) {
    const monsters = this.combat.monsters;
    const lvlUp = (player.throneBonus ? 2 : 1) +
                  (monsters.some(m => m.fearsome) && this.combat.helpers.length === 0 ? 1 : 0);
    // Elf-Helfer steigt auch 1 Stufe auf
    this.combat.helpers.forEach(h => {
      const helperPlayer = this.players.find(p => p.id === h.id);
      if (helperPlayer && helperPlayer.race?.ability === 'elf') {
        this._gainLevel(helperPlayer, 1, false);
        this._log(`🧝 ${helperPlayer.name} (Elf) steigt 1 Stufe auf!`);
      }
    });

    player.throneBonus = false;
    this._gainLevel(player, lvlUp, true); // true = kann Stufe 10 durch Monster erreichen

    // Schätze
    let totalTreasures = monsters.reduce((a, m) => {
      const bonus = m.enhancers ? m.enhancers.reduce((x,e) => x+(e.treasure_bonus||0), 0) : 0;
      return a + Math.max(0, (m.treasures || 1) + bonus);
    }, 0);

    const loot = [];
    for (let i = 0; i < totalTreasures; i++) {
      const t = this._drawTreasure();
      if (t) { player.hand.push(t); loot.push(t); }
    }

    this._log(`💰 ${player.name} erhält ${loot.length} Schätze!`);
    this._event('combat_win', { playerId: player.id, level: player.level, loot });

    // Monster vom Board entfernen
    monsters.forEach(m => {
      this.board.removeMonsterFromTile(this.combat.tile.x, this.combat.tile.y, m.uid);
      this.monsterDiscard.push(m);
    });

    // Effekte löschen nach Kampf
    player.activeEffects = player.activeEffects.filter(e => e.type !== 'minus2_fight');

    this.combat = null;
    // Weiterbewegen falls noch Marker
    if (player.movesLeft > 0) {
      this.phase = 'movement';
    } else {
      this._beginCharity(player);
    }

    // Boss-Check: Stufe 10?
    if (player.level >= 10 && !this.bossActive) {
      this._log(`🏆 ${player.name} erreicht Stufe 10! Zurück zum Eingang — Boss erwartet dich!`);
      this._event('reached_level_10', { playerId: player.id });
    }

    return { ok: true, won: true, level: player.level, loot, movesLeft: player.movesLeft };
  }

  _combatLose(player) {
    this._log(`💀 ${player.name} verliert den Kampf!`);
    this._event('combat_lose', { playerId: player.id });
    // Alle am Kampf nehmen 1 Treffer pro Monster
    const hitCount = this.combat.monsters.length;
    [player, ...this.combat.helpers.map(h => this.players.find(p=>p.id===h.id)).filter(Boolean)]
      .forEach(p => { this._takeHit(p, hitCount); });
    // Nicht getötet = fliehen; getötet = Respawn
    if (player.alive) {
      this.phase = 'flee';
      this._log(`💨 ${player.name} muss fliehen!`);
      this._event('must_flee', { playerId: player.id });
      return { ok: true, won: false, mustFlee: true };
    } else {
      this.combat = null;
      this._beginCharity(player);
      return { ok: true, won: false, died: true };
    }
  }

  _flee(player, toX, toY) {
    if (!this.combat) return this._err('Kein aktiver Kampf!');
    if (this.combat.noFlee) {
      this._log(`🔒 ${player.name} kann im Kerker nicht fliehen!`);
      return this._err('Im Kerker kann man nicht fliehen!');
    }

    // Halbling = automatisch erfolgreich
    const isHalfling = player.race?.ability === 'halfling';
    let roll = d6();
    let needed = 5;
    if (player.class?.ability === 'warrior') needed = 4; // Krieger: 4+
    const success = isHalfling || roll >= needed;

    this._log(`🏃 ${player.name} flieht: ${isHalfling ? 'HALBLING (auto)' : `W6=${roll} (braucht ${needed}+)`} → ${success ? 'Entkommen!' : 'Gefangen!'}`);
    this._event('flee_roll', { playerId: player.id, roll, needed, success, isHalfling });

    if (!success) {
      // Schlimme Dinge!
      const monsters = this.combat.monsters;
      monsters.forEach(m => this._applyBadStuff(player, m));
    }

    // Spieler bewegen (falls Ziel valide)
    if (toX !== undefined && toY !== undefined && success) {
      player.x = toX;
      player.y = toY;
    } else if (!success && toX !== undefined) {
      player.x = toX; // Auch bei Misserfolg bewegt man sich in den Raum
      player.y = toY;
    }

    // Monster bleiben auf dem Feld
    this.combat = null;
    if (player.movesLeft > 0) {
      this.phase = 'movement';
    } else {
      this._beginCharity(player);
    }

    return { ok: true, success, roll, movesLeft: player.movesLeft };
  }

  _applyBadStuff(player, monster) {
    this._log(`😱 ${player.name} erleidet: ${monster.bad_stuff}`);
    this._event('bad_stuff', { playerId: player.id, badStuff: monster.bad_stuff, monsterName: monster.name });
    const bs = (monster.bad_stuff || '').toLowerCase();
    if (bs.includes('stufe')) {
      const n = bs.includes('2') ? 2 : bs.includes('3') ? 3 : 1;
      for (let i = 0; i < n; i++) this._loseLevel(player);
    }
    if (bs.includes('klasse')) player.class = null;
    if (bs.includes('rasse')) player.race = null;
    if (bs.includes('stiefel')) player.equipment.boots = null;
    if (bs.includes('kopfbedeckung') || bs.includes('helm')) player.equipment.headgear = null;
    if (bs.includes('rüstung')) player.equipment.armor = null;
    if (bs.includes('schatz')) {
      const t = player.hand.find(c => c.type === 'equipment');
      if (t) { player.hand = player.hand.filter(c => c.uid !== t.uid); this.treasureDiscard.push(t); }
    }
    if (bs.includes('alle stufen')) player.level = 1;
    if (bs.includes('lebenspunkt') || bs.includes('treffer')) this._takeHit(player, 1);
  }

  // ── HELFEN ───────────────────────────────────────────────────
  _helpFight(helper, helperId) {
    if (!this.combat || this.combat.resolved) return this._err('Kein aktiver Kampf!');
    if (this.combat.fighterId === helperId) return this._err('Du bist der Kämpfer!');
    if (this.combat.helpers.find(h => h.id === helperId)) return this._err('Du hilfst bereits!');
    if (this.combat.helpers.length >= 1) return this._err('Nur 1 Helfer erlaubt!');

    // Prüfen: benachbarter Raum?
    const fighter = this.players.find(p => p.id === this.combat.fighterId);
    const hDist = Math.abs(helper.x - fighter.x) + Math.abs(helper.y - fighter.y);
    if (hDist > 1) return this._err('Helfer muss im selben oder benachbarten Raum sein!');

    this.combat.helpers.push({
      id:        helper.id,
      name:      helper.name,
      level:     helper.level,
      equipment: helper.equipment,
      class:     helper.class,
      race:      helper.race,
    });
    // Helfer bewegt sich in den Raum
    helper.x = fighter.x;
    helper.y = fighter.y;
    this._log(`🤝 ${helper.name} hilft ${fighter.name} im Kampf!`);
    this._event('helper_joins', { helperId: helper.id, helperName: helper.name });
    return { ok: true, helpers: this.combat.helpers };
  }

  // ── BEHINDERN (In den Rücken fallen) ─────────────────────────
  _hinder(player, bonusForMonster) {
    if (!this.combat) return this._err('Kein aktiver Kampf!');
    if (this.combat.fighterId === player.id) return this._err('Kein Rückenfall in eigenen Kampf!');
    this.combat.hinderers.push({ level_bonus: bonusForMonster, from: player.id });
    this._log(`😈 ${player.name} behindert! Monster +${bonusForMonster}`);
    this._event('hinderer_joins', { hindererName: player.name, bonus: bonusForMonster });
    return { ok: true };
  }

  // ── KARTE SPIELEN ─────────────────────────────────────────────
  _playCard(player, cardId) {
    const idx = player.hand.findIndex(c => c.id === cardId || c.uid === cardId);
    if (idx === -1) return this._err('Karte nicht auf der Hand!');
    const card = player.hand[idx];

    // Flüche können auf jeden Spieler gespielt werden (Ziel via action.targetId)
    if (card.type === 'curse') {
      player.hand.splice(idx, 1);
      this._applyCurse(player, card);
      this.dxmDiscard.push(card);
      return { ok: true };
    }
    if (card.type === 'class') {
      player.hand.splice(idx, 1);
      if (player.class) this.dxmDiscard.push(player.class);
      player.class = card;
      this._log(`🧙 ${player.name} wird ${card.name}`);
      this._event('class_change', { playerId: player.id, className: card.name, icon: card.icon });
      return { ok: true };
    }
    if (card.type === 'race') {
      player.hand.splice(idx, 1);
      if (player.race) this.dxmDiscard.push(player.race);
      player.race = card;
      this._log(`🧝 ${player.name} ist jetzt ${card.name}`);
      this._event('race_change', { playerId: player.id, raceName: card.name });
      return { ok: true };
    }
    if (card.type === 'level_up') {
      player.hand.splice(idx, 1);
      this._gainLevel(player, 1, false);
      this.dxmDiscard.push(card);
      return { ok: true };
    }
    if (card.type === 'equipment') {
      player.hand.splice(idx, 1);
      this._equip(player, card);
      return { ok: true };
    }
    if (card.type === 'potion' && this.combat && !this.combat.resolved) {
      player.hand.splice(idx, 1);
      this.combat.usedPotions.push(card);
      this._log(`🧪 ${player.name} benutzt ${card.name} (+${card.bonus})`);
      this._event('potion_used', { playerId: player.id, potion: card });
      this.treasureDiscard.push(card);
      return { ok: true };
    }
    if (card.type === 'enhancer' && this.combat) {
      player.hand.splice(idx, 1);
      // Ersten Monster verstärken
      if (this.combat.monsters.length > 0) {
        this.combat.monsters[0].enhancers.push(card);
        this._log(`🔺 ${player.name} spielt ${card.name} auf ${this.combat.monsters[0].name}`);
        this._event('enhancer_played', { enhancer: card, monster: this.combat.monsters[0] });
      }
      this.dxmDiscard.push(card);
      return { ok: true };
    }
    if (card.type === 'wandering_monster' && this.combat) {
      player.hand.splice(idx, 1);
      const m = this._drawMonster();
      if (m) {
        this.combat.monsters.push({ ...m, uid: m.id + '_wander_' + Date.now(), enhancers: [] });
        this._log(`🚶 Wanderndes Monster: ${m.name} betritt den Kampf!`);
        this._event('monster_joined', { monster: m });
      }
      this.dxmDiscard.push(card);
      return { ok: true };
    }
    return this._err('Karte kann jetzt nicht gespielt werden: ' + card.type);
  }

  _equip(player, card) {
    const slot = card.slot;
    if (slot === 'klunker') {
      player.equipment.klunker.push(card);
      this._log(`💎 ${player.name} trägt jetzt ${card.name}`);
      return;
    }
    const old = player.equipment[slot];
    player.equipment[slot] = card;
    if (old) {
      player.hand.push(old); // Alte Ausrüstung zurück auf Hand
      this._log(`🔄 ${player.name}: ${old.name} abgelegt, ${card.name} angelegt`);
    } else {
      this._log(`🛡️ ${player.name} legt an: ${card.name} (+${card.bonus})`);
    }
    this._event('item_equipped', { playerId: player.id, item: card });
  }

  // ── ZAUBERER: KARTE ABWERFEN FÜR +3 ─────────────────────────
  _wizardDiscard(player, cardId) {
    if (player.class?.ability !== 'wizard') return this._err('Nur Zauberer können das!');
    if (!this.combat) return this._err('Nur im Kampf!');
    const idx = player.hand.findIndex(c => c.id === cardId || c.uid === cardId);
    if (idx === -1) return this._err('Karte nicht gefunden!');
    const card = player.hand.splice(idx, 1)[0];
    if (!this.combat.usedPotions) this.combat.usedPotions = [];
    this.combat.usedPotions.push({ bonus: 3, name: 'Zauberer-Abwurf', uid: 'wiz_' + Date.now() });
    this.dxmDiscard.push(card);
    this._log(`🧙 ${player.name} wirft ${card.name} ab für +3!`);
    return { ok: true };
  }

  // ── FLUCH ANWENDEN ────────────────────────────────────────────
  _applyCurse(player, curse) {
    this._log(`💀 ${player.name} ist verflucht: ${curse.name}`);
    this._event('curse', { playerId: player.id, curse });
    switch (curse.effect) {
      case 'lose_class':     player.class = null; break;
      case 'lose_race':      player.race  = null; break;
      case 'lose_boots':     player.equipment.boots = null; break;
      case 'lose_armor':     player.equipment.armor = null; break;
      case 'lose_headgear':  player.equipment.headgear = null; break;
      case 'lose_level':     this._loseLevel(player); break;
      case 'lose_2_cards':
        for (let i = 0; i < 2 && player.hand.length > 0; i++) {
          this.dxmDiscard.push(player.hand.pop());
        }
        break;
      case 'lose_best_item': {
        const slots = ['weapon','armor','headgear','boots'];
        let best = null, bestSlot = null;
        slots.forEach(s => {
          const it = player.equipment[s];
          if (it && (!best || (it.bonus || 0) > (best.bonus || 0))) { best = it; bestSlot = s; }
        });
        if (best) { player.equipment[bestSlot] = null; this.treasureDiscard.push(best); }
        break;
      }
      case 'minus2_fight':
        player.activeEffects.push({ type: 'minus2_fight', duration: 1 });
        break;
    }
  }

  // ── RAUM DURCHSUCHEN ─────────────────────────────────────────
  _searchRoom(player) {
    const tile = this.board.getTile(player.x, player.y);
    if (!tile) return this._err('Ungültiger Raum!');
    if (tile.search === null) return this._err('Kein Durchsuchen möglich hier!');
    if (tile.monsters && tile.monsters.length > 0) return this._err('Raum mit Monster nicht durchsuchbar!');
    if (player.movesLeft <= 0) return this._err('Keine Bewegungsmarker!');

    player.movesLeft--;
    const bonus = tile.search || 0;
    const roll = d6() + bonus;

    this._log(`🔍 ${player.name} durchsucht ${tile.name}: W6=${roll-bonus}${bonus!==0?`+${bonus}`:''}=${roll}`);
    this._event('search_roll', { playerId: player.id, roll, bonus, tileName: tile.name });

    let result = { ok: true, roll };

    if (roll <= 1) {
      // Monster!
      const m = this._drawMonster();
      if (m) {
        const inst = { ...m, uid: m.id + '_search_' + Date.now() };
        this.board.addMonsterToTile(player.x, player.y, inst);
        this._log(`👹 Beim Durchsuchen: Monster! ${m.name}`);
        const combat = this._initCombat(player, [inst], tile);
        return { ...result, monster: m, ...combat };
      }
    } else if (roll <= 4) {
      const gold = roll <= 2 ? 300 : roll <= 3 ? 400 : 500;
      player.gold += gold;
      this._log(`💰 ${player.name} findet ${gold} Gold!`);
      result.gold = gold;
    } else if (roll <= 6) {
      const gold = roll === 5 ? 100 : 300;
      player.gold += gold;
      const t = this._drawTreasure();
      if (t) { player.hand.push(t); result.treasure = t; }
      tile.searched = true;
      result.gold = gold;
      result.status = 'searched';
    } else if (roll === 7) {
      const m = this._drawMonster();
      if (m) {
        const inst = { ...m, uid: m.id + '_s7_' + Date.now() };
        this.board.addMonsterToTile(player.x, player.y, inst);
        return { ...result, monster: m, ...(this._initCombat(player, [inst], tile)) };
      }
    } else if (roll <= 10) {
      const gold = roll === 8 ? 500 : 0;
      if (gold) player.gold += gold;
      const count = roll >= 9 ? 2 : 1;
      const treasures = [];
      for (let i = 0; i < count; i++) {
        const t = this._drawTreasure();
        if (t) { player.hand.push(t); treasures.push(t); }
      }
      tile.searched = true;
      if (roll >= 9) tile.looted = true;
      result.gold = gold;
      result.treasures = treasures;
      result.status = roll >= 9 ? 'looted' : 'searched';
    } else {
      // 11+: 3 Schatzkarten, Ausgeplündert
      const treasures = [];
      for (let i = 0; i < 3; i++) {
        const t = this._drawTreasure();
        if (t) { player.hand.push(t); treasures.push(t); }
      }
      tile.looted = true;
      result.treasures = treasures;
      result.status = 'looted';
    }

    return result;
  }

  // ── DEAL MACHEN ───────────────────────────────────────────────
  _makeDeal(player, dealType) {
    const tile = this.board.getTile(player.x, player.y);
    if (!tile) return this._err('Kein Raum!');
    if (tile.monsters && tile.monsters.length > 0) return this._err('Kein Deal mit Monster im Raum!');
    if (player.movesLeft <= 0) return this._err('Kostet 1 Bewegungsmarker!');
    player.movesLeft--;

    switch (dealType) {
      case 'heal':
        if (tile.special !== 'heal') return this._err('Kein Heilungs-Deal hier!');
        if (player.gold < 500) return this._err('500 Gold nötig!');
        if (player.lifePoints >= player.maxLife) return this._err('Volle Lebenspunkte!');
        player.gold -= 500;
        player.lifePoints = Math.min(player.maxLife, player.lifePoints + 1);
        this._log(`⛪ ${player.name} heilt 1 LP (500 Gold)`);
        return { ok: true };
      case 'draw_dxm':
        if (tile.type !== 'tavern' && tile.special !== 'draw_dxm') return this._err('Kein DxM-Deal hier!');
        const c = this._drawDxm();
        if (c) { player.hand.push(c); this._log(`🍺 ${player.name} zieht DxM in Taverne: ${c.name}`); }
        return { ok: true, card: c };
      default:
        return this._err('Unbekannter Deal: ' + dealType);
    }
  }

  // ── ITEMS VERKAUFEN ───────────────────────────────────────────
  _sellItems(player, cardIds) {
    if (this.phase === 'combat') return this._err('Im Kampf nicht möglich!');
    let total = 0;
    cardIds.forEach(id => {
      const idx = player.hand.findIndex(c => c.id===id || c.uid===id);
      if (idx !== -1 && player.hand[idx].value) {
        total += player.hand[idx].value;
        this.treasureDiscard.push(player.hand.splice(idx, 1)[0]);
      }
    });
    const levels = Math.floor(total / 1000);
    if (levels > 0 && player.level < 9) { // Nicht für Stufe 10!
      this._gainLevel(player, levels, false);
      this._log(`💸 ${player.name} verkauft für ${levels} Stufe(n) (${total} Gold)`);
    } else {
      player.gold += total;
      this._log(`💸 ${player.name} verkauft für ${total} Gold`);
    }
    return { ok: true, total, levels };
  }

  // ── MILDE GABE (CHARITY) ─────────────────────────────────────
  _beginCharity(player) {
    if (player.hand.length > 5) {
      this.phase = 'charity';
      this._log(`🃏 ${player.name} hat ${player.hand.length} Karten → Milde Gabe!`);
    } else {
      this._endCharity();
    }
  }

  _giveCharity(player, cardId, targetId) {
    const idx = player.hand.findIndex(c => c.id===cardId || c.uid===cardId);
    if (idx === -1) return this._err('Karte nicht gefunden!');
    const target = this.players.find(p => p.id === targetId);
    if (!target) return this._err('Zielspieler nicht gefunden!');
    const lowestLevel = Math.min(...this.players.map(p => p.level));
    if (target.level > lowestLevel) return this._err('Nur an niedrigsten Spieler geben!');
    const card = player.hand.splice(idx, 1)[0];
    target.hand.push(card);
    this._log(`🎁 ${player.name} gibt ${card.name} → ${target.name}`);
    if (player.hand.length <= 5) return this._endCharity();
    return { ok: true, handCount: player.hand.length };
  }

  _endCharity() {
    const player = this.currentPlayer;
    // Überschuss einfach ablegen
    while (player.hand.length > 5) {
      const c = player.hand.pop();
      (c.type === 'equipment' || c.type === 'potion' || c.type === 'level_up' ? this.treasureDiscard : this.dxmDiscard).push(c);
    }
    this._nextPlayer();
    return { ok: true };
  }

  // ── NÄCHSTER SPIELER ─────────────────────────────────────────
  _nextPlayer() {
    // TODO: Monsterzug (vereinfacht — Monster bewegen sich auf dem Server)
    this._log(`🎲 Monsterzug...`);
    this._doMonsterTurn();

    this.currentIdx = (this.currentIdx + 1) % this.players.length;
    if (this.currentIdx === 0) this.round++;

    const next = this.currentPlayer;
    // Toter Spieler: nächste Runde Eingang
    if (!next.alive) {
      next.alive = true;
      next.lifePoints = next.maxLife;
      next.x = 0; next.y = 0;
      next.gold = 300;
      const cards = [];
      for (let i = 0; i < 2; i++) { const c = this._drawTreasure(); if (c) { next.hand.push(c); cards.push(c); } }
      for (let i = 0; i < 2; i++) { const c = this._drawDxm();      if (c) { next.hand.push(c); cards.push(c); } }
      this._log(`💀→🧟 ${next.name} kehrt zurück (Eingang, 300 Gold, 4 Karten)`);
      this._event('player_respawn', { playerId: next.id, cards });
    }

    this.phase = 'draw_dxm';
    this._log(`📜 ${next.name} ist dran (Runde ${this.round})`);
    this._event('next_turn', { playerId: next.id, round: this.round });
  }

  // ── MONSTERZUG (vereinfacht) ──────────────────────────────────
  _doMonsterTurn() {
    // Würfel-Farbe (vereinfacht: zufällig N/S/E/W)
    const dirs = ['N','S','E','W'];
    const moveDir = dirs[Math.floor(Math.random() * dirs.length)];
    // Alle Monster bewegen (vereinfacht: random 1 Schritt)
    const monsterMoves = [];
    Object.values(this.board.tiles).forEach(tile => {
      if (!tile.monsters) return;
      tile.monsters.forEach(monster => {
        const nx = tile.x + (moveDir==='E'?1:moveDir==='W'?-1:0);
        const ny = tile.y + (moveDir==='N'?-1:moveDir==='S'?1:0);
        const target = this.board.getTile(nx, ny);
        if (!target) return;
        const opp = getOpposite(moveDir);
        if (!tile.exits?.includes(moveDir) || !target.exits?.includes(opp)) return;
        // Eingang: Monster geht durch (Regelwerk)
        if (target.type === 'start') return;
        monsterMoves.push({ monster, fromX: tile.x, fromY: tile.y, toX: nx, toY: ny });
      });
    });
    monsterMoves.forEach(mv => {
      this.board.removeMonsterFromTile(mv.fromX, mv.fromY, mv.monster.uid);
      this.board.addMonsterToTile(mv.toX, mv.toY, mv.monster);
    });
    if (monsterMoves.length > 0) {
      this._event('monster_move', { moves: monsterMoves });
    }
  }

  // ── BOSS KAMPF ────────────────────────────────────────────────
  _spawnBoss(player) {
    const baseMonster = this._drawMonster() || { id:'boss', name:'Unbekannter Boss', icon:'👹', dice:2, bad_stuff:'Verliere 2 Stufen', special:null };
    this.bossMonster = {
      ...baseMonster,
      uid:      'boss_' + Date.now(),
      level:    20, // IMMER Stufe 20!
      fearsome: true,
      treasures:5,
      dice:     3,
      isBoss:   true,
    };
    this.bossActive = true;
    this.board.addMonsterToTile(0, 0, this.bossMonster);
    this._log(`⚡ BOSS erscheint in der Eingangshalle: ${this.bossMonster.name} (Stufe 20)!`);
    this._event('boss_spawn', { boss: this.bossMonster });
  }

  _startBossFight(player) {
    if (!this.bossActive || !this.bossMonster) return this._err('Kein Boss aktiv!');
    if (player.level < 10) return this._err('Nur Stufe-10-Spieler können den Boss bekämpfen!');
    const tile = this.board.getTile(0, 0);
    return this._initCombat(player, [this.bossMonster], tile || { x:0, y:0, exits:[], special:'entrance' });
  }

  // ── STUFEN ────────────────────────────────────────────────────
  _gainLevel(player, n, byMonster) {
    for (let i = 0; i < n; i++) {
      if (!byMonster && player.level >= 9) { this._log(`⚠️ Stufe 10 nur durch Monster-Kill!`); break; }
      if (player.level >= 10) { this._checkBossWin(player); break; }
      player.level = Math.min(10, player.level + 1);
    }
    this._log(`⬆️ ${player.name}: Stufe ${player.level}`);
    this._event('level_up', { playerId: player.id, level: player.level, byMonster });
    // Siegbedingung nach Boss
    if (player.level >= 10 && byMonster && this.bossActive) {
      const tile = this.board.getTile(player.x, player.y);
      if (tile?.type === 'start') this._checkBossWin(player);
    }
  }

  _checkBossWin(player) {
    if (this.bossMonster && this.board.getTile(0,0)?.monsters?.find(m=>m.isBoss)) return; // Boss noch lebendig
    if (player.level >= 10 && !this.bossActive) return; // Kein Boss gespawnt
    // Boss besiegt → Gewinn!
    this.winner = player.id;
    this._log(`🏆 ${player.name} GEWINNT! Boss besiegt, Dungeon bezwungen!`);
    this._event('game_won', { winnerId: player.id, winnerName: player.name });
  }

  _loseLevel(player) {
    if (player.level > 1) {
      player.level--;
      this._log(`⬇️ ${player.name}: Stufe ${player.level}`);
    }
  }

  _takeHit(player, n = 1) {
    player.lifePoints = Math.max(0, player.lifePoints - n);
    this._log(`💔 ${player.name}: ${player.lifePoints}/${player.maxLife} LP`);
    this._event('take_hit', { playerId: player.id, lifePoints: player.lifePoints });
    if (player.lifePoints <= 0) this._die(player);
  }

  _die(player) {
    player.alive = false;
    player.lifePoints = 0;
    const itemsDrop = [];
    // Gegenstände fallen lassen
    ['weapon','armor','headgear','boots'].forEach(slot => {
      if (player.equipment[slot]) {
        itemsDrop.push(player.equipment[slot]);
        this.board.getTile(player.x, player.y)?.monsters; // Drop on tile
        player.equipment[slot] = null;
      }
    });
    player.gold = 0;
    player.hand = [];
    this._loseLevel(player);
    this._log(`💀 ${player.name} STIRBT! Kommt nächste Runde in der Eingangshalle zurück.`);
    this._event('player_death', { playerId: player.id, x: player.x, y: player.y, items: itemsDrop });
  }

  // ── COMBAT STATE ────────────────────────────────────────────
  _getCombatState() {
    if (!this.combat) return null;
    return {
      fighterId:   this.combat.fighterId,
      monsters:    this.combat.monsters,
      helpers:     this.combat.helpers,
      hinderers:   this.combat.hinderers.length,
      usedPotions: this.combat.usedPotions,
      noFlee:      this.combat.noFlee,
      announced:   this.combat.announced,
      resolved:    this.combat.resolved,
      playerRolls: this.combat.playerRolls,
      monsterRolls:this.combat.monsterRolls,
    };
  }

  // ── SERIALISIERUNG ────────────────────────────────────────────
  getStateFor(socketId) {
    return {
      round:           this.round,
      phase:           this.phase,
      currentPlayerId: this.currentPlayer.id,
      winner:          this.winner,
      bossActive:      this.bossActive,
      bossMonster:     this.bossMonster,
      board:           this.board.serialize(),
      combat:          this._getCombatState(),
      players:         this.players.map(p => ({
        id:         p.id,
        name:       p.name,
        color:      p.color,
        level:      p.level,
        lifePoints: p.lifePoints,
        maxLife:    p.maxLife,
        movesLeft:  p.movesLeft,
        gold:       p.gold,
        x:          p.x,
        y:          p.y,
        alive:      p.alive,
        class:      p.class,
        race:       p.race,
        equipment:  p.equipment,
        handCount:  p.hand.length,
        backpackCount: p.backpack.length,
        activeEffects: p.activeEffects,
      })),
      myHand:     this.players.find(p => p.id === socketId)?.hand || [],
      log:        this.log.slice(-15),
      events:     this.events,
    };
  }
  _getConnectionCost(fromX, fromY, toX, toY) { return 1; }
  _countBigItems(player) {
    const eq = player.equipment || {};
    return ['weapon','armor','headgear','boots'].filter(s => eq[s]?.big).length;
  }

}

module.exports = { GameState };
