// ════════════════════════════════════════════════════
// tileData.js — Dungeon Raumteile (Regelwerk-konform)
// Räume mit: exits, Sonderregeln, Such-Symbol, Icons
// ════════════════════════════════════════════════════

const OPPOSITE = { N:'S', S:'N', E:'W', W:'E' };

// Monsterbewegungspfeile (6 Farben wie Monsterwürfel)
const MONSTER_COLORS = ['red','blue','green','yellow','purple','orange'];

function randomArrows() {
  // Jeder Raum hat für jede Farbe einen Pfeil (N/S/E/W/null)
  const dirs = ['N','S','E','W'];
  const arrows = {};
  MONSTER_COLORS.forEach(c => {
    arrows[c] = dirs[Math.floor(Math.random() * dirs.length)];
  });
  return arrows;
}

const TILE_TYPES = [
  // START
  { id:'start',  name:'Eingangshalle', exits:['N','E','S','W'], type:'start',    icon:'🚪', search:null, special:'entrance',
    rule:'Kein Monster darf hier seinen Zug beenden.', color:'#0d2e1e' },
  // KORRIDORE
  { id:'c_ns',   name:'Korridor',      exits:['N','S'],         type:'corridor', icon:'▮',  search:0,    special:null, color:'#111128' },
  { id:'c_ew',   name:'Korridor',      exits:['E','W'],         type:'corridor', icon:'▬',  search:0,    special:null, color:'#111128' },
  // KURVEN
  { id:'t_ne',   name:'Kurve N-E',     exits:['N','E'],         type:'turn',     icon:'↗',  search:0,    special:null, color:'#111128' },
  { id:'t_nw',   name:'Kurve N-W',     exits:['N','W'],         type:'turn',     icon:'↖',  search:0,    special:null, color:'#111128' },
  { id:'t_se',   name:'Kurve S-E',     exits:['S','E'],         type:'turn',     icon:'↘',  search:0,    special:null, color:'#111128' },
  { id:'t_sw',   name:'Kurve S-W',     exits:['S','W'],         type:'turn',     icon:'↙',  search:0,    special:null, color:'#111128' },
  // T-KREUZUNGEN
  { id:'j_new',  name:'T-Kreuzung N',  exits:['N','E','W'],     type:'junction', icon:'⊥',  search:0,    special:null, color:'#12142e' },
  { id:'j_sew',  name:'T-Kreuzung S',  exits:['S','E','W'],     type:'junction', icon:'⊤',  search:0,    special:null, color:'#12142e' },
  { id:'j_nse',  name:'T-Kreuzung E',  exits:['N','S','E'],     type:'junction', icon:'⊢',  search:0,    special:null, color:'#12142e' },
  { id:'j_nsw',  name:'T-Kreuzung W',  exits:['N','S','W'],     type:'junction', icon:'⊣',  search:0,    special:null, color:'#12142e' },
  { id:'j_all',  name:'Kreuzung',      exits:['N','S','E','W'], type:'junction', icon:'✛',  search:0,    special:null, color:'#12142e' },
  // SONDERRÄUME (mit Regeln)
  { id:'sr_treas', name:'Schatzraum',    exits:['N','S'],         type:'treasure', icon:'💰', search:1,    special:'extra_treasure',
    rule:'Wenn du hier einen Kampf gewinnst, ziehe 1 extra Schatzkarte.', color:'#2e2208' },
  { id:'sr_arm',   name:'Waffenkammer',  exits:['E','W'],         type:'armory',   icon:'⚔️', search:0,    special:'weapon_bonus',
    rule:'+2 auf Kampfwürfe in diesem Raum für alle Krieger.', color:'#2e1010' },
  { id:'sr_lib',   name:'Bibliothek',    exits:['N','E'],         type:'library',  icon:'📚', search:1,    special:'draw_dxm',
    rule:'Wenn du diesen Raum erforschst, ziehe 2 DxM-Karten statt 1.', color:'#0e2020' },
  { id:'sr_temple',name:'Tempel',        exits:['N','S','E','W'], type:'temple',   icon:'⛪', search:0,    special:'heal',
    rule:'Deal: Zahle 500 Gold, drehe 1 Lebenspunktmarker auf die rote Seite.', color:'#2a2a08' },
  { id:'sr_throne',name:'Thronsaal',     exits:['N','E','W'],     type:'throne',   icon:'👑', search:1,    special:'throne',
    rule:'Wenn du hier allein ein Monster tötest, steigst du 2 Stufen statt 1 auf.', color:'#2a2205' },
  { id:'sr_prison',name:'Kerker',        exits:['S'],             type:'prison',   icon:'🔒', search:-1,   special:'trap',
    rule:'Fliehen ist in diesem Raum unmöglich. Kein Durchsuchen möglich.', color:'#08080e' },
  { id:'sr_altar', name:'Altar',         exits:['N','S'],         type:'altar',    icon:'🕯️',search:0,    special:'curse_remove',
    rule:'Deal (1 Bewegung): Entferne 1 aktiven Fluch kostenlos.', color:'#180d2a' },
  { id:'sr_smithy',name:'Schmiede',      exits:['E','W'],         type:'smithy',   icon:'⚒️', search:0,    special:'upgrade',
    rule:'Deal: Zahle 500 Gold, lege +1 Marker auf eine deiner Rüstungen.', color:'#1a1000' },
  { id:'sr_tavern',name:'Taverne',       exits:['N','E','S','W'], type:'tavern',   icon:'🍺', search:0,    special:'draw_dxm',
    rule:'Deal (1 Bew.): Ziehe 1 DxM-Karte. Kein Kampf in der Taverne.', color:'#1a0a00' },
  // SACKGASSEN
  { id:'d_n',   name:'Sackgasse',        exits:['N'],             type:'deadend',  icon:'🧱', search:1,    special:null, color:'#0a0a14' },
  { id:'d_s',   name:'Sackgasse',        exits:['S'],             type:'deadend',  icon:'🧱', search:1,    special:null, color:'#0a0a14' },
  { id:'d_e',   name:'Sackgasse',        exits:['E'],             type:'deadend',  icon:'🧱', search:1,    special:null, color:'#0a0a14' },
  { id:'d_w',   name:'Sackgasse',        exits:['W'],             type:'deadend',  icon:'🧱', search:1,    special:null, color:'#0a0a14' },
];

function createTileDeck() {
  const deck = [];
  TILE_TYPES.forEach(t => {
    if (t.type === 'start') return; // Start wird separat platziert
    const count = t.type === 'corridor' ? 6 :
                  t.type === 'turn'     ? 4 :
                  t.type === 'junction' ? 4 :
                  t.type === 'deadend'  ? 3 : 2;
    for (let i = 0; i < count; i++) {
      deck.push({ ...t, uid: t.id + '_' + i, arrows: randomArrows() });
    }
  });
  // Mischen
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function getOpposite(dir) { return OPPOSITE[dir]; }

module.exports = { TILE_TYPES, createTileDeck, getOpposite, MONSTER_COLORS };
