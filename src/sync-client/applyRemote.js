import { threeWayMerge } from "./merge.js";
import { siblingPath } from "./paths.js";
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
    for (const n of nodes) {
        seen.add(n.id);
        const existing = pathForId(state, n.id);
        const prev = existing !== undefined ? state.byPath[existing] : state.byPath[n.path];
        if (n.trashed) {
            if (existing !== undefined) {
                await vault.remove(existing);
                delete state.byPath[existing];
            }
            continue;
        }
        if (existing !== undefined && existing !== n.path) {
            await vault.move(existing, n.path);
            delete state.byPath[existing];
        }
        if (n.kind === "folder") {
            await vault.mkdir(n.path);
            state.byPath[n.path] = { id: n.id, kind: "folder", baseRev: n.rev };
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
            state.byPath[n.path] = { id: n.id, kind: "file", baseRev: n.rev, baseBody: serverBody };
        }
        else {
            state.byPath[n.path] = { id: n.id, kind: "attachment", baseRev: n.rev };
        }
    }
    return seen;
}
