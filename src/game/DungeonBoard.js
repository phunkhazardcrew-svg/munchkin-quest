// ═══════════════════════════════════════════════════
// DungeonBoard.js — Kachelverwaltung & Bewegung
// ═══════════════════════════════════════════════════
const { createTileDeck, oppositeDir } = require('../data/tileData');

class DungeonBoard {
  constructor() {
    this.tiles  = {};    // key: "x,y" → tile-Objekt
    this.deck   = createTileDeck();
    this._placeStart();
  }

  _placeStart() {
    const startTile = { id:'start', uid:'start', name:'Eingang', exits:['N','E','S','W'],
                        type:'start', special:null, icon:'🚪', x:0, y:0 };
    this.tiles['0,0'] = startTile;
  }

  // Kachel an Position holen
  getTile(x, y) { return this.tiles[`${x},${y}`] || null; }

  // Neue Kachel aufdecken (bei Erkundung)
  revealTile(x, y, fromDir) {
    if (this.tiles[`${x},${y}`]) return this.tiles[`${x},${y}`];

    // Kacheln aus Stapel holen bis passende Verbindung
    let tile = null;
    const needed = oppositeDir(fromDir); // Kachel muss Eingang von dieser Seite haben
    for (let i = 0; i < this.deck.length; i++) {
      if (this.deck[i].exits.includes(needed)) {
        tile = this.deck.splice(i, 1)[0];
        break;
      }
    }
    if (!tile && this.deck.length > 0) tile = this.deck.shift();
    if (!tile) {
      // Fallback: Sackgasse
      tile = { id:'d_fallback', uid:'dead_'+x+'_'+y, name:'Sackgasse',
               exits:[needed], type:'deadend', special:null, icon:'🧱' };
    }
    tile = { ...tile, x, y };
    this.tiles[`${x},${y}`] = tile;
    return tile;
  }

  // Mögliche Bewegungsrichtungen von Position aus
  getExitsAt(x, y) {
    const t = this.getTile(x, y);
    if (!t) return [];
    return t.exits.map(dir => {
      const nx = x + (dir==='E'?1:dir==='W'?-1:0);
      const ny = y + (dir==='N'?-1:dir==='S'?1:0);
      return { dir, x:nx, y:ny, revealed: !!this.tiles[`${nx},${ny}`] };
    });
  }

  // Prüfen ob Bewegung von A nach B gültig
  canMove(fromX, fromY, toX, toY) {
    const dx = toX - fromX, dy = toY - fromY;
    if (Math.abs(dx) + Math.abs(dy) !== 1) return false;
    const dir = dx===1?'E':dx===-1?'W':dy===1?'S':'N';
    const fromTile = this.getTile(fromX, fromY);
    if (!fromTile || !fromTile.exits.includes(dir)) return false;
    const toTile = this.getTile(toX, toY);
    if (toTile) {
      return toTile.exits.includes(oppositeDir(dir));
    }
    return true; // Neue Kachel wird aufgedeckt
  }

  // Serialisierung für Client
  serialize() {
    return { tiles: this.tiles, deckSize: this.deck.length };
  }
}

module.exports = { DungeonBoard };
