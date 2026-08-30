export const MAX_QUARANTINE = 50;
const MAX_COOLDOWN = 16;
export function isNoteName(name) {
    const i = name.lastIndexOf(".");
    if (i <= 0 || i + 1 === name.length)
        return false;
    return name.slice(i + 1).toLowerCase() === "md";
}
export function keysetLt(aRev, aId, bRev, bId) {
    return aRev < bRev || (aRev === bRev && aId < bId);
}
export class QuarantineCtl {
    state;
    enabled;
    prevOf;
    retryingPrefixes;
    retryingIds;
    constructor(state, enabled, prevOf, retryingPrefixes = new Set(), retryingIds = new Set()) {
        this.state = state;
        this.enabled = enabled;
        this.prevOf = prevOf;
        this.retryingPrefixes = retryingPrefixes;
        this.retryingIds = retryingIds;
    }
    shouldSkip(id) {
        return this.enabled && this.has(id) && !this.retryingIds.has(id);
    }
    records() {
        return (this.state.quarantine ??= {});
    }
    groupPrefixes() {
        if (!this.enabled)
            return [];
        const out = new Set();
        for (const r of Object.values(this.state.quarantine ?? {})) {
            if (r.groupPrefix && !this.retryingPrefixes.has(r.groupPrefix))
                out.add(r.groupPrefix);
        }
        return [...out];
    }
    inActiveGroup(serverPath) {
        return this.groupPrefixes().find((g) => serverPath === g || serverPath.startsWith(g + "/"));
    }
    has(id) {
        return Boolean(this.state.quarantine?.[id]);
    }
    record(id) {
        return this.state.quarantine?.[id];
    }
    park(n, reason, groupPrefix) {
        if (!this.enabled) {
            throw new Error(`sync apply failed for ${n.path}: ${reason}`);
        }
        const q = this.records();
        const existing = q[n.id];
        if (!existing && Object.keys(q).length >= MAX_QUARANTINE) {
            throw new Error(`sync quarantine is full (${MAX_QUARANTINE}); apply failed for ${n.path}: ${reason}`);
        }
        const prev = this.prevOf.get(n.id);
        const attempts = (existing?.attempts ?? 0) + 1;
        q[n.id] = {
            payload: n,
            prevRev: existing?.prevRev ?? prev?.rev ?? 0,
            prevId: existing?.prevId ?? prev?.id ?? "00000000-0000-0000-0000-000000000000",
            reason,
            attempts,
            cooldown: attempts <= 1 ? 0 : Math.min(2 ** (attempts - 1), MAX_COOLDOWN),
            groupPrefix: groupPrefix ?? existing?.groupPrefix,
        };
    }
    release(id) {
        const q = this.state.quarantine;
        if (!q)
            return;
        delete q[id];
        if (Object.keys(q).length === 0)
            delete this.state.quarantine;
    }
    releaseGroup(prefix) {
        const q = this.state.quarantine;
        if (!q)
            return [];
        const members = [];
        for (const [id, r] of Object.entries(q)) {
            if (r.groupPrefix === prefix) {
                members.push(r.payload);
                this.prevOf.set(id, { rev: r.prevRev, id: r.prevId });
                delete q[id];
            }
        }
        if (Object.keys(q).length === 0)
            delete this.state.quarantine;
        return members.sort((a, b) => (keysetLt(a.rev, a.id, b.rev, b.id) ? -1 : 1));
    }
    rememberPrev(id, rev, prevId) {
        this.prevOf.set(id, { rev, id: prevId });
    }
}
export function ackFrontier(state, cursor) {
    let best = null;
    for (const r of Object.values(state.quarantine ?? {})) {
        if (!best || keysetLt(r.prevRev, r.prevId, best.rev, best.id)) {
            best = { rev: r.prevRev, id: r.prevId };
        }
    }
    if (!best)
        return cursor;
    return keysetLt(best.rev, best.id, cursor.rev, cursor.id) ? best : cursor;
}
export function tickCooldowns(state) {
    const q = state.quarantine;
    if (!q)
        return [];
    const eligible = [];
    for (const r of Object.values(q)) {
        if ((r.cooldown ?? 0) > 0) {
            r.cooldown = (r.cooldown ?? 0) - 1;
            continue;
        }
        eligible.push(r.payload);
    }
    return eligible.sort((a, b) => (keysetLt(a.rev, a.id, b.rev, b.id) ? -1 : 1));
}
