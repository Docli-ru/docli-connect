// SPDX-FileCopyrightText: 2026 OOO Agitek
// SPDX-License-Identifier: MIT

import { normalizePath, TFile, TFolder, type App } from "obsidian";
import { hasReservedSegment, type Kind, type VaultEntry, type VaultPort } from "./sync-client/index.js";

export function classifyFile(file: TFile): Kind {
  return file.extension.toLowerCase() === "md" ? "file" : "attachment";
}

export class ObsidianVaultPort implements VaultPort {
  constructor(private readonly app: App) {}

  async list(): Promise<VaultEntry[]> {
    return (await this.scan()).entries;
  }

  async scan(drainDeletes?: () => string[]): Promise<{ entries: VaultEntry[]; deletedPaths: string[] }> {

    const loaded = this.app.vault.getAllLoadedFiles();
    const deletedPaths = drainDeletes?.() ?? [];
    const files: TFile[] = [];
    const entries: VaultEntry[] = [];
    for (const f of loaded) {
      const path = f.path;
      if (path === "" || path === "/") continue;
      if (hasReservedSegment(path)) continue;
      if (f instanceof TFolder) {
        entries.push({ path, kind: "folder" });
      } else if (f instanceof TFile) {
        const kind = classifyFile(f);
        if (kind === "file") files.push(f);
        else entries.push({ path, kind });
      }
    }

    for (const f of files) entries.push({ path: f.path, kind: "file", body: await this.app.vault.cachedRead(f) });
    return { entries, deletedPaths };
  }

  async readFile(path: string): Promise<string> {
    const f = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (f instanceof TFile) return this.app.vault.cachedRead(f);
    return "";
  }

  async writeFile(path: string, body: string): Promise<void> {
    const p = normalizePath(path);
    const existing = this.app.vault.getAbstractFileByPath(p);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, body);
      return;
    }
    await this.ensureParent(p);
    await this.app.vault.create(p, body);
  }

  async mkdir(path: string): Promise<void> {
    const p = normalizePath(path);
    if (this.app.vault.getAbstractFileByPath(p)) return;
    await this.ensureParent(p);
    try {
      await this.app.vault.createFolder(p);
    } catch {
       /* noop */
    }
  }

  async remove(path: string): Promise<void> {
    const f = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (!f) return;
    await this.app.fileManager.trashFile(f);
  }

  async move(from: string, to: string): Promise<void> {
    const src = this.app.vault.getAbstractFileByPath(normalizePath(from));
    if (!src) return;
    const dest = normalizePath(to);
    await this.ensureParent(dest);
    await this.app.vault.rename(src, dest);
  }

  private async ensureParent(path: string): Promise<void> {
    const slash = path.lastIndexOf("/");
    if (slash < 0) return;
    const segments = path.slice(0, slash).split("/");
    let acc = "";
    for (const seg of segments) {
      acc = acc ? `${acc}/${seg}` : seg;
      if (!this.app.vault.getAbstractFileByPath(acc)) {
        try {
          await this.app.vault.createFolder(acc);
        } catch {
           /* noop */
        }
      }
    }
  }
}
