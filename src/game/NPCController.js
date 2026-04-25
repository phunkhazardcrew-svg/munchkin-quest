// ═══════════════════════════════════════════════════
// NPCController.js — KI-Gehirn für Bot-Spieler
// Persönlichkeiten: STRATEGISCH | ZUFÄLLIG
// ═══════════════════════════════════════════════════

const { CombatSystem } = require('./CombatSystem');

// ── NPC DEFINITIONEN ──────────────────────────────
const NPC_PROFILES = [
  {
    id:          'npc_aldric',
    name:        'Aldric der Weise',
    personality: 'strategic',
    emoji:       '🧙',
    desc:        'Kluge Entscheidungen, kämpft nur wenn er gewinnen kann',
  },
  {
    id:          'npc_zara',
    name:        'Zara Eisenfaust',
    personality: 'strategic',
    emoji:       '⚔️',
    desc:        'Aggressiv-strategisch, sammelt Ausrüstung, behindert Führende',
  },
  {
    id:          'npc_glitch',
    name:        'Glitch das Chaos',
    personality: 'random',
    emoji:       '🎲',
    desc:        'Völlig unberechenbar — manchmal brillant, manchmal katastrophal',
  },
];

class NPCController {
  constructor(profile) {
    this.id          = profile.id;
    this.name        = profile.name;
    this.personality = profile.personality; // 'strategic' | 'random'
    this.emoji       = profile.emoji;
  }

  // ── HAUPT-ENTSCHEIDUNG ────────────────────────────
  // Gibt eine action zurück die der NPC ausführen soll
  decideAction(gameState, mySocketId) {
    const me = gameState.players.find(p => p.id === mySocketId);
    if (!me) return null;

    const isMyTurn = gameState.currentPlayerId === mySocketId;
    const phase    = gameState.turnPhase;

    if (this.personality === 'random') {
      return this._randomDecision(gameState, me, isMyTurn, phase);
    } else {
      return this._strategicDecision(gameState, me, isMyTurn, phase);
    }
  }

  // ── STRATEGISCHE KI ──────────────────────────────
  _strategicDecision(state, me, isMyTurn, phase) {
    // Kampf läuft — entscheide als Nicht-Kämpfer
    if (state.combat && !state.combat.resolved && state.combat.fighterId !== me.id) {
      return this._strategicCombatReaction(state, me);
    }

    if (!isMyTurn) return null;

    switch (phase) {
      case 'roll_movement':
        return { type: 'roll_movement' };

      case 'move': {
        const best = this._pickBestMove(state, me);
        if (best) return { type: 'move', x: best.x, y: best.y };
        return { type: 'end_turn' }; // Kein Zug möglich
      }

      case 'open_door':
        // Immer Tür öffnen — Monster ist Chance auf Levelup
        return { type: 'open_door' };

      case 'combat': {
        if (state.combat?.fighterId === me.id) {
          return this._strategicFightOrFlee(state, me);
        }
        return null;
      }

      case 'end_turn': {
        // Vorher: beste Karte aus Hand spielen
        const card = this._pickBestCardToPlay(me);
        if (card) return { type: 'play_card', cardId: card.uid || card.id };
        return { type: 'end_turn' };
      }

      default:
        return null;
    }
  }

  // Strategisch: Kampf oder Flucht
  _strategicFightOrFlee(state, me) {
    const monster = state.combat.monster;
    const myStr   = this._estimateStrength(me);
    const monStr  = monster.level;

    // Kampf wenn Stärke >= Monster + kleiner Puffer
    if (myStr >= monStr) {
      // Erst Trank spielen wenn Stärke knapp
      if (myStr < monStr + 2) {
        const potion = me.hand?.find(c => c.type === 'potion' && c.bonus > 0);
        if (potion) return { type: 'play_card', cardId: potion.uid || potion.id };
      }
      return { type: 'fight' };
    }
    return { type: 'flee' };
  }

  // Strategisch: Helfen oder Behindern wenn anderer kämpft
  _strategicCombatReaction(state, me) {
    const fighter = state.players.find(p => p.id === state.combat.fighterId);
    if (!fighter) return null;

    // Führenden Spieler behindern (Stufe > eigene Stufe + 2)
    if (fighter.level >= me.level + 2) {
      return { type: 'hinder' };
    }
    // Sonst: ignorieren (keine Hilfe für Konkurrenten)
    return null;
  }

  // Strategisch: Beste Bewegungsrichtung
  _pickBestMove(state, me) {
    const board = state.board;
    if (!board?.tiles) return null;

    const dirs = [
      { x: me.x,   y: me.y-1 },
      { x: me.x,   y: me.y+1 },
      { x: me.x+1, y: me.y   },
      { x: me.x-1, y: me.y   },
    ];

    // Prüfen welche Züge möglich sind
    const valid = dirs.filter(d => {
      const fromTile = board.tiles[`${me.x},${me.y}`];
      if (!fromTile) return false;
      const dx = d.x - me.x, dy = d.y - me.y;
      const dir = dx===1?'E':dx===-1?'W':dy===1?'S':'N';
      return fromTile.exits?.includes(dir);
    });

    if (valid.length === 0) return null;

    // Schatzräume bevorzugen, dann unbekannte Kacheln
    const scored = valid.map(d => {
      const tile = board.tiles[`${d.x},${d.y}`];
      if (!tile) return { ...d, score: 5 }; // Unbekannte Kachel = gut!
      if (tile.type === 'treasure') return { ...d, score: 10 };
      if (tile.type === 'armory')   return { ...d, score: 8 };
      if (tile.type === 'throne')   return { ...d, score: 9 };
      if (tile.type === 'deadend')  return { ...d, score: 1 };
      if (tile.type === 'prison')   return { ...d, score: 0 }; // Kerker meiden!
      return { ...d, score: 3 };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0];
  }

  // Strategisch: Beste Karte spielen
  _pickBestCardToPlay(me) {
    if (!me.hand || me.hand.length === 0) return null;

    // Priorität: Klasse > Rasse > Ausrüstung (bestes Item)
    const classCard = me.hand.find(c => c.type === 'class' && !me.class);
    if (classCard) return classCard;

    const raceCard = me.hand.find(c => c.type === 'race' && !me.race);
    if (raceCard) return raceCard;

    const levelUp = me.hand.find(c => c.type === 'level_up');
    if (levelUp) return levelUp;

    // Bessere Ausrüstung anlegen
    const equipment = me.hand
      .filter(c => c.type === 'equipment' && c.slot)
      .filter(c => {
        const current = me.equipment?.[c.slot];
        return !current || (c.bonus || 0) > (current.bonus || 0);
      })
      .sort((a,b) => (b.bonus||0) - (a.bonus||0));

    if (equipment.length > 0) return equipment[0];

    return null;
  }

  // Spieler-Stärke schätzen (Stufe + Ausrüstung)
  _estimateStrength(player) {
    let str = player.level || 1;
    if (player.equipment) {
      Object.values(player.equipment).forEach(item => {
        if (item?.bonus) str += item.bonus;
      });
    }
    if (player.class?.id === 'cl01') str += 3; // Krieger
    if (player.class?.id === 'cl04') str += 2; // Kleriker
    return str;
  }

  // ── ZUFÄLLIGE KI ─────────────────────────────────
  _randomDecision(state, me, isMyTurn, phase) {
    // Kampf läuft — zufällig helfen/behindern/ignorieren
    if (state.combat && !state.combat.resolved && state.combat.fighterId !== me.id) {
      const r = Math.random();
      if (r < 0.25) return { type: 'help_fight', targetId: state.combat.fighterId };
      if (r < 0.45) return { type: 'hinder' };
      return null; // 55%: ignorieren
    }

    if (!isMyTurn) return null;

    switch (phase) {
      case 'roll_movement':
        return { type: 'roll_movement' };

      case 'move': {
        const dirs = [
          { x: me.x, y: me.y-1 },
          { x: me.x, y: me.y+1 },
          { x: me.x+1, y: me.y },
          { x: me.x-1, y: me.y },
        ];
        const valid = dirs.filter(d => {
          const fromTile = state.board?.tiles?.[`${me.x},${me.y}`];
          if (!fromTile) return false;
          const dx = d.x - me.x, dy = d.y - me.y;
          const dir = dx===1?'E':dx===-1?'W':dy===1?'S':'N';
          return fromTile.exits?.includes(dir);
        });
        if (valid.length === 0) return { type: 'end_turn' };
        const pick = valid[Math.floor(Math.random() * valid.length)];
        return { type: 'move', x: pick.x, y: pick.y };
      }

      case 'open_door':
        return { type: 'open_door' };

      case 'combat': {
        if (state.combat?.fighterId === me.id) {
          // 50/50: kämpfen oder fliehen (völlig zufällig!)
          if (Math.random() < 0.5) return { type: 'fight' };
          return { type: 'flee' };
        }
        return null;
      }

      case 'end_turn': {
        // Zufällig Karte spielen (30% Chance)
        if (me.hand?.length > 0 && Math.random() < 0.3) {
          const card = me.hand[Math.floor(Math.random() * me.hand.length)];
          // Nur spielbare Karten (kein Monster aus Hand spielen)
          if (!['monster','enhancer','curse'].includes(card.type)) {
            return { type: 'play_card', cardId: card.uid || card.id };
          }
        }
        return { type: 'end_turn' };
      }

      default:
        return null;
    }
  }

  // ── STATIC FACTORY ────────────────────────────────
  static createNPCSet(count = 3) {
    return NPC_PROFILES.slice(0, count).map(p => new NPCController(p));
  }

  static getProfiles() { return NPC_PROFILES; }
}

module.exports = { NPCController, NPC_PROFILES };
