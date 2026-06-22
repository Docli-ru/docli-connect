// SPDX-FileCopyrightText: 2026 OOO Agitek
// SPDX-License-Identifier: MIT

import { Notice, Platform, Plugin, TFile } from "obsidian";
import {
  emptyState,
  folderScope,
  hasReservedSegment,
  isScopeWiden,
  mapLimit,
  NIL_UUID,
  SyncClient,
  withRetry,
  type Capability,
  type NotifyStatus,
  type RenameHint,
  type StatePort,
} from "@docli/sync-client";
import { DEFAULT_SETTINGS, MAX_SUPERSEDED_MOVES, normalizeServerUrl, scopeKey, type DocliSettings } from "./settings.js";
import { RequestUrlTransport, type VersionMismatchInfo } from "./transport.js";
import { compareSemver } from "./semver.js";
import { ObsidianVaultPort, classifyFile } from "./vaultPort.js";
import { IndexedDbKv, KvStatePort, PendingDeletesStore, type KvStore } from "./statePort.js";
import { DocliSettingTab } from "./settingsTab.js";
import { AlertModal, ConfirmModal } from "./confirmModal.js";
import { plural, t } from "./i18n.js";
import { WebSocketNotifyPort } from "./wsNotify.js";
import { downloadAttachment, uploadAttachment, type AttachmentDeps } from "./attachments.js";

export default class DocliPlugin extends Plugin {
  settings: DocliSettings = { ...DEFAULT_SETTINGS };

  private kv: KvStore | null = null;
  private statusEl: HTMLElement | null = null;

  private settingTab: DocliSettingTab | null = null;

  private pendingHints: RenameHint[] = [];

  private readonly uploaded = new Set<string>();

  private readonly skipNotified = new Set<string>();
  private syncing = false;
  private debounce: number | null = null;

  private ticker: number | null = null;

  private nextSyncAt: number | null = null;

  private lastError = false;

  upgradeRequired = false;

  upgradeInfo: VersionMismatchInfo | null = null;

  private versionBlocked = false;

  private notifyDisposer: (() => void) | null = null;

  private notifyStatus: NotifyStatus = "disconnected";

  private pokePending = false;

  private dirty = false;

  private pendingDeletes: string[] = [];

  private deletesStore: PendingDeletesStore | null = null;
  private deletesStoreKey = "";

  private lastDrained: string[] = [];

  private massDeleteDeclinedUntil = 0;

  async onload(): Promise<void> {

    try {
      this.settingTab = new DocliSettingTab(this.app, this);
      this.addSettingTab(this.settingTab);
      this.addCommand({ id: "sync-now", name: t("cmd.syncNow"), callback: () => void this.runSync(true) });
      this.statusEl = this.addStatusBarItem();
    } catch (e) {
      console.error("docli: UI registration failed", e);
    }

    try {
      await this.loadSettings();

      if (!this.settings.clientId) {
        this.settings.clientId = crypto.randomUUID();
        await this.saveSettings();
      }

      this.registerEvent(
        this.app.vault.on("rename", (file, oldPath) => {
          if (!hasReservedSegment(oldPath) && !hasReservedSegment(file.path)) {
            this.pendingHints.push({ oldPath, newPath: file.path });
          }

          this.uploaded.delete(oldPath);
          this.skipNotified.delete(oldPath);

          this.dropPendingDelete(file.path);
          this.scheduleSync();
        }),
      );
      this.registerEvent(
        this.app.vault.on("create", (file) => {

          this.dropPendingDelete(file.path);
          this.scheduleSync();
        }),
      );
      this.registerEvent(this.app.vault.on("modify", () => this.scheduleSync()));
      this.registerEvent(
        this.app.vault.on("delete", (file) => {

          if (!hasReservedSegment(file.path)) {
            this.pendingDeletes.push(file.path);
            this.persistTombstones();
          }

          this.uploaded.delete(file.path);
          this.skipNotified.delete(file.path);
          this.scheduleSync();
        }),
      );

      this.scheduleInterval();
      this.startTicker();
      this.app.workspace.onLayoutReady(() => void this.runSync(false));

      this.connectNotify();
    } catch (e) {

      console.error("docli: startup failed", e);
      new Notice(t("notice.failedStart", { msg: String((e as Error)?.message ?? e) }));
      this.paintStatus("red", t("status.failedStart"));
    }
  }

  onunload(): void {
    if (this.debounce !== null) window.clearTimeout(this.debounce);
    if (this.ticker !== null) window.clearInterval(this.ticker);
    this.disconnectNotify();

    void this.deletesStore?.flush();
  }

  connectNotify(): void {
    this.disconnectNotify();
    if (!this.canSync()) return;
    if (Platform.isMobile && !normalizeServerUrl(this.settings.serverUrl).startsWith("https://")) {
      return;
    }
    const port = new WebSocketNotifyPort(this.settings.serverUrl, this.settings.pat);
    this.notifyDisposer = port.connect(this.settings.workspaceId, {
      onPoke: () => this.onPoke(),
      onConnect: () => this.onPoke(),
      onStatus: (s) => {
        this.notifyStatus = s;
        this.renderStatus();
      },
    });
  }

  disconnectNotify(): void {
    if (this.notifyDisposer) {
      this.notifyDisposer();
      this.notifyDisposer = null;
    }
    this.notifyStatus = "disconnected";
  }

  private onPoke(): void {
    if (this.syncing) {
      this.pokePending = true;
      return;
    }
    void this.runSync(false);
  }

  async loadSettings(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) as Partial<DocliSettings>) };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  scheduleInterval(): void {
    const secs = this.settings.syncIntervalSecs;
    this.nextSyncAt = secs > 0 ? Date.now() + Math.max(30, secs) * 1000 : null;
    this.renderStatus();
  }

  private startTicker(): void {
    if (this.ticker !== null) return;
    this.ticker = window.setInterval(() => this.tick(), 1000);
    this.registerInterval(this.ticker);
  }

  private tick(): void {

    if (!this.syncing && this.nextSyncAt !== null && Date.now() >= this.nextSyncAt && this.canSync()) {
      void this.runSync(false);
    }
  }

  private renderStatus(): void {
    const last = this.settings.lastSyncAt
      ? t("status.last.synced", { time: new Date(this.settings.lastSyncAt).toLocaleTimeString() })
      : t("status.last.never");

    if (!this.isConfigured()) {
      return this.paintStatus("red", t("status.notConfigured"));
    }
    if (!this.settings.locked) {
      return this.paintStatus("off", t("status.notLocked"));
    }
    if (this.upgradeRequired) {

      return this.paintStatus("red", t("status.upgradeRequired"));
    }
    if (this.lastError) {
      return this.paintStatus("red", t("status.error", { last }));
    }
    if (this.syncing) {
      return this.paintStatus(this.notifyStatus === "connected" ? "green" : "yellow", t("status.syncing", { last }));
    }
    if (this.notifyStatus === "connected") {
      return this.paintStatus("green", t("status.live", { last }));
    }

    const manual = this.nextSyncAt === null;
    return this.paintStatus("yellow", t("status.pollingOrManual", {
      mode: manual ? t("status.mode.manual") : t("status.mode.polling"),
      last,
    }));
  }

  private paintStatus(light: "green" | "yellow" | "red" | "off", tooltip: string): void {
    const el = this.statusEl;
    if (!el) return;
    const emoji =
      light === "green" ? "🟢" : light === "yellow" ? "🟡" : light === "red" ? "🔴" : "⏸️";
    el.setText(`d: ${emoji}`);
    el.setAttribute("aria-label", tooltip);
  }

  onVersionMismatch(info: VersionMismatchInfo): void {
    this.versionBlocked = true;
    this.upgradeInfo = info;
    if (!this.upgradeRequired) {

      this.upgradeRequired = true;
      new AlertModal(this.app, {
        title: t("modal.upgrade.title"),
        body: [
          info.code === "PLUGIN_OUTDATED" && info.minVersion
            ? t("settings.notice.outdated.body", {
                clientVersion: info.clientVersion ?? this.manifest.version,
                minVersion: info.minVersion,
              })
            : t("settings.notice.upgrade.body"),
        ],
        acceptText: t("modal.upgrade.accept"),
      }).open();
      this.renderStatus();

      this.settingTab?.refreshIfOpen();
    }
  }

  clearUpgradeNotice(): void {
    this.upgradeRequired = false;
    this.upgradeInfo = null;
  }

  onCapabilities(caps: Capability[]): void {
    const need = caps
      .filter((c) => compareSemver(this.manifest.version, c.minClientVersion) < 0)
      .map((c) => c.feature)
      .sort();
    const key = need.join(",");
    if (key === this.settings.featuresNeedingUpdate) return;
    this.settings.featuresNeedingUpdate = key;
    if (need.length) new Notice(t("notice.featuresNeedUpdate", { features: need.join(", ") }));
  }

  isConfigured(): boolean {
    return Boolean(
      this.settings.serverUrl && this.settings.pat && this.settings.workspaceId && this.settings.clientId,
    );
  }

  canSync(): boolean {
    return this.isConfigured() && this.settings.locked;
  }

  private scheduleSync(): void {
    if (!this.canSync()) return;

    if (this.syncing) {
      this.dirty = true;
      return;
    }
    if (this.debounce !== null) window.clearTimeout(this.debounce);
    this.debounce = window.setTimeout(() => void this.runSync(false), 1000);
  }

  private drainDeletes(): string[] {
    const d = this.pendingDeletes;
    this.pendingDeletes = [];
    this.lastDrained = d;
    this.persistTombstones();
    return d;
  }

  private dropPendingDelete(path: string): void {
    const i = this.pendingDeletes.indexOf(path);
    if (i < 0) return;
    this.pendingDeletes.splice(i, 1);
    this.persistTombstones();
  }

  private persistTombstones(): void {
    void this.pendingDeletesStore()?.save([...this.pendingDeletes, ...this.lastDrained]);
  }

  flushPendingDeletes(): void {
    this.persistTombstones();
  }

  resetPendingDeletes(): void {
    this.pendingDeletes = [];
    this.lastDrained = [];
  }

  private statePort(): StatePort {
    if (!this.kv) this.kv = new IndexedDbKv();
    return new KvStatePort(this.kv, this.settings.workspaceId, this.settings.clientId);
  }

  private pendingDeletesStore(): PendingDeletesStore | null {
    const { workspaceId, clientId } = this.settings;
    if (!workspaceId || !clientId) return null;
    const key = `${workspaceId}:${clientId}`;
    if (!this.kv) this.kv = new IndexedDbKv();
    if (!this.deletesStore || this.deletesStoreKey !== key) {
      this.deletesStore = new PendingDeletesStore(this.kv, workspaceId, clientId);
      this.deletesStoreKey = key;
    }
    return this.deletesStore;
  }

  private syncScope(): ((path: string) => boolean) | undefined {
    return this.settings.syncFolders.length ? folderScope(this.settings.syncFolders) : undefined;
  }

  onScopeChanged(): void {
    this.scheduleSync();
  }

  private buildClient(state: StatePort): SyncClient {
    return new SyncClient({
      workspaceId: this.settings.workspaceId,
      clientId: this.settings.clientId,
      vault: new ObsidianVaultPort(this.app),

      transport: withRetry(
        new RequestUrlTransport(
          this.settings.serverUrl,
          this.settings.pat,
          (info) => this.onVersionMismatch(info),
          this.manifest.version,
        ),
      ),
      state,

      pageLimit: Platform.isMobile ? 200 : 500,

      scope: this.syncScope(),
      onConflict: ({ original, savedAs }) =>
        new Notice(t("notice.conflictSaved", { original, savedAs })),
      onMassDelete: (info) => this.confirmMassDelete(info),
      onSupersede: (info) => void this.recordSuperseded(info),
      onCapabilities: (caps) => this.onCapabilities(caps),
    });
  }

  private async recordSuperseded(info: { localPath: string; serverPath: string }): Promise<void> {
    new Notice(t("notice.moveOverridden", { localPath: info.localPath, serverPath: info.serverPath }));
    this.settings.supersededMoves = [{ ...info, at: new Date().toISOString() }, ...this.settings.supersededMoves].slice(
      0,
      MAX_SUPERSEDED_MOVES,
    );
    await this.saveSettings();
  }

  private confirmMassDelete(info: { count: number; total: number }): Promise<boolean> {
    if (Date.now() < this.massDeleteDeclinedUntil) return Promise.resolve(false);

    const many = info.count > 1;
    return new Promise((resolve) => {
      new ConfirmModal(this.app, {
        title: many ? t("modal.massDelete.titleMany") : t("modal.massDelete.titleOne"),
        body: [
          many
            ? t("modal.massDelete.bodyMany", { count: info.count, total: info.total })
            : t("modal.massDelete.bodyOne"),
          t("modal.massDelete.body2"),
        ],
        confirmText: many
          ? t("modal.massDelete.confirmMany", { count: info.count, noun: plural("noun.note", info.count) })
          : t("modal.massDelete.confirmOne"),
        warning: true,
        onConfirm: () => resolve(true),
        onCancel: () => {
          this.massDeleteDeclinedUntil = Date.now() + 60_000;
          resolve(false);
        },
      }).open();
    });
  }

  async runSync(manual: boolean): Promise<void> {
    if (!this.isConfigured()) {
      if (manual) new Notice(t("notice.notConfiguredManual"));
      return;
    }
    if (!this.settings.locked) {

      if (manual) new Notice(t("notice.lockToSync"));
      return;
    }
    if (Platform.isMobile && !normalizeServerUrl(this.settings.serverUrl).startsWith("https://")) {
      if (manual) new Notice(t("notice.httpsRequired"));
      return;
    }
    if (this.syncing) return;
    this.syncing = true;
    this.versionBlocked = false;
    const hints = this.pendingHints;
    this.pendingHints = [];
    this.renderStatus();

    const currentScopeKey = scopeKey(this.settings.syncFolders);
    const scopeChanged = currentScopeKey !== this.settings.lastSyncedScopeKey;

    const scopeWidened =
      scopeChanged && isScopeWiden(this.settings.lastSyncedScopeKey.split("\n").filter(Boolean), this.settings.syncFolders);
    try {

      const seedStore = this.pendingDeletesStore();
      if (seedStore) {
        await seedStore.flush();
        for (const p of await seedStore.load()) if (!this.pendingDeletes.includes(p)) this.pendingDeletes.push(p);
      }

      for (const p of this.lastDrained) if (!this.pendingDeletes.includes(p)) this.pendingDeletes.push(p);
      this.lastDrained = [];

      if (this.pendingDeletes.length) this.persistTombstones();
      const state = this.statePort();
      const before = await state.load();
      const firstRun = before.cursor.rev === 0 && Object.keys(before.byPath).length === 0;
      if (scopeChanged && !firstRun) {

        before.cursor = { rev: 0, id: NIL_UUID };
        await state.save(before);
      }
      const client = this.buildClient(state);

      const adoptNeeded = Object.keys(before.byPath).length === 0;
      if (adoptNeeded || scopeChanged) {

        const adopted = await client.bootstrap({ recoverMoves: scopeWidened && !adoptNeeded });
        if (!adopted) {

          this.pendingHints.unshift(...hints);
          return;
        }
      }

      if (this.settings.needsBootstrap) {
        this.settings.needsBootstrap = false;
        await this.saveSettings();
      }

      const { unapplied, needsReadopt } = await client.sync(hints, () => this.drainDeletes());

      if (this.lastDrained.length) {
        this.lastDrained = [];
        this.persistTombstones();
      }
      if (unapplied.length) this.pendingHints.unshift(...unapplied);
      if (this.versionBlocked) {

        return;
      }
      if (needsReadopt) {

        const carried = (await state.load()).releasedNodes;
        await state.save({ ...emptyState(), releasedNodes: carried });

        if (!(await client.bootstrap())) return;
      }
      await this.syncAttachments(state);

      this.settings.lastSyncedScopeKey = currentScopeKey;
      this.settings.lastSyncAt = new Date().toISOString();
      await this.saveSettings();
      this.lastError = false;

      const wasBlocked = this.upgradeRequired;
      this.upgradeRequired = false;
      if (wasBlocked) this.settingTab?.refreshIfOpen();
    } catch (e) {

      this.pendingHints.unshift(...hints);
      this.lastError = true;
      console.error("docli sync failed", e);
      if (manual) new Notice(t("notice.syncFailed", { msg: String((e as Error).message ?? e) }));
    } finally {
      this.syncing = false;
      this.scheduleInterval();

      if (this.pokePending || this.dirty) {
        this.pokePending = false;
        this.dirty = false;
        void this.runSync(false);
      }
    }
  }

  private async syncAttachments(state: StatePort): Promise<void> {
    const s = await state.load();
    const deps: AttachmentDeps = {
      app: this.app,
      serverUrl: this.settings.serverUrl,
      pat: this.settings.pat,
      workspaceId: this.settings.workspaceId,
      maxBytes: Math.max(1, this.settings.maxAttachmentMiB) * 1024 * 1024,
    };

    const concurrency = Platform.isMobile ? 2 : 4;

    const inScope = this.syncScope();
    const toUpload = this.app.vault
      .getAllLoadedFiles()
      .filter(
        (f): f is TFile =>
          f instanceof TFile &&
          classifyFile(f) === "attachment" &&
          !hasReservedSegment(f.path) &&
          (!inScope || inScope(f.path)) &&
          !s.byPath[f.path] &&
          !this.uploaded.has(f.path),
      );
    const skipped: string[] = [];
    await mapLimit(toUpload, concurrency, async (f) => {
      let res;
      try {
        res = await uploadAttachment(deps, f);
      } catch (e) {

        console.error(`docli: failed to upload attachment ${f.path}`, e);
        return;
      }
      if (res === "uploaded") {
        this.uploaded.add(f.path);
      } else if (res === "skipped-large" || res === "skipped-type") {
        if (!this.skipNotified.has(f.path)) {
          this.skipNotified.add(f.path);
          skipped.push(`${f.name} (${res === "skipped-large" ? t("attach.tooLarge") : t("attach.unsupported")})`);
        }
      }

    });
    if (skipped.length) {
      const head = skipped.slice(0, 3).join(", ");
      new Notice(
        t("notice.skippedAttachments", {
          count: skipped.length,
          noun: plural("noun.attachment", skipped.length),
          head,
          ellipsis: skipped.length > 3 ? "…" : "",
        }),
      );
    }

    const toDownload = Object.entries(s.byPath).filter(([, st]) => st.kind === "attachment");
    await mapLimit(toDownload, concurrency, async ([path, st]) => {
      try {
        await downloadAttachment(deps, st.id, path);
      } catch (e) {
        console.error(`docli: failed to download attachment ${path}`, e);
      }
    });
  }

}
