export function siblingPath(path, taken) {
    const slash = path.lastIndexOf("/");
    const dot = path.lastIndexOf(".");
    const hasExt = dot > slash;
    const stem = hasExt ? path.slice(0, dot) : path;
    const ext = hasExt ? path.slice(dot) : "";
    let cand = `${stem} (conflict)${ext}`;
    for (let i = 2; taken(cand); i++)
        cand = `${stem} (conflict ${i})${ext}`;
    return cand;
}
export function folderScope(folders) {
    const roots = folders.map((f) => f.trim().replace(/\/+$/, "")).filter((f) => f.length > 0);
    if (roots.length === 0)
        return () => true;
    return (path) => roots.some((r) => path === r || path.startsWith(r + "/"));
}
function scopeRoots(folders) {
    return folders.map((f) => f.trim().replace(/\/+$/, "")).filter((f) => f.length > 0);
}
export function isScopeWiden(prev, next) {
    const prevRoots = scopeRoots(prev);
    const nextRoots = scopeRoots(next);
    if (prevRoots.length === 0)
        return nextRoots.length === 0;
    if (nextRoots.length === 0)
        return true;
    const inNext = folderScope(nextRoots);
    return prevRoots.every((r) => inNext(r));
}
