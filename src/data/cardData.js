// ═══════════════════════════════════════════════════
// cardData.js — Munchkin Quest Kartendaten (Deutsch)
// ═══════════════════════════════════════════════════

const DOOR_CARDS = [
  // ── MONSTER ──────────────────────────────────────
  { id:'m01', type:'monster', name:'Schleimiger Goblin',    level:1,  treasures:1, bad_stuff:'Verliere eine Stufe',              special:null },
  { id:'m02', type:'monster', name:'Potted Plant',          level:1,  treasures:1, bad_stuff:'Verliere deine Handkarten',        special:null },
  { id:'m03', type:'monster', name:'Krawattenwächter',       level:2,  treasures:1, bad_stuff:'Verliere deine Ausrüstung',        special:null },
  { id:'m04', type:'monster', name:'Großer Krabbenmonster', level:2,  treasures:2, bad_stuff:'Verliere 2 Stufen',                special:null },
  { id:'m05', type:'monster', name:'Fliegende Frösche',     level:3,  treasures:1, bad_stuff:'Verliere alle Kopfbedeckungen',    special:null },
  { id:'m06', type:'monster', name:'Dreckiger Ork',         level:3,  treasures:2, bad_stuff:'Verliere 3 Stufen',                special:null },
  { id:'m07', type:'monster', name:'Skelett',               level:4,  treasures:2, bad_stuff:'Verliere eine Stufe und 1 Karte', special:null },
  { id:'m08', type:'monster', name:'Troll',                 level:4,  treasures:2, bad_stuff:'Verliere 2 Stufen',                special:null },
  { id:'m09', type:'monster', name:'Vampir',                level:5,  treasures:3, bad_stuff:'Verliere deine Klasse',            special:'undead' },
  { id:'m10', type:'monster', name:'Minotaurus',            level:5,  treasures:3, bad_stuff:'Verliere 2 Stufen',                special:null },
  { id:'m11', type:'monster', name:'Golem',                 level:6,  treasures:3, bad_stuff:'Verliere alle Schätze',            special:'unlootable' },
  { id:'m12', type:'monster', name:'Werwolf',               level:6,  treasures:3, bad_stuff:'Verliere eine Stufe',              special:'undead' },
  { id:'m13', type:'monster', name:'Feuerdrache',           level:7,  treasures:4, bad_stuff:'Verliere 3 Stufen',                special:null },
  { id:'m14', type:'monster', name:'Hydra',                 level:7,  treasures:3, bad_stuff:'Alle verlieren 1 Stufe',           special:null },
  { id:'m15', type:'monster', name:'Dämonenfürst',          level:8,  treasures:4, bad_stuff:'Verliere alle Stufen (Stufe 1)',   special:null },
  { id:'m16', type:'monster', name:'Lich',                  level:8,  treasures:4, bad_stuff:'Verliere alles',                  special:'undead' },
  { id:'m17', type:'monster', name:'Urdrache',              level:9,  treasures:5, bad_stuff:'Alle verlieren 2 Stufen',          special:null },
  { id:'m18', type:'monster', name:'Der Unsagbare',         level:10, treasures:5, bad_stuff:'Spieler scheidet aus',             special:null },
  { id:'m19', type:'monster', name:'Gelatinöser Oktaeder',  level:3,  treasures:2, bad_stuff:'Verliere Stiefel',                 special:null },
  { id:'m20', type:'monster', name:'Riesige Ameisen',       level:2,  treasures:1, bad_stuff:'Verliere 1 Schatz',               special:null },
  { id:'m21', type:'monster', name:'Zauberdieb',            level:4,  treasures:2, bad_stuff:'Dieb klaut 1 Ausrüstung',         special:null },
  { id:'m22', type:'monster', name:'Knochenhaufen',         level:5,  treasures:3, bad_stuff:'Verliere 2 Schätze',              special:'undead' },
  { id:'m23', type:'monster', name:'Koboldschwarm',         level:6,  treasures:3, bad_stuff:'Verliere 3 Stufen',               special:'many' },
  { id:'m24', type:'monster', name:'Banshee',               level:7,  treasures:4, bad_stuff:'Verliere alle Klassen und Rassen', special:'undead' },
  // ── FLÜCHE ───────────────────────────────────────
  { id:'c01', type:'curse', name:'Fluch: Ente der Verwandlung', effect:'lose_class',     desc:'Verliere deine Klasse!' },
  { id:'c02', type:'curse', name:'Fluch: Verlustiger Fluch',    effect:'lose_item',      desc:'Wirf das beste Ausrüstungsstück ab!' },
  { id:'c03', type:'curse', name:'Fluch: Stufen-Fluch',         effect:'lose_level',     desc:'Verliere eine Stufe!' },
  { id:'c04', type:'curse', name:'Fluch: Karten-Fluch',         effect:'lose_cards',     desc:'Wirf 2 Handkarten ab!' },
  { id:'c05', type:'curse', name:'Fluch: Rassen-Fluch',         effect:'lose_race',      desc:'Verliere deine Rasse!' },
  { id:'c06', type:'curse', name:'Fluch: Stiefelfluch',         effect:'lose_boots',     desc:'Verliere alle Stiefel!' },
  // ── KLASSEN ──────────────────────────────────────
  { id:'cl01', type:'class', name:'Krieger',  bonus_combat:3, ability:'flee_easier',   desc:'+3 im Kampf, Flucht bei W6≥4' },
  { id:'cl02', type:'class', name:'Zauberer', bonus_combat:0, ability:'discard_fight', desc:'Karte abwerfen = +3 im Kampf' },
  { id:'cl03', type:'class', name:'Dieb',     bonus_combat:0, ability:'steal',         desc:'Kann Karten von besiegten Spielern stehlen' },
  { id:'cl04', type:'class', name:'Kleriker', bonus_combat:2, ability:'undead_bonus',  desc:'+2 im Kampf, +3 gegen Untote' },
  // ── RASSEN ───────────────────────────────────────
  { id:'r01', type:'race', name:'Mensch',  ability:null,            desc:'Keine Boni, aber keine Einschränkungen' },
  { id:'r02', type:'race', name:'Elf',     ability:'extra_treasure',desc:'Extra Schatz bei Hilfe eines anderen Spielers' },
  { id:'r03', type:'race', name:'Zwerg',   ability:'keep_items',    desc:'Kann alle Ausrüstungsgegenstände tragen' },
  { id:'r04', type:'race', name:'Halbling',ability:'backstab',      desc:'Flucht automatisch erfolgreich' },
  // ── MONSTERVERSTÄRKER ────────────────────────────
  { id:'e01', type:'enhancer', name:'Riesig',   level_bonus:5, desc:'+5 auf Monsterlevel' },
  { id:'e02', type:'enhancer', name:'Uralt',     level_bonus:8, desc:'+8 auf Monsterlevel' },
  { id:'e03', type:'enhancer', name:'Winzig',    level_bonus:-5,desc:'-5 auf Monsterlevel (min 1)' },
  { id:'e04', type:'enhancer', name:'Intelligent',level_bonus:3,desc:'+3 auf Monsterlevel' },
  { id:'e05', type:'enhancer', name:'Irre',      level_bonus:2, desc:'+2 auf Monsterlevel, doppelte Schätze' },
];

const TREASURE_CARDS = [
  // ── WAFFEN ───────────────────────────────────────
  { id:'w01', type:'equipment', slot:'weapon',    name:'Dolch +1',              bonus:1,  value:100 },
  { id:'w02', type:'equipment', slot:'weapon',    name:'Kurzschwert +2',        bonus:2,  value:200 },
  { id:'w03', type:'equipment', slot:'weapon',    name:'Breitschwert +3',       bonus:3,  value:300 },
  { id:'w04', type:'equipment', slot:'weapon',    name:'Flammenklinge +4',      bonus:4,  value:400 },
  { id:'w05', type:'equipment', slot:'weapon',    name:'Donnerstreitaxt +5',    bonus:5,  value:500 },
  { id:'w06', type:'equipment', slot:'weapon',    name:'Magierstab +2',         bonus:2,  value:250, class_req:'Zauberer' },
  { id:'w07', type:'equipment', slot:'weapon',    name:'Heiliges Symbol +3',    bonus:3,  value:300, class_req:'Kleriker' },
  { id:'w08', type:'equipment', slot:'weapon',    name:'Schurkenklinge +3',     bonus:3,  value:350, class_req:'Dieb' },
  // ── RÜSTUNGEN ─────────────────────────────────────
  { id:'a01', type:'equipment', slot:'armor',     name:'Lederrüstung +1',       bonus:1,  value:100 },
  { id:'a02', type:'equipment', slot:'armor',     name:'Kettenhemd +2',         bonus:2,  value:200 },
  { id:'a03', type:'equipment', slot:'armor',     name:'Plattenrüstung +3',     bonus:3,  value:400 },
  { id:'a04', type:'equipment', slot:'armor',     name:'Magierroben +2',        bonus:2,  value:250, class_req:'Zauberer' },
  // ── KOPFBEDECKUNGEN ──────────────────────────────
  { id:'h01', type:'equipment', slot:'headgear',  name:'Spitzhut +1',           bonus:1,  value:100 },
  { id:'h02', type:'equipment', slot:'headgear',  name:'Topfhelm +2',           bonus:2,  value:200 },
  { id:'h03', type:'equipment', slot:'headgear',  name:'Zauberhut +3',          bonus:3,  value:300, class_req:'Zauberer' },
  // ── STIEFEL ──────────────────────────────────────
  { id:'b01', type:'equipment', slot:'boots',     name:'Stiefel der Eile +1',   bonus:1,  value:200 },
  { id:'b02', type:'equipment', slot:'boots',     name:'Elfenstiefel +2',       bonus:2,  value:300 },
  { id:'b03', type:'equipment', slot:'boots',     name:'Siebenmeilenstiefel +3',bonus:3,  value:500 },
  // ── TRÄNKE ───────────────────────────────────────
  { id:'p01', type:'potion', name:'Stärketrank +2',    bonus:2, one_use:true, desc:'+2 im Kampf (einmalig)' },
  { id:'p02', type:'potion', name:'Fluchtrant',         bonus:0, one_use:true, desc:'Flucht automatisch erfolgreich' },
  { id:'p03', type:'potion', name:'Heilzauber',         bonus:0, one_use:true, desc:'Ignoriere Bad Stuff eines Monsters' },
  // ── STUFEN-KARTEN ────────────────────────────────
  { id:'l01', type:'level_up', name:'Geheimes Wissen',  desc:'Erhalte sofort 1 Stufe' },
  { id:'l02', type:'level_up', name:'Schatz der Alten', desc:'Erhalte sofort 1 Stufe' },
  // ── SÖLDNER ──────────────────────────────────────
  { id:'h01t', type:'hireling', name:'Zwergenbegleiter', bonus:3, desc:'+3 im Kampf, einmalig benutzbar' },
  { id:'h02t', type:'hireling', name:'Elfenbote',         bonus:2, desc:'+2 im Kampf, einmalig benutzbar' },
];

// Kombinierte Kartenstapel (für zufälliges Mischen)
function createDoorDeck() {
  const deck = [...DOOR_CARDS];
  // Mehr Monster als alles andere
  for (let i = 0; i < 2; i++) {
    DOOR_CARDS.filter(c => c.type === 'monster').forEach(c => deck.push({...c, id: c.id + '_copy' + i}));
  }
  return shuffleDeck(deck);
}

function createTreasureDeck() {
  const deck = [...TREASURE_CARDS];
  // Mehr Ausrüstung
  TREASURE_CARDS.filter(c => c.type === 'equipment').forEach(c => deck.push({...c, id: c.id + '_copy'}));
  return shuffleDeck(deck);
}

function shuffleDeck(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

module.exports = { DOOR_CARDS, TREASURE_CARDS, createDoorDeck, createTreasureDeck };
