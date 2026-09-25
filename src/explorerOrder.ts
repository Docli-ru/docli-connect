// SPDX-FileCopyrightText: 2026 OOO Agitek
// SPDX-License-Identifier: MIT

import { naturalCmp } from "./sync-client/index.js";

export { naturalCmp };

export interface OrderEntry {
  id: string;
  position?: string;
}

const basename = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

export function orderBands<T>(
  items: T[],
  pathOf: (item: T) => string | undefined,
  entryFor: (path: string) => OrderEntry | undefined,
  override?: string[],
): T[] {
  try {
    const rows = items.map((item, index) => {
      const path = pathOf(item);
      const entry = path !== undefined ? entryFor(path) : undefined;
      return { item, index, path, entry };
    });
    if (override && override.length) {
      const at = new Map(override.map((p, i) => [p, i]));
      return rows
        .slice()
        .sort((a, b) => {
          const ai = a.path !== undefined ? (at.get(a.path) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
          const bi = b.path !== undefined ? (at.get(b.path) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
          return ai - bi || a.index - b.index;
        })
        .map((r) => r.item);
    }
    if (!rows.some((r) => r.entry)) return items;
    const band = (r: (typeof rows)[number]): number => (r.entry?.position ? 1 : r.entry ? 2 : 3);
    return rows
      .slice()
      .sort((a, b) => {
        const ba = band(a);
        const bb = band(b);
        if (ba !== bb) return ba - bb;
        if (ba === 3) return a.index - b.index;
        if (ba === 1 && a.entry!.position !== b.entry!.position) {
          return a.entry!.position! < b.entry!.position! ? -1 : 1;
        }
        const byName = naturalCmp(basename(a.path ?? ""), basename(b.path ?? ""));
        if (byName !== 0) return byName;
        return a.entry!.id < b.entry!.id ? -1 : a.entry!.id > b.entry!.id ? 1 : 0;
      })
      .map((r) => r.item);
  } catch {
    return items;
  }
}

export function parentOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

export function neighborsFromOrder(
  orderPaths: string[],
  targetPath: string,
  edge: "before" | "after",
  draggedPath: string,
): { beforePath: string | null; afterPath: string | null; newOrder: string[] } | null {
  if (targetPath === draggedPath) return null;
  const tIdx = orderPaths.indexOf(targetPath);
  if (tIdx < 0) return null;
  const insertAt = edge === "after" ? tIdx + 1 : tIdx;
  const dIdx = orderPaths.indexOf(draggedPath);
  const rest = orderPaths.filter((p) => p !== draggedPath);
  const pos = dIdx >= 0 && dIdx < insertAt ? insertAt - 1 : insertAt;
  const newOrder = [...rest.slice(0, pos), draggedPath, ...rest.slice(pos)];
  if (dIdx >= 0 && newOrder.every((p, i) => p === orderPaths[i])) return null;
  return {
    beforePath: rest[pos - 1] ?? null,
    afterPath: rest[pos] ?? null,
    newOrder,
  };
}

export interface ReorderRequest {
  nodeId: string;
  beforeId: string | null;
  afterId: string | null;

  parentPath: string;

  newOrder: string[];
}

export interface ExplorerOrderDeps {

  enabled: () => boolean;

  entryFor: (path: string) => OrderEntry | undefined;

  overrideFor: (parentPath: string) => string[] | undefined;

  onReorder: (req: ReorderRequest) => void;
}

interface ExplorerItemLike {
  file?: { path?: string };
}

interface ExplorerViewLike {
  getSortedFolderItems?: (folder: unknown) => ExplorerItemLike[];
  requestSort?: () => void;
  containerEl?: HTMLElement;
}

interface WorkspaceLike {
  getLeavesOfType(type: string): Array<{ view?: unknown }>;
}

export class ExplorerOrderPatch {
  private proto: { getSortedFolderItems?: (folder: unknown) => ExplorerItemLike[] } | null = null;
  private original: ((folder: unknown) => ExplorerItemLike[]) | null = null;
  private gesture: ExplorerReorderGesture | null = null;

  constructor(
    private readonly workspace: WorkspaceLike,
    private readonly deps: ExplorerOrderDeps,
  ) {}

  private view(): ExplorerViewLike | undefined {
    try {
      return this.workspace.getLeavesOfType("file-explorer")[0]?.view as ExplorerViewLike | undefined;
    } catch {
      return undefined;
    }
  }

  install(withGesture: boolean): boolean {
    try {
      const view = this.view();
      if (!view || typeof view.getSortedFolderItems !== "function") return false;
      const proto = Object.getPrototypeOf(view) as {
        getSortedFolderItems?: (folder: unknown) => ExplorerItemLike[];
      };
      if (typeof proto.getSortedFolderItems !== "function") return false;
      this.proto = proto;
      this.original = proto.getSortedFolderItems;
      const deps = this.deps;
      const original = this.original;
      proto.getSortedFolderItems = function (this: unknown, folder: unknown): ExplorerItemLike[] {
        const items = original.call(this, folder);
        try {
          if (!deps.enabled()) return items;
          const folderPath = (folder as { path?: string } | undefined)?.path;
          const parent = folderPath === undefined || folderPath === "/" ? "" : folderPath;
          return orderBands(
            items,
            (it) => it.file?.path,
            deps.entryFor,
            deps.overrideFor(parent),
          );
        } catch {
          return items;
        }
      };
      if (withGesture && view.containerEl) {
        try {
          this.gesture = new ExplorerReorderGesture(view.containerEl, this.deps);
          this.gesture.install();
        } catch {
          this.gesture = null;
        }
      }
      return true;
    } catch {
      this.uninstall();
      return false;
    }
  }

  uninstall(): void {
    try {
      if (this.proto && this.original) this.proto.getSortedFolderItems = this.original;
    } catch {
       /* noop */
    }
    this.proto = null;
    this.original = null;
    try {
      this.gesture?.uninstall();
    } catch {
       /* noop */
    }
    this.gesture = null;
    this.requestSort();
  }

  requestSort(): void {
    try {
      this.view()?.requestSort?.();
    } catch {
       /* noop */
    }
  }
}

export class ExplorerReorderGesture {
  private dragPath: string | null = null;
  private indicator: HTMLElement | null = null;
  private slot: { targetPath: string; edge: "before" | "after" } | null = null;

  private readonly onDragStart = (e: DragEvent): void => {

    this.dragPath = this.deps.enabled() ? this.rowPath(e.target) : null;
    this.clearSlot();
  };
  private readonly onDragEnd = (): void => {
    this.dragPath = null;
    this.clearSlot();
  };
  private readonly onDragOver = (e: DragEvent): void => {
    try {
      const dragged = this.dragPath;
      if (!dragged || !this.deps.enabled()) return;
      const rowEl = this.rowEl(e.target);
      const target = rowEl ? this.rowPath(rowEl) : null;
      if (!rowEl || !target || target === dragged || parentOf(target) !== parentOf(dragged)) {
        this.clearSlot();
        return;
      }
      const rect = rowEl.getBoundingClientRect();
      const frac = rect.height > 0 ? (e.clientY - rect.top) / rect.height : 1;
      const isFolder = rowEl.classList.contains("nav-folder-title");
      let edge: "before" | "after" | null;
      if (isFolder) {
        edge = frac < 0.25 ? "before" : frac > 0.75 ? "after" : null;
      } else {
        edge = frac < 0.5 ? "before" : "after";
      }
      if (!edge) {
        this.clearSlot();
        return;
      }
      e.preventDefault();
      this.slot = { targetPath: target, edge };
      this.paintIndicator(rowEl, edge);
    } catch {
      this.clearSlot();
    }
  };
  private readonly onDrop = (e: DragEvent): void => {
    try {
      const dragged = this.dragPath;
      const slot = this.slot;
      this.dragPath = null;
      this.clearSlot();
      if (!dragged || !slot || !this.deps.enabled()) return;

      const parent = parentOf(dragged);
      if (parentOf(slot.targetPath) !== parent) return;
      const order = this.domOrder(parent);
      const nb = neighborsFromOrder(order, slot.targetPath, slot.edge, dragged);
      if (!nb) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const nodeId = this.deps.entryFor(dragged)?.id;
      const beforeId = nb.beforePath === null ? null : this.deps.entryFor(nb.beforePath)?.id;
      const afterId = nb.afterPath === null ? null : this.deps.entryFor(nb.afterPath)?.id;
      e.preventDefault();
      e.stopPropagation();
      if (!nodeId || beforeId === undefined || afterId === undefined) return;
      this.deps.onReorder({
        nodeId,
        beforeId,
        afterId,
        parentPath: parent,
        newOrder: nb.newOrder,
      });
    } catch {
      this.clearSlot();
    }
  };
  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      this.dragPath = null;
      this.clearSlot();
    }
  };

  constructor(
    private readonly containerEl: HTMLElement,
    private readonly deps: ExplorerOrderDeps,
  ) {}

  install(): void {
    this.containerEl.addEventListener("dragstart", this.onDragStart, true);
    this.containerEl.addEventListener("dragend", this.onDragEnd, true);
    this.containerEl.addEventListener("dragover", this.onDragOver, true);
    this.containerEl.addEventListener("drop", this.onDrop, true);
    window.addEventListener("keydown", this.onKeyDown, true);
  }

  uninstall(): void {
    this.containerEl.removeEventListener("dragstart", this.onDragStart, true);
    this.containerEl.removeEventListener("dragend", this.onDragEnd, true);
    this.containerEl.removeEventListener("dragover", this.onDragOver, true);
    this.containerEl.removeEventListener("drop", this.onDrop, true);
    window.removeEventListener("keydown", this.onKeyDown, true);
    this.clearSlot();
  }

  private rowEl(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof HTMLElement)) return null;
    return target.closest<HTMLElement>(".nav-file-title[data-path], .nav-folder-title[data-path]");
  }

  private rowPath(target: EventTarget | null): string | null {
    const el = target instanceof HTMLElement ? this.rowEl(target) ?? null : null;
    return el?.getAttribute("data-path") ?? null;
  }

  private domOrder(parent: string): string[] {
    const out: string[] = [];
    const rows = this.containerEl.querySelectorAll<HTMLElement>(
      ".nav-file-title[data-path], .nav-folder-title[data-path]",
    );
    rows.forEach((el) => {
      const p = el.getAttribute("data-path");
      if (p && parentOf(p) === parent) out.push(p);
    });
    return out;
  }

  private paintIndicator(rowEl: HTMLElement, edge: "before" | "after"): void {
    if (!this.indicator) {

      this.indicator = this.containerEl.createEl("div", { cls: "docli-order-indicator" });
    }
    const c = this.containerEl.getBoundingClientRect();
    const r = rowEl.getBoundingClientRect();
    const st = this.indicator.style;
    st.left = `${r.left - c.left + 8}px`;
    st.width = `${Math.max(0, r.width - 16)}px`;
    st.top = `${(edge === "before" ? r.top : r.bottom) - c.top + this.containerEl.scrollTop - 1}px`;
    this.indicator.classList.add("is-active");
  }

  private clearSlot(): void {
    this.slot = null;
    this.indicator?.classList.remove("is-active");
  }
}
