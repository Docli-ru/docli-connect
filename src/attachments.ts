// SPDX-FileCopyrightText: 2026 OOO Agitek
// SPDX-License-Identifier: MIT

import { requestUrl, type App } from "obsidian";
import { sha256Hex, type BlobPort, type BlobPutResult } from "./sync-client/index.js";
import { normalizeServerUrl } from "./settings.js";

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  flac: "audio/flac",
  wav: "audio/wav",
  m4a: "audio/mp4",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

const WHOLE_FILE_MAX = 25 * 1024 * 1024;
const SERVER_CHUNK_MAX = 200 * 1024 * 1024;
const CHUNK_SIZE = 8 * 1024 * 1024;
const DOWNLOAD_CHUNK = 8 * 1024 * 1024;

export function mimeForExt(ext: string): string {
  return MIME[ext.toLowerCase()] ?? "application/octet-stream";
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  return buf;
}

const BOUNDARY = "----docliSyncFormBoundary7MA4YWxkTrZu0gW";

function cdSafe(value: string): string {
  return value.replace(/["\\\r\n]/g, "_");
}

export function buildMultipart(
  fields: Record<string, string>,
  file: { name: string; mime: string; bytes: ArrayBuffer },
): { body: ArrayBuffer; contentType: string } {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(enc.encode(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="${cdSafe(k)}"\r\n\r\n${v}\r\n`));
  }
  parts.push(
    enc.encode(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="${cdSafe(file.name)}"\r\n` +
        `Content-Type: ${file.mime}\r\n\r\n`,
    ),
  );
  parts.push(new Uint8Array(file.bytes));
  parts.push(enc.encode(`\r\n--${BOUNDARY}--\r\n`));
  const merged = concat(parts);
  const body = new ArrayBuffer(merged.byteLength);
  new Uint8Array(body).set(merged);
  return { body, contentType: `multipart/form-data; boundary=${BOUNDARY}` };
}

export interface AttachmentDeps {
  app: App;
  serverUrl: string;
  pat: string;
  workspaceId: string;

  maxBytes: number;
}

export class RequestUrlBlobPort implements BlobPort {
  constructor(private readonly deps: AttachmentDeps) {}

  async putBlob(
    nodeId: string,
    baseGeneration: number,
    sha256: string,
    bytes: Uint8Array,
  ): Promise<BlobPutResult> {

    try {
      return await this.putBlobInner(nodeId, baseGeneration, sha256, bytes);
    } catch {
      return { ok: false, kind: "failed", detail: "network error" };
    }
  }

  private async putBlobInner(
    nodeId: string,
    baseGeneration: number,
    sha256: string,
    bytes: Uint8Array,
  ): Promise<BlobPutResult> {
    const size = bytes.byteLength;
    if (size > this.deps.maxBytes || size > SERVER_CHUNK_MAX) {

      return { ok: false, kind: "too-large" };
    }
    const base = normalizeServerUrl(this.deps.serverUrl);
    if (size <= WHOLE_FILE_MAX) {
      const resp = await requestUrl({
        url: base + "/api/upload/replace",
        method: "POST",
        contentType: "application/octet-stream",
        headers: {
          Authorization: `Bearer ${this.deps.pat}`,
          "X-Docli-Workspace": this.deps.workspaceId,
          "X-Docli-Node-Id": nodeId,
          "X-Docli-Base-Generation": String(baseGeneration),
          "X-Docli-Sha256": sha256,
        },
        body: toArrayBuffer(bytes),
        throw: false,
      });
      return parsePutBlobResponse(resp.status, safeJson(resp));
    }
    return this.putBlobChunked(nodeId, baseGeneration, sha256, bytes);
  }

  private async putBlobChunked(
    nodeId: string,
    baseGeneration: number,
    sha256: string,
    bytes: Uint8Array,
  ): Promise<BlobPutResult> {
    const base = normalizeServerUrl(this.deps.serverUrl);
    const auth = { Authorization: `Bearer ${this.deps.pat}` };

    const uploadId = uploadIdFor(`replace:${nodeId}:${baseGeneration}:${sha256}`);
    const init = await requestUrl({
      url: base + "/api/upload/chunk/init",
      method: "POST",
      contentType: "application/json",
      headers: auth,
      body: JSON.stringify({
        workspaceId: this.deps.workspaceId,
        uploadId,
        path: `replace-${nodeId}.bin`,
        totalBytes: bytes.byteLength,
        targetNodeId: nodeId,
        expectedGeneration: baseGeneration,
        sha256,
      }),
      throw: false,
    });
    if (init.status !== 200) return { ok: false, kind: "failed", detail: `init ${init.status}` };
    let received = Number((safeJson(init) as { receivedBytes?: string })?.receivedBytes ?? 0);
    while (received < bytes.byteLength) {
      const end = Math.min(received + CHUNK_SIZE, bytes.byteLength);
      const resp = await requestUrl({
        url: base + "/api/upload/chunk/append",
        method: "POST",
        contentType: "application/octet-stream",
        headers: {
          ...auth,
          "X-Docli-Workspace": this.deps.workspaceId,
          "X-Docli-Upload-Id": uploadId,
          "X-Docli-Offset": String(received),
        },
        body: toArrayBuffer(bytes.slice(received, end)),
        throw: false,
      });
      if (resp.status !== 200) return { ok: false, kind: "failed", detail: `append ${resp.status}` };
      const next = Number((safeJson(resp) as { receivedBytes?: string })?.receivedBytes ?? received);
      if (next <= received) return { ok: false, kind: "failed", detail: "no progress" };
      received = next;
    }
    const done = await requestUrl({
      url: base + "/api/upload/chunk/complete",
      method: "POST",
      contentType: "application/json",
      headers: auth,
      body: JSON.stringify({ workspaceId: this.deps.workspaceId, uploadId }),
      throw: false,
    });
    return parsePutBlobResponse(done.status, safeJson(done));
  }

  async download(nodeId: string, blobUrl: string | null): Promise<{ bytes: Uint8Array } | "failed"> {

    try {
      return await this.downloadInner(nodeId, blobUrl);
    } catch {
      return "failed";
    }
  }

  private async downloadInner(
    nodeId: string,
    blobUrl: string | null,
  ): Promise<{ bytes: Uint8Array } | "failed"> {
    const rel = blobUrl ?? `/api/attachments/${nodeId}`;
    const url = normalizeServerUrl(this.deps.serverUrl) + rel;
    const auth = { Authorization: `Bearer ${this.deps.pat}` };
    const first = await requestUrl({
      url,
      method: "GET",
      headers: { ...auth, Range: `bytes=0-${DOWNLOAD_CHUNK - 1}` },
      throw: false,
    });
    if (first.status === 200) return { bytes: new Uint8Array(first.arrayBuffer) };
    if (first.status !== 206) return "failed";
    const total = totalFromContentRange(first.headers?.["content-range"]);
    const parts: Uint8Array[] = [new Uint8Array(first.arrayBuffer)];
    let offset = first.arrayBuffer.byteLength;
    while (total !== null && offset < total) {
      const end = Math.min(offset + DOWNLOAD_CHUNK, total) - 1;
      const resp = await requestUrl({
        url,
        method: "GET",
        headers: { ...auth, Range: `bytes=${offset}-${end}` },
        throw: false,
      });
      if (resp.status !== 206 && resp.status !== 200) return "failed";
      const part = new Uint8Array(resp.arrayBuffer);
      if (part.length === 0) break;
      parts.push(part);
      offset += part.length;
    }
    return { bytes: concat(parts) };
  }

  async uploadNew(
    path: string,
    bytes: Uint8Array,
  ): Promise<{ id: string; generation: number; sha256: string } | "failed" | "skipped-large"> {
    try {
      return await this.uploadNewInner(path, bytes);
    } catch {
      return "failed";
    }
  }

  private async uploadNewInner(
    path: string,
    bytes: Uint8Array,
  ): Promise<{ id: string; generation: number; sha256: string } | "failed" | "skipped-large"> {
    const size = bytes.byteLength;
    if (size > this.deps.maxBytes || size > SERVER_CHUNK_MAX) return "skipped-large";
    const name = path.slice(path.lastIndexOf("/") + 1);
    const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";
    const digest = sha256Hex(bytes);
    let status: number;
    let json: unknown;
    if (size <= WHOLE_FILE_MAX) {
      const { body, contentType } = buildMultipart(
        { workspace_id: this.deps.workspaceId, path },
        { name, mime: mimeForExt(ext), bytes: toArrayBuffer(bytes) },
      );
      const resp = await requestUrl({
        url: normalizeServerUrl(this.deps.serverUrl) + "/api/upload",
        method: "POST",
        contentType,
        headers: { Authorization: `Bearer ${this.deps.pat}` },
        body,
        throw: false,
      });
      status = resp.status;
      json = safeJson(resp);
    } else {
      const res = await chunkedCreate(this.deps, path, bytes, digest);
      if (res === null) return "failed";
      status = res.status;
      json = res.json;
    }
    if (status !== 200) return "failed";
    const id = (json as { id?: string })?.id;
    if (!id) return "failed";

    const serverPath = (json as { path?: string })?.path;
    return { id, generation: 0, sha256: digest, ...(serverPath ? { path: serverPath } : {}) };
  }
}

function parsePutBlobResponse(status: number, json: unknown): BlobPutResult {
  const j = (json ?? {}) as {
    code?: string;
    generation?: number;
    sha256?: string | null;
    divergence?: string;
  };
  if (status === 200) {
    return { ok: true, generation: Number(j.generation ?? 0), sha256: String(j.sha256 ?? "") };
  }
  if (status === 409 && j.code === "GENERATION_CONFLICT") {
    const d = j.divergence;
    return {
      ok: false,
      kind: "conflict",
      generation: Number(j.generation ?? 0),
      sha256: j.sha256 ?? null,
      divergence: d === "current-match" || d === "displaced-match" ? d : "unknown",
    };
  }
  return { ok: false, kind: "failed", detail: `${status}${j.code ? ` ${j.code}` : ""}` };
}

async function chunkedCreate(
  deps: AttachmentDeps,
  path: string,
  bytes: Uint8Array,
  sha256: string,
): Promise<{ status: number; json: unknown } | null> {
  const base = normalizeServerUrl(deps.serverUrl);
  const auth = { Authorization: `Bearer ${deps.pat}` };

  const uploadId = uploadIdFor(`${deps.workspaceId}:${path}:${bytes.byteLength}:${sha256}`);
  const init = await requestUrl({
    url: base + "/api/upload/chunk/init",
    method: "POST",
    contentType: "application/json",
    headers: auth,
    body: JSON.stringify({ workspaceId: deps.workspaceId, uploadId, path, totalBytes: bytes.byteLength, sha256 }),
    throw: false,
  });
  if (init.status !== 200) return null;
  let received = Number((safeJson(init) as { receivedBytes?: string })?.receivedBytes ?? 0);
  while (received < bytes.byteLength) {
    const end = Math.min(received + CHUNK_SIZE, bytes.byteLength);
    const resp = await requestUrl({
      url: base + "/api/upload/chunk/append",
      method: "POST",
      contentType: "application/octet-stream",
      headers: {
        ...auth,
        "X-Docli-Workspace": deps.workspaceId,
        "X-Docli-Upload-Id": uploadId,
        "X-Docli-Offset": String(received),
      },
      body: toArrayBuffer(bytes.slice(received, end)),
      throw: false,
    });
    if (resp.status !== 200) return null;
    const next = Number((safeJson(resp) as { receivedBytes?: string })?.receivedBytes ?? received);
    if (next <= received) return null;
    received = next;
  }
  const done = await requestUrl({
    url: base + "/api/upload/chunk/complete",
    method: "POST",
    contentType: "application/json",
    headers: auth,
    body: JSON.stringify({ workspaceId: deps.workspaceId, uploadId }),
    throw: false,
  });
  return { status: done.status, json: safeJson(done) };
}

function totalFromContentRange(value: string | undefined): number | null {
  if (!value) return null;
  const slash = value.lastIndexOf("/");
  if (slash < 0) return null;
  const n = Number(value.slice(slash + 1));
  return Number.isFinite(n) ? n : null;
}

function safeJson(resp: { json: unknown }): unknown {
  try {
    return resp.json;
  } catch {
    return null;
  }
}

function uploadIdFor(key: string): string {
  const words: number[] = [];
  for (let w = 0; w < 4; w++) {
    let h = 0x811c9dc5 ^ (w * 0x9e3779b1);
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    words.push(h >>> 0);
  }
  const hex = words.map((x) => x.toString(16).padStart(8, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
