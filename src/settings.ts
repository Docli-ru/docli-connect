// SPDX-FileCopyrightText: 2026 OOO Agitek
// SPDX-License-Identifier: MIT

export interface SupersededMove {

  localPath: string;

  serverPath: string;

  at: string;
}

export interface DocliSettings {

  serverUrl: string;

  pat: string;

  workspaceHandle: string;

  workspaceId: string;

  clientId: string;

  syncIntervalSecs: number;

  maxAttachmentMiB: number;

  lastSyncAt: string | null;

  locked: boolean;

  needsBootstrap: boolean;

  syncFolders: string[];

  supersededMoves: SupersededMove[];

  lastSyncedScopeKey: string;

  featuresNeedingUpdate: string;

  serverFeatures: string;

  mirrorCustomOrder: boolean;
}

export const DEFAULT_SETTINGS: DocliSettings = {
  serverUrl: "https://docli.ru",
  pat: "",
  workspaceHandle: "",
  workspaceId: "",
  clientId: "",
  syncIntervalSecs: 120,
  maxAttachmentMiB: 15,
  lastSyncAt: null,
  locked: false,
  needsBootstrap: false,
  syncFolders: [],
  supersededMoves: [],
  lastSyncedScopeKey: "",
  featuresNeedingUpdate: "",
  serverFeatures: "",
  mirrorCustomOrder: false,
};

export const MAX_SUPERSEDED_MOVES = 50;

export function normalizeServerUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function mirrorOrderAvailable(s: DocliSettings): boolean {
  return (
    s.mirrorCustomOrder &&
    s.syncFolders.length === 0 &&
    s.locked &&
    Boolean(s.serverUrl && s.pat && s.workspaceId && s.clientId)
  );
}

export function reorderGestureAdvertised(s: DocliSettings): boolean {
  const has = (csv: string, f: string) => csv.split(",").includes(f);
  return has(s.serverFeatures, "reorder") && !has(s.featuresNeedingUpdate, "reorder");
}

export function scopeKey(folders: string[]): string {
  return folders.slice().sort().join("\n");
}
