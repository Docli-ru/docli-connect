// SPDX-FileCopyrightText: 2026 OOO Agitek
// SPDX-License-Identifier: MIT

export interface AuthStorage {
  getSecret(): string | null;
  setSecret(value: string): void;
  getCheckpoint(): Promise<string | null>;
  setCheckpoint(value: string): Promise<void>;
}
interface RecordV1 {
  version: 1;
  generation: string;
  issuer: string;
  resource: string;
  access: string;
  refresh: string;
  expires: number;
}
type Exchange = (path: string, fields: Record<string, string>) => Promise<{ status: number; json: unknown }>;
export type Credential = string | { token(force?: boolean): Promise<string> };
export function credentialToken(credential: Credential): Promise<string> {
  return typeof credential === 'string' ? Promise.resolve(credential) : credential.token();
}
export const OAUTH_REDIRECT = 'obsidian://docli-connect/oauth';

export function validateOrigin(value: string, mobile: boolean): string {
  const url = new URL(value.trim());
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || !/^\/*$/.test(url.pathname) ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback && !mobile))) {
    throw new Error('Use an HTTPS server origin. HTTP is supported only for desktop loopback development.');
  }
  return url.origin;
}
function random(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}
function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export class AuthProvider {
  private record: RecordV1 | null = null;
  private pending: { state: string; verifier: string; expires: number; epoch: number } | null = null;
  private epoch = 0;
  private refreshTask: Promise<string> | null = null;
  status: 'connected' | 'expired' | 'offline' = 'expired';
  constructor(
    readonly origin: string,
    private readonly installId: string,
    private readonly storage: AuthStorage,
    private readonly exchange: Exchange,
  ) {}

  get hasPending(): boolean { return this.pending !== null && this.pending.expires > Date.now(); }

  get ready(): boolean { return this.record !== null; }

  async load(): Promise<void> {
    this.record = null;
    try {
      const record = JSON.parse(this.storage.getSecret() ?? 'null') as RecordV1 | null;
      const check = JSON.parse(await this.storage.getCheckpoint() ?? 'null') as { phase: string; generation: string } | null;
      if (record?.version === 1 && record.issuer === this.origin && record.resource === this.origin + '/api/sync' &&
          typeof record.access === 'string' && record.access && typeof record.refresh === 'string' && record.refresh &&
          Number.isFinite(record.expires) && check?.phase === 'ready' && check.generation === record.generation) {
        this.record = record;
        this.status = 'connected';
      }
    } catch { this.status = 'expired'; }
  }

  cancel(): void { this.epoch++; this.pending = null; }

  async begin(): Promise<string> {
    this.cancel();
    const pending = { state: random(), verifier: random(), expires: Date.now() + 10 * 60_000, epoch: this.epoch };
    this.pending = pending;
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pending.verifier));
    this.current(pending.epoch);
    const params = new URLSearchParams({
      response_type: 'code', client_id: 'docli-connect', redirect_uri: OAUTH_REDIRECT,
      scope: 'sync', resource: this.origin + '/api/sync', install_id: this.installId,
      state: pending.state, code_challenge: base64url(new Uint8Array(hash)), code_challenge_method: 'S256',
    });
    return this.origin + '/api/oauth/authorize?' + params.toString();
  }

  async complete(callback: Record<string, string>): Promise<void> {
    const p = this.pending;
    if (!p || p.state !== callback.state || callback.iss !== this.origin || p.expires <= Date.now()) {
      throw new Error('Sign-in callback did not match this vault or has expired.');
    }
    this.current(p.epoch);
    this.pending = null;
    if (callback.error || !callback.code) throw new Error('Sign-in was not approved.');
    await this.rotate({ grant_type: 'authorization_code', code: callback.code,
      code_verifier: p.verifier, redirect_uri: OAUTH_REDIRECT }, p.epoch);
  }

  async token(force = false): Promise<string> {
    if (!this.record) throw new Error('Sign in to docli again.');
    if (this.refreshTask) return this.refreshTask;
    if (!force && this.record.expires > Date.now() + 60_000) return this.record.access;
    this.refreshTask = this.rotate({ grant_type: 'refresh_token', refresh_token: this.record.refresh }, this.epoch)
      .finally(() => { this.refreshTask = null; });
    return this.refreshTask;
  }

  private current(epoch: number): void {
    if (epoch !== this.epoch) throw new Error('Sign-in was cancelled.');
  }

  private async rotate(fields: Record<string, string>, epoch: number): Promise<string> {
    const old = this.record;
    try {
      await this.storage.setCheckpoint(JSON.stringify({ phase: 'in-flight', generation: old?.generation ?? '' }));
      this.current(epoch);
      const response = await this.exchange('/api/oauth/token', {
        ...fields, client_id: 'docli-connect', resource: this.origin + '/api/sync',
      });
      this.current(epoch);

      const body = response.json as Record<string, unknown> | null;
      if (response.status !== 200) {
        if (old && (response.status === 429 || response.status === 503) &&
            (body?.error === 'temporarily_unavailable' || body?.error === 'slow_down' || (response.status === 429 && body?.error === 'invalid_request'))) {
          await this.storage.setCheckpoint(JSON.stringify({ phase: 'ready', generation: old.generation }));
          this.current(epoch);
          this.status = 'offline';
          throw new RetryableAuthError();
        }
        throw new Error('Sign in to docli again.');
      }
      if (!body || typeof body.access_token !== 'string' || !body.access_token ||
          typeof body.refresh_token !== 'string' || !body.refresh_token ||
          typeof body.expires_in !== 'number' || body.expires_in <= 0 || !Number.isFinite(body.expires_in) ||
          typeof body.token_type !== 'string' || body.token_type.toLowerCase() !== 'bearer' ||
          (body.scope !== undefined && body.scope !== 'sync')) throw new Error('Invalid sign-in response.');
      const next: RecordV1 = { version: 1, generation: random(), issuer: this.origin,
        resource: this.origin + '/api/sync', access: body.access_token, refresh: body.refresh_token,
        expires: Date.now() + body.expires_in * 1000 };
      this.storage.setSecret(JSON.stringify(next));
      await this.storage.setCheckpoint(JSON.stringify({ phase: 'ready', generation: next.generation }));
      this.current(epoch);
      this.record = next;
      this.status = 'connected';
      return next.access;
    } catch (error) {
      if (!(error instanceof RetryableAuthError)) {
        this.record = null;
        this.status = 'expired';
      }

      throw new AuthError(error instanceof RetryableAuthError);
    }
  }

  async signOut(): Promise<boolean> {
    const record = this.record;
    this.cancel();
    this.record = null;
    this.status = 'expired';
    this.storage.setSecret('');
    await this.storage.setCheckpoint(JSON.stringify({ phase: 'signed-out' }));
    if (!record) return true;
    try {
      return (await this.exchange('/api/oauth/revoke', { client_id: 'docli-connect', token: record.refresh,
        token_type_hint: 'refresh_token' })).status === 200;
    } catch { return false; }
  }
}
class RetryableAuthError extends Error {}

export class AuthError extends Error {
  constructor(readonly retryable: boolean) {
    super(retryable ? 'Connection temporarily unavailable. Try again later.' : 'Sign in to docli again.');
  }
}
