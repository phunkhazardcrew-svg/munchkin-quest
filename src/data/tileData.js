// ═══════════════════════════════════════════════════
// tileData.js — Dungeon Kacheln Definitionen
// ═══════════════════════════════════════════════════

// Verbindungsseiten: N=Nord, S=Süd, E=Ost, W=West
// exits: Array der offenen Ausgänge

const TILE_TYPES = [
  // ── STARTRAUM ────────────────────────────────────
  { id:'start', name:'Eingang',     exits:['N','E','S','W'], type:'start',    special:null,            icon:'🚪' },
  // ── NORMALE RÄUME ────────────────────────────────
  { id:'r1',    name:'Korridor N-S',exits:['N','S'],         type:'corridor', special:null,            icon:'▮' },
  { id:'r2',    name:'Korridor E-W',exits:['E','W'],         type:'corridor', special:null,            icon:'▭' },
  { id:'r3',    name:'Kurve N-E',   exits:['N','E'],         type:'turn',     special:null,            icon:'↗' },
  { id:'r4',    name:'Kurve N-W',   exits:['N','W'],         type:'turn',     special:null,            icon:'↖' },
  { id:'r5',    name:'Kurve S-E',   exits:['S','E'],         type:'turn',     special:null,            icon:'↘' },
  { id:'r6',    name:'Kurve S-W',   exits:['S','W'],         type:'turn',     special:null,            icon:'↙' },
  { id:'r7',    name:'T-Kreuzung N',exits:['N','E','W'],     type:'junction', special:null,            icon:'⊥' },
  { id:'r8',    name:'T-Kreuzung S',exits:['S','E','W'],     type:'junction', special:null,            icon:'⊤' },
  { id:'r9',    name:'T-Kreuzung E',exits:['N','S','E'],     type:'junction', special:null,            icon:'⊢' },
  { id:'r10',   name:'T-Kreuzung W',exits:['N','S','W'],     type:'junction', special:null,            icon:'⊣' },
  { id:'r11',   name:'Kreuzung',    exits:['N','S','E','W'], type:'junction', special:null,            icon:'✛' },
  // ── SONDERRÄUME ──────────────────────────────────
  { id:'s1',    name:'Schatzraum',  exits:['N','S'],         type:'treasure', special:'extra_treasure',icon:'💰', desc:'Ziehe 2 Schatzkarten!' },
  { id:'s2',    name:'Waffenkammer',exits:['E','W'],         type:'armory',   special:'weapon_bonus',  icon:'⚔️', desc:'+2 im nächsten Kampf' },
  { id:'s3',    name:'Bibliothek',  exits:['N','E'],         type:'library',  special:'draw_door',     icon:'📚', desc:'Ziehe 1 extra Türkarte' },
  { id:'s4',    name:'Tempel',      exits:['N','S','E','W'], type:'temple',   special:'heal',          icon:'⛪', desc:'Klasse/Rasse Fluch aufheben' },
  { id:'s5',    name:'Folterkammer',exits:['S','W'],         type:'torture',  special:'monster_boost', icon:'🪤', desc:'Monster in diesem Raum +3' },
  { id:'s6',    name:'Thronsaal',   exits:['N','E','W'],     type:'throne',   special:'throne',        icon:'👑', desc:'Nächster Monster-Sieg gibt 2 Stufen' },
  { id:'s7',    name:'Kerker',      exits:['S'],             type:'prison',   special:'trap',          icon:'🔒', desc:'Flucht unmöglich bis Kampf gewonnen' },
  { id:'s8',    name:'Altar',       exits:['N','S'],         type:'altar',    special:'curse_removal', icon:'🕯️',desc:'Entferne 1 aktiven Fluch' },
  // ── SACKGASSEN ───────────────────────────────────
  { id:'d1',    name:'Sackgasse N', exits:['N'],             type:'deadend',  special:null,            icon:'🧱' },
  { id:'d2',    name:'Sackgasse S', exits:['S'],             type:'deadend',  special:null,            icon:'🧱' },
  { id:'d3',    name:'Sackgasse E', exits:['E'],             type:'deadend',  special:null,            icon:'🧱' },
  { id:'d4',    name:'Sackgasse W', exits:['W'],             type:'deadend',  special:null,            icon:'🧱' },
];

// Stapel erstellen – mehr normale Räume, weniger Sonderräume
function createTileDeck() {
  const deck = [];
  // Normale Räume: je 4x
  TILE_TYPES.filter(t => t.type === 'corridor' || t.type === 'turn' || t.type === 'junction')
    .forEach(t => { for (let i = 0; i < 4; i++) deck.push({...t, uid: t.id + '_' + i}); });
  // Sonderräume: je 2x
  TILE_TYPES.filter(t => ['treasure','armory','library','temple','torture','throne','prison','altar'].includes(t.type))
    .forEach(t => { for (let i = 0; i < 2; i++) deck.push({...t, uid: t.id + '_' + i}); });
  // Sackgassen: je 3x
  TILE_TYPES.filter(t => t.type === 'deadend')
    .forEach(t => { for (let i = 0; i < 3; i++) deck.push({...t, uid: t.id + '_' + i}); });
  // Mischen
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// Gegenüberliegende Richtung ermitteln
function oppositeDir(dir) {
  return { N:'S', S:'N', E:'W', W:'E' }[dir];
}

module.exports = { TILE_TYPES, createTileDeck, oppositeDir };
