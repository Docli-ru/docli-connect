// SPDX-FileCopyrightText: 2026 OOO Agitek
// SPDX-License-Identifier: MIT

import { App, ButtonComponent, Modal } from "obsidian";
import { t } from "./i18n.js";

export interface ConfirmOpts {
  title: string;

  body: string[];
  confirmText: string;

  warning?: boolean;
  onConfirm: () => void | Promise<void>;

  onCancel?: () => void;
}

export interface AlertOpts {
  title: string;

  body: string[];

  acceptText: string;

  onAccept?: () => void;
}

export class AlertModal extends Modal {
  constructor(
    app: App,
    private readonly opts: AlertOpts,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.opts.title);
    for (const line of this.opts.body) this.contentEl.createEl("p", { text: line });
    const buttons = this.contentEl.createDiv({ cls: "modal-button-container" });
    new ButtonComponent(buttons)
      .setButtonText(this.opts.acceptText)
      .setCta()
      .onClick(() => this.close());
  }

  onClose(): void {
    this.contentEl.empty();
    this.opts.onAccept?.();
  }
}

export class ConfirmModal extends Modal {

  private confirmed = false;

  constructor(
    app: App,
    private readonly opts: ConfirmOpts,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.opts.title);
    for (const line of this.opts.body) this.contentEl.createEl("p", { text: line });
    const buttons = this.contentEl.createDiv({ cls: "modal-button-container" });
    new ButtonComponent(buttons).setButtonText(t("modal.cancel")).onClick(() => this.close());
    const confirm = new ButtonComponent(buttons)
      .setButtonText(this.opts.confirmText)
      .setCta()
      .onClick(() => {
        this.confirmed = true;
        this.close();
        void this.opts.onConfirm();
      });
    if (this.opts.warning) confirm.setWarning();
  }

  onClose(): void {
    this.contentEl.empty();

    if (!this.confirmed) this.opts.onCancel?.();
  }
}
