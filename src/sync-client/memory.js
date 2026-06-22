import { emptyState, } from "./ports.js";
export class MemoryVault {
    files = new Map();
    folders = new Set();
    pendingDeletes = [];
    async list() {
        const out = [];
        for (const p of this.folders)
            out.push({ path: p, kind: "folder" });
        for (const [p, body] of this.files)
            out.push({ path: p, kind: "file", body });
        return out;
    }
    async scan(drainDeletes) {
        const entries = await this.list();
        const deletedPaths = drainDeletes ? drainDeletes() : this.drainDeletes();
        return { entries, deletedPaths };
    }
    drainDeletes() {
        const d = this.pendingDeletes;
        this.pendingDeletes = [];
        return d;
    }
    async readFile(path) {
        return this.files.get(path) ?? "";
    }
    async writeFile(path, body) {
        this.addAncestors(path);
        this.files.set(path, body);
    }
    async mkdir(path) {
        this.addAncestors(path);
        this.folders.add(path);
    }
    addAncestors(path) {
        let slash = path.indexOf("/");
        while (slash >= 0) {
            this.folders.add(path.slice(0, slash));
            slash = path.indexOf("/", slash + 1);
        }
    }
    async remove(path) {
        this.files.delete(path);
        this.folders.delete(path);
    }
    async move(from, to) {
        if (from !== to && (this.files.has(to) || this.folders.has(to))) {
            throw new Error("Destination file already exists!");
        }
        this.addAncestors(to);
        if (this.files.has(from)) {
            this.files.set(to, this.files.get(from) ?? "");
            this.files.delete(from);
        }
        else if (this.folders.has(from)) {
            const prefix = from + "/";
            this.folders.delete(from);
            this.folders.add(to);
            for (const p of [...this.folders]) {
                if (p.startsWith(prefix)) {
                    this.folders.delete(p);
                    this.folders.add(to + p.slice(from.length));
                }
            }
            for (const [p, body] of [...this.files]) {
                if (p.startsWith(prefix)) {
                    this.files.delete(p);
                    this.files.set(to + p.slice(from.length), body);
                }
            }
        }
    }
    put(path, body) {
        this.addAncestors(path);
        this.files.set(path, body);
    }
    del(path) {
        if (this.files.has(path) || this.folders.has(path))
            this.pendingDeletes.push(path);
        this.files.delete(path);
        this.folders.delete(path);
    }
    snapshot() {
        return Object.fromEntries([...this.files.entries()].sort());
    }
}
export class MemoryStatePort {
    s = emptyState();
    async load() {
        return JSON.parse(JSON.stringify(this.s));
    }
    async save(s) {
        this.s = JSON.parse(JSON.stringify(s));
    }
}
export class MemoryNotifyPort {
    subs = new Map();
    connect(workspaceId, handlers) {
        let set = this.subs.get(workspaceId);
        if (!set) {
            set = new Set();
            this.subs.set(workspaceId, set);
        }
        set.add(handlers);
        handlers.onStatus?.("connected");
        return () => {
            handlers.onStatus?.("disconnected");
            set?.delete(handlers);
        };
    }
    poke(workspaceId) {
        for (const h of this.subs.get(workspaceId) ?? [])
            h.onPoke();
    }
    fireConnect(workspaceId) {
        for (const h of this.subs.get(workspaceId) ?? [])
            h.onConnect?.();
    }
    subscriberCount(workspaceId) {
        return this.subs.get(workspaceId)?.size ?? 0;
    }
}
