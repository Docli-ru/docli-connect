import { threeWayMerge } from "./merge.js";
import { siblingPath } from "./paths.js";
import { sha256Hex } from "./sha256.js";
import { isNoteName } from "./quarantine.js";
import { rekey } from "./reconcile.js";
function pathForId(state, id) {
    for (const [path, st] of Object.entries(state.byPath)) {
        if (st.id === id)
            return path;
    }
    return undefined;
}
export async function applyRemote(nodes, vault, state, opts = {}) {
    const seen = new Set();
    const folderMoves = nodes
        .filter((n) => !n.trashed && n.kind === "folder")
        .sort((a, b) => a.path.length - b.path.length);
    for (const n of folderMoves) {
        const from = pathForId(state, n.id);
        if (from === undefined || from === n.path)
            continue;
        try {
            await applyFolderMove(n, from, vault, state, opts);
        }
        catch (e) {
            if (opts.quarantine) {
                opts.quarantine.park(n, String(e?.message ?? e), n.path);
                continue;
            }
            throw e;
        }
    }
    const foldIdx = opts.foldPath
        ? new Map(Object.entries(state.byPath).map(([p, st]) => [opts.foldPath(p), st.id]))
        : undefined;
    for (const n of nodes) {
        seen.add(n.id);
        if (opts.quarantine?.shouldSkip(n.id))
            continue;
        const group = opts.quarantine?.inActiveGroup(n.path);
        if (group !== undefined && !n.trashed) {
            opts.quarantine.park(n, `grouped under quarantined folder move «${group}»`, group);
            continue;
        }
        try {
            await applyOne(n, vault, state, opts, foldIdx);
            if (foldIdx && opts.foldPath && !n.trashed)
                foldIdx.set(opts.foldPath(n.path), n.id);
        }
        catch (e) {
            if (opts.quarantine) {
                opts.quarantine.park(n, String(e?.message ?? e));
                continue;
            }
            throw e;
        }
    }
    return seen;
}
async function applyFolderMove(n, from, vault, state, opts) {
    {
        const asidePath = () => siblingPath(n.path, (p) => p in state.byPath || Boolean(opts.localFiles?.has(p)) || Boolean(opts.reserved?.(p)));
        const occ = state.byPath[n.path];
        if (occ && occ.id !== n.id) {
            const aside = asidePath();
            await vault.move(n.path, aside);
            rekey(state, n.path, aside);
            opts.onConflict?.({ original: n.path, savedAs: aside });
        }
        try {
            await vault.move(from, n.path);
        }
        catch {
            const aside = asidePath();
            await vault.move(n.path, aside);
            if (opts.localFiles?.has(n.path)) {
                opts.localFiles.set(aside, opts.localFiles.get(n.path));
                opts.localFiles.delete(n.path);
            }
            opts.onConflict?.({ original: n.path, savedAs: aside });
            await vault.move(from, n.path);
        }
        rekey(state, from, n.path);
    }
}
async function applyOne(n, vault, state, opts, foldIdx) {
    {
        const existing = pathForId(state, n.id);
        const prev = existing !== undefined ? state.byPath[existing] : state.byPath[n.path];
        if (n.trashed) {
            if (existing !== undefined) {
                const prevSt = state.byPath[existing];
                if (prevSt?.kind === "attachment") {
                    let divergent = false;
                    try {
                        const bytes = await vault.readBinary(existing);
                        if (bytes.byteLength > 0) {
                            const ref = prevSt.baseSha256 ?? n.sha256 ?? null;
                            divergent = ref === null || sha256Hex(bytes) !== ref;
                        }
                        else {
                            divergent = ((await vault.stat(existing))?.size ?? 0) > 0;
                        }
                    }
                    catch {
                        try {
                            divergent = ((await vault.stat(existing))?.size ?? 0) > 0;
                        }
                        catch {
                        }
                    }
                    if (divergent) {
                        const taken = new Set(Object.keys(state.byPath));
                        const isTaken = (p) => taken.has(p) || Boolean(opts.localFiles?.has(p)) || Boolean(opts.reserved?.(p));
                        let sib = siblingPath(existing, isTaken);
                        for (let guard = 0; guard < 100 && (await vault.stat(sib)) !== null; guard++) {
                            taken.add(sib);
                            sib = siblingPath(existing, isTaken);
                        }
                        await vault.move(existing, sib);
                        opts.onConflict?.({ original: existing, savedAs: sib });
                        delete state.byPath[existing];
                        return;
                    }
                }
                await vault.remove(existing);
                delete state.byPath[existing];
                if (foldIdx && opts.foldPath)
                    foldIdx.delete(opts.foldPath(existing));
            }
            return;
        }
        if (!n.trashed && n.kind === "file") {
            const basename = n.path.slice(n.path.lastIndexOf("/") + 1);
            if (!isNoteName(basename)) {
                throw new Error(`refusing to write note «${n.path}»: not a .md name (the A3 mirror guard)`);
            }
        }
        if (foldIdx && opts.foldPath && !n.trashed) {
            const owner = foldIdx.get(opts.foldPath(n.path));
            if (owner !== undefined && owner !== n.id) {
                throw new Error(`refusing to write «${n.path}»: its name collides with an existing synced file on this filesystem`);
            }
        }
        if (existing !== undefined && existing !== n.path) {
            if (foldIdx && opts.foldPath)
                foldIdx.delete(opts.foldPath(existing));
            try {
                await vault.move(existing, n.path);
            }
            catch (e) {
                if (state.byPath[n.path] !== undefined)
                    throw e;
                const taken = new Set();
                const pick = () => siblingPath(n.path, (p) => p in state.byPath ||
                    Boolean(opts.localFiles?.has(p)) ||
                    Boolean(opts.reserved?.(p)) ||
                    taken.has(p));
                let aside = pick();
                for (let guard = 0; guard < 100 && (await vault.stat(aside).catch(() => null)) !== null; guard++) {
                    taken.add(aside);
                    aside = pick();
                }
                try {
                    await vault.move(n.path, aside);
                }
                catch {
                    throw e;
                }
                try {
                    await vault.move(existing, n.path);
                }
                catch (e2) {
                    await vault.move(aside, n.path).catch(() => { });
                    throw e2;
                }
                if (opts.localFiles?.has(n.path)) {
                    opts.localFiles.set(aside, opts.localFiles.get(n.path));
                    opts.localFiles.delete(n.path);
                }
                opts.onConflict?.({ original: n.path, savedAs: aside });
            }
            delete state.byPath[existing];
        }
        if (n.kind === "folder") {
            await vault.mkdir(n.path);
            state.byPath[n.path] = { id: n.id, kind: "folder", baseRev: n.rev, position: n.position ?? undefined };
        }
        else if (n.kind === "file") {
            const serverBody = n.body ?? "";
            const cur = await vault.readFile(n.path);
            const base = opts.pushedBodies?.get(n.id) ?? prev?.baseBody ?? cur;
            let toWrite;
            const merged = threeWayMerge(base, cur, serverBody);
            if (merged.kind === "clean") {
                toWrite = merged.text;
            }
            else {
                const sib = siblingPath(n.path, (p) => Boolean(opts.reserved?.(p)) || p in state.byPath || Boolean(opts.localFiles?.has(p)));
                await vault.writeFile(sib, cur);
                opts.localFiles?.set(sib, cur);
                opts.onConflict?.({ original: n.path, savedAs: sib });
                toWrite = serverBody;
            }
            const untracked = prev === undefined;
            const ourEcho = opts.pushedBodies?.has(n.id) ?? false;
            if (toWrite !== cur || (untracked && toWrite === "" && !ourEcho)) {
                await vault.writeFile(n.path, toWrite);
            }
            state.byPath[n.path] = { id: n.id, kind: "file", baseRev: n.rev, baseBody: serverBody, position: n.position ?? undefined };
        }
        else {
            const keep = prev?.id === n.id ? prev : undefined;
            state.byPath[n.path] = {
                id: n.id,
                kind: "attachment",
                baseRev: n.rev,
                position: n.position ?? undefined,
                baseGeneration: keep?.baseGeneration,
                baseSha256: keep?.baseSha256,
                baseSize: keep?.baseSize,
                baseMtime: keep?.baseMtime,
                materialized: keep ? keep.materialized : false,
                restorePending: keep?.restorePending,
                remoteGeneration: n.blobGeneration ?? undefined,
                remoteSha256: n.sha256 ?? null,
                blobUrl: n.blobUrl,
            };
        }
    }
}
