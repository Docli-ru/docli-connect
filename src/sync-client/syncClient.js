import { applyRemote } from "./applyRemote.js";
import { emptyState, isKnownKind, NIL_UUID, } from "./ports.js";
import { deriveFolderRenameHints, reconcile, rekey } from "./reconcile.js";
import { siblingPath } from "./paths.js";
import { contentRenameHints, matchableBody } from "./contentRename.js";
import { ackFrontier, keysetLt, tickCooldowns, QuarantineCtl } from "./quarantine.js";
export const SUSPECT_RESTORE_AFTER = 2;
export function isMassDelete(trash, trackedLive) {
    if (trash <= 0)
        return false;
    if (trash === trackedLive)
        return true;
    return trash >= 5 && trash * 2 >= trackedLive;
}
export class SyncClient {
    o;
    s = emptyState();
    refusedMoves = new Set();
    attachmentsOn = false;
    constructor(o) {
        this.o = o;
    }
    inScope(path) {
        return this.o.scope ? this.o.scope(path) : true;
    }
    attachmentsCapable() {
        return this.attachmentsOn;
    }
    noteCapabilities(caps) {
        const list = caps ?? [];
        const wasOn = this.s.serverAttachments === true;
        this.attachmentsOn = list.some((c) => c.feature === "attachments");
        if (this.attachmentsOn &&
            !wasOn &&
            Object.values(this.s.byPath).some((st) => st.kind === "attachment" &&
                st.remoteGeneration === undefined &&
                st.baseGeneration === undefined)) {
            this.s.attachmentSeedPending = true;
        }
        if (this.attachmentsOn) {
            this.s.serverAttachments = true;
            delete this.s.quarantineFlushPending;
        }
        else {
            delete this.s.serverAttachments;
            delete this.s.attachmentSeedPending;
            if (this.s.quarantine || this.s.absenteeQuarantine)
                this.s.quarantineFlushPending = true;
        }
    }
    adoptPersistedCapability() {
        if (this.s.serverAttachments)
            this.attachmentsOn = true;
    }
    scopePulled(page) {
        if (!this.o.scope)
            return page;
        const idToPath = new Map();
        for (const [p, st] of Object.entries(this.s.byPath))
            idToPath.set(st.id, p);
        const apply = [];
        for (const n of page) {
            if (this.inScope(n.path)) {
                apply.push(n);
                continue;
            }
            const tracked = idToPath.get(n.id);
            if (tracked !== undefined)
                untrackSubtree(this.s, tracked);
        }
        return apply;
    }
    knownKindPulled(page) {
        const apply = [];
        let idToPath = null;
        for (const n of page) {
            if (isKnownKind(n.kind)) {
                apply.push(n);
                continue;
            }
            if (!idToPath) {
                idToPath = new Map();
                for (const [p, st] of Object.entries(this.s.byPath))
                    idToPath.set(st.id, p);
            }
            const tracked = idToPath.get(n.id);
            if (tracked !== undefined)
                untrackSubtree(this.s, tracked);
        }
        return apply;
    }
    adoptContentMoves(nodes, allNodes, localFiles) {
        const adopted = new Set();
        const superseded = [];
        const released = this.s.releasedNodes ?? {};
        const trackedIds = new Set();
        for (const st of Object.values(this.s.byPath))
            trackedIds.add(st.id);
        const trackedPaths = new Set(Object.keys(this.s.byPath));
        const serverPaths = new Set(nodes.filter((n) => !n.trashed).map((n) => n.path));
        const serverBodyCount = new Map();
        for (const n of allNodes) {
            if (n.trashed || n.kind !== "file")
                continue;
            const b = matchableBody(n.body ?? undefined);
            if (b !== null)
                serverBodyCount.set(b, (serverBodyCount.get(b) ?? 0) + 1);
        }
        const localBodyCount = new Map();
        for (const [, body] of localFiles) {
            const b = matchableBody(body);
            if (b !== null)
                localBodyCount.set(b, (localBodyCount.get(b) ?? 0) + 1);
        }
        const trackedBodyCount = new Map();
        for (const st of Object.values(this.s.byPath)) {
            if (st.kind !== "file")
                continue;
            const b = matchableBody(st.baseBody);
            if (b !== null)
                trackedBodyCount.set(b, (trackedBodyCount.get(b) ?? 0) + 1);
        }
        const nodeIdsByBody = new Map();
        const nodeById = new Map();
        for (const n of nodes) {
            if (n.trashed || n.kind !== "file")
                continue;
            if (trackedIds.has(n.id))
                continue;
            if (localFiles.has(n.path))
                continue;
            const b = matchableBody(n.body ?? undefined);
            if (b === null)
                continue;
            (nodeIdsByBody.get(b) ?? nodeIdsByBody.set(b, []).get(b)).push(n.id);
            nodeById.set(n.id, n);
        }
        const localPathsByBody = new Map();
        for (const [p, body] of localFiles) {
            if (trackedPaths.has(p) || serverPaths.has(p) || !this.inScope(p))
                continue;
            const b = matchableBody(body);
            if (b === null)
                continue;
            (localPathsByBody.get(b) ?? localPathsByBody.set(b, []).get(b)).push(p);
        }
        for (const [body, ids] of nodeIdsByBody) {
            const locals = localPathsByBody.get(body);
            const globallyUnique = serverBodyCount.get(body) === 1 && localBodyCount.get(body) === 1 && (trackedBodyCount.get(body) ?? 0) === 0;
            if (!(ids.length === 1 && locals && locals.length === 1 && globallyUnique))
                continue;
            const n = nodeById.get(ids[0]);
            const localPath = locals[0];
            const rel = released[n.id];
            const contended = rel !== undefined && rel.path !== n.path;
            delete released[n.id];
            if (contended) {
                superseded.push({ localPath, serverPath: n.path });
                continue;
            }
            this.s.byPath[n.path] = {
                id: n.id,
                kind: "file",
                baseRev: n.rev,
                baseBody: n.body ?? "",
                position: n.position ?? undefined,
            };
            adopted.add(n.id);
            this.o.onRecover?.({ from: n.path, to: localPath });
        }
        return { adopted, superseded };
    }
    listen(onTrigger, onStatus) {
        const port = this.o.notify;
        if (!port)
            return () => { };
        return port.connect(this.o.workspaceId, {
            onPoke: onTrigger,
            onConnect: onTrigger,
            onStatus,
        });
    }
    async sync(hints = [], drainDeletes = () => []) {
        this.s = await this.o.state.load();
        this.adoptPersistedCapability();
        const outcome = await this.pushBatch(hints, drainDeletes);
        if (!outcome.skipPull) {
            await this.retryQuarantined(outcome.pushedBodies);
            await this.pullDelta(outcome.pushedBodies);
            await this.reapplyOutboxDeletes();
        }
        await this.o.state.save(this.s);
        return { unapplied: outcome.unapplied, needsReadopt: outcome.needsReadopt };
    }
    async queueReorder(op) {
        this.s.reorderOutbox = [...(this.s.reorderOutbox ?? []), op];
        const persisted = await this.o.state.load();
        persisted.reorderOutbox = [...(persisted.reorderOutbox ?? []), op];
        await this.o.state.save(persisted);
    }
    async reapplyOutboxDeletes() {
        const outbox = this.s.deleteOutbox;
        if (!outbox?.length)
            return;
        if (!outbox.some((o) => this.s.byPath[o.path]?.id === o.id))
            return;
        const prefixes = outbox.map((o) => o.path);
        const covers = (p) => prefixes.some((rp) => p === rp || p.startsWith(rp + "/"));
        for (const p of Object.keys(this.s.byPath)) {
            if (covers(p))
                await this.o.vault.remove(p);
        }
    }
    async bootstrap(opts = {}) {
        this.s = await this.o.state.load();
        this.adoptPersistedCapability();
        if (this.o.scope) {
            for (const p of Object.keys(this.s.byPath)) {
                if (!this.inScope(p)) {
                    recordRelease(this.s, p);
                    delete this.s.byPath[p];
                }
            }
        }
        const localFiles = new Map();
        for (const e of await this.o.vault.list()) {
            if (e.kind === "file")
                localFiles.set(e.path, e.body ?? "");
        }
        const all = [];
        let cursor = this.s.cursor;
        let capabilities;
        for (let guard = 0; guard < 10_000; guard++) {
            const { status, json } = await this.o.transport.post("/api/sync/pull", {
                workspaceId: this.o.workspaceId,
                clientId: this.o.clientId,
                cursor,
                epoch: this.s.epoch,
                limit: this.o.pageLimit ?? 500,
                ...(this.attachmentsOn ? { ack: ackFrontier(this.s, cursor) } : {}),
            });
            if (status === 409) {
                const epoch = json.epoch;
                if (typeof epoch === "number")
                    this.s.epoch = epoch;
                all.length = 0;
                cursor = { rev: 0, id: NIL_UUID };
                continue;
            }
            if (status !== 200)
                return false;
            const resp = json;
            this.noteCapabilities(resp.capabilities);
            this.s.epoch = resp.epoch;
            this.s.lastMutationId = Math.max(this.s.lastMutationId, resp.lastMutationId ?? 0);
            if (resp.capabilities)
                capabilities = resp.capabilities;
            all.push(...resp.nodes);
            this.s.cursor = resp.cursor;
            cursor = resp.cursor;
            if (resp.nodes.length === 0)
                break;
        }
        this.o.onCapabilities?.(capabilities ?? []);
        const known = this.knownKindPulled(all);
        const scoped = this.scopePulled(known);
        const { adopted, superseded } = opts.recoverMoves
            ? this.adoptContentMoves(scoped, known, localFiles)
            : { adopted: new Set(), superseded: [] };
        for (const sup of superseded) {
            await this.o.vault.remove(sup.localPath);
            localFiles.delete(sup.localPath);
            this.o.onSupersede?.(sup);
        }
        const toApply = adopted.size ? scoped.filter((n) => !adopted.has(n.id)) : scoped;
        const ctl = new QuarantineCtl(this.s, this.attachmentsOn, streamPredecessors({ rev: 0, id: NIL_UUID }, all));
        const partitioned = partitionQuarantine(ctl, toApply, all);
        const serverPaths = new Set(scoped.filter((n) => !n.trashed).map((n) => n.path));
        const preParked = await keepBothGuarded(partitioned, this.o.vault, this.s, localFiles, (p) => serverPaths.has(p), ctl);
        const applySet = preParked.size ? partitioned.filter((n) => !preParked.has(n.id)) : partitioned;
        await applyRemote(applySet, this.o.vault, this.s, {
            foldPath: this.o.foldPath,
            reserved: (p) => serverPaths.has(p),
            localFiles,
            onConflict: this.o.onConflict,
            quarantine: ctl,
        });
        if (this.s.releasedNodes) {
            const live = new Set(Object.values(this.s.byPath).map((st) => st.id));
            for (const id of Object.keys(this.s.releasedNodes))
                if (live.has(id))
                    delete this.s.releasedNodes[id];
        }
        await this.o.state.save(this.s);
        return true;
    }
    async pushBatch(hints, drainDeletes) {
        const fullTrackedBodies = Object.values(this.s.byPath)
            .filter((st) => st.kind === "file")
            .map((st) => st.baseBody);
        let hintsInScope = hints;
        if (this.o.scope) {
            hintsInScope = hints.filter((h) => {
                if (this.inScope(h.newPath) || !this.s.byPath[h.oldPath])
                    return true;
                untrackSubtree(this.s, h.oldPath);
                return false;
            });
            for (const p of Object.keys(this.s.byPath)) {
                if (!this.inScope(p)) {
                    recordRelease(this.s, p);
                    delete this.s.byPath[p];
                }
            }
        }
        const scan = await this.o.vault.scan(drainDeletes);
        const entries = this.o.scope ? scan.entries.filter((e) => this.inScope(e.path)) : scan.entries;
        const deletedPaths = this.o.scope ? scan.deletedPaths.filter((p) => this.inScope(p)) : scan.deletedPaths;
        const tombstonedSet = new Set(deletedPaths);
        const synthHints = contentRenameHints(entries, this.s, hintsInScope, tombstonedSet, this.o.scope ? { liveEntries: scan.entries, trackedBaseBodies: fullTrackedBodies } : undefined);
        const folderHints = deriveFolderRenameHints(entries, this.s, [...hintsInScope, ...synthHints], tombstonedSet);
        const synthAll = [...synthHints, ...folderHints];
        const allHints = (synthAll.length ? [...hintsInScope, ...synthAll] : hintsInScope).filter((h) => !this.refusedMoves.has(`${h.oldPath}\u0000${h.newPath}`));
        const pendingMovePaths = new Set(synthAll.map((h) => h.oldPath));
        const rekeys = [];
        const muts = reconcile(entries, this.s, allHints, rekeys);
        const pushedBodies = new Map();
        const scanPaths = new Set(entries.map((e) => e.path));
        const trackedLive = Object.keys(this.s.byPath).length;
        const absent = Object.keys(this.s.byPath).filter((p) => !scanPaths.has(p) && !pendingMovePaths.has(p));
        const tombstoned = new Set(deletedPaths);
        const nonTrashOpIds = new Set(muts
            .filter((m) => m.op !== "trash")
            .map((m) => m.args.nodeId)
            .filter((id) => Boolean(id)));
        const replayable = (this.s.deleteOutbox ?? []).filter((o) => !scanPaths.has(o.path) && (!this.o.scope || this.inScope(o.path)) && !nonTrashOpIds.has(o.id));
        this.s.deleteOutbox = replayable.length ? replayable : undefined;
        const replayPrefixes = replayable.map((o) => o.path);
        const replayCovers = (p) => replayPrefixes.some((rp) => p === rp || p.startsWith(rp + "/"));
        const confirmedDel = absent.filter((p) => tombstoned.has(p) && !replayCovers(p));
        const suspectDel = absent.filter((p) => !tombstoned.has(p) && !replayCovers(p));
        const trustedScan = entries.length > 0;
        if (this.s.missingStreak) {
            const suspectSet = new Set(suspectDel);
            for (const p of Object.keys(this.s.missingStreak))
                if (!suspectSet.has(p))
                    delete this.s.missingStreak[p];
        }
        const dropPaths = new Set(pendingMovePaths);
        let needsReadopt = false;
        let confirmMassDelete = false;
        if (suspectDel.length) {
            for (const p of suspectDel)
                dropPaths.add(p);
            if (!trustedScan || isMassDelete(suspectDel.length, trackedLive)) {
                needsReadopt = true;
            }
            else {
                const streak = (this.s.missingStreak ??= {});
                for (const p of suspectDel) {
                    streak[p] = (streak[p] ?? 0) + 1;
                    if (streak[p] < SUSPECT_RESTORE_AFTER)
                        continue;
                    const st = this.s.byPath[p];
                    if (st.kind === "file")
                        await this.o.vault.writeFile(p, st.baseBody ?? "");
                    else if (st.kind === "folder")
                        await this.o.vault.mkdir(p);
                    else if (st.kind === "attachment") {
                        st.restorePending = true;
                    }
                    delete streak[p];
                }
            }
        }
        let outboxAdd = [];
        if (confirmedDel.length) {
            const mass = isMassDelete(confirmedDel.length, trackedLive);
            const approved = !mass ||
                (this.o.onMassDelete ? await this.o.onMassDelete({ count: confirmedDel.length, total: trackedLive }) : true);
            if (!approved) {
                for (const p of confirmedDel)
                    dropPaths.add(p);
            }
            else {
                if (mass)
                    confirmMassDelete = true;
                outboxAdd = confirmedDel.map((p) => ({ id: this.s.byPath[p].id, path: p }));
            }
        }
        if (replayable.length) {
            const covered = new Set(replayable.map((o) => o.path));
            for (const p of absent)
                if (replayCovers(p))
                    covered.add(p);
            if (isMassDelete(covered.size, trackedLive))
                confirmMassDelete = true;
            const trashed = new Set(muts.filter((m) => m.op === "trash").map((m) => m.args.nodeId));
            let nextMut = muts.reduce((mx, m) => Math.max(mx, m.mutationId), this.s.lastMutationId);
            for (const o of replayable) {
                if (!trashed.has(o.id))
                    muts.push({ mutationId: ++nextMut, op: "trash", args: { nodeId: o.id } });
            }
        }
        const sentReorders = [];
        const reorderQueue = this.s.reorderOutbox ?? [];
        if (reorderQueue.length) {
            let nextMut = muts.reduce((mx, m) => Math.max(mx, m.mutationId), this.s.lastMutationId);
            for (const r of reorderQueue) {
                nextMut += 1;
                muts.push({
                    mutationId: nextMut,
                    op: "reorder",
                    args: { nodeId: r.nodeId, beforeId: r.beforeId, afterId: r.afterId },
                });
                sentReorders.push({ mutationId: nextMut, entry: r });
            }
        }
        let sendMuts = muts;
        if (dropPaths.size) {
            const dropIds = new Set();
            for (const p of dropPaths) {
                const id = this.s.byPath[p]?.id;
                if (id)
                    dropIds.add(id);
            }
            sendMuts = muts.filter((m) => !(m.op === "trash" && dropIds.has(m.args.nodeId ?? "")));
        }
        if (sendMuts.length === 0)
            return { skipPull: false, unapplied: [], pushedBodies, needsReadopt };
        const mergedOutbox = mergeDeleteOutbox(this.s.deleteOutbox ?? [], outboxAdd);
        this.s.deleteOutbox = mergedOutbox.length ? mergedOutbox : undefined;
        if (outboxAdd.length) {
            const persisted = await this.o.state.load();
            persisted.deleteOutbox = mergedOutbox;
            await this.o.state.save(persisted);
        }
        const collected = [];
        const freshParkedIds = new Set(outboxAdd.map((o) => o.id));
        const { skipPull, epochChanged } = await this.sendChunked(sendMuts, collected, confirmMassDelete, freshParkedIds);
        const result = new Map(collected.map((r) => [r.mutationId, r]));
        const confirmed = new Set(collected.filter((r) => r.status === "ok" || r.status === "skipped").map((r) => r.mutationId));
        if (this.s.deleteOutbox?.length) {
            const trashDone = (id) => {
                const r = result.get(id);
                if (!r)
                    return false;
                if (r.status === "ok" || r.status === "skipped")
                    return true;
                return r.status === "error" && (r.code === "NODE_NOT_FOUND" || r.code === "FORBIDDEN");
            };
            const doneIds = new Set(sendMuts
                .filter((m) => m.op === "trash" && trashDone(m.mutationId))
                .map((m) => m.args.nodeId));
            const remaining = this.s.deleteOutbox.filter((o) => !doneIds.has(o.id));
            this.s.deleteOutbox = remaining.length ? remaining : undefined;
        }
        if (sentReorders.length && this.s.reorderOutbox?.length) {
            const acked = new Set(sentReorders.filter((r) => result.has(r.mutationId)).map((r) => r.entry));
            const remaining = this.s.reorderOutbox.filter((o) => !acked.has(o));
            this.s.reorderOutbox = remaining.length ? remaining : undefined;
        }
        const accounted = (id) => {
            const s = result.get(id)?.status;
            return s === "ok" || s === "conflict";
        };
        for (const m of sendMuts) {
            if (!accounted(m.mutationId))
                continue;
            if (m.op === "putBody") {
                const a = m.args;
                if (a.nodeId)
                    pushedBodies.set(a.nodeId, a.body ?? "");
            }
            else if (m.op === "createNote") {
                const id = result.get(m.mutationId)?.id;
                if (id)
                    pushedBodies.set(id, m.args.body ?? "");
            }
        }
        if (epochChanged)
            return { skipPull, unapplied: [], pushedBodies, needsReadopt };
        const liveBody = new Map(entries.filter((e) => e.kind === "file").map((e) => [e.path, e.body ?? ""]));
        const livePaths = new Set(entries.map((e) => e.path));
        const isCollision = (id) => {
            const r = result.get(id);
            return r?.status === "error" && (r.code === "NODE_PATH_TAKEN" || r.code === "NODE_NAME_TAKEN");
        };
        const isRefusal = (id) => {
            const r = result.get(id);
            return r?.status === "error" && (r.code === "FORBIDDEN" || r.code === "NODE_NAME_INVALID");
        };
        const unapplied = [];
        let didConflictCopy = false;
        for (const rk of rekeys.slice().sort((a, b) => b.newPath.length - a.newPath.length)) {
            if (rk.mutationIds.every((id) => confirmed.has(id)))
                continue;
            const kind = this.s.byPath[rk.newPath]?.kind;
            rekey(this.s, rk.newPath, rk.oldPath);
            const definitive = rk.mutationIds.some(isCollision);
            if (definitive && kind === "file" && liveBody.has(rk.newPath)) {
                const conflictPath = siblingPath(rk.newPath, (p) => livePaths.has(p) || p in this.s.byPath);
                const body = liveBody.get(rk.newPath) ?? "";
                await this.o.vault.writeFile(conflictPath, body);
                await this.o.vault.remove(rk.newPath);
                livePaths.delete(rk.newPath);
                livePaths.add(conflictPath);
                liveBody.set(conflictPath, body);
                this.o.onConflict?.({ original: rk.newPath, savedAs: conflictPath });
                unapplied.push({ oldPath: rk.oldPath, newPath: conflictPath });
                didConflictCopy = true;
            }
            else if (definitive && kind === "folder" && livePaths.has(rk.newPath)) {
                const conflictPath = siblingPath(rk.newPath, (p) => livePaths.has(p) || p in this.s.byPath);
                await this.o.vault.move(rk.newPath, conflictPath);
                const prefix = rk.newPath + "/";
                const relocate = (p) => (p === rk.newPath ? conflictPath : conflictPath + p.slice(rk.newPath.length));
                for (const p of [...livePaths]) {
                    if (p === rk.newPath || p.startsWith(prefix)) {
                        const np = relocate(p);
                        livePaths.delete(p);
                        livePaths.add(np);
                        if (liveBody.has(p)) {
                            liveBody.set(np, liveBody.get(p));
                            liveBody.delete(p);
                        }
                    }
                }
                for (const h of unapplied) {
                    if (h.newPath === rk.newPath || h.newPath.startsWith(prefix))
                        h.newPath = relocate(h.newPath);
                }
                this.o.onConflict?.({ original: rk.newPath, savedAs: conflictPath });
                unapplied.push({ oldPath: rk.oldPath, newPath: conflictPath });
                didConflictCopy = true;
            }
            else if (rk.mutationIds.some(isRefusal)) {
                this.refusedMoves.add(`${rk.hint.oldPath}\u0000${rk.hint.newPath}`);
            }
            else {
                unapplied.push(rk.hint);
            }
        }
        unapplied.sort((a, b) => a.newPath.length - b.newPath.length);
        return { skipPull: skipPull || didConflictCopy, unapplied, pushedBodies, needsReadopt };
    }
    async parkConfirmedTrashes(muts) {
        const idToPath = new Map();
        for (const [path, st] of Object.entries(this.s.byPath))
            idToPath.set(st.id, path);
        const add = [];
        for (const m of muts) {
            if (m.op !== "trash")
                continue;
            const id = m.args.nodeId;
            const path = id ? idToPath.get(id) : undefined;
            if (id && path)
                add.push({ id, path });
        }
        if (!add.length)
            return;
        const merged = mergeDeleteOutbox(this.s.deleteOutbox ?? [], add);
        this.s.deleteOutbox = merged;
        const persisted = await this.o.state.load();
        persisted.deleteOutbox = merged;
        await this.o.state.save(persisted);
    }
    async unparkFresh(ids) {
        if (!ids.size || !this.s.deleteOutbox?.length)
            return;
        const remaining = this.s.deleteOutbox.filter((o) => !ids.has(o.id));
        if (remaining.length === this.s.deleteOutbox.length)
            return;
        this.s.deleteOutbox = remaining.length ? remaining : undefined;
        const persisted = await this.o.state.load();
        persisted.deleteOutbox = this.s.deleteOutbox;
        await this.o.state.save(persisted);
    }
    async sendChunked(muts, collected, confirmMassDelete, freshParkedIds = new Set()) {
        const { status, json } = await this.o.transport.post("/api/sync/push", {
            workspaceId: this.o.workspaceId,
            clientId: this.o.clientId,
            epoch: this.s.epoch,
            mutations: muts,
            ...(confirmMassDelete ? { confirmMassDelete: true } : {}),
        });
        if (status === 413) {
            if (muts.length <= 1)
                return { skipPull: true, epochChanged: false };
            const mid = Math.ceil(muts.length / 2);
            const first = await this.sendChunked(muts.slice(0, mid), collected, confirmMassDelete, freshParkedIds);
            if (first.skipPull || first.epochChanged)
                return first;
            return this.sendChunked(muts.slice(mid), collected, confirmMassDelete, freshParkedIds);
        }
        if (status === 409) {
            const epoch = json.epoch;
            if (typeof epoch === "number")
                this.s.epoch = epoch;
            this.s.cursor = { rev: 0, id: NIL_UUID };
            return { skipPull: false, epochChanged: true };
        }
        if (status === 422 && json.code === "MASS_DELETE_BLOCKED") {
            const { impact, live } = json;
            const approved = this.o.onMassDelete
                ? await this.o.onMassDelete({ count: impact ?? 0, total: live ?? 0 })
                : false;
            if (approved) {
                await this.parkConfirmedTrashes(muts);
                return this.sendChunked(muts, collected, true, freshParkedIds);
            }
            await this.unparkFresh(freshParkedIds);
            const stripped = muts.filter((m) => m.op !== "trash");
            if (stripped.length === 0)
                return { skipPull: false, epochChanged: false };
            return this.sendChunked(stripped, collected, confirmMassDelete, freshParkedIds);
        }
        if (status !== 200) {
            return { skipPull: true, epochChanged: false };
        }
        const resp = json;
        if (resp.lastMutationId > this.s.lastMutationId)
            this.s.lastMutationId = resp.lastMutationId;
        for (const r of resp.results)
            collected.push(r);
        return { skipPull: false, epochChanged: false };
    }
    async pullDelta(pushedBodies) {
        let resync = false;
        let cursor = this.s.cursor;
        const seeding = this.attachmentsOn && this.s.attachmentSeedPending === true;
        if (seeding) {
            cursor = { rev: 0, id: NIL_UUID };
        }
        if (!this.attachmentsOn && this.s.quarantineFlushPending === true) {
            resync = true;
            cursor = { rev: 0, id: NIL_UUID };
            this.clearQuarantineForResync();
            delete this.s.quarantineFlushPending;
        }
        const seenAll = new Set();
        let localFiles = await this.localFileMap();
        const seenServerPaths = new Set();
        let capabilities;
        for (let guard = 0; guard < 10_000; guard++) {
            const { status, json } = await this.o.transport.post("/api/sync/pull", {
                workspaceId: this.o.workspaceId,
                clientId: this.o.clientId,
                cursor,
                epoch: this.s.epoch,
                limit: this.o.pageLimit ?? 500,
                ...(this.attachmentsOn ? { ack: ackFrontier(this.s, cursor) } : {}),
            });
            if (status === 409) {
                const epoch = json.epoch;
                if (typeof epoch === "number")
                    this.s.epoch = epoch;
                cursor = { rev: 0, id: NIL_UUID };
                resync = true;
                this.clearQuarantineForResync();
                localFiles = await this.localFileMap();
                continue;
            }
            if (status !== 200)
                return;
            const resp = json;
            this.noteCapabilities(resp.capabilities);
            this.s.epoch = resp.epoch;
            this.s.lastMutationId = Math.max(this.s.lastMutationId, resp.lastMutationId ?? 0);
            if (resp.capabilities)
                capabilities = resp.capabilities;
            if (resp.resyncRequired) {
                resync = true;
                cursor = { rev: 0, id: NIL_UUID };
                this.clearQuarantineForResync();
            }
            const filtered = this.scopePulled(this.knownKindPulled(resp.nodes));
            const ctl = new QuarantineCtl(this.s, this.attachmentsOn, streamPredecessors(cursor, resp.nodes));
            const nodes = partitionQuarantine(ctl, filtered, resp.nodes);
            for (const n of nodes)
                if (!n.trashed)
                    seenServerPaths.add(n.path);
            const preParked = await keepBothGuarded(nodes, this.o.vault, this.s, localFiles, (p) => seenServerPaths.has(p), ctl, pushedBodies);
            const toApply = preParked.size ? nodes.filter((n) => !preParked.has(n.id)) : nodes;
            const seen = await applyRemote(toApply, this.o.vault, this.s, {
                foldPath: this.o.foldPath,
                pushedBodies,
                reserved: (p) => seenServerPaths.has(p),
                localFiles,
                onConflict: this.o.onConflict,
                quarantine: ctl,
            });
            for (const id of seen)
                seenAll.add(id);
            for (const id of Object.keys(this.s.quarantine ?? {}))
                seenAll.add(id);
            for (const n of nodes) {
                if (n.trashed)
                    localFiles.delete(n.path);
                else if (n.kind === "file")
                    localFiles.set(n.path, n.body ?? "");
            }
            this.s.cursor = resp.cursor;
            cursor = resp.cursor;
            if (resp.nodes.length === 0)
                break;
        }
        this.o.onCapabilities?.(capabilities ?? []);
        if (seeding)
            delete this.s.attachmentSeedPending;
        if (resync) {
            for (const [path, st] of Object.entries(this.s.byPath)) {
                if (!seenAll.has(st.id)) {
                    try {
                        await this.o.vault.remove(path);
                        delete this.s.byPath[path];
                    }
                    catch (e) {
                        if (!this.attachmentsOn)
                            throw e;
                        const box = (this.s.absenteeQuarantine ??= []);
                        if (!box.some((a) => a.id === st.id)) {
                            box.push({ id: st.id, path, reason: String(e?.message ?? e) });
                        }
                    }
                }
            }
        }
    }
    async retryQuarantined(pushedBodies) {
        if (!this.attachmentsOn)
            return;
        if (this.o.scope) {
            if (this.s.absenteeQuarantine?.length) {
                const kept = this.s.absenteeQuarantine.filter((a) => this.inScope(a.path));
                this.s.absenteeQuarantine = kept.length ? kept : undefined;
            }
            if (this.s.quarantine) {
                let idToPath;
                for (const [id, rec] of Object.entries(this.s.quarantine)) {
                    if (this.inScope(rec.payload.path))
                        continue;
                    delete this.s.quarantine[id];
                    idToPath ??= new Map(Object.entries(this.s.byPath).map(([p, st]) => [st.id, p]));
                    const tracked = idToPath.get(id);
                    if (tracked !== undefined)
                        untrackSubtree(this.s, tracked);
                }
                if (!Object.keys(this.s.quarantine).length)
                    delete this.s.quarantine;
            }
        }
        if (this.s.absenteeQuarantine?.length) {
            const remaining = [];
            for (const a of this.s.absenteeQuarantine) {
                try {
                    await this.o.vault.remove(a.path);
                    if (this.s.byPath[a.path]?.id === a.id)
                        delete this.s.byPath[a.path];
                }
                catch {
                    remaining.push(a);
                }
            }
            this.s.absenteeQuarantine = remaining.length ? remaining : undefined;
        }
        const eligible = tickCooldowns(this.s);
        if (!eligible.length)
            return;
        const q = this.s.quarantine ?? {};
        const groups = new Map();
        const singles = [];
        for (const n of eligible) {
            const prefix = q[n.id]?.groupPrefix;
            if (prefix)
                (groups.get(prefix) ?? groups.set(prefix, []).get(prefix)).push(n);
            else
                singles.push(n);
        }
        const localFiles = await this.localFileMap();
        const attempt = async (batch, retrying) => {
            const ctl = new QuarantineCtl(this.s, true, new Map(), retrying, new Set(batch.map((n) => n.id)));
            for (const n of batch) {
                const rec = q[n.id];
                if (rec)
                    ctl.rememberPrev(n.id, rec.prevRev, rec.prevId);
            }
            const before = new Map(batch.map((n) => [n.id, q[n.id]?.attempts ?? 0]));
            const batchPaths = new Set(batch.filter((n) => !n.trashed).map((n) => n.path));
            const preParked = await keepBothGuarded(batch, this.o.vault, this.s, localFiles, (p) => batchPaths.has(p), ctl, pushedBodies);
            const toApply = preParked.size ? batch.filter((n) => !preParked.has(n.id)) : batch;
            await applyRemote(toApply, this.o.vault, this.s, {
                foldPath: this.o.foldPath,
                pushedBodies,
                reserved: (p) => batchPaths.has(p),
                localFiles,
                onConflict: this.o.onConflict,
                quarantine: ctl,
            });
            for (const n of batch) {
                const rec = this.s.quarantine?.[n.id];
                if (rec && rec.attempts === before.get(n.id))
                    ctl.release(n.id);
            }
        };
        for (const [prefix, members] of groups) {
            const folder = members.find((n) => n.path === prefix && n.kind === "folder");
            if (folder) {
                await attempt([folder], new Set([prefix]));
                if (this.s.quarantine?.[folder.id])
                    continue;
            }
            else if (Object.values(this.s.quarantine ?? {}).some((r) => r.groupPrefix === prefix && r.payload.path === prefix)) {
                continue;
            }
            const rest = members.filter((n) => n !== folder);
            if (rest.length)
                await attempt(rest, new Set([prefix]));
        }
        if (singles.length)
            await attempt(singles, new Set());
    }
    clearQuarantineForResync() {
        delete this.s.quarantine;
        delete this.s.absenteeQuarantine;
    }
    async localFileMap() {
        const m = new Map();
        for (const e of await this.o.vault.list()) {
            if (e.kind === "file")
                m.set(e.path, e.body ?? "");
        }
        return m;
    }
}
function mergeDeleteOutbox(existing, add) {
    if (!add.length)
        return existing;
    const byId = new Map(existing.map((o) => [o.id, o]));
    for (const o of add)
        byId.set(o.id, o);
    return [...byId.values()];
}
const MAX_RELEASED_NODES = 2000;
function recordRelease(state, path) {
    const st = state.byPath[path];
    if (st?.kind !== "file")
        return;
    const released = (state.releasedNodes ??= {});
    delete released[st.id];
    released[st.id] = { path, rev: st.baseRev };
    const keys = Object.keys(released);
    for (let i = 0; i < keys.length - MAX_RELEASED_NODES; i++)
        delete released[keys[i]];
}
function untrackSubtree(state, path) {
    const prefix = path + "/";
    for (const p of Object.keys(state.byPath)) {
        if (p === path || p.startsWith(prefix)) {
            recordRelease(state, p);
            delete state.byPath[p];
        }
    }
}
function streamPredecessors(cursor, raw) {
    const out = new Map();
    let prev = cursor;
    for (const n of raw) {
        out.set(n.id, prev);
        prev = { rev: n.rev, id: n.id };
    }
    return out;
}
function partitionQuarantine(ctl, nodes, raw) {
    if (!ctl.enabled)
        return nodes;
    if (raw && raw.length !== nodes.length) {
        const applied = new Set(nodes.map((n) => n.id));
        for (const d of raw) {
            if (applied.has(d.id))
                continue;
            const rec = ctl.record(d.id);
            if (!rec)
                continue;
            if (!keysetLt(rec.payload.rev, rec.payload.id, d.rev, d.id))
                continue;
            if (rec.groupPrefix && rec.payload.kind === "folder" && rec.payload.path === rec.groupPrefix) {
                ctl.releaseGroup(rec.groupPrefix);
            }
            else {
                ctl.release(d.id);
            }
        }
    }
    const delivered = new Set(nodes.map((n) => n.id));
    const reinjected = [];
    for (const n of nodes) {
        const rec = ctl.record(n.id);
        if (!rec || !rec.groupPrefix)
            continue;
        if (rec.payload.kind !== "folder" || rec.payload.path !== rec.groupPrefix)
            continue;
        if (!keysetLt(rec.payload.rev, rec.payload.id, n.rev, n.id))
            continue;
        const members = ctl.releaseGroup(rec.groupPrefix);
        if (n.path === rec.groupPrefix) {
            for (const m of members) {
                if (m.id !== n.id && !delivered.has(m.id))
                    reinjected.push(m);
            }
        }
    }
    const out = [];
    const stream = reinjected.length
        ? [...nodes, ...reinjected].sort((a, b) => (keysetLt(a.rev, a.id, b.rev, b.id) ? -1 : 1))
        : nodes;
    for (const n of stream) {
        const rec = ctl.record(n.id);
        if (rec) {
            const newer = keysetLt(rec.payload.rev, rec.payload.id, n.rev, n.id);
            if (!newer)
                continue;
            if (rec.groupPrefix) {
                const g = rec.groupPrefix;
                const stays = !n.trashed && (n.path === g || n.path.startsWith(g + "/"));
                if (stays) {
                    rec.payload = n;
                }
                else {
                    ctl.release(n.id);
                    out.push(n);
                }
                continue;
            }
            ctl.release(n.id);
            out.push(n);
            continue;
        }
        const g = !n.trashed ? ctl.inActiveGroup(n.path) : undefined;
        if (g !== undefined) {
            ctl.park(n, `grouped under quarantined folder move «${g}»`, g);
            continue;
        }
        out.push(n);
    }
    return out;
}
async function keepBothGuarded(nodes, vault, state, localFiles, reserved, ctl, pushedBodies) {
    const parked = new Set();
    for (const n of nodes) {
        try {
            await keepBothDivergent([n], vault, state, localFiles, reserved, pushedBodies);
        }
        catch (e) {
            ctl.park(n, String(e?.message ?? e));
            parked.add(n.id);
        }
    }
    return parked;
}
async function keepBothDivergent(nodes, vault, state, localFiles, reserved, pushedBodies) {
    const trackedIds = new Set();
    for (const st of Object.values(state.byPath))
        trackedIds.add(st.id);
    for (const n of nodes) {
        if (n.trashed)
            continue;
        if (state.byPath[n.path])
            continue;
        if (pushedBodies?.has(n.id) && !trackedIds.has(n.id))
            continue;
        const local = localFiles.get(n.path);
        if (local === undefined)
            continue;
        if (n.kind === "file" && local === (n.body ?? ""))
            continue;
        const sib = siblingPath(n.path, (p) => reserved(p) || localFiles.has(p));
        await vault.writeFile(sib, local);
        localFiles.set(sib, local);
        await vault.remove(n.path);
        localFiles.delete(n.path);
    }
}
