// ═══════════════════════════════════════════════════
// CombatSystem.js — Kampflogik
// ═══════════════════════════════════════════════════

class CombatSystem {
  // Kampfstärke eines Spielers berechnen
  static calcPlayerStrength(player, bonuses = []) {
    let str = player.level;
    // Ausrüstung
    if (player.equipment) {
      Object.values(player.equipment).forEach(item => {
        if (item && item.bonus) str += item.bonus;
      });
    }
    // Klassen-Bonus
    if (player.class) {
      if (player.class.id === 'cl01') str += 3; // Krieger
      if (player.class.id === 'cl02') str += 0; // Zauberer: keine Basis
      if (player.class.id === 'cl04') str += 2; // Kleriker
    }
    // Temporäre Boni (Tränke, Räume, Helfer)
    bonuses.forEach(b => str += b);
    return str;
  }

  // Monsterstärke berechnen (inkl. Verstärker)
  static calcMonsterStrength(monster, enhancers = []) {
    let level = monster.level;
    enhancers.forEach(e => {
      level += e.level_bonus || 0;
    });
    return Math.max(1, level);
  }

  // Kleriker-Bonus gegen Untote
  static getClericBonus(player, monster) {
    if (player.class?.id === 'cl04' && monster.special === 'undead') return 3;
    return 0;
  }

  // Flucht-Würfel (W6 >= 5, Krieger >= 4, Halbling automatisch)
  static rollFlee(player) {
    if (player.race?.id === 'r04') return { success: true, roll: 6 }; // Halbling
    const roll = Math.floor(Math.random() * 6) + 1;
    const needed = player.class?.id === 'cl01' ? 4 : 5; // Krieger leichter
    return { success: roll >= needed, roll, needed };
  }

  // Würfeln (W6)
  static rollD6() { return Math.floor(Math.random() * 6) + 1; }

  // Kampf auflösen
  static resolve(player, monster, helpers = [], hinderers = [], roomBonus = 0, usedPotions = []) {
    let playerStr = this.calcPlayerStrength(player);
    playerStr += this.getClericBonus(player, monster);
    playerStr += roomBonus;
    usedPotions.forEach(p => { if (p.bonus) playerStr += p.bonus; });

    // Helfer addieren
    helpers.forEach(h => {
      playerStr += this.calcPlayerStrength(h);
    });

    // Monster Hinderer
    let monsterStr = this.calcMonsterStrength(monster);
    hinderers.forEach(hinder => {
      monsterStr += hinder.level_bonus || 2; // Standard +2 wenn Spieler behindert
    });

    const playerWins = playerStr > monsterStr;

    return {
      playerStrength: playerStr,
      monsterStrength: monsterStr,
      playerWins,
      loot: playerWins ? this._calcLoot(monster, helpers) : null,
      badStuff: !playerWins ? monster.bad_stuff : null,
    };
  }

  // Schätze für Sieg berechnen
  static _calcLoot(monster, helpers) {
    const total = monster.treasures || 1;
    if (helpers.length === 0) return { solo: total };
    // Mit Helfern: aufteilen (Elf-Rasse bekommt extra)
    return { shared: true, total };
  }
}

module.exports = { CombatSystem };
