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
  authMode: "pat" | "oauth";
  oauthSecretRef: string;

  setupReminders: boolean;

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
  setupReminders: true,
  serverUrl: "https://docli.ru",
  pat: "",
  authMode: "oauth",
  oauthSecretRef: "",
  workspaceHandle: "",
  workspaceId: "",
  clientId: "",
  syncIntervalSecs: 120,
  maxAttachmentMiB: 50,
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

export function mirrorOrderAvailable(s: DocliSettings, authenticated = Boolean(s.pat)): boolean {
  return (
    s.mirrorCustomOrder &&
    s.syncFolders.length === 0 &&
    s.locked &&
    Boolean(s.serverUrl && authenticated && s.workspaceId && s.clientId)
  );
}

export function reorderGestureAdvertised(s: DocliSettings): boolean {
  const has = (csv: string, f: string) => csv.split(",").includes(f);
  return has(s.serverFeatures, "reorder") && !has(s.featuresNeedingUpdate, "reorder");
}

export function scopeKey(folders: string[]): string {
  return folders.slice().sort().join("\n");
}

export function loadSettings(saved: Partial<DocliSettings> | null): DocliSettings {
  const settings = { ...DEFAULT_SETTINGS, ...saved };
  settings.authMode = saved?.authMode ?? (saved?.pat ? "pat" : "oauth");
  if (!Number.isFinite(settings.maxAttachmentMiB) || settings.maxAttachmentMiB <= 0) settings.maxAttachmentMiB = 50;
  settings.setupReminders = saved?.setupReminders !== false;
  return settings;
}
