// SPDX-FileCopyrightText: 2026 OOO Agitek
// SPDX-License-Identifier: MIT
import { requestUrl, type RequestUrlParam, type RequestUrlResponse } from 'obsidian';
import { credentialToken, type Credential } from './auth.js';

export async function authRequest(credential: Credential, params: RequestUrlParam): Promise<RequestUrlResponse> {
  const send = (token: string) => requestUrl({ ...params, throw: false,
    headers: { ...params.headers, Authorization: `Bearer ${token}` } });
  const response = await send(await credentialToken(credential));
  if (response.status !== 401 || typeof credential === 'string') return response;

  let body: unknown;
  try { body = response.json; } catch { return response; }
  if (!body || typeof body !== 'object' || !('code' in body) ||
      body.code !== 'NOT_AUTHENTICATED') return response;
  return send(await credential.token(true));
}
