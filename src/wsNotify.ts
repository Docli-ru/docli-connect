// SPDX-FileCopyrightText: 2026 OOO Agitek
// SPDX-License-Identifier: MIT

import { type NotifyHandlers, type NotifyPort } from "@docli/sync-client";
import { normalizeServerUrl } from "./settings.js";

export function pokeUrl(serverUrl: string): string {
  return normalizeServerUrl(serverUrl).replace(/^http/i, "ws") + "/api/sync/poke";
}

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;

export class WebSocketNotifyPort implements NotifyPort {
  constructor(
    private readonly serverUrl: string,
    private readonly pat: string,
  ) {}

  connect(workspaceId: string, handlers: NotifyHandlers): () => void {
    let closed = false;
    let ws: WebSocket | null = null;
    let backoff = INITIAL_BACKOFF_MS;
    let reconnectTimer: number | null = null;

    const scheduleReconnect = () => {
      if (closed || reconnectTimer !== null) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        open();
      }, backoff);
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    };

    const open = () => {
      if (closed) return;
      handlers.onStatus?.("connecting");
      let sock: WebSocket;
      try {
        sock = new WebSocket(pokeUrl(this.serverUrl));
      } catch {
        scheduleReconnect();
        return;
      }
      ws = sock;
      sock.onopen = () => {

        try {
          sock.send(JSON.stringify({ token: this.pat, workspaceId }));
        } catch {
          sock.close();
        }
      };
      sock.onmessage = (ev) => {
        let msg: { type?: string };
        try {
          msg = JSON.parse(String(ev.data)) as { type?: string };
        } catch {
          return;
        }
        if (msg.type === "connected") {

          backoff = INITIAL_BACKOFF_MS;
          handlers.onStatus?.("connected");
          handlers.onConnect?.();
          return;
        }

        if (msg.type) handlers.onPoke();
      };
      sock.onerror = () => {

        try {
          sock.close();
        } catch {

        }
      };
      sock.onclose = () => {
        if (ws === sock) ws = null;
        handlers.onStatus?.("disconnected");
        scheduleReconnect();
      };
    };

    open();

    return () => {
      closed = true;
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      if (ws) {

        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        ws.onopen = null;
        try {
          ws.close();
        } catch {

        }
        ws = null;
      }
    };
  }
}
