import { ATTACKS, type AttackName, type Fighter, type Intent, type Level, NO_INTENT } from './fighter';

/** Qué tan viva es la CPU en cada dificultad. */
export interface Difficulty {
  name: string;
  /** Probabilidad de cubrirse de un golpe o de algo que le tiran (0–1). */
  defense: number;
  /** Segundos entre una decisión y la otra. */
  wait: number;
  /** Probabilidad de pegar cuando está a distancia (0–1). */
  aggression: number;
  /** Probabilidad de tirar una habilidad cuando está lejos. */
  specials: number;
  /** Probabilidad de agarrar al que se queda bloqueando. */
  grabs: number;
  /** Probabilidad de saltar el vinilo en vez de bloquearlo. */
  jumps: number;
}

export const DIFFICULTIES: Difficulty[] = [
  { name: 'FACIL', defense: 0.12, wait: 0.55, aggression: 0.3, specials: 0.06, grabs: 0, jumps: 0 },
  { name: 'NORMAL', defense: 0.45, wait: 0.3, aggression: 0.55, specials: 0.2, grabs: 0.25, jumps: 0.3 },
  { name: 'DIFICIL', defense: 0.8, wait: 0.15, aggression: 0.8, specials: 0.3, grabs: 0.6, jumps: 0.65 },
];

/**
 * IA del rival: se acerca, tira golpes cuando está a distancia, usa las habilidades de lejos,
 * agarra al que bloquea mucho y se cubre de lo que ve venir, según la dificultad.
 */
export class Cpu {
  difficulty = DIFFICULTIES[1];
  private wait = 0.6;
  private hold: Intent = { ...NO_INTENT };
  private holdFor = 0;
  private reacted = false;
  private dodged = false;

  /** @param incoming lo más cercano que viene volando hacia él (distancia y altura), si hay algo. */
  think(dt: number, me: Fighter, foe: Fighter, incoming: { dist: number; level: Level } | null = null): Intent {
    const dist = Math.abs(foe.x - me.x);
    const d = this.difficulty;

    // Reaccionar a un golpe que viene: una sola tirada de dados por golpe.
    const threat = foe.state === 'attack' && foe.attack && !foe.landed ? ATTACKS[foe.attack] : null;
    if (!threat) this.reacted = false;
    else if (!this.reacted && foe.t > 0.05 && dist < threat.range + 0.25) {
      this.reacted = true;
      if (Math.random() < d.defense) {
        // El agarre no se bloquea: hay que agacharse. El golpe alto también se puede esquivar así.
        const down = Boolean(threat.grab) || threat.level === 'bajo' || (threat.level === 'alto' && Math.random() < 0.3);
        this.hold = { ...NO_INTENT, down, block: !threat.grab && !(threat.level === 'alto' && down) };
        this.holdFor = threat.startup + threat.active - foe.t + 0.12;
      }
    }
    // Algo viene volando: saltarlo, cubrirse o agacharse (si viene alto) hasta que pase.
    if (!incoming) this.dodged = false;
    else if (!this.dodged && incoming.dist < 1.7) {
      this.dodged = true;
      if (Math.random() < d.defense + 0.1) {
        const duck = incoming.level === 'alto';
        const jump = !duck && Math.random() < d.jumps;
        this.hold = { ...NO_INTENT, down: duck, up: jump, block: !duck && !jump };
        this.holdFor = jump ? 0.08 : 0.5;
      }
    }
    if (this.holdFor > 0) {
      this.holdFor -= dt;
      return this.hold;
    }

    this.wait -= dt;
    const out: Intent = { ...NO_INTENT, move: this.hold.move };
    if (this.wait > 0) return out;
    this.wait = d.wait * (0.7 + Math.random() * 0.8);

    if (dist > 2.3 && Math.random() < d.specials) {
      // De lejos: revolear algo.
      out.attack = Math.random() < 0.6 ? 'vinilo' : 'humo';
      out.move = 0;
    } else if (dist > 1.25 && dist < 1.9 && Math.random() < d.specials * 0.3) {
      out.attack = 'vomito';
      out.move = 0;
    } else if (dist > 1.25) {
      // Lejos: acercarse (cada tanto duda, o entra saltando).
      out.move = Math.random() < 0.85 ? 1 : 0;
      if (dist < 2.6 && Math.random() < d.jumps * 0.15) out.up = true;
    } else if (dist < 0.98 && foe.blocking && Math.random() < d.grabs) {
      // Se queda cubierto: agarrarlo.
      out.attack = 'agarre';
      out.move = 0;
    } else if (Math.random() < d.aggression) {
      const roll = Math.random();
      const pick: AttackName = dist > 1.05 ? 'patada' : roll < 0.4 ? 'alto' : roll < 0.7 ? 'bajo' : 'patada';
      out.attack = pick;
      out.move = 0;
    } else {
      // Cerca y sin pegar: un pasito atrás o quedarse cubierto.
      out.move = Math.random() < 0.5 ? -1 : 0;
      if (out.move === 0 && Math.random() < 0.5) {
        this.hold = { ...NO_INTENT, block: true };
        this.holdFor = 0.3;
        return this.hold;
      }
    }
    this.hold = { ...out, attack: null, up: false };
    return out;
  }
}
