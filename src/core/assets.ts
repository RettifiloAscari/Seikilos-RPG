/**
 * Image and audio registry.
 *
 * Art is looked up by a stable string key (`'tileset.town'`, `'actor.kairos'`).
 * Right now those keys are filled by the procedural placeholder generator; when
 * real art arrives it registers under the same keys and no game code changes.
 */

export type Drawable = HTMLImageElement | HTMLCanvasElement;

export class Assets {
  private images = new Map<string, Drawable>();
  private sounds = new Map<string, HTMLAudioElement>();

  /** Register an already-built canvas (used by the placeholder art generator). */
  register(key: string, image: Drawable): void {
    this.images.set(key, image);
  }

  has(key: string): boolean {
    return this.images.has(key);
  }

  async loadImage(key: string, url: string): Promise<void> {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`Failed to load image "${key}" from ${url}`));
      el.src = url;
    });
    this.images.set(key, image);
  }

  /** Load a whole `{ key: url }` manifest in parallel. */
  async loadImages(manifest: Record<string, string>): Promise<void> {
    await Promise.all(Object.entries(manifest).map(([key, url]) => this.loadImage(key, url)));
  }

  /**
   * Load a manifest but don't fail the boot if entries are missing. Returns the
   * keys that failed, so the game can fall back to placeholder art per-asset.
   */
  async loadImagesOptional(manifest: Record<string, string>): Promise<string[]> {
    const failures: string[] = [];
    await Promise.all(
      Object.entries(manifest).map(async ([key, url]) => {
        try {
          await this.loadImage(key, url);
        } catch {
          failures.push(key);
        }
      }),
    );
    return failures;
  }

  image(key: string): Drawable {
    const image = this.images.get(key);
    if (!image) throw new Error(`Asset "${key}" was requested before it was registered`);
    return image;
  }

  /** Like `image`, but returns undefined instead of throwing. */
  tryImage(key: string): Drawable | undefined {
    return this.images.get(key);
  }

  registerSound(key: string, url: string): void {
    const audio = new Audio(url);
    audio.preload = 'auto';
    this.sounds.set(key, audio);
  }

  playSound(key: string, volume = 1): void {
    const source = this.sounds.get(key);
    if (!source) return;
    // Clone so the same effect can overlap with itself.
    const instance = source.cloneNode(true) as HTMLAudioElement;
    instance.volume = volume;
    void instance.play().catch(() => {
      /* autoplay policy; ignore until the player interacts */
    });
  }
}
