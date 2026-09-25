// SPDX-FileCopyrightText: 2026 OOO Agitek
// SPDX-License-Identifier: MIT

import { type NotifyHandlers, type NotifyPort } from "./sync-client/index.js";
import { AuthError, credentialToken, type Credential } from "./auth.js";
import { normalizeServerUrl } from "./settings.js";

export function pokeUrl(serverUrl: string): string {
  return normalizeServerUrl(serverUrl).replace(/^http/i, "ws") + "/api/sync/poke";
}

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;

export class WebSocketNotifyPort implements NotifyPort {
  constructor(
    private readonly serverUrl: string,
    private readonly pat: Credential,
  ) {}

  connect(workspaceId: string, handlers: NotifyHandlers): () => void {
    let closed = false;
    let ws: WebSocket | null = null;
    let backoff = INITIAL_BACKOFF_MS;
    let reconnectTimer: number | null = null;
    let authRetried = false;

    const scheduleReconnect = () => {
      if (closed || reconnectTimer !== null) return;
      reconnectTimer = window.setTimeout(() => {
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
          if (typeof this.pat === "string") sock.send(JSON.stringify({ token: this.pat, workspaceId }));
          else void credentialToken(this.pat).then((token) => {
            if (!closed && ws === sock) sock.send(JSON.stringify({ token, workspaceId }));
          }).catch((error: unknown) => {
            if (closed || ws !== sock) return;
            closed = !(error instanceof AuthError && error.retryable);
            sock.close();
            handlers.onStatus?.("disconnected");
          });
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
          authRetried = false;
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
           /* noop */
        }
      };
      sock.onclose = (event) => {
        if (ws === sock) ws = null;
        handlers.onStatus?.("disconnected");
        if (event?.code === 4403 || (event?.code === 4401 && (typeof this.pat === "string" || authRetried))) {
          closed = true;
          return;
        }
        if (event?.code === 4401 && typeof this.pat !== "string") {
          authRetried = true;
          void this.pat.token(true).then(() => scheduleReconnect()).catch((error: unknown) => {
            if (closed) return;
            if (error instanceof AuthError && error.retryable) { authRetried = false; scheduleReconnect(); }
            else closed = true;
            handlers.onStatus?.("disconnected");
          });
          return;
        }
        scheduleReconnect();
      };
    };

    open();

    return () => {
      closed = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (ws) {

        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        ws.onopen = null;
        try {
          ws.close();
        } catch {
           /* noop */
        }
        ws = null;
      }
    };
  }
}
