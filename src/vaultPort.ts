// SPDX-FileCopyrightText: 2026 OOO Agitek
// SPDX-License-Identifier: MIT

import { normalizePath, Platform, TFile, TFolder, type App } from "obsidian";
import { hasReservedSegment, type Kind, type VaultEntry, type VaultPort } from "./sync-client/index.js";
import { decodeWinPath, encodeWinPath } from "./winPath.js";

export function classifyFile(file: TFile): Kind {
  return file.extension.toLowerCase() === "md" ? "file" : "attachment";
}

export class ObsidianVaultPort implements VaultPort {

  constructor(
    private readonly app: App,
    private readonly winNames: boolean = Platform.isWin,
  ) {}

  private toLocal(serverPath: string): string {
    return this.winNames ? encodeWinPath(serverPath) : serverPath;
  }

  private toServer(localPath: string): string {
    return this.winNames ? decodeWinPath(localPath) : localPath;
  }

  async list(): Promise<VaultEntry[]> {
    return (await this.scan()).entries;
  }

  async listMeta(): Promise<VaultEntry[]> {
    const entries: VaultEntry[] = [];
    for (const f of this.app.vault.getAllLoadedFiles()) {
      const path = this.toServer(f.path);
      if (path === "" || path === "/") continue;
      if (hasReservedSegment(path)) continue;
      if (f instanceof TFolder) {
        entries.push({ path, kind: "folder" });
      } else if (f instanceof TFile) {
        entries.push({ path, kind: classifyFile(f), size: f.stat?.size, mtime: f.stat?.mtime });
      }
    }
    return entries;
  }

  async scan(drainDeletes?: () => string[]): Promise<{ entries: VaultEntry[]; deletedPaths: string[] }> {

    const loaded = this.app.vault.getAllLoadedFiles();
    const deletedPaths = drainDeletes?.() ?? [];
    const files: TFile[] = [];
    const entries: VaultEntry[] = [];
    for (const f of loaded) {
      const path = this.toServer(f.path);
      if (path === "" || path === "/") continue;
      if (hasReservedSegment(path)) continue;
      if (f instanceof TFolder) {
        entries.push({ path, kind: "folder" });
      } else if (f instanceof TFile) {
        const kind = classifyFile(f);
        if (kind === "file") files.push(f);
        else entries.push({ path, kind, size: f.stat?.size, mtime: f.stat?.mtime });
      }
    }

    for (const f of files) {
      const body = await this.app.vault.cachedRead(f);

      const suspectRead = body === "" && (f.stat?.size ?? 0) > 0;
      entries.push({
        path: this.toServer(f.path),
        kind: "file",
        body,
        size: f.stat?.size,
        mtime: f.stat?.mtime,
        ...(suspectRead ? { suspectRead: true } : {}),
      });
    }
    return { entries, deletedPaths };
  }

  async readFile(path: string): Promise<string> {
    const f = this.app.vault.getAbstractFileByPath(normalizePath(this.toLocal(path)));
    if (f instanceof TFile) return this.app.vault.cachedRead(f);
    return "";
  }

  async writeFile(path: string, body: string): Promise<void> {
    const p = normalizePath(this.toLocal(path));
    const existing = this.app.vault.getAbstractFileByPath(p);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, body);
      return;
    }
    await this.ensureParent(p);
    await this.app.vault.create(p, body);
  }

  async mkdir(path: string): Promise<void> {
    const p = normalizePath(this.toLocal(path));
    if (this.app.vault.getAbstractFileByPath(p)) return;
    await this.ensureParent(p);
    try {
      await this.app.vault.createFolder(p);
    } catch {
       /* noop */
    }
  }

  async remove(path: string): Promise<void> {
    const f = this.app.vault.getAbstractFileByPath(normalizePath(this.toLocal(path)));
    if (!f) return;
    await this.app.fileManager.trashFile(f);
  }

  async move(from: string, to: string): Promise<void> {
    const src = this.app.vault.getAbstractFileByPath(normalizePath(this.toLocal(from)));
    if (!src) return;
    const dest = normalizePath(this.toLocal(to));
    await this.ensureParent(dest);
    await this.app.vault.rename(src, dest);
  }

  async stat(path: string): Promise<{ size: number; mtime: number } | null> {
    const f = this.app.vault.getAbstractFileByPath(normalizePath(this.toLocal(path)));
    if (f instanceof TFile) return { size: f.stat.size, mtime: f.stat.mtime };
    return null;
  }

  async readBinary(path: string): Promise<Uint8Array> {
    const f = this.app.vault.getAbstractFileByPath(normalizePath(this.toLocal(path)));
    if (!(f instanceof TFile)) return new Uint8Array();
    return new Uint8Array(await this.app.vault.readBinary(f));
  }

  async writeBinary(path: string, bytes: Uint8Array): Promise<void> {
    const p = normalizePath(this.toLocal(path));
    const buf = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buf).set(bytes);
    const existing = this.app.vault.getAbstractFileByPath(p);
    if (existing instanceof TFile) {
      await this.app.vault.modifyBinary(existing, buf);
      return;
    }
    await this.ensureParent(p);
    await this.app.vault.createBinary(p, buf);
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
