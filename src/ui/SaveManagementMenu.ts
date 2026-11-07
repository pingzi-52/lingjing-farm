import type Phaser from "phaser";
import { getGameSession } from "../game/systems/GameSession";
import { MAX_SAVE_BYTES, type SaveImportPreview } from "../persistence/save";
import { TimeService } from "../domain/services/TimeService";
import { getFarmAudio } from "../game/systems/farmAudio";
import { PausePanel, node } from "./PausePanel";
import { SAVE_VERSION } from "../domain/models/types";

const ERRORS: Record<string, string> = {
  INVALID_SAVE: "文件不是有效的游戏存档，请选择之前导出的 JSON 文件。",
  UNSUPPORTED_VERSION: "这是更新版本的存档，当前游戏无法读取；原存档未改动。",
  SAVE_TOO_LARGE: "文件或当前存档超过 256 KiB，无法安全处理；原存档未改动。",
  NO_SAVE: "还没有可导出的存档，请先开始游戏并保存。",
  NO_IMPORT_BACKUP: "还没有导入前备份。替换已有存档时会自动保留一份。",
  SAVE_CHANGED: "当前存档在预览后发生变化，请重新选择文件查看再导入。",
  STORAGE_FAILED: "无法读取或写入浏览器存储，导入未完成。请检查空间后重试。",
};
const SEASONS = { spring: "春", summer: "夏", autumn: "秋", winter: "冬" };

/** File operations stay explicit and only commit after the player's preview confirmation. */
export class SaveManagementMenu extends PausePanel {
  private prepared: { raw: string; preview: SaveImportPreview } | null = null;
  private fileName = "";
  private message = "";
  private reading = false;
  private generation = 0;

  constructor(scene: Phaser.Scene, private readonly imported: () => void) { super(scene, "存档管理", "KeyS"); }

  open(): void {
    if (!this.begin()) return;
    this.prepared = null; this.fileName = ""; this.message = ""; this.reading = false;
    this.render();
  }

  override close(): void {
    this.generation++;
    this.prepared = null; this.reading = false;
    super.close();
  }

  private report(reason: string): void {
    this.message = ERRORS[reason] ?? "操作未完成，当前存档未替换。";
    getFarmAudio().play("error"); this.render();
  }

  private exportFile(beforeImport = false): void {
    const save = getGameSession().save;
    const result = beforeImport ? save.exportImportBackup() : save.exportSave();
    if (!result.ok) { this.report(result.reason); return; }
    const url = URL.createObjectURL(new Blob([result.value.raw], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url; link.download = `lingjing-farm-${beforeImport ? "before-import-" : ""}day-${result.value.day}.save.json`;
    document.body.append(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.message = beforeImport ? "导入前的进度已交给浏览器下载。需要找回时，选择此文件预览并确认导入。" : "存档文件已交给浏览器下载。请保留文件，在另一台电脑的标题页导入。";
    getFarmAudio().play("confirm"); this.render();
  }

  private async selectFile(file?: File): Promise<void> {
    const generation = ++this.generation;
    this.prepared = null; this.fileName = file?.name ?? ""; this.message = ""; this.reading = false;
    if (!file) { this.render(); return; }
    if (file.size > MAX_SAVE_BYTES) { this.report("SAVE_TOO_LARGE"); return; }
    this.reading = true; this.render();
    try {
      const raw = await file.text();
      if (!this.isOpen || this.generation !== generation) return;
      this.reading = false;
      const result = getGameSession().save.previewImport(raw);
      if (!result.ok) { this.report(result.reason); return; }
      this.prepared = { raw, preview: result.value };
      this.render();
    } catch {
      if (!this.isOpen || this.generation !== generation) return;
      this.reading = false; this.message = "文件读取失败，请重新选择；当前存档未改动。"; this.render();
    }
  }

  private confirmImport(): void {
    if (!this.prepared || this.reading) return;
    const result = getGameSession().save.importSave(this.prepared.raw, this.prepared.preview.previousRaw);
    if (!result.ok) {
      if (result.reason === "SAVE_CHANGED") this.prepared = null;
      this.report(result.reason); return;
    }
    getFarmAudio().play("confirm"); this.close(); this.imported();
  }

  private render(): void {
    if (!this.isOpen) return;
    const panel = this.panel("存档管理");
    panel.append(node("p", "farm-menu-note", "游玩进度保存在当前浏览器。用存档文件在电脑或浏览器之间搬家。"));
    const actions = node("div", "merchant-actions");
    actions.append(this.button("导出当前存档", "save-export", () => this.exportFile()),
      this.button("导出导入前备份", "save-export-backup", () => this.exportFile(true))); panel.append(actions);
    const label = node("label", "save-file-label", "选择要导入的存档文件（JSON，最多 256 KiB）");
    const input = node("input", "save-file-input");
    input.type = "file"; input.accept = ".json,application/json"; input.dataset.action = "save-file";
    input.addEventListener("change", () => { void this.selectFile(input.files?.[0]); });
    label.append(input); panel.append(label);
    if (this.fileName) panel.append(node("p", "farm-menu-note", `已选择：${this.fileName}`));
    if (this.reading) panel.append(node("p", "farm-menu-status", "正在检查存档…"));
    if (this.prepared) {
      const { data, sourceVersion, previousRaw } = this.prepared.preview;
      const date = new TimeService(data.day).date;
      const preview = node("div", "merchant-quest save-preview");
      preview.append(node("strong", "", "待导入的生活"),
        node("p", "", `${SEASONS[date.season]} · 第 ${data.day} 天 · ${data.gold} 金`),
        node("small", "", `文件版本 V${sourceVersion}${sourceVersion < SAVE_VERSION ? `，导入后升级为 V${SAVE_VERSION}` : ""} · 背包、木箱、田地、委托与家具将一并恢复。`),
        node("p", "", previousRaw === null ? "当前没有主存档，确认后将创建导入存档。" : "确认后替换当前进度，原始存档会保留为导入前副本，自动保存不会更新它。有效副本可在本页导出。"));
      const controls = node("div", "merchant-actions");
      controls.append(this.button("确认导入并替换", "save-import-confirm", () => this.confirmImport()),
        this.button("取消导入", "save-import-cancel", () => {
          this.generation++; this.prepared = null; this.fileName = ""; this.message = "已取消，当前存档未改动。"; this.render();
        }));
      preview.append(controls); panel.append(preview);
    }
    const status = node("p", "farm-menu-status", this.message || "先查看文件信息，再确认导入。S / Esc 关闭，不会自动导入。");
    status.setAttribute("role", "status"); panel.append(status); this.show(panel);
  }
}
