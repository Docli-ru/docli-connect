import { siblingPath } from "./paths.js";
import { sha256Hex } from "./sha256.js";
export const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
export async function syncAttachmentBytes(o) {
    const s = await o.state.load();
    const notice = (n) => o.onNotice?.(n);
    const inScope = (p) => (o.scope ? o.scope(p) : true);
    const listing = await (o.vault.listMeta?.() ?? o.vault.list());
    const localAtt = new Map(listing.filter((e) => e.kind === "attachment").map((e) => [e.path, e]));
    const localFolders = new Set(listing.filter((e) => e.kind === "folder").map((e) => e.path));
    for (const [path, st] of Object.entries(s.byPath)) {
        if (st.kind !== "attachment" || !inScope(path))
            continue;
        const local = localAtt.get(path);
        if (!local) {
            if (st.materialized && !st.restorePending)
                continue;
            if (localFolders.has(path)) {
                const sib = siblingPath(path, (p) => Boolean(s.byPath[p]) || localAtt.has(p) || localFolders.has(p));
                try {
                    await o.vault.move(path, sib);
                }
                catch {
                    notice({ kind: "download-failed", path, detail: "a local folder occupies this path" });
                    continue;
                }
                notice({ kind: "conflict", path, savedAs: sib });
            }
            try {
                await materialize(o, path, st, notice);
            }
            catch {
                notice({ kind: "download-failed", path, detail: "local write failed" });
            }
            continue;
        }
        const freshAdopt = st.materialized === false;
        if (!freshAdopt) {
            st.materialized = true;
            st.restorePending = false;
        }
        if (!o.enabled)
            continue;
        const stat = (await o.vault.stat(path)) ?? { size: local.size ?? 0, mtime: local.mtime ?? 0 };
        let bytes = null;
        let localSha;
        if (st.baseSha256 !== undefined &&
            st.baseSize !== undefined &&
            st.baseSize === stat.size &&
            st.baseMtime === stat.mtime) {
            localSha = st.baseSha256;
        }
        else {
            bytes = await o.vault.readBinary(path);
            if (bytes.byteLength < stat.size) {
                notice({ kind: "held", path, detail: "short read — file still materializing" });
                continue;
            }
            localSha = sha256Hex(bytes);
        }
        const readBytes = async () => bytes ?? (bytes = await o.vault.readBinary(path));
        if (st.baseGeneration === undefined || st.baseSha256 === undefined) {
            if (st.remoteSha256 && st.remoteSha256.toLowerCase() === localSha) {
                recordBase(st, st.remoteGeneration ?? 0, localSha, stat);
                st.materialized = true;
                st.restorePending = false;
                continue;
            }
            if (st.remoteSha256 === undefined && st.remoteGeneration === undefined) {
                continue;
            }
            if (freshAdopt) {
                const got = await o.blob.download(st.id, st.blobUrl ?? null);
                if (got === "failed") {
                    notice({ kind: "download-failed", path });
                    continue;
                }
                const digest = sha256Hex(got.bytes);
                if (st.remoteSha256 && digest !== st.remoteSha256.toLowerCase()) {
                    notice({ kind: "download-failed", path, detail: "digest mismatch — discarded" });
                    continue;
                }
                const now = await o.vault.stat(path);
                if (now === null || now.size !== stat.size || now.mtime !== stat.mtime) {
                    notice({ kind: "held", path, detail: "file changed during the download — retrying" });
                    continue;
                }
                const sib = siblingPath(path, (p) => Boolean(s.byPath[p]) || localAtt.has(p) || localFolders.has(p));
                await o.vault.writeBinary(sib, await readBytes());
                localAtt.set(sib, { path: sib, kind: "attachment" });
                localAtt.delete(path);
                notice({ kind: "conflict", path, savedAs: sib });
                await o.vault.writeBinary(path, got.bytes);
                st.materialized = true;
                st.restorePending = false;
                recordBase(st, st.remoteGeneration ?? 0, digest, await o.vault.stat(path));
                notice({ kind: "transferred", path });
                continue;
            }
            await pushLocal(o, s, localAtt, localFolders, path, st, 0, localSha, await readBytes(), stat, notice);
            continue;
        }
        const localChanged = localSha !== st.baseSha256;
        const remoteChanged = (st.remoteGeneration ?? 0) !== st.baseGeneration;
        if (!localChanged && !remoteChanged) {
            if (bytes !== null) {
                st.baseSize = stat.size;
                st.baseMtime = stat.mtime;
            }
            continue;
        }
        if (localChanged && !remoteChanged) {
            await pushLocal(o, s, localAtt, localFolders, path, st, st.baseGeneration, localSha, await readBytes(), stat, notice);
            continue;
        }
        if (!localChanged && remoteChanged) {
            if (st.remoteSha256?.toLowerCase() === EMPTY_SHA256 && stat.size > 0) {
                notice({ kind: "held", path, detail: "empty server copy held off a non-empty local file" });
                continue;
            }
            await replaceFromServer(o, path, st, notice, stat);
            continue;
        }
        if (st.remoteSha256?.toLowerCase() === EMPTY_SHA256 && stat.size > 0) {
            notice({ kind: "held", path, detail: "empty server copy held off a non-empty local file" });
            continue;
        }
        const sib = siblingPath(path, (p) => Boolean(s.byPath[p]) || localAtt.has(p) || localFolders.has(p));
        await o.vault.writeBinary(sib, await readBytes());
        localAtt.set(sib, { path: sib, kind: "attachment" });
        if (await replaceFromServer(o, path, st, notice, stat)) {
            notice({ kind: "conflict", path, savedAs: sib });
        }
        else {
            await o.vault.remove(sib);
            localAtt.delete(sib);
        }
    }
    for (const [path, e] of localAtt) {
        if (s.byPath[path] || !inScope(path))
            continue;
        const bytes = await o.vault.readBinary(path);
        if (e.size !== undefined && bytes.byteLength < e.size) {
            notice({ kind: "held", path, detail: "short read — file still materializing" });
            continue;
        }
        const res = await o.blob.uploadNew(path, bytes);
        if (res === "skipped-large") {
            notice({ kind: "skipped-large", path });
            continue;
        }
        if (res === "failed") {
            notice({ kind: "upload-failed", path });
            continue;
        }
        let finalPath = path;
        if (res.path !== undefined && res.path !== path) {
            try {
                await o.vault.move(path, res.path);
                finalPath = res.path;
            }
            catch {
            }
        }
        notice({ kind: "transferred", path: finalPath });
        s.byPath[finalPath] = {
            id: res.id,
            kind: "attachment",
            baseRev: 0,
            materialized: true,
            ...(o.enabled
                ? {
                    baseGeneration: res.generation,
                    baseSha256: res.sha256.toLowerCase(),
                    baseSize: e.size,
                    baseMtime: e.mtime,
                }
                : {}),
        };
    }
    await o.state.save(s);
}
function recordBase(st, generation, sha256, stat) {
    st.baseGeneration = generation;
    st.baseSha256 = sha256.toLowerCase();
    st.baseSize = stat?.size;
    st.baseMtime = stat?.mtime;
}
async function materialize(o, path, st, notice) {
    const got = await o.blob.download(st.id, st.blobUrl ?? null);
    if (got === "failed") {
        notice({ kind: "download-failed", path });
        return;
    }
    const digest = sha256Hex(got.bytes);
    if (st.remoteSha256 && digest !== st.remoteSha256.toLowerCase()) {
        notice({ kind: "download-failed", path, detail: "digest mismatch — discarded" });
        return;
    }
    if ((await o.vault.stat(path)) !== null) {
        notice({ kind: "held", path, detail: "a local file appeared during the download — retrying" });
        return;
    }
    await o.vault.writeBinary(path, got.bytes);
    st.materialized = true;
    st.restorePending = false;
    if (o.enabled) {
        const stat = await o.vault.stat(path);
        recordBase(st, st.remoteGeneration ?? 0, digest, stat);
    }
    notice({ kind: "transferred", path });
}
async function replaceFromServer(o, path, st, notice, expectStat) {
    const got = await o.blob.download(st.id, st.blobUrl ?? null);
    if (got === "failed") {
        notice({ kind: "download-failed", path });
        return false;
    }
    const digest = sha256Hex(got.bytes);
    if (st.remoteSha256 && digest !== st.remoteSha256.toLowerCase()) {
        notice({ kind: "download-failed", path, detail: "digest mismatch — discarded" });
        return false;
    }
    if (got.bytes.byteLength === 0 && ((await o.vault.stat(path))?.size ?? 0) > 0) {
        notice({ kind: "held", path, detail: "empty server copy held off a non-empty local file" });
        return false;
    }
    if (expectStat) {
        const now = await o.vault.stat(path);
        if (now === null || now.size !== expectStat.size || now.mtime !== expectStat.mtime) {
            notice({ kind: "held", path, detail: "file changed during the download — retrying" });
            return false;
        }
    }
    await o.vault.writeBinary(path, got.bytes);
    st.materialized = true;
    const stat = await o.vault.stat(path);
    recordBase(st, st.remoteGeneration ?? 0, digest, stat);
    notice({ kind: "transferred", path });
    return true;
}
async function pushLocal(o, s, localAtt, localFolders, path, st, baseGeneration, localSha, bytes, stat, notice) {
    const res = await o.blob.putBlob(st.id, baseGeneration, localSha, bytes);
    if (res.ok) {
        recordBase(st, res.generation, res.sha256, stat);
        st.remoteGeneration = res.generation;
        st.remoteSha256 = res.sha256.toLowerCase();
        notice({ kind: "transferred", path });
        return;
    }
    if (res.kind === "too-large") {
        notice({ kind: "skipped-large", path });
        return;
    }
    if (res.kind === "failed") {
        notice({ kind: "upload-failed", path, detail: res.detail });
        return;
    }
    switch (res.divergence) {
        case "current-match":
            recordBase(st, res.generation, localSha, stat);
            st.remoteGeneration = res.generation;
            st.remoteSha256 = res.sha256 ?? localSha;
            return;
        case "displaced-match":
            st.remoteGeneration = res.generation;
            st.remoteSha256 = res.sha256 ?? null;
            st.blobUrl = null;
            await replaceFromServer(o, path, st, notice, stat);
            return;
        case "unknown": {
            const sib = siblingPath(path, (p) => Boolean(s.byPath[p]) || localAtt.has(p) || localFolders.has(p));
            await o.vault.writeBinary(sib, bytes);
            localAtt.set(sib, { path: sib, kind: "attachment" });
            st.remoteGeneration = res.generation;
            st.remoteSha256 = res.sha256 ?? null;
            st.blobUrl = null;
            if (await replaceFromServer(o, path, st, notice, stat)) {
                notice({ kind: "conflict", path, savedAs: sib });
            }
            else {
                await o.vault.remove(sib);
                localAtt.delete(sib);
            }
            return;
        }
    }
}
