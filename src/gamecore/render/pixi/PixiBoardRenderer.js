import { Application, Assets, Container, Graphics, Sprite, Text } from 'pixi.js';
import { SPRITE_MANIFEST, getShipSpriteUrl } from './SpriteManifest.js';

const COLORS = {
  cryos: 0x63b3ed,
  ignis: 0xfc8181,
  grey: 0x8fa3a7,
  move: 0x49dcb1,
  attack: 0xff5964,
  colonize: 0xf6e05e,
};

export class PixiBoardRenderer {
  constructor(host, onCellClick, onCellHover = () => {}) {
    this.host = host;
    this.onCellClick = onCellClick;
    this.onCellHover = onCellHover;
    this.app = null;
    this.snapshot = null;
    this.selection = null;
    this.actions = [];
    this.cellSize = 64;
    this.shipSprites = new Map();
  }

  async init() {
    this.app = new Application();
    await this.app.init({
      width: 720,
      height: 720,
      backgroundColor: 0x02050d,
      antialias: true,
      resolution: Math.min(globalThis.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    this.app.canvas.className = 'game-canvas';
    this.app.canvas.setAttribute('aria-label', 'Игровое поле Space Commander');
    this.host.replaceChildren(this.app.canvas);

    this.layers = {
      background: new Container({ label: 'backgroundLayer' }),
      grid: new Container({ label: 'gridLayer' }),
      planets: new Container({ label: 'planetLayer' }),
      movement: new Container({ label: 'movementOverlayLayer' }),
      ships: new Container({ label: 'shipLayer' }),
      effects: new Container({ label: 'effectsLayer' }),
      labels: new Container({ label: 'labelsLayer' }),
    };
    this.app.stage.addChild(...Object.values(this.layers));
    this.app.canvas.addEventListener('pointerdown', (event) => this.#handlePointer(event));
    this.app.canvas.addEventListener('pointermove', (event) => this.#handleHover(event));
    this.app.canvas.addEventListener('pointerleave', () => this.onCellHover(null, null, null));
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);
    this.resize();
  }

  resize() {
    if (!this.app) return;
    const size = Math.max(300, Math.min(760, this.host.clientWidth || 720, globalThis.innerHeight - 150));
    this.app.renderer.resize(size, size);
    this.cellSize = size / (this.snapshot?.map.width ?? 10);
    this.render(this.snapshot, this.selection, this.actions);
  }

  render(snapshot, selection = null, actions = []) {
    if (!this.app || !snapshot) return;
    this.snapshot = snapshot;
    this.selection = selection;
    this.actions = actions;
    this.cellSize = this.app.screen.width / snapshot.map.width;
    this.shipSprites.clear();
    for (const layer of Object.values(this.layers)) layer.removeChildren().forEach((child) => child.destroy());
    this.#drawBackground(snapshot);
    this.#drawGrid(snapshot);
    this.#drawActions(actions);
    for (const planet of snapshot.planets) this.#drawPlanet(planet);
    for (const ship of snapshot.ships) this.#drawShip(ship);
  }

  async playAction(result) {
    if (!this.app || !result?.executed) return;
    const cell = result.to ?? result.from;
    if (!cell) return;
    const color = result.actionType === 'MOVE' ? COLORS.move
      : result.actionType === 'COLONIZE' ? COLORS.colonize : COLORS.attack;
    const effect = new Graphics()
      .circle((cell[0] + 0.5) * this.cellSize, (cell[1] + 0.5) * this.cellSize, this.cellSize * 0.16)
      .stroke({ color, width: 4, alpha: 0.9 });
    this.layers.effects.addChild(effect);
    await new Promise((resolve) => {
      const started = performance.now();
      const animate = () => {
        const progress = Math.min(1, (performance.now() - started) / 260);
        effect.scale.set(1 + progress * 2.5);
        effect.alpha = 1 - progress;
        if (progress >= 1) {
          this.app.ticker.remove(animate);
          effect.destroy();
          resolve();
        }
      };
      this.app.ticker.add(animate);
    });
  }

  destroy() {
    this.resizeObserver?.disconnect();
    this.app?.destroy(true, { children: true, texture: false });
  }

  #drawBackground(snapshot) {
    const size = this.cellSize * snapshot.map.width;
    const background = new Graphics().rect(0, 0, size, size).fill(0x02050d);
    for (let index = 0; index < 90; index += 1) {
      const x = ((index * 97 + 31) % 997) / 997 * size;
      const y = ((index * 193 + 17) % 991) / 991 * size;
      const radius = index % 11 === 0 ? 1.4 : 0.7;
      background.circle(x, y, radius).fill({ color: 0xffffff, alpha: index % 5 === 0 ? 0.7 : 0.35 });
    }
    this.layers.background.addChild(background);
  }

  #drawGrid(snapshot) {
    const grid = new Graphics();
    const width = snapshot.map.width * this.cellSize;
    const height = snapshot.map.height * this.cellSize;
    for (let x = 0; x <= snapshot.map.width; x += 1) {
      grid.moveTo(x * this.cellSize, 0).lineTo(x * this.cellSize, height);
    }
    for (let y = 0; y <= snapshot.map.height; y += 1) {
      grid.moveTo(0, y * this.cellSize).lineTo(width, y * this.cellSize);
    }
    grid.stroke({ color: 0x426489, width: 1, alpha: 0.28 });
    this.layers.grid.addChild(grid);
    if (this.selection) {
      this.layers.grid.addChild(
        new Graphics()
          .rect(
            this.selection.x * this.cellSize + 2,
            this.selection.y * this.cellSize + 2,
            this.cellSize - 4,
            this.cellSize - 4,
          )
          .stroke({ color: COLORS[this.selection.faction] ?? 0xffffff, width: 3, alpha: 0.9 }),
      );
    }
  }

  #drawActions(actions) {
    for (const action of actions) {
      if (!action.to) continue;
      const color = action.type === 'MOVE' ? COLORS.move
        : action.type === 'COLONIZE' ? COLORS.colonize
          : action.type === 'WAIT' ? 0xffffff : COLORS.attack;
      const marker = new Graphics()
        .circle(
          (action.to[0] + 0.5) * this.cellSize,
          (action.to[1] + 0.5) * this.cellSize,
          action.type === 'MOVE' ? this.cellSize * 0.1 : this.cellSize * 0.22,
        )
        .fill({ color, alpha: action.type === 'MOVE' ? 0.5 : 0.18 })
        .stroke({ color, width: 2, alpha: 0.8 });
      this.layers.movement.addChild(marker);
    }
  }

  #drawPlanet(planet) {
    const x = (planet.x + 0.5) * this.cellSize;
    const y = (planet.y + 0.5) * this.cellSize;
    const container = new Container();
    const glow = new Graphics()
      .circle(x, y, this.cellSize * 0.39)
      .fill({ color: COLORS[planet.faction] ?? COLORS.grey, alpha: 0.16 })
      .stroke({ color: COLORS[planet.faction] ?? COLORS.grey, width: 2, alpha: 0.85 });
    const sprite = new Sprite(Assets.get(SPRITE_MANIFEST.planets[planet.type]));
    sprite.anchor.set(0.5);
    sprite.position.set(x, y);
    sprite.width = this.cellSize * 0.68;
    sprite.height = this.cellSize * 0.68;
    const mask = new Graphics().circle(x, y, this.cellSize * 0.34).fill(0xffffff);
    sprite.mask = mask;
    container.addChild(glow, sprite, mask);
    this.layers.planets.addChild(container);
    this.layers.labels.addChild(this.#label(`${Math.ceil(planet.hp)}`, x, y + this.cellSize * 0.31));
  }

  #drawShip(ship) {
    const url = getShipSpriteUrl(ship.faction, ship.type);
    if (!url) return;
    const sprite = new Sprite(Assets.get(url));
    sprite.anchor.set(0.5);
    sprite.position.set((ship.x + 0.5) * this.cellSize, (ship.y + 0.5) * this.cellSize);
    sprite.width = this.cellSize * 0.82;
    sprite.height = this.cellSize * 0.82;
    sprite.alpha = ship.hasActed ? 0.52 : 1;
    this.layers.ships.addChild(sprite);
    this.shipSprites.set(ship.id, sprite);
    const maxHp = this.snapshot ? this.snapshot.ships.find((item) => item.id === ship.id)?.hp : ship.hp;
    const label = this.#label(`${Math.ceil(ship.hp)}`, sprite.x, sprite.y + this.cellSize * 0.31);
    label.style.fill = ship.hasActed ? 0x9aa8bc : 0xffffff;
    this.layers.labels.addChild(label);
    void maxHp;
  }

  #label(value, x, y) {
    const label = new Text({
      text: value,
      style: {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: Math.max(9, this.cellSize * 0.15),
        fontWeight: '700',
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 3 },
      },
    });
    label.anchor.set(0.5);
    label.position.set(x, y);
    return label;
  }

  #handlePointer(event) {
    if (!this.snapshot) return;
    const rect = this.app.canvas.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) / rect.width * this.snapshot.map.width);
    const y = Math.floor((event.clientY - rect.top) / rect.height * this.snapshot.map.height);
    if (x >= 0 && y >= 0 && x < this.snapshot.map.width && y < this.snapshot.map.height) {
      this.onCellClick(x, y);
    }
  }

  #handleHover(event) {
    if (event.pointerType === 'touch' || !this.snapshot) return;
    const cell = this.#eventToCell(event);
    if (!cell) {
      this.onCellHover(null, null, null);
      return;
    }
    this.onCellHover(cell.x, cell.y, { x: event.clientX, y: event.clientY });
  }

  #eventToCell(event) {
    const rect = this.app.canvas.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) / rect.width * this.snapshot.map.width);
    const y = Math.floor((event.clientY - rect.top) / rect.height * this.snapshot.map.height);
    if (x < 0 || y < 0 || x >= this.snapshot.map.width || y >= this.snapshot.map.height) return null;
    return { x, y };
  }
}
