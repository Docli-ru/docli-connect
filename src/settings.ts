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
};

export const MAX_SUPERSEDED_MOVES = 50;

export function normalizeServerUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function scopeKey(folders: string[]): string {
  return folders.slice().sort().join("\n");
}
