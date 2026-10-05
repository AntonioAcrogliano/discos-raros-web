import { ATTACKS, type AttackName, type Fighter, type Intent, type Level } from './fighter';

/**
 * IA simple del rival: se acerca, tira golpes cuando está a distancia y a veces bloquea lo
 * que ve venir. `level` (0, 1, 2…) la hace más rápida para decidir y mejor bloqueando.
 */
export class Cpu {
  private wait = 0.6;
  private hold: Intent = { move: 0, down: false, block: false, attack: null };
  private holdFor = 0;
  private reacted = false;
  private dodged = false;

  constructor(public level = 0) {}

  /** @param incoming lo más cercano que viene volando hacia él (distancia y altura), si hay algo. */
  think(dt: number, me: Fighter, foe: Fighter, incoming: { dist: number; level: Level } | null = null): Intent {
    const dist = Math.abs(foe.x - me.x);
    const skill = Math.min(1, 0.3 + this.level * 0.2);

    // Reaccionar a un golpe que viene: una sola tirada de dados por golpe.
    const threat = foe.state === 'attack' && foe.attack && !foe.landed ? ATTACKS[foe.attack] : null;
    if (!threat) this.reacted = false;
    else if (!this.reacted && foe.t > 0.05 && dist < threat.range + 0.25) {
      this.reacted = true;
      if (Math.random() < skill) {
        const down = threat.level === 'bajo' || (threat.level === 'alto' && Math.random() < 0.3);
        // Agacharse esquiva el golpe alto; el resto se bloquea a la altura que corresponde.
        this.hold = { move: 0, down, block: !(threat.level === 'alto' && down), attack: null };
        this.holdFor = threat.startup + threat.active - foe.t + 0.12;
      }
    }
    // Algo viene volando: cubrirse (o agacharse si viene alto) hasta que pase.
    if (!incoming) this.dodged = false;
    else if (!this.dodged && incoming.dist < 1.6) {
      // Una sola tirada de dados por cada cosa que le tiran.
      this.dodged = true;
      if (Math.random() < skill + 0.15) {
        const duck = incoming.level === 'alto';
        this.hold = { move: 0, down: duck, block: !duck, attack: null };
        this.holdFor = 0.5;
      }
    }
    if (this.holdFor > 0) {
      this.holdFor -= dt;
      return this.hold;
    }

    this.wait -= dt;
    const out: Intent = { ...this.hold, attack: null, block: false, down: false };
    if (this.wait > 0) return out;
    this.wait = 0.34 - skill * 0.18 + Math.random() * 0.25;

    if (dist > 2.3 && Math.random() < 0.22) {
      // De lejos: revolear algo.
      out.attack = Math.random() < 0.6 ? 'vinilo' : 'humo';
      out.move = 0;
    } else if (dist > 1.25 && dist < 1.9 && Math.random() < 0.07) {
      out.attack = 'vomito';
      out.move = 0;
    } else if (dist > 1.25) {
      // Lejos: acercarse (cada tanto duda).
      out.move = Math.random() < 0.85 ? 1 : 0;
    } else if (Math.random() < 0.45 + skill * 0.25) {
      const roll = Math.random();
      const pick: AttackName = dist > 1.05 ? 'patada' : roll < 0.4 ? 'alto' : roll < 0.7 ? 'bajo' : 'patada';
      out.attack = pick;
      out.move = 0;
    } else {
      // Cerca y sin pegar: un pasito atrás o quedarse cubierto.
      out.move = Math.random() < 0.5 ? -1 : 0;
      if (out.move === 0 && Math.random() < 0.5) {
        this.hold = { move: 0, down: false, block: true, attack: null };
        this.holdFor = 0.3;
        return this.hold;
      }
    }
    this.hold = { ...out, attack: null };
    return out;
  }
}
