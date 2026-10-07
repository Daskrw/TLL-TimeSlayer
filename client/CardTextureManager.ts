// ============================================================
//  CardTextureManager.ts
//  Async Three.js texture pipeline for remote card artwork.
//  – Maintains a Map cache keyed by imageUrl
//  – Lightweight canvas placeholder while image loads
//  – Hot-reloads when imageUrl changes (disposes stale textures)
//  – Thread-safe deduplication via promise coalescing
// ============================================================

import * as THREE from "three";

// ─────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────

export interface TextureEntry {
  texture: THREE.Texture;
  url:     string;
  refCount: number;
}

type OnLoadCallback = (texture: THREE.Texture) => void;

// ─────────────────────────────────────────────────────────────
//  Singleton Manager
// ─────────────────────────────────────────────────────────────

export class CardTextureManager {
  private static instance: CardTextureManager | null = null;

  private cache     = new Map<string, TextureEntry>();
  private pending   = new Map<string, Promise<THREE.Texture>>();
  private loader    = new THREE.TextureLoader();
  private _placeholder: THREE.Texture | null = null;

  private constructor() {}

  public static getInstance(): CardTextureManager {
    if (!CardTextureManager.instance) {
      CardTextureManager.instance = new CardTextureManager();
    }
    return CardTextureManager.instance;
  }

  // ── Placeholder ───────────────────────────────────────────────

  public getPlaceholder(): THREE.Texture {
    if (this._placeholder) return this._placeholder;

    const canvas = document.createElement("canvas");
    canvas.width  = 256;
    canvas.height = 360;
    const ctx = canvas.getContext("2d")!;

    // Dark background
    const bg = ctx.createLinearGradient(0, 0, 256, 360);
    bg.addColorStop(0, "#1a1030");
    bg.addColorStop(1, "#0a0618");
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(0, 0, 256, 360, 14);
    ctx.fill();

    // Shimmer border
    ctx.strokeStyle = "rgba(160,100,255,0.35)";
    ctx.lineWidth   = 3;
    ctx.beginPath();
    ctx.roundRect(4, 4, 248, 352, 12);
    ctx.stroke();

    // Loading skeleton bar
    const gradient = ctx.createLinearGradient(20, 0, 236, 0);
    gradient.addColorStop(0,   "rgba(140,100,255,0.08)");
    gradient.addColorStop(0.5, "rgba(180,140,255,0.22)");
    gradient.addColorStop(1,   "rgba(140,100,255,0.08)");

    for (const [y, h] of [[46, 155], [215, 16], [240, 12], [264, 12], [295, 22]] as Array<[number,number]>) {
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(10, y, 236, h, 4);
      ctx.fill();
    }

    // Center art placeholder icon
    ctx.fillStyle    = "rgba(160,100,255,0.3)";
    ctx.font         = "48px Arial";
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🃏", 128, 123);

    this._placeholder = new THREE.CanvasTexture(canvas);
    this._placeholder.colorSpace = THREE.SRGBColorSpace;
    return this._placeholder;
  }

  // ── Load (async, deduplicated) ────────────────────────────────

  public load(url: string): Promise<THREE.Texture> {
    // Already cached?
    const cached = this.cache.get(url);
    if (cached) {
      cached.refCount++;
      return Promise.resolve(cached.texture);
    }

    // In flight?
    const inflight = this.pending.get(url);
    if (inflight) return inflight;

    // Start fetch
    const promise = new Promise<THREE.Texture>((resolve, reject) => {
      // Add cache-buster for freshness
      const fetchUrl = `${url}${url.includes("?") ? "&" : "?"}_t=${Date.now()}`;
      this.loader.load(
        fetchUrl,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.needsUpdate = true;
          this.cache.set(url, { texture, url, refCount: 1 });
          this.pending.delete(url);
          resolve(texture);
        },
        undefined,
        (err) => {
          this.pending.delete(url);
          console.warn(`[CardTextureManager] Failed to load texture: ${url}`, err);
          reject(err);
        },
      );
    });

    this.pending.set(url, promise);
    return promise;
  }

  // ── Hot-swap: apply remote art onto an existing material ──────

  /**
   * Asynchronously loads `imageUrl` and composites it onto the
   * existing canvas card face stored in `material.map`.
   * Shows placeholder immediately, replaces with real art on load.
   */
  public applyToMaterial(
    material: THREE.MeshStandardMaterial,
    imageUrl: string,
    onApplied?: OnLoadCallback,
  ): void {
    if (!imageUrl) return;

    // Apply placeholder immediately while loading
    if (!material.map || material.map === this._placeholder) {
      material.map = this.getPlaceholder();
      material.needsUpdate = true;
    }

    this.load(imageUrl)
      .then((texture) => {
        // Compositing: blit the remote art into the art rect of the card face
        const composed = this.compositeArtOntoCard(material, texture);
        material.map = composed;
        material.needsUpdate = true;
        onApplied?.(composed);
      })
      .catch(() => {
        // Keep placeholder on failure
      });
  }

  /**
   * Composites a remote texture as the art panel on top of the
   * existing card face canvas texture (if it is a CanvasTexture).
   * Falls back to raw texture if card face isn't a canvas.
   */
  private compositeArtOntoCard(
    material: THREE.MeshStandardMaterial,
    artTexture: THREE.Texture,
  ): THREE.Texture {
    const existingMap = material.map;

    // If no existing canvas texture, just use the raw art
    if (!(existingMap instanceof THREE.CanvasTexture)) {
      return artTexture;
    }

    const srcCanvas = existingMap.image as HTMLCanvasElement;
    if (!srcCanvas || !srcCanvas.getContext) return artTexture;

    // Clone the card face canvas
    const canvas  = document.createElement("canvas");
    canvas.width  = srcCanvas.width;
    canvas.height = srcCanvas.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(srcCanvas, 0, 0);

    // Draw the remote art image into the art area (matching renderCardFaceCanvas art zone)
    // Art area: x=10, y=46, w=236, h=155
    const artX = 10, artY = 46, artW = 236, artH = 155;
    const img = artTexture.image as HTMLImageElement;
    if (img && img.naturalWidth) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(artX, artY, artW, artH, 6);
      ctx.clip();
      ctx.drawImage(img, artX, artY, artW, artH);
      ctx.restore();
    }

    const composed = new THREE.CanvasTexture(canvas);
    composed.colorSpace = THREE.SRGBColorSpace;
    return composed;
  }

  // ── Hot-reload ────────────────────────────────────────────────

  /**
   * Forces a cache-busted reload of the given URL and calls
   * `applyToMaterial` with the fresh texture.
   */
  public hotReload(
    material: THREE.MeshStandardMaterial,
    newUrl: string,
    onApplied?: OnLoadCallback,
  ): void {
    // Dispose old cached entry for this URL
    const existing = this.cache.get(newUrl);
    if (existing) {
      existing.texture.dispose();
      this.cache.delete(newUrl);
    }
    this.applyToMaterial(material, newUrl, onApplied);
  }

  // ── Release ───────────────────────────────────────────────────

  public release(url: string): void {
    const entry = this.cache.get(url);
    if (!entry) return;
    entry.refCount--;
    if (entry.refCount <= 0) {
      entry.texture.dispose();
      this.cache.delete(url);
    }
  }

  public disposeAll(): void {
    for (const entry of this.cache.values()) {
      entry.texture.dispose();
    }
    this.cache.clear();
    this.pending.clear();
    this._placeholder?.dispose();
    this._placeholder = null;
  }

  // ── Stats ─────────────────────────────────────────────────────

  public getCacheStats(): { cached: number; pending: number } {
    return { cached: this.cache.size, pending: this.pending.size };
  }
}

// Convenience singleton accessor
export const textures = CardTextureManager.getInstance();
