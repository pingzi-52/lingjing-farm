import Phaser from "phaser";
import { createForestMap, createTownMap, type ExplorationKind, type ExplorationMap, type ForageNode } from "../../data/maps/explorationMaps";
import { Player } from "../entities/Player";
import { FarmEnvironment } from "../systems/farmEnvironment";
import { FarmAtmosphere } from "../systems/farmAtmosphere";
import { getGameSession } from "../systems/GameSession";
import { getFarmAudio } from "../systems/farmAudio";
import { FarmMenu } from "../../ui/FarmMenu";
import { AudioSettingsMenu } from "../../ui/AudioSettingsMenu";
import { ResidentDialogue } from "../../ui/ResidentDialogue";
import { CraftingMenu } from "../../ui/CraftingMenu";
import { TravelMenu } from "../../ui/TravelMenu";
import { openAreaExits, arrivalFrom, type AreaId } from "../../data/maps/areaConnections";
import { AreaPassage } from "../systems/areaPassage";

const TILE = 32;
const SEASONS = { spring: "春", summer: "夏", autumn: "秋", winter: "冬" };
const WEATHER = { sunny: "晴", cloudy: "阴", rain: "雨" };
const TEXT = { fontFamily: "monospace", fontSize: "11px", color: "#f0dfb9" };
const NODE_NAMES = { branch: "枯枝", stone: "石块", wild_mushroom: "野蘑菇" };
const FAILURES: Record<string, string> = {
  ALREADY_PICKED: "这里已采集，睡一觉后明天再来", TOO_TIRED: "体力不足，回农舍休息或制作蘑菇餐",
  INVENTORY_FULL: "背包已满，请先存放或出售物品", SAVE_FAILED: "保存失败，采集已撤回；请留在游戏内重试",
};

/** Connected beta areas share the real session, clock, audio and modal lifecycle. */
class ExplorationScene extends Phaser.Scene {
  public player!: Player;
  public resident!: Phaser.Physics.Arcade.Image;
  public nodeDisplays = new Map<string, Phaser.GameObjects.Image>();
  public worldMap!: ExplorationMap;
  private environment!: FarmEnvironment;
  private atmosphere!: FarmAtmosphere;
  private menu!: FarmMenu;
  private dialogue!: ResidentDialogue;
  private crafting!: CraftingMenu;
  private travelMenu!: TravelMenu;
  private passage?: AreaPassage;
  private fromArea?: AreaId;
  private audioSettings!: AudioSettingsMenu;
  private hud!: Phaser.GameObjects.Text;
  private materials!: Phaser.GameObjects.Text;
  private contextHint!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private statusTimer?: Phaser.Time.TimerEvent;
  private lastState = "";
  private lastStepX = 0;
  private lastStepY = 0;
  private clockPaused = true;
  private leaving = false;
  private saveFailed = false;
  private readonly onVisibility = (): void => {
    if (document.hidden) { this.clockPaused = true; this.player?.sprite.setVelocity(0, 0); getFarmAudio().setPaused(true); }
  };

  constructor(private readonly kind: ExplorationKind) { super(kind); }

  init(data?: { fromArea?: AreaId }): void { this.fromArea = data?.fromArea; }

  preload(): void {
    FarmEnvironment.preload(this);
    const base = `${import.meta.env.BASE_URL}farm-assets/original-addons/`;
    if (!this.textures.exists("farm-home-path")) this.load.atlas("farm-home-path", `${base}v1/dirt-road-v1.png`, `${base}v1/dirt-road-v1.json`);
    if (!this.textures.exists("farmhouse-main")) this.load.image("farmhouse-main", `${base}v2/farmhouse-v1.png`);
  }

  create(): void {
    this.worldMap = openAreaExits(this.kind === "forest" ? createForestMap() : createTownMap(), this.kind);
    this.nodeDisplays = new Map(); this.lastState = ""; this.clockPaused = true;
    this.leaving = false; this.saveFailed = false;
    this.physics.world.resume(); this.physics.world.setBounds(0, 0, this.worldMap.width * TILE, this.worldMap.height * TILE);
    this.input.enabled = true; this.input.keyboard!.enabled = true; this.input.keyboard!.resetKeys();
    this.environment = new FarmEnvironment(this);
    const solids = this.physics.add.staticGroup();
    for (let row = 0; row < this.worldMap.height; row++) for (let col = 0; col < this.worldMap.width; col++) {
      const tile = this.worldMap.tiles[row][col];
      if (!this.environment.render(tile, row, col, false)) this.add.image(col * TILE, row * TILE, "tile_grass").setOrigin(0).setDepth(0);
      if (tile.solid) {
        const body = solids.create((col + 0.5) * TILE, (row + 0.5) * TILE, "tile_fence") as Phaser.Physics.Arcade.Image;
        body.setDisplaySize(TILE, TILE).setVisible(false).refreshBody();
      }
    }
    this.renderPaths(); this.renderDecor();
    this.environment.applySeason(getGameSession().time.date.season);
    const start = this.worldMap.start;
    this.player = new Player(this, (start.col + 0.5) * TILE, (start.row + 0.5) * TILE);
    const arrival = this.fromArea ? arrivalFrom(this.kind, this.fromArea, this.worldMap.width) : null;
    if (arrival) this.player.sprite.body!.reset(arrival.x, arrival.y);
    this.physics.add.collider(this.player.sprite, solids);
    this.createResident();
    this.physics.add.collider(this.player.sprite, this.resident);
    this.createNodes();
    this.lastStepX = this.player.x; this.lastStepY = this.player.y;
    const camera = this.cameras.main;
    camera.setBounds(0, 0, this.worldMap.width * TILE, this.worldMap.height * TILE);
    camera.setZoom(1).setRoundPixels(true).startFollow(this.player.sprite, true, 0.1, 0.1);
    camera.setBackgroundColor("#454d28");
    this.menu = new FarmMenu(this, () => {});
    this.crafting = new CraftingMenu(this);
    this.dialogue = new ResidentDialogue(this, this.kind === "forest" ? "forest" : "carpenter", () => this.crafting.open());
    this.travelMenu = new TravelMenu(this);
    this.audioSettings = new AudioSettingsMenu(this);
    this.atmosphere = new FarmAtmosphere(this);
    this.add.rectangle(256, 29, 496, 44, 0x493824, 0.95).setStrokeStyle(1, 0xaf8c55).setScrollFactor(0).setDepth(98);
    this.hud = this.add.text(256, 13, "", TEXT).setOrigin(0.5, 0).setScrollFactor(0).setDepth(99);
    this.materials = this.add.text(256, 32, "", { ...TEXT, color: "#d8c592" }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(99);
    this.status = this.add.text(256, 66, "", { ...TEXT, backgroundColor: "#392b20dd" }).setOrigin(0.5).setWordWrapWidth(464).setAlign("center").setScrollFactor(0).setDepth(101);
    this.contextHint = this.add.text(256, 326, "", { ...TEXT, backgroundColor: "#34331bdc" }).setOrigin(0.5).setScrollFactor(0).setDepth(100);
    const controls = this.add.text(256, 366, "WASD 移动 · E 交互 · L 区域手记 · K 制作 · I 背包 · M 声音", TEXT)
      .setOrigin(0.5).setScrollFactor(0).setDepth(100);
    controls.setScale(Math.min(1, 492 / controls.width));
    this.add.text((start.col + 0.5) * TILE, (start.row + 1.8) * TILE, `${this.kind === "forest" ? "东侧小路" : "西侧乡道"}通往农场`, { ...TEXT, fontSize: "10px", backgroundColor: "#393421bb" })
      .setOrigin(0.5).setDepth(3);
    const keyboard = this.input.keyboard!;
    keyboard.on("keydown-E", this.interact, this);
    keyboard.on("keydown-L", this.openTravel, this);
    keyboard.on("keydown-K", this.openCrafting, this);
    keyboard.on("keydown-I", this.openInventory, this);
    keyboard.on("keydown-B", this.openMarket, this);
    keyboard.on("keydown-M", this.openAudio, this);
    keyboard.on("keydown-T", this.returnToTitle, this);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.refreshState();
    this.passage = new AreaPassage(this, this.kind, this.worldMap, this.player.sprite,
      () => getGameSession().saveGame(), () => { this.leaving = true; },
      () => this.notify("保存失败，仍留在当前区域；请稍后重试路口"));
  }

  private renderPaths(): void {
    const paths = new Set(this.worldMap.paths.map(p => `${p.row}_${p.col}`));
    if (!this.textures.exists("farm-home-path")) return;
    for (const p of this.worldMap.paths) {
      const n = paths.has(`${p.row - 1}_${p.col}`), s = paths.has(`${p.row + 1}_${p.col}`);
      const w = paths.has(`${p.row}_${p.col - 1}`), e = paths.has(`${p.row}_${p.col + 1}`);
      const frame = !n ? (!w ? "nw" : !e ? "ne" : "n") : !s ? (!w ? "sw" : !e ? "se" : "s") : !w ? "w" : !e ? "e" : "center";
      this.add.image(p.col * TILE, p.row * TILE, "farm-home-path", frame).setOrigin(0).setDisplaySize(TILE, TILE).setDepth(1);
    }
  }

  private renderDecor(): void {
    const occupied = new Set([...this.worldMap.paths, this.worldMap.start, this.worldMap.resident, ...this.worldMap.nodes, ...this.worldMap.props].map(p => `${p.row}_${p.col}`));
    if (this.textures.exists("TX Plant")) for (let r = 2; r < 22; r++) for (let c = 2; c < 30; c++) {
      if (this.worldMap.tiles[r][c].solid || occupied.has(`${r}_${c}`) || (r * 3 + c * 7) % 3 !== 0) continue;
      const frame = (r + c) % 4 ? "TX Plant - Grass 07" : "TX Plant - Flower 01";
      this.add.image(c * TILE + 12, r * TILE + 22, "TX Plant", frame).setOrigin(0.5, 1).setDepth(2);
      this.add.image(c * TILE + 24, r * TILE + 29, "TX Plant", "TX Plant - Grass 10").setOrigin(0.5, 1).setDepth(2);
    }
    for (const prop of this.worldMap.props) {
      if (!this.textures.exists("TX Props") || !this.textures.get("TX Props").has(prop.frame)) continue;
      const image = this.add.image((prop.col + 0.5) * TILE, (prop.row + 1) * TILE, "TX Props", prop.frame).setOrigin(0.5, 1);
      image.setScale(Math.min(1, 42 / image.frame.realHeight, 46 / image.frame.realWidth));
      image.setDepth(FarmEnvironment.objectDepth(image.y));
    }
    for (const b of this.worldMap.buildings) {
      if (this.textures.exists("farmhouse-main")) {
        const texture = this.textures.get("farmhouse-main");
        if (!texture.has("trimmed")) texture.add("trimmed", 0, 44, 164, 1117, 1033);
        const image = this.add.image((b.col + b.width / 2) * TILE, (b.row + b.height) * TILE, "farmhouse-main", "trimmed").setOrigin(0.5, 1);
        image.setScale(b.width * TILE / image.frame.realWidth).setDepth(FarmEnvironment.objectDepth(image.y));
        if (b.label === "林缘会馆") image.setTint(0xc7c7a9);
      }
      this.add.text((b.col + b.width / 2) * TILE, (b.row + b.height) * TILE + 13, b.label, { ...TEXT, backgroundColor: "#493a25dd" }).setOrigin(0.5).setDepth(12);
    }
  }

  private createResident(): void {
    const plot = this.worldMap.resident, x = (plot.col + 0.5) * TILE, y = (plot.row + 0.5) * TILE;
    this.resident = this.physics.add.staticImage(x, y, "player_0").setVisible(false);
    this.resident.setDisplaySize(32, 28).refreshBody();
    const frame = this.kind === "forest" ? "guide" : "carpenter";
    let key = "farm-beta-npcs", artFrame: string | undefined = frame;
    if (!this.textures.exists(key) || !this.textures.get(key).has(frame)) {
      key = this.textures.exists("farm-merchant-v1") ? "farm-merchant-v1" : "player_0";
      if (key === "farm-merchant-v1" && !this.textures.get(key).has("trimmed")) this.textures.get(key).add("trimmed", 0, 258, 216, 576, 1096);
      artFrame = key === "farm-merchant-v1" ? "trimmed" : undefined;
    }
    const image = this.add.image(x, y + 16, key, artFrame).setOrigin(0.5, 1).setScale(1);
    image.setScale(44 / image.frame.realHeight).setDepth(FarmEnvironment.objectDepth(y + 16));
    this.add.text(x, image.y - image.displayHeight - 5, this.kind === "forest" ? "岚 · 林缘向导" : "阿榆 · 木匠", { ...TEXT, fontSize: "10px", backgroundColor: "#342c1fcc" })
      .setOrigin(0.5, 1).setDepth(12);
  }

  private createNodes(): void {
    for (const node of this.worldMap.nodes) {
      const art = this.textures.exists("farm-forage-v1") && this.textures.get("farm-forage-v1").has(node.itemId);
      const image = this.add.image((node.col + 0.5) * TILE, (node.row + 1) * TILE - 3, art ? "farm-forage-v1" : "TX Props", art ? node.itemId : "TX Props - Stone 01")
        .setOrigin(0.5, 1).setDepth(3);
      image.setScale(Math.min(24 / image.frame.realWidth, 24 / image.frame.realHeight));
      this.nodeDisplays.set(node.id, image);
    }
  }

  private busy(): boolean { return this.leaving || this.menu.isOpen || this.dialogue.isOpen || this.crafting.isOpen || this.travelMenu.isOpen || this.audioSettings.isOpen; }
  private openTravel(): void { if (!this.busy()) this.travelMenu.open(); }
  private openCrafting(): void { if (!this.busy()) this.crafting.open(); }
  private openAudio(): void { if (!this.busy()) this.audioSettings.open(); }
  private openInventory(): void { if (!this.busy()) this.menu.open("inventory"); }
  private openMarket(): void { if (!this.busy()) this.menu.open("market"); }
  private nearResident(): boolean { return Math.hypot(this.player.x - this.resident.x, this.player.y - this.resident.y) <= 64; }
  private nearestNode(): ForageNode | undefined {
    return this.worldMap.nodes.map(node => ({ node, distance: Math.hypot(this.player.x - (node.col + 0.5) * TILE, this.player.y - (node.row + 0.5) * TILE) }))
      .filter(candidate => candidate.distance <= 44).sort((a, b) => a.distance - b.distance)[0]?.node;
  }
  private interact(): void {
    if (this.busy()) return;
    this.player.sprite.setVelocity(0, 0);
    if (this.nearResident()) { this.dialogue.open(); return; }
    const node = this.nearestNode();
    if (!node) { this.notify(this.kind === "forest" ? "靠近枯枝、石块或野蘑菇按 E 采集" : "靠近阿榆按 E 对话 · K 制作 · 西侧道路回农场"); return; }
    const result = getGameSession().gatherNode(node.id);
    getFarmAudio().play(result.ok ? "harvest" : "error");
    this.notify(result.ok ? `拾得${NODE_NAMES[node.itemId]} · 已保存` : FAILURES[result.reason] ?? "暂时无法采集");
    this.refreshState();
  }
  private returnToTitle(): void {
    if (this.busy()) return;
    if (!getGameSession().saveGame()) { getFarmAudio().play("error"); this.notify("保存失败，仍留在当前区域；请稍后重试 T"); return; }
    this.leaving = true; this.scene.start("title");
  }
  private notify(message: string): void {
    this.statusTimer?.destroy(); this.status.setText(message);
    this.statusTimer = this.time.delayedCall(3500, () => { this.status.setText(""); this.statusTimer = undefined; });
  }
  private refreshState(): void {
    const session = getGameSession(), state = session.exploration.state, date = session.time.date;
    const name = this.kind === "forest" ? "林缘森林" : "溪桥镇";
    this.hud.setText(`${name}　${SEASONS[date.season]} ${date.day}日 · ${WEATHER[session.weather.current().type]}　${session.life.clockText}　体力 ${session.life.energy}　${session.economy.goldValue} 金`);
    this.hud.setScale(Math.min(1, 480 / this.hud.width));
    this.materials.setText(`枯枝 ${session.inventory.count("branch")}　石块 ${session.inventory.count("stone")}　野蘑菇 ${session.inventory.count("wild_mushroom")}　蘑菇餐 ${session.inventory.count("mushroom_meal")}`);
    for (const [id, image] of this.nodeDisplays) image.setAlpha(state.picked.includes(id) ? 0.3 : 1);
    this.lastState = JSON.stringify([date, session.life.serialize(), session.economy.goldValue, session.inventory.serialize(), state]);
  }

  update(_time: number, delta: number): void {
    const audio = getFarmAudio();
    if (this.busy() || document.hidden) {
      this.clockPaused = true; this.player.sprite.setVelocity(0, 0); audio.setPaused(true); return;
    }
    const session = getGameSession(), clockDelta = this.clockPaused ? 0 : delta;
    this.clockPaused = false;
    this.player.update(delta);
    audio.setEnvironment("farm", session.weather.current().type, session.life.minute); audio.setPaused(false);
    if (Math.hypot(this.player.x - this.lastStepX, this.player.y - this.lastStepY) >= 8) {
      audio.play("step"); this.lastStepX = this.player.x; this.lastStepY = this.player.y;
    }
    if (session.advanceTime(clockDelta)) {
      const saved = session.saveGame();
      if (!saved && !this.saveFailed) this.notify("时间已推进，但保存失败；请留在游戏内重试保存");
      if (saved && this.saveFailed) this.notify("时间进度已重新保存");
      this.saveFailed = !saved;
    }
    this.atmosphere.update(session.life.minute, session.weather.current().type, clockDelta);
    const key = JSON.stringify([session.time.date, session.life.serialize(), session.economy.goldValue, session.inventory.serialize(), session.exploration.state]);
    if (key !== this.lastState) this.refreshState();
    const node = this.nearestNode();
    this.contextHint.setText(this.nearResident() ? "E 对话 / 委托" : node ? session.exploration.state.picked.includes(node.id) ? "已采集 · 睡一觉后明天再来" : `E 采集${NODE_NAMES[node.itemId]} · 体力 -2`
      : this.passage?.hint() ?? (session.life.isLate ? `夜深了 · 沿${this.kind === "forest" ? "东" : "西"}侧小路回农场`
        : this.kind === "forest" ? "沿林间小路探索 · E 采集 · 东路回农场" : "找阿榆了解制作 · K 制作 · 西路回农场"));
    this.passage?.update();
  }

  private shutdown(): void {
    const keyboard = this.input.keyboard;
    keyboard?.off("keydown-E", this.interact, this); keyboard?.off("keydown-L", this.openTravel, this);
    keyboard?.off("keydown-K", this.openCrafting, this); keyboard?.off("keydown-I", this.openInventory, this);
    keyboard?.off("keydown-B", this.openMarket, this); keyboard?.off("keydown-M", this.openAudio, this);
    keyboard?.off("keydown-T", this.returnToTitle, this);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.statusTimer?.destroy(); this.statusTimer = undefined;
    this.menu?.destroy(); this.dialogue?.destroy(); this.crafting?.destroy(); this.travelMenu?.destroy(); this.audioSettings?.destroy();
    this.atmosphere?.destroy(); getFarmAudio().setPaused(true);
    this.passage?.destroy(); this.passage = undefined;
    this.player?.destroy(); this.resident?.destroy(); this.nodeDisplays.clear();
  }
}

export class ForestScene extends ExplorationScene { constructor() { super("forest"); } }
export class TownScene extends ExplorationScene { constructor() { super("town"); } }
