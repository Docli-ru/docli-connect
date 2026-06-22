// SPDX-FileCopyrightText: 2026 OOO Agitek
// SPDX-License-Identifier: MIT

import { requestUrl } from "obsidian";
import type { HttpTransport } from "@docli/sync-client";
import { normalizeServerUrl } from "./settings.js";

export const SYNC_VERSION = "1";

export interface VersionMismatchInfo {
  code?: string;
  clientVersion?: string;
  minVersion?: string;
}

export class RequestUrlTransport implements HttpTransport {
  constructor(
    private readonly serverUrl: string,
    private readonly pat: string,

    private readonly onVersionMismatch?: (info: VersionMismatchInfo) => void,

    private readonly pluginVersion?: string,
  ) {}

  async post(path: string, body: unknown): Promise<{ status: number; json: unknown }> {
    const url = normalizeServerUrl(this.serverUrl) + path;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.pat}`,
      "X-Docli-Sync-Version": SYNC_VERSION,
    };
    if (this.pluginVersion) headers["X-Docli-Plugin-Version"] = this.pluginVersion;
    const resp = await requestUrl({
      url,
      method: "POST",
      contentType: "application/json",
      headers,
      body: JSON.stringify(body),
      throw: false,
    });

    let json: unknown = null;
    try {
      json = resp.json;
    } catch {
      json = null;
    }
    if (resp.status === 426) {
      const b = (json ?? {}) as VersionMismatchInfo;
      this.onVersionMismatch?.({ code: b.code, clientVersion: b.clientVersion, minVersion: b.minVersion });
    }
    return { status: resp.status, json };
  }
}
