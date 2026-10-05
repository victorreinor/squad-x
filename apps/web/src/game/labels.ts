import * as THREE from "three";

/** A billboard that shows text drawn on a canvas: counters, hit points, reward names. */
export class TextSprite {
  readonly sprite: THREE.Sprite;
  private readonly canvas = document.createElement("canvas");
  private readonly ctx = this.canvas.getContext("2d")!;
  private readonly texture: THREE.CanvasTexture;
  private shown = "";

  /** `width` x `height` is the size in world units; the canvas keeps the same ratio. */
  constructor(width: number, height: number, private readonly size = 96) {
    this.canvas.width = Math.round(size * (width / height) * 1.6);
    this.canvas.height = Math.round(size * 1.6);
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, transparent: true, depthWrite: false }));
    this.sprite.scale.set(width, height, 1);
  }

  /** Redraw only when the text or colour changes. */
  set(text: string, fill = "#ffffff", stroke = "#1b1b2a") {
    const key = `${text}|${fill}|${stroke}`;
    if (key === this.shown) return;
    this.shown = key;
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = `900 ${this.size}px "Arial Black", Impact, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = this.size * 0.2;
    ctx.strokeStyle = stroke;
    ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
    ctx.fillStyle = fill;
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.texture.dispose();
    this.sprite.material.dispose();
  }
}
