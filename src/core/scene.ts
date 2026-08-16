import type { Renderer } from '../render/renderer';
import type { Game } from './game';

/**
 * A screen or mode: the title screen, the field, a battle, a menu.
 *
 * Scenes live on a stack. Pushing a scene (say, the pause menu) leaves the one
 * underneath alive but frozen; if the new scene is `transparent`, the one below
 * still renders, which is how menus overlay the field.
 */
export interface Scene {
  /** Render the scene below this one too. */
  readonly transparent?: boolean;

  /** Called when the scene is pushed onto the stack. */
  enter?(game: Game): void;
  /** Called when the scene is popped off the stack. */
  exit?(game: Game): void;
  /** Called when another scene is pushed on top of this one. */
  suspend?(game: Game): void;
  /** Called when the scene above this one is popped. */
  resume?(game: Game, result?: unknown): void;

  update(dt: number, game: Game): void;
  render(r: Renderer, game: Game): void;
}

type PendingOp =
  | { kind: 'push'; scene: Scene }
  | { kind: 'pop'; result?: unknown }
  | { kind: 'replace'; scene: Scene }
  | { kind: 'reset'; scene: Scene };

/**
 * Stack of scenes with deferred mutation: a scene can call `push`/`pop` from
 * inside its own `update` without the stack changing under its feet.
 */
export class SceneStack {
  private stack: Scene[] = [];
  private pending: PendingOp[] = [];

  constructor(private readonly game: Game) {}

  get current(): Scene | undefined {
    return this.stack[this.stack.length - 1];
  }

  get depth(): number {
    return this.stack.length;
  }

  push(scene: Scene): void {
    this.pending.push({ kind: 'push', scene });
  }

  /** Pop the top scene, optionally handing a result to the one beneath. */
  pop(result?: unknown): void {
    this.pending.push({ kind: 'pop', result });
  }

  /** Swap the top scene for another. */
  replace(scene: Scene): void {
    this.pending.push({ kind: 'replace', scene });
  }

  /** Clear the whole stack and start again with one scene. */
  reset(scene: Scene): void {
    this.pending.push({ kind: 'reset', scene });
  }

  update(dt: number): void {
    this.current?.update(dt, this.game);
    this.flush();
  }

  render(r: Renderer): void {
    // The very first frame can land before the initial push has been flushed.
    if (this.stack.length === 0) return;

    // Walk down to the deepest scene that must be drawn, then draw upwards.
    let base = this.stack.length - 1;
    while (base > 0 && this.stack[base]?.transparent) base--;
    for (let i = base; i < this.stack.length; i++) {
      this.stack[i]!.render(r, this.game);
    }
  }

  /** Apply queued stack operations. Runs after update, never during. */
  private flush(): void {
    while (this.pending.length > 0) {
      const op = this.pending.shift()!;
      switch (op.kind) {
        case 'push': {
          this.current?.suspend?.(this.game);
          this.stack.push(op.scene);
          op.scene.enter?.(this.game);
          break;
        }
        case 'pop': {
          const popped = this.stack.pop();
          popped?.exit?.(this.game);
          this.current?.resume?.(this.game, op.result);
          break;
        }
        case 'replace': {
          const popped = this.stack.pop();
          popped?.exit?.(this.game);
          this.stack.push(op.scene);
          op.scene.enter?.(this.game);
          break;
        }
        case 'reset': {
          while (this.stack.length > 0) this.stack.pop()?.exit?.(this.game);
          this.stack.push(op.scene);
          op.scene.enter?.(this.game);
          break;
        }
      }
    }
  }
}
