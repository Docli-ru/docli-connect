// SPDX-FileCopyrightText: 2026 OOO Agitek
// SPDX-License-Identifier: MIT

import { PluginSettingTab, Setting, Notice, type App } from "obsidian";
import type DocliPlugin from "./main.js";
import { normalizeServerUrl } from "./settings.js";
import { fetchWorkspaces, type WorkspaceRef } from "./workspaces.js";
import { ConfirmModal } from "./confirmModal.js";
import { plural, t } from "./i18n.js";

export class DocliSettingTab extends PluginSettingTab {
  private workspaces: WorkspaceRef[] = [];

  private shown = false;

  constructor(
    app: App,
    private readonly plugin: DocliPlugin,
  ) {
    super(app, plugin);
  }

  hide(): void {
    this.shown = false;
  }

  refreshIfOpen(): void {
    if (this.shown) this.display();
  }

  display(): void {
    this.shown = true;
    const { containerEl } = this;
    containerEl.empty();

    for (const w of [
      { title: t("settings.warn.experimental.title"), body: t("settings.warn.experimental.body") },
      { title: t("settings.warn.syncedDisk.title"), body: t("settings.warn.syncedDisk.body") },
    ]) {
      const box = containerEl.createDiv({ cls: "docli-warning" });
      box.createEl("strong", { text: w.title });
      box.appendText(w.body);
    }

    if (this.plugin.upgradeRequired) {
      const info = this.plugin.upgradeInfo;
      const box = containerEl.createDiv({ cls: "docli-notice" });
      box.createEl("strong", { text: t("settings.notice.upgrade.title") });
      box.appendText(
        info?.code === "PLUGIN_OUTDATED" && info.minVersion
          ? t("settings.notice.outdated.body", {
              clientVersion: info.clientVersion ?? this.plugin.manifest.version,
              minVersion: info.minVersion,
            })
          : t("settings.notice.upgrade.body"),
      );
    }

    if (this.plugin.settings.featuresNeedingUpdate) {
      const box = containerEl.createDiv({ cls: "docli-notice" });
      box.createEl("strong", { text: t("settings.notice.features.title") });
      box.appendText(
        t("settings.notice.features.body", {
          features: this.plugin.settings.featuresNeedingUpdate.split(",").join(", "),
        }),
      );
    }

    new Setting(containerEl)
      .setName(t("settings.serverUrl.name"))
      .setDesc(t("settings.serverUrl.desc"))
      .addText((text) =>
        text
          .setPlaceholder("https://docli.ru")
          .setValue(this.plugin.settings.serverUrl)
          .onChange(async (v) => {
            this.plugin.settings.serverUrl = normalizeServerUrl(v);
            await this.plugin.saveSettings();
            this.plugin.connectNotify();
          }),
      );

    new Setting(containerEl)
      .setName(t("settings.pat.name"))
      .setDesc(t("settings.pat.desc"))
      .addText((text) => {
        text.inputEl.type = "password";
        text
          .setPlaceholder("docli_pat_…")
          .setValue(this.plugin.settings.pat)
          .onChange(async (v) => {
            this.plugin.settings.pat = v.trim();
            await this.plugin.saveSettings();
            this.plugin.connectNotify();
          });
      });

    new Setting(containerEl)
      .setName(t("settings.connect.name"))
      .setDesc(t("settings.connect.desc"))
      .addButton((b) =>
        b.setButtonText(t("settings.connect.button")).onClick(async () => {
          try {
            this.workspaces = await fetchWorkspaces(this.plugin.settings.serverUrl, this.plugin.settings.pat);
            if (this.workspaces.length === 0) {
              new Notice(t("notice.noWorkspaces"));
            } else {
              new Notice(
                t("notice.foundWorkspaces", {
                  count: this.workspaces.length,
                  noun: plural("noun.workspace", this.workspaces.length),
                }),
              );
            }
            this.display();
          } catch (e) {
            new Notice(t("notice.error", { msg: (e as Error).message }));
          }
        }),
      );

    if (this.workspaces.length > 0 || this.plugin.settings.workspaceHandle) {
      const locked = this.plugin.settings.locked;
      new Setting(containerEl)
        .setName(t("settings.workspace.name"))
        .setDesc(locked ? t("settings.workspace.descLocked") : t("settings.workspace.descUnlocked"))
        .addDropdown((d) => {
          const opts = this.workspaces.length > 0
            ? this.workspaces
            : [{ id: this.plugin.settings.workspaceId, handle: this.plugin.settings.workspaceHandle, name: this.plugin.settings.workspaceHandle }];
          for (const w of opts) d.addOption(w.handle, `${w.name} (@${w.handle})`);
          d.setValue(this.plugin.settings.workspaceHandle);
          d.setDisabled(locked);
          d.onChange(async (handle) => {
            const w = this.workspaces.find((x) => x.handle === handle);
            if (w) {

              this.plugin.flushPendingDeletes();
              this.plugin.settings.workspaceHandle = w.handle;
              this.plugin.settings.workspaceId = w.id;
              this.plugin.resetPendingDeletes();
              await this.plugin.saveSettings();

            }
          });
        });

      new Setting(containerEl)
        .setName(locked ? t("settings.lock.nameLocked") : t("settings.lock.nameUnlocked"))
        .setDesc(locked ? t("settings.lock.descLocked") : t("settings.lock.descUnlocked"))
        .addButton((b) => {
          if (locked) {
            b.setButtonText(t("settings.lock.unlock"))
              .setWarning()
              .onClick(async () => {
                this.plugin.settings.locked = false;
                await this.plugin.saveSettings();
                this.plugin.disconnectNotify();

                this.plugin.clearUpgradeNotice();
                this.plugin.scheduleInterval();
                new Notice(t("notice.unlocked"));
                this.display();
              });
          } else {
            b.setButtonText(t("settings.lock.lockAndSync"))
              .setCta()
              .onClick(() => {
                if (!this.plugin.settings.workspaceId) {
                  new Notice(t("notice.pickWorkspace"));
                  return;
                }
                const handle = this.plugin.settings.workspaceHandle;
                new ConfirmModal(this.app, {
                  title: t("modal.lock.title"),
                  body: [t("modal.lock.body1", { handle }), t("modal.lock.body2"), t("modal.lock.body3")],
                  confirmText: t("modal.lock.confirm"),
                  warning: true,
                  onConfirm: async () => {
                    this.plugin.settings.locked = true;

                    this.plugin.settings.needsBootstrap = true;
                    await this.plugin.saveSettings();
                    this.plugin.connectNotify();
                    this.plugin.scheduleInterval();
                    void this.plugin.runSync(true);
                    new Notice(t("notice.locked"));
                    this.display();
                  },
                }).open();
              });
          }
        });
    }

    new Setting(containerEl)
      .setName(t("settings.interval.name"))
      .setDesc(t("settings.interval.desc"))
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.syncIntervalSecs))
          .onChange(async (v) => {
            const n = Number.parseInt(v, 10);
            this.plugin.settings.syncIntervalSecs = Number.isFinite(n) && n >= 0 ? n : 0;
            await this.plugin.saveSettings();
            this.plugin.scheduleInterval();
          }),
      );

    new Setting(containerEl)
      .setName(t("settings.maxAttachment.name"))
      .setDesc(t("settings.maxAttachment.desc"))
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.maxAttachmentMiB))
          .onChange(async (v) => {
            const n = Number.parseInt(v, 10);
            this.plugin.settings.maxAttachmentMiB = Number.isFinite(n) && n > 0 ? n : 15;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("settings.folders.name"))
      .setDesc(t("settings.folders.desc"))
      .addTextArea((text) => {
        text
          .setPlaceholder("Work\nProjects/2026")
          .setValue(this.plugin.settings.syncFolders.join("\n"))
          .onChange(async (v) => {
            const next = v
              .split("\n")
              .map((line) => line.trim().replace(/^\/+|\/+$/g, ""))
              .filter((line) => line.length > 0);
            const changed = next.join("\n") !== this.plugin.settings.syncFolders.join("\n");
            this.plugin.settings.syncFolders = next;
            await this.plugin.saveSettings();

            if (changed) this.plugin.onScopeChanged();
          });
        text.inputEl.rows = 3;
      });

    const locked = this.plugin.settings.locked;
    new Setting(containerEl)
      .setName(t("settings.syncNow.name"))
      .setDesc(
        !locked
          ? t("settings.syncNow.descUnlocked")
          : this.plugin.settings.lastSyncAt
            ? t("settings.syncNow.descLast", { time: new Date(this.plugin.settings.lastSyncAt).toLocaleString() })
            : t("settings.syncNow.descNever"),
      )
      .addButton((b) =>
        b
          .setButtonText(t("settings.syncNow.button"))
          .setCta()
          .setDisabled(!locked)
          .onClick(() => void this.plugin.runSync(true)),
      );

    this.renderConflicts(containerEl);
    this.renderSupersededMoves(containerEl);
  }

  private renderConflicts(containerEl: HTMLElement): void {
    const conflicts = this.app.vault
      .getFiles()
      .filter((f) => /\(conflict( \d+)?\)/.test(f.name))
      .sort((a, b) => a.path.localeCompare(b.path));

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
        this.display();
      }),
    );
  }
}
