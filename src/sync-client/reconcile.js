import { hasReservedSegment } from "./ports.js";
const dirOf = (path) => {
    const slash = path.lastIndexOf("/");
    return slash < 0 ? "" : path.slice(0, slash);
};
const nameOf = (path) => {
    const slash = path.lastIndexOf("/");
    return slash < 0 ? path : path.slice(slash + 1);
};
export function reconcile(entries, state, hints = [], appliedRekeys = []) {
    const live = new Map(entries.map((e) => [e.path, e]));
    const muts = [];
    let next = state.lastMutationId;
    const id = () => (next += 1);
    for (const h of hints.slice().sort((a, b) => a.oldPath.length - b.oldPath.length)) {
        if (h.oldPath === h.newPath)
            continue;
        if (hasReservedSegment(h.oldPath) || hasReservedSegment(h.newPath))
            continue;
        const known = state.byPath[h.oldPath];
        if (!known)
            continue;
        if (live.has(h.oldPath))
            continue;
        if (!live.has(h.newPath))
            continue;
        const oldParent = dirOf(h.oldPath);
        const newParent = dirOf(h.newPath);
        const movedParent = oldParent !== newParent;
        const renamed = nameOf(h.oldPath) !== nameOf(h.newPath);
        let newParentId = null;
        if (newParent !== "")
            newParentId = state.byPath[newParent]?.id;
        if (movedParent && newParentId === undefined)
            continue;
        const mutationIds = [];
        if (movedParent) {
            const m = id();
            mutationIds.push(m);
            muts.push({ mutationId: m, op: "move", args: { nodeId: known.id, newParentId } });
        }
        if (renamed) {
            const m = id();
            mutationIds.push(m);
            muts.push({ mutationId: m, op: "rename", args: { nodeId: known.id, name: nameOf(h.newPath) } });
        }
        rekey(state, h.oldPath, h.newPath);
        appliedRekeys.push({ hint: h, oldPath: h.oldPath, newPath: h.newPath, mutationIds });
    }
    const parentIdOf = (path) => {
        const parentPath = dirOf(path);
        if (parentPath === "")
            return null;
        return state.byPath[parentPath]?.id;
    };
    for (const e of entries.slice().sort((a, b) => a.path.localeCompare(b.path))) {
        const known = state.byPath[e.path];
        if (!known) {
            if (e.kind === "attachment")
                continue;
            const parentId = parentIdOf(e.path);
            if (parentId === undefined)
                continue;
            const name = nameOf(e.path);
            if (e.kind === "folder") {
                muts.push({ mutationId: id(), op: "createFolder", args: { parentId, name } });
            }
            else {
                muts.push({ mutationId: id(), op: "createNote", args: { parentId, name, body: e.body ?? "" } });
            }
        }
        else if (e.kind === "file" && (e.body ?? "") !== (known.baseBody ?? "")) {
            muts.push({
                mutationId: id(),
                op: "putBody",
                args: { nodeId: known.id, base: known.baseBody ?? "", body: e.body ?? "", baseRev: known.baseRev },
            });
        }
    }
    for (const path of Object.keys(state.byPath).sort((a, b) => b.length - a.length)) {
        if (!live.has(path)) {
            muts.push({ mutationId: id(), op: "trash", args: { nodeId: state.byPath[path].id } });
        }
    }
    return muts;
}
export function deriveFolderRenameHints(entries, state, explicitHints = [], tombstoned = new Set()) {
    const live = new Map(entries.map((e) => [e.path, e]));
    const explicitOld = new Set(explicitHints.map((h) => h.oldPath));
    const absentFolders = Object.keys(state.byPath)
        .filter((p) => state.byPath[p].kind === "folder" && !live.has(p) && !explicitOld.has(p) && !tombstoned.has(p))
        .sort((a, b) => a.length - b.length);
    const newFolders = entries.filter((e) => e.kind === "folder" && !state.byPath[e.path]).map((e) => e.path);
    if (absentFolders.length === 0 || newFolders.length === 0)
        return [];
    const derived = [];
    const usedTargets = new Set();
    const derivedOld = [];
    for (const X of absentFolders) {
        if (derivedOld.some((d) => X === d || X.startsWith(d + "/")))
            continue;
        const prefix = X + "/";
        const descendants = Object.keys(state.byPath).filter((p) => p.startsWith(prefix));
        if (!descendants.some((d) => state.byPath[d].kind === "file"))
            continue;
        const matches = newFolders.filter((Y) => {
            if (usedTargets.has(Y))
                return false;
            return descendants.every((d) => {
                const st = state.byPath[d];
                const yEntry = live.get(Y + d.slice(X.length));
                if (yEntry === undefined || yEntry.kind !== st.kind)
                    return false;
                if (st.kind === "file")
                    return (yEntry.body ?? "") === (st.baseBody ?? "");
                return true;
            });
        });
        if (matches.length !== 1)
            continue;
        derived.push({ oldPath: X, newPath: matches[0] });
        usedTargets.add(matches[0]);
        derivedOld.push(X);
    }
    return derived;
}
export function rekey(state, oldPath, newPath) {
    const prefix = oldPath + "/";
    const moves = [];
    for (const p of Object.keys(state.byPath)) {
        if (p === oldPath)
            moves.push([p, newPath]);
        else if (p.startsWith(prefix))
            moves.push([p, newPath + p.slice(oldPath.length)]);
    }
    for (const [from, to] of moves) {
        state.byPath[to] = state.byPath[from];
        if (to !== from)
            delete state.byPath[from];
    }
}
