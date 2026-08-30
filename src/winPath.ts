// SPDX-FileCopyrightText: 2026 OOO Agitek
// SPDX-License-Identifier: MIT

const ILLEGAL = new Set(['<', '>', ':', '"', '|', '?', '*', '\\']);

const DEVICE = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;

function hex(ch: string): string {
  return "%" + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0");
}

function isIllegalChar(ch: string): boolean {
  return ILLEGAL.has(ch) || ch.charCodeAt(0) < 0x20;
}

function needsEscape(seg: string): boolean {
  for (const ch of seg) if (isIllegalChar(ch)) return true;
  if (DEVICE.test(seg)) return true;
  return seg.endsWith(".") || seg.endsWith(" ");
}

function coreEscape(seg: string): string {
  let out = "";
  for (const ch of seg) {
    out += isIllegalChar(ch) || ch === "%" ? hex(ch) : ch;
  }
  if (DEVICE.test(out)) out = hex(out[0]) + out.slice(1);
  if (out.endsWith(".") || out.endsWith(" ")) out = out.slice(0, -1) + hex(out[out.length - 1]);
  return out;
}

export function encodeWinSegment(seg: string): string {
  return needsEscape(seg) ? coreEscape(seg) : seg;
}

export function decodeWinSegment(seg: string): string {
  if (!seg.includes("%")) return seg;
  const candidate = permissiveDecode(seg);
  if (candidate === seg) return seg;
  return needsEscape(candidate) && coreEscape(candidate) === seg ? candidate : seg;
}

function permissiveDecode(seg: string): string {
  let out = "";
  for (let i = 0; i < seg.length; i++) {
    if (seg[i] === "%" && i + 2 < seg.length + 1) {
      const h = seg.slice(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(h)) {
        out += String.fromCharCode(parseInt(h, 16));
        i += 2;
        continue;
      }
    }
    out += seg[i];
  }
  return out;
}

export function encodeWinPath(path: string): string {
  return path.split("/").map(encodeWinSegment).join("/");
}

export function decodeWinPath(path: string): string {
  return path.split("/").map(decodeWinSegment).join("/");
}

export function needsWinMapping(path: string): boolean {
  return path.split("/").some(needsEscape);
}
