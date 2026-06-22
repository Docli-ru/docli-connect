export function matchableBody(body) {
    const b = body ?? "";
    return b.trim().length > 0 ? b : null;
}
function group(pairs) {
    const m = new Map();
    for (const [k, v] of pairs) {
        const arr = m.get(k);
        if (arr)
            arr.push(v);
        else
            m.set(k, [v]);
    }
    return m;
}
export function contentRenameHints(entries, state, explicitHints = [], tombstoned = new Set(), uniqueness) {
    const live = new Set(entries.map((e) => e.path));
    const explicitOld = new Set(explicitHints.map((h) => h.oldPath));
    const explicitNew = new Set(explicitHints.map((h) => h.newPath));
    const gone = [];
    for (const [path, st] of Object.entries(state.byPath)) {
        if (st.kind !== "file")
            continue;
        if (live.has(path))
            continue;
        if (tombstoned.has(path))
            continue;
        if (explicitOld.has(path))
            continue;
        const b = matchableBody(st.baseBody);
        if (b !== null)
            gone.push([b, path]);
    }
    const appeared = [];
    for (const e of entries) {
        if (e.kind !== "file")
            continue;
        if (state.byPath[e.path])
            continue;
        if (explicitNew.has(e.path))
            continue;
        const b = matchableBody(e.body);
        if (b !== null)
            appeared.push([b, e.path]);
    }
    const liveBodyCount = new Map();
    for (const e of uniqueness?.liveEntries ?? entries) {
        if (e.kind !== "file")
            continue;
        const b = matchableBody(e.body);
        if (b !== null)
            liveBodyCount.set(b, (liveBodyCount.get(b) ?? 0) + 1);
    }
    const trackedBodyCount = new Map();
    const trackedBodies = uniqueness?.trackedBaseBodies ?? Object.values(state.byPath).filter((st) => st.kind === "file").map((st) => st.baseBody);
    for (const baseBody of trackedBodies) {
        const b = matchableBody(baseBody);
        if (b !== null)
            trackedBodyCount.set(b, (trackedBodyCount.get(b) ?? 0) + 1);
    }
    const goneByBody = group(gone);
    const appearedByBody = group(appeared);
    const hints = [];
    for (const [body, olds] of goneByBody) {
        const news = appearedByBody.get(body);
        const globallyUnique = liveBodyCount.get(body) === 1 && trackedBodyCount.get(body) === 1;
        if (olds.length === 1 && news && news.length === 1 && globallyUnique) {
            hints.push({ oldPath: olds[0], newPath: news[0] });
        }
    }
    return hints;
}
