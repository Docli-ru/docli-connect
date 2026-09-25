// SPDX-FileCopyrightText: 2026 OOO Agitek
// SPDX-License-Identifier: MIT

import { Notice, Platform, Plugin, requestUrl } from "obsidian";
import {
  emptyState,
  folderScope,
  hasReservedSegment,
  isScopeWiden,
  NIL_UUID,
  SyncClient,
  syncAttachmentBytes,
  withRetry,
  type Capability,
  type AttachmentNotice,
  type NotifyStatus,
  type RenameHint,
  type ReorderOp,
  type StatePort,
} from "./sync-client/index.js";
import { ExplorerOrderPatch, type OrderEntry, type ReorderRequest } from "./explorerOrder.js";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  MAX_SUPERSEDED_MOVES,
  mirrorOrderAvailable,
  normalizeServerUrl,
  reorderGestureAdvertised,
  scopeKey,
  type DocliSettings,
} from "./settings.js";
import { RequestUrlTransport, type VersionMismatchInfo } from "./transport.js";
import { compareSemver } from "./semver.js";
import { ObsidianVaultPort } from "./vaultPort.js";
import {
  IndexedDbKv,
  KvStatePort,
  PendingDeletesStore,
  PendingReordersStore,
  type KvStore,
} from "./statePort.js";
import { DocliSettingTab } from "./settingsTab.js";
import { AlertModal, ConfirmModal } from "./confirmModal.js";
import { plural, t } from "./i18n.js";
import { WebSocketNotifyPort } from "./wsNotify.js";
import { RequestUrlBlobPort, type AttachmentDeps } from "./attachments.js";
import { AuthProvider, validateOrigin, type Credential } from "./auth.js";
import { fetchWorkspaces, type WorkspaceRef } from "./workspaces.js";
import { decodeWinPath } from "./winPath.js";

function platformName(): string {
  if (Platform.isIosApp) return "ios";
  if (Platform.isAndroidApp) return "android";
  if (Platform.isWin) return "windows";
  if (Platform.isMacOS) return "macos";
  return Platform.isMobile ? "mobile" : "linux";
}

export default class DocliPlugin extends Plugin {
  settings: DocliSettings = { ...DEFAULT_SETTINGS };

  private kv: KvStore | null = null;
  auth: AuthProvider | null = null;
  private pendingAuth: { auth: AuthProvider; ref: string } | null = null;
  changingConnection = false;
  private unloaded = false;
  connectionGeneration = 0;
  private connectionQueue: Promise<void> = Promise.resolve();
  private cycleDone: Promise<void> = Promise.resolve();
  private finishCycle: (() => void) | null = null;

  private statusEl: HTMLElement | null = null;
  private nextConnectionReminderAt = Date.now() + 10 * 60_000;
  private connectionReminderKind: "setup" | "reauth" | null = null;
  private connectionReminderNotice: Notice | null = null;

  private settingTab: DocliSettingTab | null = null;

  private pendingHints: RenameHint[] = [];

  private readonly skipNotified = new Set<string>();
  private syncing = false;
  private debounce: number | null = null;

  private ticker: number | null = null;

  private nextSyncAt: number | null = null;

  private lastError = false;

  private quarantinedPaths: string[] = [];

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

  private explorerOrder: ExplorerOrderPatch | null = null;

  private orderEntries = new Map<string, OrderEntry>();

  private orderOverrides = new Map<string, string[]>();

  private pendingReorders: ReorderOp[] = [];

  private reordersStore: PendingReordersStore | null = null;
  private reordersStoreKey = "";

  private mirrorGestureInstalled = false;

  async onload(): Promise<void> {

    try {
      this.settingTab = new DocliSettingTab(this.app, this);
      this.addSettingTab(this.settingTab);
      this.addCommand({ id: "sync-now", name: t("cmd.syncNow"), callback: () => void this.runSync(true) });
      this.addCommand({ id: "open-sync-settings", name: t("cmd.openSettings"), callback: () => this.openSyncSettings() });
      this.statusEl = this.addStatusBarItem();
      if (this.statusEl) {
        this.statusEl.addClass("mod-clickable");
        this.statusEl.setAttribute("role", "button");
        this.statusEl.tabIndex = 0;
        this.registerDomEvent(this.statusEl, "click", () => this.openSyncSettings());
        this.registerDomEvent(this.statusEl, "keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); this.openSyncSettings(); }
        });
      }
    } catch (e) {
      console.error("docli: UI registration failed", e);
    }

    try {
      await this.loadSettings();
      try {
        await this.loadAuth();
      } catch (e) {

        this.auth = null;
        console.error("docli: authentication initialization failed", e);
        new Notice(t("auth.failed"));
      }
      this.registerObsidianProtocolHandler("docli-connect/oauth", (params) => {
        void this.completeSignIn(params).catch(() => new Notice(t("auth.failed")));
      });

      if (!this.settings.clientId) {
        this.settings.clientId = crypto.randomUUID();
        await this.saveSettings();
      }

      this.registerEvent(
        this.app.vault.on("rename", (file, oldPath) => {

          const oldServer = this.toServerPath(oldPath);
          const newServer = this.toServerPath(file.path);
          if (!hasReservedSegment(oldServer) && !hasReservedSegment(newServer)) {
            this.pendingHints.push({ oldPath: oldServer, newPath: newServer });
          }
          this.skipNotified.delete(oldServer);

          this.dropPendingDelete(newServer);
          this.scheduleSync();
        }),
      );
      this.registerEvent(
        this.app.vault.on("create", (file) => {

          this.dropPendingDelete(this.toServerPath(file.path));
          this.scheduleSync();
        }),
      );
      this.registerEvent(this.app.vault.on("modify", () => this.scheduleSync()));
      this.registerEvent(
        this.app.vault.on("delete", (file) => {

          const serverPath = this.toServerPath(file.path);
          if (!hasReservedSegment(serverPath)) {
            this.pendingDeletes.push(serverPath);
            this.persistTombstones();
          }
          this.skipNotified.delete(serverPath);
          this.scheduleSync();
        }),
      );

      this.scheduleInterval();
      this.startTicker();
      this.app.workspace.onLayoutReady(() => {

        this.applyExplorerMirror();
        void this.refreshOrderEntries();
        void this.runSync(false);
      });
      this.register(() => this.explorerOrder?.uninstall());

      this.connectNotify();
    } catch (e) {

      console.error("docli: startup failed", e);
      new Notice(t("notice.failedStart", { msg: String((e as Error)?.message ?? e) }));
      this.paintStatus("red", t("status.failedStart"));
    }
  }

  onunload(): void {
    this.connectionReminderNotice?.hide();
    this.connectionReminderNotice = null;
    this.unloaded = true;
    this.connectionGeneration++;
    this.auth?.cancel();
    this.cancelSignIn();
    if (this.debounce !== null) window.clearTimeout(this.debounce);
    if (this.ticker !== null) window.clearInterval(this.ticker);
    this.disconnectNotify();

    void this.deletesStore?.flush();

    void this.reordersStore?.flush();
  }

  connectNotify(): void {
    this.disconnectNotify();
    if (!this.canSync()) return;
    if (Platform.isMobile && !normalizeServerUrl(this.settings.serverUrl).startsWith("https://")) {
      return;
    }
    const port = new WebSocketNotifyPort(this.settings.serverUrl, this.credential());
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
    this.settings = loadSettings((await this.loadData()) as Partial<DocliSettings> | null);
  }

  authenticated(): boolean {
    let origin: string;
    try { origin = validateOrigin(this.settings.serverUrl, Platform.isMobile); } catch { return false; }
    return this.settings.authMode === "pat" ? Boolean(this.settings.pat) : Boolean(this.auth?.ready && this.auth.origin === origin);
  }

  credential(): Credential {
    const origin = validateOrigin(this.settings.serverUrl, Platform.isMobile);
    if (this.settings.authMode === "pat") return this.settings.pat;
    if (!this.auth || this.auth.origin !== origin) throw new Error(t("auth.failed"));
    return this.auth;
  }

  private async loadAuth(): Promise<void> {
    this.auth = null;
    this.auth = await this.createAuth(this.settings.oauthSecretRef);
    await this.auth.load();
  }

  private async createAuth(secretRef: string): Promise<AuthProvider> {
    const origin = validateOrigin(this.settings.serverUrl, Platform.isMobile);
    let install = this.app.loadLocalStorage("docli-oauth-install") as string | null;
    if (!install) {
      install = crypto.randomUUID();
      this.app.saveLocalStorage("docli-oauth-install", install);
    }
    const ref = secretRef || `docli-oauth-${install}`;
    const kv = new IndexedDbKv();
    const auth = new AuthProvider(origin, install, {
      getSecret: () => this.app.secretStorage.getSecret(ref),
      setSecret: (value) => this.app.secretStorage.setSecret(ref, value),
      getCheckpoint: () => kv.get(`oauth:${install}:${ref}`),
      setCheckpoint: (value) => kv.set(`oauth:${install}:${ref}`, value),
    }, async (path, fields) => {
      const response = await requestUrl({ url: origin + path, method: "POST",
        contentType: "application/x-www-form-urlencoded", body: new URLSearchParams(fields).toString(), throw: false });
      let json: unknown = null;
      try { json = response.json; } catch {  /* noop */  }
      return { status: response.status, json };
    });
    return auth;
  }

  changeConnection(change: () => Promise<void>, cancel = true): Promise<void> {
    this.changingConnection = true;
    this.connectionGeneration++;
    if (cancel) this.cancelSignIn();
    this.disconnectNotify();
    if (this.debounce !== null) window.clearTimeout(this.debounce);
    const task = this.connectionQueue.then(async () => {
      await this.cycleDone;
      await this.persistConnectionOutboxes();
      if (this.unloaded) return;
      await change();
      await this.saveSettings();
    });
    this.connectionQueue = task.catch(() => {});
    const tail = this.connectionQueue;
    return task.finally(() => {

      if (this.connectionQueue !== tail) return;
      this.changingConnection = false;
      this.applyExplorerMirror();
      this.connectNotify();
      this.scheduleInterval();
      this.settingTab?.refreshIfOpen();
    });
  }

  private async persistConnectionOutboxes(): Promise<void> {
    const deletes = this.pendingDeletesStore();
    const reorders = this.pendingReordersStore();
    await deletes?.flush();
    await reorders?.flush();
    for (;;) {
      const snapshot = JSON.stringify([this.pendingDeletes, this.lastDrained, this.pendingReorders]);
      if (deletes) await deletes.save([...await deletes.load(), ...this.pendingDeletes, ...this.lastDrained], true);
      if (reorders) await reorders.save(this.pendingReorders.length ? this.pendingReorders : await reorders.load(), true);
      if (snapshot === JSON.stringify([this.pendingDeletes, this.lastDrained, this.pendingReorders])) return;
    }
  }

  private clearSelection(): void {
    this.nextConnectionReminderAt = Date.now() + 10 * 60_000;
    this.settings.locked = false;
    this.settings.workspaceId = "";
    this.settings.workspaceHandle = "";
    this.resetPendingDeletes();
    this.pendingReorders = [];
    this.pendingHints = [];
    this.orderEntries.clear();
    this.orderOverrides.clear();
  }

  async changeServer(value: string): Promise<void> {
    const origin = validateOrigin(value, Platform.isMobile);
    if (origin === this.settings.serverUrl) return;
    await this.changeConnection(async () => {
      this.settings.serverUrl = origin;
      this.settings.pat = "";
      this.clearSelection();
      await this.loadAuth();
    });
  }

  async useToken(token: string): Promise<void> {
    await this.changeConnection(async () => {
      this.settings.authMode = "pat";
      this.settings.pat = token.trim();
      this.clearSelection();
    });
  }

  get signInPending(): boolean { return this.pendingAuth !== null; }

  async beginSignIn(): Promise<void> {
    this.cancelSignIn();
    const generation = this.connectionGeneration;
    const ref = `docli-oauth-${crypto.randomUUID()}`;
    const auth = await this.createAuth(ref);
    if (generation !== this.connectionGeneration || this.unloaded) return;
    this.pendingAuth = { auth, ref };
    this.settingTab?.refreshIfOpen();
    try {
      const url = await auth.begin();
      if (this.pendingAuth?.auth === auth && !this.unloaded) window.open(url);
    } catch (error) {
      if (this.pendingAuth?.auth === auth) this.cancelSignIn();
      this.settingTab?.refreshIfOpen();
      throw error;
    }
  }

  cancelSignIn(): void {
    this.pendingAuth?.auth.cancel();
    this.pendingAuth = null;
  }

  private async completeSignIn(params: Record<string, string>): Promise<void> {
    const pending = this.pendingAuth;
    if (!pending) return;
    try {
      await this.changeConnection(async () => {
      await pending.auth.complete(params);
      await this.persistConnectionOutboxes();
      if (this.unloaded || this.pendingAuth !== pending) return;
      this.auth = pending.auth;
      this.settings.oauthSecretRef = pending.ref;
      this.pendingAuth = null;
      this.settings.authMode = "oauth";
      this.settings.pat = "";
      this.clearSelection();
      new Notice(t("auth.selectWorkspace"));
      }, false);
    } finally {
      if (this.pendingAuth === pending && !pending.auth.hasPending) this.cancelSignIn();
      this.settingTab?.refreshIfOpen();
    }
  }

  async discoverWorkspaces(): Promise<WorkspaceRef[]> {
    const generation = this.connectionGeneration;
    const result = await fetchWorkspaces(this.settings.serverUrl, this.credential());
    if (generation !== this.connectionGeneration || this.unloaded) return [];
    return result;
  }

  async signOut(): Promise<void> {
    await this.changeConnection(async () => {
      let revoked = true;
      if (this.settings.authMode === "oauth") revoked = await this.auth?.signOut() ?? true;
      await this.persistConnectionOutboxes();
      this.settings.pat = "";
      this.clearSelection();
      if (!revoked) new Notice(t("auth.offlineRevoke"));
    });
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
    this.maybeRemindConnection();

    if (!this.syncing && this.nextSyncAt !== null && Date.now() >= this.nextSyncAt && this.canSync()) {
      void this.runSync(false);
    }
  }

  maybeRemindConnection(now = Date.now(), foreground = !activeDocument.hidden && activeDocument.hasFocus()): void {
    const kind = this.updateConnectionReminderKind(now);
    if (!kind || !this.settings.setupReminders || this.unloaded || this.changingConnection || this.signInPending ||
        !foreground || this.settingTab?.isVisible || now < this.nextConnectionReminderAt) return;
    this.nextConnectionReminderAt = now + 10 * 60_000;
    this.showConnectionReminder(kind);
  }

  async setConnectionReminders(enabled: boolean): Promise<void> {
    const previous = this.settings.setupReminders;
    this.settings.setupReminders = enabled;
    try { await this.saveSettings(); }
    catch (error) { this.settings.setupReminders = previous; throw error; }
    this.nextConnectionReminderAt = Date.now() + 10 * 60_000;
    if (!enabled) { this.connectionReminderNotice?.hide(); this.connectionReminderNotice = null; }
  }

  private showConnectionReminder(kind: "setup" | "reauth"): void {
    this.connectionReminderNotice?.hide();
    const content = createFragment();
    content.createEl("strong", { text: t(kind === "setup" ? "setupReminder.title" : "reauthReminder.title") });
    content.createEl("p", { text: t(kind === "setup" ? "setupReminder.body" : "reauthReminder.body") });
    const actions = content.createDiv({ cls: "docli-setup-reminder-actions" });
    actions.createEl("button", { text: t(kind === "setup" ? "setupReminder.choose" : "reauthReminder.signIn") }).addEventListener("click", (event) => {
      event.stopPropagation();
      this.connectionReminderNotice?.hide(); this.connectionReminderNotice = null;
      this.openSyncSettings();
    });
    actions.createEl("button", { text: t("setupReminder.stop") }).addEventListener("click", (event) => {
      event.stopPropagation();
      void this.setConnectionReminders(false).catch(() => new Notice(t("ux.actionFailed")));
    });
    this.connectionReminderNotice = new Notice(content, 15_000);
  }

  get needsSetup(): boolean {
    return this.authenticated() && !this.settings.workspaceId;
  }

  get needsReauth(): boolean {
    return this.settings.authMode === "oauth" && Boolean(this.settings.oauthSecretRef) &&
      Boolean(this.settings.workspaceId) && this.settings.locked && !this.authenticated();
  }

  private updateConnectionReminderKind(now: number): "setup" | "reauth" | null {
    const kind = this.needsSetup ? "setup" : this.needsReauth ? "reauth" : null;
    if (kind !== this.connectionReminderKind) {
      this.connectionReminderKind = kind;
      this.nextConnectionReminderAt = now + 10 * 60_000;
      this.connectionReminderNotice?.hide();
      this.connectionReminderNotice = null;
    }
    return kind;
  }

  get syncMode(): "auth" | "paused" | "update" | "syncing" | "error" | "attention" | "live" | "polling" | "disconnected" {
    if (this.unloaded || this.changingConnection || !this.settings.locked) return "paused";
    if (!this.authenticated()) return "auth";
    if (!this.isConfigured()) return "paused";
    if (this.upgradeRequired) return "update";
    if (this.syncing) return "syncing";
    if (this.lastError) return "error";
    if (this.quarantinedPaths.length) return "attention";
    if (this.notifyStatus === "connected") return "live";
    return this.settings.syncIntervalSecs > 0 ? "polling" : "disconnected";
  }

  openSyncSettings(): void {

    const settings = (this.app as unknown as { setting?: { open(): void; openTabById(id: string): void } }).setting;
    if (!settings) { new Notice(t("status.setupHelp")); return; }
    settings.open();
    settings.openTabById(this.manifest.id);
    this.settingTab?.refreshIfOpen();
  }

  private renderStatus(): void {
    this.settingTab?.refreshSyncStatus();
    const reminderKind = this.updateConnectionReminderKind(Date.now());
    if (!reminderKind || !this.settings.setupReminders) {
      this.connectionReminderNotice?.hide(); this.connectionReminderNotice = null;
    }
    if (this.needsSetup) return this.paintStatus("yellow", t("status.setupHelp"));
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
    if (this.quarantinedPaths.length) {

      const head = this.quarantinedPaths.slice(0, 3).join(", ");
      return this.paintStatus(
        "yellow",
        t("status.quarantined", {
          count: this.quarantinedPaths.length,
          head,
          ellipsis: this.quarantinedPaths.length > 3 ? "…" : "",
          last,
        }),
      );
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
    el.setText(this.needsSetup ? t("status.finishSetup") : this.needsReauth ? t("status.signInAgain") : `d: ${emoji}`);
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

    const advertised = caps
      .map((c) => c.feature)
      .sort()
      .join(",");
    const advertChanged = advertised !== this.settings.serverFeatures;
    this.settings.serverFeatures = advertised;

    const need = caps
      .filter((c) => compareSemver(this.manifest.version, c.minClientVersion) < 0)
      .map((c) => c.feature)
      .sort();
    const key = need.join(",");
    const needChanged = key !== this.settings.featuresNeedingUpdate;
    if (needChanged) {
      this.settings.featuresNeedingUpdate = key;
      if (need.length) new Notice(t("notice.featuresNeedUpdate", { features: need.join(", ") }));
    }
    if (advertChanged || needChanged) this.applyExplorerMirror();
  }

  private mirrorEnabled(): boolean {
    return mirrorOrderAvailable(this.settings, this.authenticated() && !this.changingConnection && !this.unloaded);
  }

  applyExplorerMirror(): void {
    try {
      if (this.mirrorEnabled()) {
        const wantGesture = !Platform.isMobile && reorderGestureAdvertised(this.settings);
        if (this.explorerOrder && this.mirrorGestureInstalled !== wantGesture) {
          this.explorerOrder.uninstall();
          this.explorerOrder = null;
        }
        if (!this.explorerOrder) {
          this.explorerOrder = new ExplorerOrderPatch(this.app.workspace, {
            enabled: () => this.mirrorEnabled(),
            entryFor: (path) => this.orderEntries.get(path),
            overrideFor: (parentPath) => this.orderOverrides.get(parentPath),
            onReorder: (req) => this.onExplorerReorder(req),
          });
          if (!this.explorerOrder.install(wantGesture)) {
            console.warn("docli: explorer order mirror unavailable (explorer internals changed?)");
            this.explorerOrder = null;
            return;
          }
          this.mirrorGestureInstalled = wantGesture;
        }
        this.explorerOrder.requestSort();
      } else if (this.explorerOrder) {
        this.explorerOrder.uninstall();
        this.explorerOrder = null;
      }
    } catch (e) {
      console.error("docli: explorer order mirror failed", e);
      this.explorerOrder = null;
    }
  }

  private async refreshOrderEntries(): Promise<void> {
    if (!this.settings.mirrorCustomOrder) return;
    try {
      const s = await this.statePort().load();
      const next = new Map<string, OrderEntry>();
      for (const [path, st] of Object.entries(s.byPath)) {
        next.set(path, { id: st.id, position: st.position });
      }
      this.orderEntries = next;
      this.orderOverrides.clear();
      this.explorerOrder?.requestSort();
    } catch (e) {
      console.error("docli: failed to refresh explorer order", e);
    }
  }

  private onExplorerReorder(req: ReorderRequest): void {
    try {
      this.orderOverrides.set(req.parentPath, req.newOrder);
      this.explorerOrder?.requestSort();
      this.pendingReorders.push({ nodeId: req.nodeId, beforeId: req.beforeId, afterId: req.afterId });
      void this.pendingReordersStore()?.save(this.pendingReorders);
      if (this.syncing) this.dirty = true;
      this.scheduleSync();
    } catch (e) {
      console.error("docli: reorder gesture failed", e);
    }
  }

  private pendingReordersStore(): PendingReordersStore | null {
    const { workspaceId, clientId } = this.settings;
    if (!workspaceId || !clientId) return null;
    const key = `${workspaceId}:${clientId}`;
    if (!this.kv) this.kv = new IndexedDbKv();
    if (!this.reordersStore || this.reordersStoreKey !== key) {
      this.reordersStore = new PendingReordersStore(this.kv, workspaceId, clientId);
      this.reordersStoreKey = key;
    }
    return this.reordersStore;
  }

  isConfigured(): boolean {
    return Boolean(
      !this.unloaded && !this.changingConnection && this.authenticated() && this.settings.workspaceId && this.settings.clientId,
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

  resetPendingDeletes(): void {
    this.pendingDeletes = [];
    this.lastDrained = [];
    this.pendingReorders = [];
    this.pendingHints = [];
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
    if (!this.settings.syncFolders.length) return undefined;

    return folderScope(this.settings.syncFolders.map((f) => this.toServerPath(f)));
  }

  private toServerPath(localPath: string): string {
    return Platform.isWin ? decodeWinPath(localPath) : localPath;
  }

  onScopeChanged(): void {
    this.scheduleSync();
  }

  private buildClient(state: StatePort): SyncClient {
    return new SyncClient({
      workspaceId: this.settings.workspaceId,
      clientId: this.settings.clientId,
      vault: new ObsidianVaultPort(this.app),

      foldPath: (p) => {
        const n = p.normalize("NFC");

        return Platform.isMacOS || Platform.isWin || Platform.isIosApp
          ? n.toLowerCase().replace(/ς/g, "σ")
          : n;
      },

      transport: withRetry(
        new RequestUrlTransport(
          this.settings.serverUrl,
          this.credential(),
          (info) => this.onVersionMismatch(info),
          this.manifest.version,
          platformName(),
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
    this.cycleDone = new Promise((resolve) => { this.finishCycle = resolve; });
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

      {
        const store = this.pendingReordersStore();
        if (store) {
          await store.flush();
          if (this.pendingReorders.length === 0) {
            this.pendingReorders = await store.load();
          }
        }
        if (this.pendingReorders.length) {
          const ops = this.pendingReorders.slice();
          for (const op of ops) await client.queueReorder(op);

          this.pendingReorders = this.pendingReorders.slice(ops.length);
          void store?.save(this.pendingReorders);
        }
      }

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
      await this.syncAttachments(state, client.attachmentsCapable());

      {
        const post = await state.load();
        this.quarantinedPaths = [
          ...Object.values(post.quarantine ?? {}).map((r) => r.payload.path),
          ...(post.absenteeQuarantine ?? []).map((a) => a.path),
        ];
      }

      await this.refreshOrderEntries();

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
      this.finishCycle?.();
      this.finishCycle = null;
      this.scheduleInterval();

      if (this.pokePending || this.dirty) {
        this.pokePending = false;
        this.dirty = false;
        void this.runSync(false);
      }
    }
  }

  private async syncAttachments(state: StatePort, enabled: boolean): Promise<void> {
    const deps: AttachmentDeps = {
      app: this.app,
      serverUrl: this.settings.serverUrl,
      pat: this.credential(),
      workspaceId: this.settings.workspaceId,
      maxBytes: Math.max(1, this.settings.maxAttachmentMiB) * 1024 * 1024,
    };
    const skippedLarge: string[] = [];
    const failed: string[] = [];
    await syncAttachmentBytes({
      vault: new ObsidianVaultPort(this.app),
      state,
      blob: new RequestUrlBlobPort(deps),
      scope: this.syncScope(),
      enabled,
      onNotice: (n: AttachmentNotice) => {
        switch (n.kind) {
          case "conflict":
            new Notice(t("notice.conflictSaved", { original: n.path, savedAs: n.savedAs }));
            break;
          case "skipped-large":
            if (!this.skipNotified.has(n.path)) {
              this.skipNotified.add(n.path);
              skippedLarge.push(n.path);
            }
            break;
          case "download-failed":
          case "upload-failed":
            if (!this.skipNotified.has(n.path)) {
              this.skipNotified.add(n.path);
              failed.push(n.path);
            }
            console.error(`docli: attachment transfer failed for ${n.path}`, n.detail ?? "");
            break;
          case "held":

            console.warn(`docli: attachment held: ${n.path} (${n.detail})`);
            break;
          case "transferred":

            this.skipNotified.delete(n.path);
            break;
        }
      },
    });
    if (skippedLarge.length) {
      const head = skippedLarge
        .slice(0, 3)
        .map((p) => `${p.slice(p.lastIndexOf("/") + 1)} (${t("attach.tooLarge")})`)
        .join(", ");
      new Notice(
        t("notice.skippedAttachments", {
          count: skippedLarge.length,
          noun: plural("noun.attachment", skippedLarge.length),
          head,
          ellipsis: skippedLarge.length > 3 ? "…" : "",
        }),
      );
    }
    if (failed.length) {
      const head = failed
        .slice(0, 3)
        .map((p) => p.slice(p.lastIndexOf("/") + 1))
        .join(", ");
      new Notice(
        t("notice.attachmentsFailed", {
          count: failed.length,
          noun: plural("noun.attachment", failed.length),
          head,
          ellipsis: failed.length > 3 ? "…" : "",
        }),
      );
    }
  }

}
