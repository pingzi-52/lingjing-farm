import type Phaser from "phaser";
import "../styles/touch-controls.css";

/** Use the same keyboard paths as desktop so menus retain their pause/save rules. */
export function installTouchControls(game: Phaser.Game): void {
  const root = document.getElementById("game-root");
  const shell = document.getElementById("game-shell");
  const controls = document.getElementById("touch-controls");
  if (!root || !shell || !controls) return;
  const pressed = new Map<string, number>();
  const media = window.matchMedia("(pointer: coarse), (max-width: 800px)");
  const send = (code: string, keyCode: number, down: boolean): void => {
    document.body.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", {
      code, key: code === "Space" ? " " : code.startsWith("Key") ? code.slice(3).toLowerCase() : code,
      keyCode, which: keyCode, bubbles: true, cancelable: true,
    }));
  };
  const release = (): void => {
    for (const [code, keyCode] of pressed) send(code, keyCode, false);
    pressed.clear();
  };
  const makeButton = (label: string, code: string, keyCode: number, held = false): HTMLButtonElement => {
    const button = document.createElement("button");
    button.type = "button"; button.textContent = label; button.dataset.key = code;
    if (held) {
      button.addEventListener("pointerdown", event => {
        event.preventDefault();
        if (button.disabled) return;
        button.setPointerCapture(event.pointerId);
        pressed.set(code, keyCode); send(code, keyCode, true);
      });
      const end = (): void => { if (pressed.delete(code)) send(code, keyCode, false); };
      for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) button.addEventListener(event, end);
    } else button.addEventListener("click", () => {
      release(); send(code, keyCode, true); send(code, keyCode, false);
    });
    return button;
  };
  const dpad = document.createElement("div"); dpad.className = "touch-dpad";
  for (const [label, code, keyCode] of [["↑", "ArrowUp", 38], ["←", "ArrowLeft", 37], ["↓", "ArrowDown", 40], ["→", "ArrowRight", 39]] as const) {
    const button = makeButton(label, code, keyCode, true);
    button.setAttribute("aria-label", `向${{ ArrowUp: "上", ArrowLeft: "左", ArrowDown: "下", ArrowRight: "右" }[code]}移动`);
    dpad.append(button);
  }
  const actions = document.createElement("div"); actions.className = "touch-actions";
  for (const [label, code, keyCode] of [
    ["交互 / 收获", "KeyE", 69], ["使用工具", "Space", 32], ["背包", "KeyI", 73], ["集市", "KeyB", 66],
    ["地图", "KeyL", 76], ["制作", "KeyK", 75], ["农务", "KeyF", 70], ["任务", "KeyQ", 81],
    ["布置", "KeyG", 71], ["清理空地", "KeyX", 88], ["保存回标题", "KeyT", 84], ["关闭菜单", "Escape", 27],
  ] as const) actions.append(makeButton(label, code, keyCode));
  controls.append(dpad, actions);
  let lastScene = "";
  const refresh = (): void => {
    const active = game.scene.getScenes(true).map(scene => scene.scene.key).join(",");
    const modal = !!root.querySelector(".farm-menu-overlay");
    const title = active === "title" || active === "boot" || !active;
    if (active !== lastScene || modal || document.hidden) release();
    lastScene = active;
    controls.hidden = !media.matches || title;
    for (const button of controls.querySelectorAll("button")) button.disabled = modal && button.dataset.key !== "Escape";
    fit();
  };
  const fit = (): void => {
    const sideControls = !controls.hidden && window.innerHeight <= 500 && window.innerWidth >= 600;
    const availableWidth = window.innerWidth - 20 - (sideControls ? 246 : 0);
    const availableHeight = window.innerHeight - (!controls.hidden && !sideControls ? controls.offsetHeight + 12 : 0) - 62;
    const scale = Math.max(0.25, Math.min(1.5, availableWidth / 520, availableHeight / 392));
    root.style.transform = `scale(${scale})`;
    shell.style.width = `${520 * scale}px`; shell.style.height = `${392 * scale}px`;
    if (game.canvas) {
      game.scale.updateBounds();
      const bounds = game.scale.canvasBounds;
      game.scale.displayScale.set(512 / bounds.width, 384 / bounds.height);
    }
  };
  const observer = new MutationObserver(refresh); observer.observe(root, { childList: true });
  const onResize = (): void => { release(); refresh(); };
  window.addEventListener("resize", onResize); window.addEventListener("blur", release);
  document.addEventListener("visibilitychange", refresh); media.addEventListener("change", onResize);
  const onStep = (): void => {
    if (game.scene.getScenes(true).map(scene => scene.scene.key).join(",") !== lastScene) refresh();
  };
  game.events.on("step", onStep);
  game.events.once("destroy", () => {
    release(); observer.disconnect(); controls.replaceChildren(); game.events.off("step", onStep);
    window.removeEventListener("resize", onResize); window.removeEventListener("blur", release);
    document.removeEventListener("visibilitychange", refresh); media.removeEventListener("change", onResize);
  });
  refresh();
}
