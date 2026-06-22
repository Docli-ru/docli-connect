import { applyRemote } from "./applyRemote.js";
import { emptyState, isKnownKind, NIL_UUID, } from "./ports.js";
import { deriveFolderRenameHints, reconcile, rekey } from "./reconcile.js";
import { siblingPath } from "./paths.js";
import { contentRenameHints, matchableBody } from "./contentRename.js";
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
    constructor(o) {
        this.o = o;
    }
    inScope(path) {
        return this.o.scope ? this.o.scope(path) : true;
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
            this.s.byPath[n.path] = { id: n.id, kind: "file", baseRev: n.rev, baseBody: n.body ?? "" };
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
        const outcome = await this.pushBatch(hints, drainDeletes);
        if (!outcome.skipPull) {
            await this.pullDelta(outcome.pushedBodies);
            await this.reapplyOutboxDeletes();
        }
        await this.o.state.save(this.s);
        return { unapplied: outcome.unapplied, needsReadopt: outcome.needsReadopt };
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
        const serverPaths = new Set(scoped.filter((n) => !n.trashed).map((n) => n.path));
        await keepBothDivergent(toApply, this.o.vault, this.s, localFiles, (p) => serverPaths.has(p));
        await applyRemote(toApply, this.o.vault, this.s, {
            reserved: (p) => serverPaths.has(p),
            localFiles,
            onConflict: this.o.onConflict,
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
        const allHints = synthAll.length ? [...hintsInScope, ...synthAll] : hintsInScope;
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
                return r.status === "error" && r.code === "NODE_NOT_FOUND";
            };
            const doneIds = new Set(sendMuts
                .filter((m) => m.op === "trash" && trashDone(m.mutationId))
                .map((m) => m.args.nodeId));
            const remaining = this.s.deleteOutbox.filter((o) => !doneIds.has(o.id));
            this.s.deleteOutbox = remaining.length ? remaining : undefined;
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
            });
            if (status === 409) {
                const epoch = json.epoch;
                if (typeof epoch === "number")
                    this.s.epoch = epoch;
                cursor = { rev: 0, id: NIL_UUID };
                resync = true;
                localFiles = await this.localFileMap();
                continue;
            }
            if (status !== 200)
                return;
            const resp = json;
            this.s.epoch = resp.epoch;
            this.s.lastMutationId = Math.max(this.s.lastMutationId, resp.lastMutationId ?? 0);
            if (resp.capabilities)
                capabilities = resp.capabilities;
            if (resp.resyncRequired) {
                resync = true;
                cursor = { rev: 0, id: NIL_UUID };
            }
            const nodes = this.scopePulled(this.knownKindPulled(resp.nodes));
            for (const n of nodes)
                if (!n.trashed)
                    seenServerPaths.add(n.path);
            await keepBothDivergent(nodes, this.o.vault, this.s, localFiles, (p) => seenServerPaths.has(p), pushedBodies);
            const seen = await applyRemote(nodes, this.o.vault, this.s, {
                pushedBodies,
                reserved: (p) => seenServerPaths.has(p),
                localFiles,
                onConflict: this.o.onConflict,
            });
            for (const id of seen)
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
        if (resync) {
            for (const [path, st] of Object.entries(this.s.byPath)) {
                if (!seenAll.has(st.id)) {
                    await this.o.vault.remove(path);
                    delete this.s.byPath[path];
                }
            }
        }
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
