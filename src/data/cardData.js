// ════════════════════════════════════════════════════════
// cardData.js — Munchkin Quest 1:1 Regelwerk
// 3 Stapel: MONSTER | SCHATZ | DEUS EX MUNCHKIN (DxM)
// ════════════════════════════════════════════════════════

const MONSTER_CARDS = [
  { id:'m01', name:'Topfpflanze',          level:1,  treasures:1, dice:1, fearsome:false, bad_stuff:'Verliere deine Kopfbedeckung', special:null,     size:'winzig', icon:'🪴' },
  { id:'m02', name:'Schleimiger Goblin',   level:1,  treasures:1, dice:1, fearsome:false, bad_stuff:'Verliere 1 Stufe',             special:null,     size:'klein',  icon:'👺' },
  { id:'m03', name:'Zombie',               level:2,  treasures:1, dice:1, fearsome:false, bad_stuff:'Verliere 1 Stufe',             special:'undead', size:'klein',  icon:'🧟' },
  { id:'m04', name:'Riesige Ameisen',      level:2,  treasures:1, dice:1, fearsome:false, bad_stuff:'Verliere 1 Schatz',            special:null,     size:'winzig', icon:'🐜' },
  { id:'m05', name:'Krawattenwächter',     level:3,  treasures:2, dice:1, fearsome:false, bad_stuff:'Verliere deine Ausrüstung',    special:null,     size:'normal', icon:'👔' },
  { id:'m06', name:'Fliegende Frösche',    level:3,  treasures:1, dice:1, fearsome:false, bad_stuff:'Verliere alle Kopfbedeckungen',special:null,     size:'winzig', icon:'🐸' },
  { id:'m07', name:'Dreckiger Ork',        level:3,  treasures:2, dice:1, fearsome:false, bad_stuff:'Verliere 2 Stufen',            special:null,     size:'normal', icon:'👹' },
  { id:'m08', name:'Skelett',              level:4,  treasures:2, dice:1, fearsome:false, bad_stuff:'Verliere 1 Stufe und 1 Karte', special:'undead', size:'normal', icon:'💀' },
  { id:'m09', name:'Troll',                level:4,  treasures:2, dice:1, fearsome:false, bad_stuff:'Verliere 2 Stufen',            special:null,     size:'groß',   icon:'🧌' },
  { id:'m10', name:'Kreischender Depp',    level:6,  treasures:3, dice:1, fearsome:false, bad_stuff:'Verliere 2 Stufen (+6 vs Krieger)', special:'+6_vs_warrior', size:'normal', icon:'🤡' },
  { id:'m11', name:'Vampir',               level:5,  treasures:3, dice:1, fearsome:false, bad_stuff:'Verliere deine Klasse',        special:'undead', size:'normal', icon:'🧛' },
  { id:'m12', name:'Minotaurus',           level:5,  treasures:3, dice:1, fearsome:false, bad_stuff:'Verliere 2 Stufen',            special:null,     size:'groß',   icon:'🐂' },
  { id:'m13', name:'Werwolf',              level:6,  treasures:3, dice:1, fearsome:false, bad_stuff:'Verliere 1 Stufe',             special:'undead', size:'normal', icon:'🐺' },
  { id:'m14', name:'Golem',                level:6,  treasures:3, dice:1, fearsome:false, bad_stuff:'Verliere alle Schätze',        special:null,     size:'groß',   icon:'🗿' },
  { id:'m15', name:'Banshee',              level:7,  treasures:4, dice:1, fearsome:false, bad_stuff:'Verliere Klasse und Rasse',    special:'undead', size:'normal', icon:'👻' },
  { id:'m16', name:'Hydra',                level:7,  treasures:3, dice:2, fearsome:false, bad_stuff:'Alle verlieren 1 Stufe',       special:null,     size:'groß',   icon:'🐉' },
  { id:'m17', name:'Knochenhaufen',        level:5,  treasures:3, dice:1, fearsome:false, bad_stuff:'Verliere 2 Schätze',           special:'undead', size:'normal', icon:'🦴' },
  { id:'m18', name:'Feuerdrache',          level:8,  treasures:4, dice:2, fearsome:true,  bad_stuff:'Verliere 3 Stufen',            special:'dragon', size:'groß',   icon:'🔥' },
  { id:'m19', name:'Dämonenfürst',         level:8,  treasures:4, dice:2, fearsome:true,  bad_stuff:'Verliere alle Stufen (Stufe 1)',special:null,    size:'groß',   icon:'😈' },
  { id:'m20', name:'Lich',                 level:9,  treasures:4, dice:2, fearsome:true,  bad_stuff:'Verliere alles',               special:'undead', size:'groß',   icon:'💀' },
  { id:'m21', name:'Urdrache',             level:10, treasures:5, dice:3, fearsome:true,  bad_stuff:'Alle verlieren 2 Stufen',      special:'dragon', size:'groß',   icon:'🐲' },
  { id:'m22', name:'Koboldschwarm',        level:5,  treasures:2, dice:2, fearsome:false, bad_stuff:'Verliere 3 Stufen',            special:null,     size:'winzig', icon:'👾' },
  { id:'m23', name:'Gelatinöser Oktaeder', level:3,  treasures:2, dice:1, fearsome:false, bad_stuff:'Verliere dein Schuhwerk',      special:null,     size:'normal', icon:'🔷' },
  { id:'m24', name:'Plutoniumdrache',      level:18, treasures:5, dice:3, fearsome:true,  bad_stuff:'+3 wenn Halbling',             special:'dragon', size:'groß',   icon:'⚡' },
  { id:'m25', name:'Krakzilla',            level:18, treasures:5, dice:3, fearsome:true,  bad_stuff:'Verliere besten Gegenstand',   special:null,     size:'groß',   icon:'🦑' },
  { id:'m26', name:'Psycho-Eichhörnchen', level:2,  treasures:1, dice:1, fearsome:false, bad_stuff:'Verliere deine Rasse',         special:null,     size:'winzig', icon:'🐿️' },
  { id:'m27', name:'Zombiebienen',         level:3,  treasures:2, dice:1, fearsome:false, bad_stuff:'Verliere 1 Lebenspunkt',       special:'undead', size:'winzig', icon:'🐝' },
  { id:'m28', name:'Grusel-Bürokrat',      level:3,  treasures:2, dice:1, fearsome:false, bad_stuff:'Nächste Runde -1 Bewegung',    special:null,     size:'normal', icon:'📋' },
];

const TREASURE_CARDS = [
  // WAFFEN
  { id:'w01', type:'equipment', slot:'weapon',  name:'Dolch +1',              bonus:1, value:100, hands:1, big:false, icon:'🗡️',  class_req:null },
  { id:'w02', type:'equipment', slot:'weapon',  name:'Kurzschwert +2',        bonus:2, value:200, hands:1, big:false, icon:'⚔️',  class_req:null },
  { id:'w03', type:'equipment', slot:'weapon',  name:'Breitschwert +3',       bonus:3, value:300, hands:1, big:false, icon:'🗡️',  class_req:null },
  { id:'w04', type:'equipment', slot:'weapon',  name:'Flammenklinge +4',      bonus:4, value:400, hands:1, big:false, icon:'🔥',  class_req:null },
  { id:'w05', type:'equipment', slot:'weapon',  name:'Donnerstreitaxt +5',    bonus:5, value:500, hands:2, big:true,  icon:'🪓',  class_req:null },
  { id:'w06', type:'equipment', slot:'weapon',  name:'Magierstab +2',         bonus:2, value:250, hands:1, big:false, icon:'🪄',  class_req:'Zauberer' },
  { id:'w07', type:'equipment', slot:'weapon',  name:'Heiliges Symbol +3',    bonus:3, value:300, hands:1, big:false, icon:'✝️',  class_req:'Kleriker' },
  { id:'w08', type:'equipment', slot:'weapon',  name:'Schurkenklinge +3',     bonus:3, value:350, hands:1, big:false, icon:'🗡️',  class_req:'Dieb' },
  { id:'w09', type:'equipment', slot:'weapon',  name:'Napalmstab +3',         bonus:3, value:400, hands:1, big:false, icon:'🔮',  class_req:'Zauberer' },
  { id:'w10', type:'equipment', slot:'weapon',  name:'Lässige Lanze +5',      bonus:5, value:600, hands:2, big:true,  icon:'⚔️',  class_req:null },
  // RÜSTUNGEN
  { id:'a01', type:'equipment', slot:'armor',   name:'Lederrüstung +1',       bonus:1, value:100, hands:0, big:false, icon:'🛡️',  class_req:null },
  { id:'a02', type:'equipment', slot:'armor',   name:'Kettenhemd +2',         bonus:2, value:200, hands:0, big:false, icon:'⛓️',  class_req:null },
  { id:'a03', type:'equipment', slot:'armor',   name:'Plattenrüstung +3',     bonus:3, value:400, hands:0, big:true,  icon:'🛡️',  class_req:null },
  { id:'a04', type:'equipment', slot:'armor',   name:'Magierroben +2',        bonus:2, value:250, hands:0, big:false, icon:'🥻',  class_req:'Zauberer' },
  { id:'a05', type:'equipment', slot:'armor',   name:'Anzügliche Rüstung +1', bonus:1, value:100, hands:0, big:false, icon:'🩱',  class_req:null },
  { id:'a06', type:'equipment', slot:'armor',   name:'Adamantrüstung +4',     bonus:4, value:600, hands:0, big:true,  icon:'🛡️',  class_req:null },
  // KOPFBEDECKUNGEN
  { id:'h01', type:'equipment', slot:'headgear',name:'Spitzhut +1',           bonus:1, value:100, hands:0, big:false, icon:'🎩',  class_req:null },
  { id:'h02', type:'equipment', slot:'headgear',name:'Topfhelm +2',           bonus:2, value:200, hands:0, big:false, icon:'⛑️',  class_req:null },
  { id:'h03', type:'equipment', slot:'headgear',name:'Zauberhut +3',          bonus:3, value:300, hands:0, big:false, icon:'🧙',  class_req:'Zauberer' },
  { id:'h04', type:'equipment', slot:'headgear',name:'Spitzer Hut der Macht+3',bonus:3,value:400, hands:0, big:false, icon:'🔮',  class_req:'Zauberer' },
  { id:'h05', type:'equipment', slot:'headgear',name:'Feuerwehrhelm +2',      bonus:2, value:200, hands:0, big:false, icon:'🪖',  class_req:null },
  // STIEFEL
  { id:'b01', type:'equipment', slot:'boots',   name:'Stiefel der Eile +1',   bonus:1, value:200, hands:0, big:false, icon:'👢',  class_req:null },
  { id:'b02', type:'equipment', slot:'boots',   name:'Elfenstiefel +2',       bonus:2, value:300, hands:0, big:false, icon:'👢',  class_req:null },
  { id:'b03', type:'equipment', slot:'boots',   name:'Siebenmeilenstiefel+3', bonus:3, value:500, hands:0, big:false, icon:'👢',  class_req:null },
  // TRÄNKE (einmal einsetzbar, direkt aus Hand im Kampf spielbar)
  { id:'p01', type:'potion', name:'Stärketrank +2',        bonus:2,  value:50,  one_use:true, icon:'🧪', desc:'Einmal im Kampf +2 Bonus' },
  { id:'p02', type:'potion', name:'Explosivtrank +5',      bonus:5,  value:200, one_use:true, icon:'💣', desc:'Einmal im Kampf +5 Bonus' },
  { id:'p03', type:'potion', name:'Weglauftrank',          bonus:0,  value:100, one_use:true, icon:'💨', desc:'Fliehe automatisch erfolgreich' },
  { id:'p04', type:'potion', name:'Heilzauber',            bonus:0,  value:150, one_use:true, icon:'💊', desc:'Ignoriere Bad Stuff einmal' },
  { id:'p05', type:'potion', name:'Stärketrank +3',        bonus:3,  value:100, one_use:true, icon:'🧪', desc:'Einmal im Kampf +3 Bonus' },
  // STUFEN-KARTEN (jederzeit spielbar, nie für Stufe 10)
  { id:'l01', type:'level_up', name:'Steige eine Stufe auf', icon:'⬆️', desc:'Sofort 1 Stufe aufsteigen (nicht für Stufe 10)' },
  { id:'l02', type:'level_up', name:'Wahres Wissen',          icon:'📖', desc:'Sofort 1 Stufe aufsteigen (nicht für Stufe 10)' },
  // KLUNKER (kein Slot, unbegrenzt tragbar)
  { id:'k01', type:'equipment', slot:'klunker', name:'Gezinkter Würfel',  bonus:0, value:300, hands:0, big:false, icon:'🎲', special:'reroll',      desc:'Einen Würfelwurf wiederholen' },
  { id:'k02', type:'equipment', slot:'klunker', name:'Schummeln-Karte',   bonus:0, value:200, hands:0, big:false, icon:'🃏', special:'cheat',       desc:'Einen Gegenstand ohne Einschränkungen tragen' },
  { id:'k03', type:'equipment', slot:'klunker', name:'Ring des Wunsches', bonus:0, value:500, hands:0, big:false, icon:'💍', special:'curse_block', desc:'Einen Fluch aufheben' },
];

const DXM_CARDS = [
  // KLASSEN
  { id:'cl01', type:'class', name:'Krieger',  icon:'⚔️', bonus_combat:3, ability:'warrior',  desc:'+3 im Kampf. Unentschieden = Sieg. W10≤Stufe: +Level Kampfbonus.' },
  { id:'cl02', type:'class', name:'Zauberer', icon:'🧙', bonus_combat:0, ability:'wizard',   desc:'Karte abwerfen = +3 (beliebig oft). W10≤Stufe: Monster bannen.' },
  { id:'cl03', type:'class', name:'Dieb',     icon:'🗡️', bonus_combat:0, ability:'thief',    desc:'In den Rücken fallen: -2 einem Kämpfer. W10≤Stufe: Karte klauen.' },
  { id:'cl04', type:'class', name:'Kleriker', icon:'✝️', bonus_combat:2, ability:'cleric',   desc:'+2 Kampf, +3 vs Untote. W10≤Stufe: Fluch aufheben.' },
  // RASSEN
  { id:'r01', type:'race', name:'Elf',       icon:'🧝', ability:'elf',      desc:'Wenn du beim Sieg hilfst, steigst du 1 Stufe auf.' },
  { id:'r02', type:'race', name:'Zwerg',     icon:'⛏️', ability:'dwarf',    desc:'Rucksack-Limit aufgehoben. Große Gegenstände ohne Penalty.' },
  { id:'r03', type:'race', name:'Halbling',  icon:'🌿', ability:'halfling', desc:'Fliehen ist immer automatisch erfolgreich.' },
  // FLÜCHE (sofortige Wirkung)
  { id:'c01', type:'curse', name:'Fluch: Ente der Verwandlung', effect:'lose_class',     icon:'🦆', desc:'Verliere deine Klasse sofort!' },
  { id:'c02', type:'curse', name:'Fluch: Verlustriger Fluch',   effect:'lose_best_item', icon:'💀', desc:'Verliere deinen besten Gegenstand!' },
  { id:'c03', type:'curse', name:'Fluch: Stufenfluch',          effect:'lose_level',     icon:'⬇️', desc:'Verliere sofort 1 Stufe!' },
  { id:'c04', type:'curse', name:'Fluch: Kartenfluch',          effect:'lose_2_cards',   icon:'🃏', desc:'Lege 2 Handkarten ab!' },
  { id:'c05', type:'curse', name:'Fluch: Rassenfluch',          effect:'lose_race',      icon:'🎭', desc:'Verliere deine Rasse sofort!' },
  { id:'c06', type:'curse', name:'Fluch: Stiefelfluch',         effect:'lose_boots',     icon:'👢', desc:'Verliere dein Schuhwerk!' },
  { id:'c07', type:'curse', name:'Fluch: Rüstung zu Pudding',   effect:'lose_armor',     icon:'🍮', desc:'Verliere deine Rüstung!' },
  { id:'c08', type:'curse', name:'Fluch: Schwächeanfall',       effect:'minus2_fight',   icon:'😵', desc:'-2 in deinem nächsten Kampf!' },
  // MONSTERVERSTÄRKER
  { id:'e01', type:'enhancer', name:'Uralt',      level_bonus:8,  treasure_bonus:2,  icon:'👴', desc:'+8 Stufen, +2 Schätze' },
  { id:'e02', type:'enhancer', name:'Riesig',     level_bonus:5,  treasure_bonus:1,  icon:'🔺', desc:'+5 Stufen, +1 Schatz' },
  { id:'e03', type:'enhancer', name:'Winzig',     level_bonus:-5, treasure_bonus:-1, icon:'🔻', desc:'-5 Stufen, -1 Schatz (min 1)' },
  { id:'e04', type:'enhancer', name:'Baby',       level_bonus:-5, treasure_bonus:-1, icon:'👶', desc:'-5 Stufen, -1 Schatz' },
  { id:'e05', type:'enhancer', name:'Intelligent',level_bonus:3,  treasure_bonus:0,  icon:'🧠', desc:'+3 Stufen' },
  { id:'e06', type:'enhancer', name:'Haarig',     level_bonus:3,  treasure_bonus:1,  icon:'🦡', desc:'+3 Stufen, +1 Schatz' },
  // WANDERNDE MONSTER (3 Exemplare)
  { id:'wm01', type:'wandering_monster', name:'Wanderndes Monster', icon:'🚶', desc:'Weiteres Monster betritt den Kampf!' },
  { id:'wm02', type:'wandering_monster', name:'Wanderndes Monster', icon:'🚶', desc:'Weiteres Monster betritt den Kampf!' },
  { id:'wm03', type:'wandering_monster', name:'Wanderndes Monster', icon:'🚶', desc:'Weiteres Monster betritt den Kampf!' },
  // STUFEN-AUFSTIEG
  { id:'dl01', type:'level_up', name:'Steige eine Stufe auf', icon:'⬆️', desc:'Sofort 1 Stufe (nicht für Stufe 10!)' },
  { id:'dl02', type:'level_up', name:'Heldentat',              icon:'🌟', desc:'Sofort 1 Stufe (nicht für Stufe 10!)' },
  { id:'dl03', type:'level_up', name:'Göttlicher Beistand',   icon:'✨', desc:'Sofort 1 Stufe (nicht für Stufe 10!)' },
];

function _shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function createMonsterDeck() {
  const deck = [];
  MONSTER_CARDS.forEach(m => {
    deck.push({ ...m, uid: m.id + '_a' });
    if (m.level <= 8) deck.push({ ...m, uid: m.id + '_b' }); // Mittlere: doppelt
  });
  return _shuffle(deck);
}

function createTreasureDeck() {
  const deck = [];
  TREASURE_CARDS.forEach(t => {
    deck.push({ ...t, uid: t.id + '_a' });
    if (t.type === 'equipment') deck.push({ ...t, uid: t.id + '_b' });
  });
  return _shuffle(deck);
}

function createDxmDeck() {
  const deck = [];
  DXM_CARDS.forEach(d => {
    deck.push({ ...d, uid: d.id + '_a' });
    if (d.type === 'curse' || d.type === 'enhancer' || d.type === 'level_up') {
      deck.push({ ...d, uid: d.id + '_b' });
    }
  });
  return _shuffle(deck);
}

module.exports = { MONSTER_CARDS, TREASURE_CARDS, DXM_CARDS, createMonsterDeck, createTreasureDeck, createDxmDeck };
