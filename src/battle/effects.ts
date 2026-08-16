import type { BitmapFont } from '../render/font';
import type { Renderer } from '../render/renderer';
import type { TechFx } from '../data/types';

interface Effect {
  shape: TechFx['shape'];
  color: string;
  x: number;
  y: number;
  age: number;
  life: number;
}

interface FloatingText {
  text: string;
  x: number;
  y: number;
  age: number;
  life: number;
  color: string;
  /** Larger text for criticals. */
  emphasis: boolean;
}

const EFFECT_LIFE = 0.5;
const FLOAT_LIFE = 0.95;
const FLOAT_RISE = 22;

/**
 * Transient battle visuals: tech animations, damage numbers, screen shake.
 *
 * The battle engine emits events; this turns them into things you can see. It
 * holds no gameplay state, so effects can be restyled freely.
 */
export class EffectSystem {
  private effects: Effect[] = [];
  private floats: FloatingText[] = [];
  private shakeTime = 0;
  private shakeStrength = 0;

  spawn(fx: TechFx, x: number, y: number): void {
    this.effects.push({
      shape: fx.shape,
      color: fx.color,
      x,
      y,
      age: 0,
      life: EFFECT_LIFE + (fx.linger ?? 0),
    });
  }

  float(text: string, x: number, y: number, color: string, emphasis = false): void {
    // Nudge overlapping numbers apart so simultaneous hits stay readable.
    const collisions = this.floats.filter((f) => Math.abs(f.x - x) < 18 && Math.abs(f.y - y) < 12).length;
    this.floats.push({
      text,
      x,
      y: y - collisions * 9,
      age: 0,
      life: FLOAT_LIFE,
      color,
      emphasis,
    });
  }

  shake(strength: number): void {
    this.shakeStrength = Math.max(this.shakeStrength, strength);
    this.shakeTime = 0.28;
  }

  /** Current screen offset from shake, applied by the scene before drawing. */
  get shakeOffset(): { x: number; y: number } {
    if (this.shakeTime <= 0) return { x: 0, y: 0 };
    const decay = this.shakeTime / 0.28;
    const magnitude = this.shakeStrength * decay;
    return {
      x: Math.round(Math.sin(this.shakeTime * 90) * magnitude),
      y: Math.round(Math.cos(this.shakeTime * 71) * magnitude * 0.6),
    };
  }

  get busy(): boolean {
    return this.effects.length > 0;
  }

  update(dt: number): void {
    if (this.shakeTime > 0) this.shakeTime -= dt;

    this.effects = this.effects.filter((effect) => {
      effect.age += dt;
      return effect.age < effect.life;
    });

    this.floats = this.floats.filter((float) => {
      float.age += dt;
      return float.age < float.life;
    });
  }

  clear(): void {
    this.effects.length = 0;
    this.floats.length = 0;
    this.shakeTime = 0;
  }

  render(r: Renderer): void {
    for (const effect of this.effects) {
      const t = Math.min(1, effect.age / effect.life);
      r.ctx.save();
      r.ctx.globalAlpha = 1 - t * t;
      this.drawShape(r, effect, t);
      r.ctx.restore();
    }
  }

  renderText(r: Renderer, font: BitmapFont, fontLarge: BitmapFont): void {
    for (const float of this.floats) {
      const t = float.age / float.life;
      // Rise quickly then settle, and fade only at the end.
      const rise = FLOAT_RISE * Math.sqrt(t);
      const alpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;

      r.ctx.save();
      r.ctx.globalAlpha = alpha;
      const face = float.emphasis ? fontLarge : font;
      face.drawCentered(r.ctx, float.text, float.x, float.y - rise, float.color, '#12121b');
      r.ctx.restore();
    }
  }

  private drawShape(r: Renderer, effect: Effect, t: number): void {
    const { x, y, color } = effect;

    switch (effect.shape) {
      case 'slash': {
        // A widening diagonal streak.
        const length = 12 + t * 34;
        r.ctx.save();
        r.ctx.strokeStyle = color;
        r.ctx.lineWidth = 3 * (1 - t) + 1;
        r.ctx.beginPath();
        r.ctx.moveTo(x - length * 0.6, y - length * 0.5);
        r.ctx.lineTo(x + length * 0.6, y + length * 0.5);
        r.ctx.stroke();
        r.ctx.beginPath();
        r.ctx.moveTo(x - length * 0.5, y + length * 0.45);
        r.ctx.lineTo(x + length * 0.5, y - length * 0.45);
        r.ctx.stroke();
        r.ctx.restore();
        return;
      }

      case 'burst': {
        const radius = 6 + t * 26;
        r.fillEllipse(x, y, radius, radius * 0.85, color);
        r.fillEllipse(x, y, radius * 0.55, radius * 0.45, '#ffffff');
        return;
      }

      case 'ring': {
        const radius = 4 + t * 40;
        r.ctx.save();
        r.ctx.strokeStyle = color;
        r.ctx.lineWidth = 3 * (1 - t) + 1;
        r.ctx.beginPath();
        r.ctx.ellipse(x, y, radius, radius * 0.5, 0, 0, Math.PI * 2);
        r.ctx.stroke();
        r.ctx.restore();
        return;
      }

      case 'beam': {
        const height = 5 * (1 - t) + 2;
        r.fillRect(0, y - height / 2, r.width, height, color);
        r.fillRect(0, y - height / 4, r.width, Math.max(1, height / 2), '#ffffff');
        return;
      }

      case 'rain': {
        // Vertical shafts of light falling across the target area.
        for (let i = 0; i < 7; i++) {
          const offsetX = x + (i - 3) * 13;
          const progress = Math.min(1, t * 1.6 - i * 0.05);
          if (progress <= 0) continue;
          const top = y - 70 + progress * 60;
          r.fillRect(offsetX, top, 2, 40 * progress, color);
        }
        return;
      }

      case 'aura': {
        const radius = 10 + Math.sin(t * Math.PI) * 12;
        r.ctx.save();
        r.ctx.strokeStyle = color;
        r.ctx.lineWidth = 2;
        r.ctx.beginPath();
        r.ctx.ellipse(x, y, radius * 0.7, radius, 0, 0, Math.PI * 2);
        r.ctx.stroke();
        r.ctx.restore();
        return;
      }

      case 'impact': {
        // Ground crack: a squashed burst plus radiating spokes.
        const radius = 8 + t * 24;
        r.fillEllipse(x, y + 6, radius, radius * 0.35, color);
        r.ctx.save();
        r.ctx.strokeStyle = color;
        r.ctx.lineWidth = 1;
        for (let i = 0; i < 5; i++) {
          const angle = (i / 5) * Math.PI * 2;
          r.ctx.beginPath();
          r.ctx.moveTo(x, y + 6);
          r.ctx.lineTo(x + Math.cos(angle) * radius * 1.3, y + 6 + Math.sin(angle) * radius * 0.5);
          r.ctx.stroke();
        }
        r.ctx.restore();
        return;
      }
    }
  }
}
