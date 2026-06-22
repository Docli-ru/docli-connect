// SPDX-FileCopyrightText: 2026 OOO Agitek
// SPDX-License-Identifier: MIT

import { normalizePath, requestUrl, TFile, type App } from "obsidian";
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

export type UploadResult = "uploaded" | "skipped-large" | "skipped-type" | "failed";

export function isUploadableAttachment(ext: string): boolean {
  return ext.toLowerCase() in MIME;
}

export function mimeForExt(ext: string): string {
  return MIME[ext.toLowerCase()] ?? "application/octet-stream";
}

const dirOf = (path: string): string => {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? "" : path.slice(0, slash);
};

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

export async function uploadAttachment(deps: AttachmentDeps, file: TFile): Promise<UploadResult> {
  if (!isUploadableAttachment(file.extension)) return "skipped-type";
  const bytes = await deps.app.vault.readBinary(file);
  const size = bytes.byteLength;
  if (size > deps.maxBytes || size > SERVER_CHUNK_MAX) return "skipped-large";

  if (size <= WHOLE_FILE_MAX) return uploadWhole(deps, file, bytes);
  return uploadChunked(deps, file, bytes);
}

async function uploadWhole(deps: AttachmentDeps, file: TFile, bytes: ArrayBuffer): Promise<UploadResult> {
  const { body, contentType } = buildMultipart(
    { workspace_id: deps.workspaceId, path: file.path },
    { name: file.name, mime: mimeForExt(file.extension), bytes },
  );
  const resp = await requestUrl({
    url: normalizeServerUrl(deps.serverUrl) + "/api/upload",
    method: "POST",
    contentType,
    headers: { Authorization: `Bearer ${deps.pat}` },
    body,
    throw: false,
  });
  return resp.status === 200 ? "uploaded" : "failed";
}

async function uploadChunked(deps: AttachmentDeps, file: TFile, bytes: ArrayBuffer): Promise<UploadResult> {
  const base = normalizeServerUrl(deps.serverUrl);
  const auth = { Authorization: `Bearer ${deps.pat}` };
  const mtime = (file as unknown as { stat?: { mtime?: number } }).stat?.mtime ?? 0;

  const uploadId = uploadIdFor(`${file.path}:${bytes.byteLength}:${mtime}:${contentFingerprint(bytes)}`);

  const init = await requestUrl({
    url: base + "/api/upload/chunk/init",
    method: "POST",
    contentType: "application/json",
    headers: auth,
    body: JSON.stringify({
      workspaceId: deps.workspaceId,
      uploadId,
      path: file.path,
      totalBytes: bytes.byteLength,
    }),
    throw: false,
  });
  if (init.status !== 200) return "failed";
  let received = Number((init.json as { receivedBytes?: string })?.receivedBytes ?? 0);

  const all = new Uint8Array(bytes);
  while (received < bytes.byteLength) {
    const end = Math.min(received + CHUNK_SIZE, bytes.byteLength);
    const chunk = all.slice(received, end);
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
      body: toArrayBuffer(chunk),
      throw: false,
    });
    if (resp.status !== 200) return "failed";
    const next = Number((resp.json as { receivedBytes?: string })?.receivedBytes ?? received);
    if (next <= received) return "failed";
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
  return done.status === 200 ? "uploaded" : "failed";
}

export async function downloadAttachment(
  deps: AttachmentDeps,
  nodeId: string,
  path: string,
): Promise<boolean> {
  const p = normalizePath(path);
  if (deps.app.vault.getAbstractFileByPath(p) instanceof TFile) return false;
  const url = normalizeServerUrl(deps.serverUrl) + `/api/attachments/${nodeId}`;
  const auth = { Authorization: `Bearer ${deps.pat}` };

  const first = await requestUrl({
    url,
    method: "GET",
    headers: { ...auth, Range: `bytes=0-${DOWNLOAD_CHUNK - 1}` },
    throw: false,
  });
  let body: ArrayBuffer;
  if (first.status === 200) {
    body = first.arrayBuffer;
  } else if (first.status === 206) {
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
      if (resp.status !== 206 && resp.status !== 200) return false;
      const part = new Uint8Array(resp.arrayBuffer);
      if (part.length === 0) break;
      parts.push(part);
      offset += part.length;
    }
    body = toArrayBuffer(concat(parts));
  } else {
    return false;
  }

  const dir = dirOf(p);
  if (dir && !deps.app.vault.getAbstractFileByPath(dir)) {
    try {
      await deps.app.vault.createFolder(dir);
    } catch {

    }
  }
  await deps.app.vault.createBinary(p, body);
  return true;
}

function totalFromContentRange(value: string | undefined): number | null {
  if (!value) return null;
  const slash = value.lastIndexOf("/");
  if (slash < 0) return null;
  const n = Number(value.slice(slash + 1));
  return Number.isFinite(n) ? n : null;
}

function contentFingerprint(bytes: ArrayBuffer): string {
  const u8 = new Uint8Array(bytes);
  const n = u8.length;
  const SAMPLE = 64 * 1024;
  let h = 0x811c9dc5;
  const mix = (b: number) => {
    h ^= b;
    h = Math.imul(h, 0x01000193);
  };
  const head = Math.min(SAMPLE, n);
  for (let i = 0; i < head; i++) mix(u8[i]);
  for (let i = Math.max(head, n - SAMPLE); i < n; i++) mix(u8[i]);
  for (let s = n; s > 0; s = Math.floor(s / 256)) mix(s & 0xff);
  return (h >>> 0).toString(16);
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
