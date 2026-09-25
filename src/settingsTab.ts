// SPDX-FileCopyrightText: 2026 OOO Agitek
// SPDX-License-Identifier: MIT
import { PluginSettingTab, Setting, Notice, requireApiVersion, type App, type ButtonComponent, type SettingDefinition } from "obsidian";
import type DocliPlugin from "./main.js";
import type { WorkspaceRef } from "./workspaces.js";
import { ConfirmModal } from "./confirmModal.js";
import { t } from "./i18n.js";

export class DocliSettingTab extends PluginSettingTab {
  private workspaces: WorkspaceRef[] = [];
  private workspaceGeneration = -1;
  private shown = false;
  private connectionOptions = false;
  private syncOptions = false;
  private loadingWorkspaces = false;
  private discoveryAttempt = -1;
  private discoveryFailed = false;
  private busy = false;
  private connectionSetting: Setting | null = null;
  private connectionButton: ButtonComponent | null = null;
  private syncSetting: Setting | null = null;
  private syncButton: ButtonComponent | null = null;
  constructor(app: App, private readonly plugin: DocliPlugin) { super(app, plugin); }
  get isVisible(): boolean { return Boolean(this.containerEl?.isShown()); }
  hide(): void { this.shown = false; this.connectionSetting = null; this.connectionButton = null; this.syncSetting = null; this.syncButton = null; }
  refreshIfOpen(): void {
    if (requireApiVersion("1.13.0")) this.update();
    else if (this.shown) this.renderLegacy();
  }

  refreshSyncStatus(): void {
    this.refreshConnectionStatus();
    const row = this.syncSetting;
    if (!row?.settingEl.isConnected) return;
    const p = this.plugin;
    const mode = p.syncMode;
    const last = p.settings.lastSyncAt ? " " + t("settings.syncNow.descLast", {
      time: new Date(p.settings.lastSyncAt).toLocaleString(),
    }) : "";
    row.setName(t(`sync.${mode}.title`));
    row.setDesc(t(`sync.${mode}.desc`, { seconds: Math.max(30, p.settings.syncIntervalSecs) }) + last);
    this.syncButton?.setDisabled(!p.canSync() || mode === "syncing" || mode === "update");
  }

  private refreshConnectionStatus(): void {
    const row = this.connectionSetting;
    const button = this.connectionButton;
    if (!row?.settingEl.isConnected || !button) return;
    const p = this.plugin;
    const pending = p.signInPending;
    const connected = p.authenticated();
    row.setName(t(connected && !pending ? "auth.method" : "auth.signIn"));
    row.setDesc(pending ? t("ux.waiting") : connected ?
      (p.settings.authMode === "oauth" && p.auth?.status === "offline" ? t("auth.offline") : t("ux.signedIn")) : t("ux.signInHelp"));
    button.setButtonText(t(pending ? "auth.cancel" : connected ? "auth.signOut" : "auth.signIn"));
    button.setDisabled(!pending && (this.busy || p.changingConnection || this.loadingWorkspaces));
    button.buttonEl.toggleClass("mod-cta", !connected && !pending);
  }

  private action(work: () => Promise<void>): void {
    if (this.busy) return;
    this.busy = true;
    this.refreshIfOpen();
    void work().catch(() => new Notice(t("ux.actionFailed"))).finally(() => {
      this.busy = false;
      this.refreshIfOpen();
    });
  }

  private async loadWorkspaces(): Promise<void> {
    const p = this.plugin;
    if (this.loadingWorkspaces || !p.authenticated() || p.changingConnection) return;
    const generation = p.connectionGeneration;
    this.discoveryAttempt = generation;
    this.loadingWorkspaces = true;
    this.discoveryFailed = false;
    this.refreshIfOpen();
    try {
      const spaces = await p.discoverWorkspaces();
      if (generation !== p.connectionGeneration) return;
      this.workspaces = spaces;
      this.workspaceGeneration = generation;
    } catch {
      if (generation === p.connectionGeneration) this.discoveryFailed = true;
    } finally {
      this.loadingWorkspaces = false;
      this.refreshIfOpen();
    }
  }

  getSettingDefinitions(): SettingDefinition[] {
    const p = this.plugin;
    const s = p.settings;
    const row = (name: string, desc: string, render: (setting: Setting) => void): SettingDefinition => ({ name, desc, render });
    const defs: SettingDefinition[] = [];
    if (p.upgradeRequired) defs.push(row(t("settings.notice.upgrade.title"),
      p.upgradeInfo?.minVersion ? t("settings.notice.outdated.body", {
        clientVersion: p.upgradeInfo.clientVersion ?? p.manifest.version, minVersion: p.upgradeInfo.minVersion,
      }) : t("settings.notice.upgrade.body"), (r) => r.settingEl.addClass("docli-notice")));
    if (s.featuresNeedingUpdate) defs.push(row(t("settings.notice.features.title"),
      t("settings.notice.features.body", { features: s.featuresNeedingUpdate }), () => {}));
    const connected = p.authenticated();
    const pending = p.signInPending;
    const disabled = this.busy || p.changingConnection || this.loadingWorkspaces;
    defs.push(row(t(connected && !pending ? "auth.method" : "auth.signIn"), pending ? t("ux.waiting") : connected ?
      (s.authMode === "oauth" && p.auth?.status === "offline" ? t("auth.offline") : t("ux.signedIn")) : t("ux.signInHelp"), (r) => {
      this.connectionSetting = r;
      r.addButton((b) => {
        this.connectionButton = b;
        b.onClick(() => {
          if (p.signInPending) { p.cancelSignIn(); this.refreshIfOpen(); }
          else this.action(() => p.authenticated() ? p.signOut() : p.beginSignIn());
        });
      });
      this.refreshConnectionStatus();
    }));
    defs[defs.length - 1].aliases = [t("auth.signIn")];
    if (!s.locked) defs.push({ name: t("ux.beforeSync"), desc: t("ux.safety"), searchable: false, render: (r) => r.settingEl.addClass("docli-safety-note") });
    if (connected && !s.locked && (this.workspaceGeneration !== p.connectionGeneration || !this.workspaces.length)) {
      defs.push(row(t("settings.workspace.name"), this.loadingWorkspaces ? t("ux.loading") :
        this.discoveryFailed ? t("ux.loadFailed") : this.workspaceGeneration === p.connectionGeneration && !this.workspaces.length ?
          t("notice.noWorkspaces") : t("ux.chooseHelp"), (r) => {
        if (this.discoveryAttempt !== p.connectionGeneration && !p.changingConnection) {
          queueMicrotask(() => { void this.loadWorkspaces(); });
        }
        if (this.discoveryFailed || (this.workspaceGeneration === p.connectionGeneration && !this.workspaces.length)) {
          r.addButton((b) => b.setButtonText(t("ux.retry")).setDisabled(this.loadingWorkspaces || disabled)
            .onClick(() => { void this.loadWorkspaces(); }));
        }
      }));
    }
    const workspaces = this.workspaceGeneration === p.connectionGeneration ? this.workspaces : [];
    if (connected && (workspaces.length || s.workspaceHandle)) {
      if (!s.locked) defs.push(row(t("settings.workspace.name"), t(s.locked ? "settings.workspace.descLocked" : "settings.workspace.descUnlocked"), (r) => {
        r.addDropdown((d) => {
          d.addOption("", t("ux.choose"));
          const options = workspaces.length ? workspaces : [{ id: s.workspaceId, handle: s.workspaceHandle, name: s.workspaceHandle }];
          for (const w of options) d.addOption(w.handle, `${w.name} (@${w.handle})`);
          d.setValue(s.workspaceHandle).setDisabled(s.locked || disabled).onChange((handle) => this.action(async () => {
            const w = workspaces.find((x) => x.handle === handle);
            if (!w || s.locked) return;
            const generation = p.connectionGeneration;
            await p.changeConnection(async () => {
              if (s.locked || !p.authenticated() || p.connectionGeneration !== generation + 1) return;
              s.workspaceId = w.id; s.workspaceHandle = w.handle;
              p.resetPendingDeletes();
            });
          }));
        });
      }));
      if (s.workspaceId) defs.push(row(t(s.locked ? "settings.workspace.name" : "settings.lock.nameUnlocked"),
        (s.locked ? `@${s.workspaceHandle}. ` : "") + t(s.locked ? "settings.lock.descLocked" : "settings.lock.descUnlocked"), (r) => {
          r.addButton((b) => {
            if (s.locked) b.setButtonText(t("settings.lock.unlock")).setDisabled(disabled).onClick(() => this.action(async () => {
              await p.changeConnection(async () => { s.locked = false; p.clearUpgradeNotice(); });
              new Notice(t("notice.unlocked"));
            }));
            else b.setButtonText(t("settings.lock.lockAndSync")).setCta().setDisabled(!s.workspaceId || disabled).onClick(() => {
              if (!s.workspaceId) { new Notice(t("notice.pickWorkspace")); return; }
              const generation = p.connectionGeneration;
              const handle = s.workspaceHandle;
              const workspaceId = s.workspaceId;
              new ConfirmModal(this.app, { title: t("modal.lock.title"),
                body: [t("modal.lock.body1", { handle }), t("modal.lock.body2"), t("modal.lock.body3")],
                confirmText: t("modal.lock.confirm"), warning: true, onConfirm: async () => {
                  if (generation !== p.connectionGeneration || !p.authenticated()) return;
                  let locked = false;
                  await p.changeConnection(async () => {
                    if (p.connectionGeneration !== generation + 1 || !p.authenticated() ||
                        s.workspaceId !== workspaceId || s.workspaceHandle !== handle) return;
                    s.locked = true; s.needsBootstrap = true; locked = true;
                  });
                  if (!locked || p.connectionGeneration !== generation + 1) return;
                  void p.runSync(true);
                  new Notice(t("notice.locked"));
                },
              }).open();
            });
          });
        }));
    }
    if (connected && s.locked) defs.push(row(t("ux.syncStatus"), t("sync.live.desc"), (r) => {
      this.syncSetting = r;
      r.addButton((b) => {
        this.syncButton = b;
        b.setButtonText(t("settings.syncNow.button")).onClick(() => void p.runSync(true));
      });
      this.refreshSyncStatus();
    }));
    if (connected) {
      defs.push(row(t("ux.syncOptions"), t("ux.syncOptionsHelp"), (r) => {
        r.addButton((b) => b.setButtonText(t(this.syncOptions ? "ux.hide" : "ux.change")).setDisabled(disabled)
          .onClick(() => { this.syncOptions = !this.syncOptions; this.refreshIfOpen(); }));
      }));
      defs[defs.length - 1].aliases = [t("settings.interval.name"), t("settings.maxAttachment.name"), t("settings.folders.name"), t("settings.mirror.name"), t("settings.conflicts.title"), t("settings.moves.title")];
      if (this.syncOptions) {
    defs.push(row(t("settings.interval.name"), t("settings.interval.desc"), (r) => {
      let value = String(s.syncIntervalSecs);
      r.addText((c) => c.setDisabled(disabled).setValue(value).onChange((v) => { value = v; }));
      r.addButton((b) => b.setButtonText(t("auth.save")).setDisabled(disabled).onClick(() => this.action(async () => {
        const n = Number.parseInt(value, 10); s.syncIntervalSecs = Number.isFinite(n) && n >= 0 ? n : 0;
        await p.saveSettings(); p.scheduleInterval();
      })));
    }));
    defs.push(row(t("settings.maxAttachment.name"), t("settings.maxAttachment.desc"), (r) => {
      let value = String(s.maxAttachmentMiB);
      const save = (n: number) => p.changeConnection(async () => { s.maxAttachmentMiB = Number.isFinite(n) && n > 0 ? n : 50; });
      r.addText((c) => c.setDisabled(disabled).setValue(value).onChange((v) => { value = v; }));
      r.addButton((b) => b.setButtonText(t("auth.save")).setDisabled(disabled).onClick(() => this.action(() => save(Number.parseInt(value, 10)))));
      r.addButton((b) => b.setButtonText(t("auth.resetCap")).setDisabled(disabled).onClick(() => this.action(() => save(50))));
    }));
    defs.push(row(t("settings.folders.name"), t("settings.folders.desc"), (r) => {
      let value = s.syncFolders.join("\n");
      r.addTextArea((c) => {
        c.setDisabled(disabled).setValue(value).onChange((v) => { value = v; }); c.inputEl.rows = 3;
      });
      r.addButton((b) => b.setButtonText(t("auth.save")).setDisabled(disabled).onClick(() => this.action(async () => {
        await p.changeConnection(async () => {
          s.syncFolders = value.split("\n").map((line) => line.trim().replace(/^\/+|\/+$/g, "")).filter(Boolean);
          if (s.syncFolders.length && s.mirrorCustomOrder) { s.mirrorCustomOrder = false; new Notice(t("notice.mirrorDisabledPartial")); }
        });
        p.onScopeChanged();
      })));
    }));
    defs.push(row(t("settings.mirror.name"), t(s.syncFolders.length ? "settings.mirror.descPartial" : "settings.mirror.desc"), (r) => {
      r.addToggle((c) => c.setValue(s.mirrorCustomOrder && !s.syncFolders.length).setDisabled(disabled || Boolean(s.syncFolders.length))
        .onChange((v) => this.action(async () => { s.mirrorCustomOrder = v; await p.saveSettings(); p.applyExplorerMirror(); })));
    }));
    defs.push({ name: t("settings.conflicts.title"), searchable: false, render: (r) => {
      r.settingEl.empty(); this.renderConflicts(r.settingEl);
    } });
    defs.push({ name: t("settings.moves.title"), searchable: false, render: (r) => {
      r.settingEl.empty(); this.renderSupersededMoves(r.settingEl);
    } });
      }
    }
    defs.push(row(t("ux.connectionOptions"), t("ux.connectionOptionsHelp"), (r) => {
      r.addButton((b) => b.setButtonText(t(this.connectionOptions ? "ux.hide" : "ux.change")).setDisabled(disabled)
        .onClick(() => { this.connectionOptions = !this.connectionOptions; this.refreshIfOpen(); }));
    }));
    defs[defs.length - 1].aliases = [t("settings.serverUrl.name"), t("auth.token"), t("setupReminder.setting")];
    if (this.connectionOptions) {
      defs.push(row(t("setupReminder.setting"), t("setupReminder.help"), (r) => {
        r.addToggle((c) => c.setValue(s.setupReminders).setDisabled(disabled)
          .onChange((enabled) => this.action(() => p.setConnectionReminders(enabled))));
      }));
    defs.push(row(t("settings.serverUrl.name"), t("settings.serverUrl.desc"), (r) => {
      let value = s.serverUrl;
      r.addText((c) => c.setDisabled(disabled).setValue(value).onChange((v) => { value = v; }));
      r.addButton((b) => b.setButtonText(t("auth.save")).setDisabled(disabled).onClick(() => this.action(() => p.changeServer(value))));
    }));
    defs.push(row(t("auth.token"), t("settings.pat.desc"), (r) => {
      let value = s.authMode === "pat" ? s.pat : "";
      r.addText((c) => { c.inputEl.type = "password"; c.setDisabled(disabled).setValue(value).onChange((v) => { value = v; }); });
      r.addButton((b) => b.setButtonText(t("auth.save")).setDisabled(disabled).onClick(() => this.action(() => p.useToken(value))));
    }));
    defs.push({ name: t("auth.secret"), searchable: false });
    }
    return defs;
  }

  display(): void { this.renderLegacy(); }

  private renderLegacy(): void {
    this.shown = true;
    this.containerEl.empty();
    for (const def of this.getSettingDefinitions()) {
      const setting = new Setting(this.containerEl).setName(def.name);
      if (def.desc) setting.setDesc(def.desc);
      if (def.render) def.render(setting, undefined!);
    }
  }

  private renderConflicts(containerEl: HTMLElement): void {
    const conflicts = this.app.vault
      .getFiles()
      .filter((f) => /\(conflict( \d+)?\)/.test(f.name))
      .sort((a, b) => a.path.localeCompare(b.path));

    if (!conflicts.length) return;
    new Setting(containerEl)
      .setName(conflicts.length ? t("settings.conflicts.titleCount", { count: conflicts.length }) : t("settings.conflicts.title"))
      .setHeading();
    if (conflicts.length === 0) {
      containerEl.createEl("p", {
        text: t("settings.conflicts.empty"),
        cls: "setting-item-description",
      });
      return;
    }
    for (const f of conflicts) {
      new Setting(containerEl)
        .setName(f.name)
        .setDesc(f.path)
        .addButton((b) =>
          b.setButtonText(t("settings.open")).onClick(() => {
            void this.app.workspace.openLinkText(f.path, "", false);
          }),
        );
    }
  }

  private renderSupersededMoves(containerEl: HTMLElement): void {
    const moves = this.plugin.settings.supersededMoves;
    if (!moves.length) return;
    new Setting(containerEl)
      .setName(moves.length ? t("settings.moves.titleCount", { count: moves.length }) : t("settings.moves.title"))
      .setHeading();
    if (moves.length === 0) {
      containerEl.createEl("p", {
        text: t("settings.moves.empty"),
        cls: "setting-item-description",
      });
      return;
    }
    for (const m of moves) {
      new Setting(containerEl)
        .setName(`${m.localPath} → ${m.serverPath}`)
        .setDesc(t("settings.moves.keptLocation", { time: new Date(m.at).toLocaleString() }))
        .addButton((b) =>
          b.setButtonText(t("settings.open")).onClick(() => {
            void this.app.workspace.openLinkText(m.serverPath, "", false);
          }),
        );
    }
    new Setting(containerEl).addButton((b) =>
      b.setButtonText(t("settings.moves.clear")).onClick(async () => {
        this.plugin.settings.supersededMoves = [];
        await this.plugin.saveSettings();
        this.refreshIfOpen();
      }),
    );
  }
}
