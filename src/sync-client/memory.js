import { emptyState, } from "./ports.js";
export class MemoryVault {
    files = new Map();
    folders = new Set();
    binaries = new Map();
    clock = 0;
    suspectPaths = new Set();
    failPaths = new Set();
    failIf(path) {
        if (this.failPaths.has(path))
            throw new Error(`EPERM: cannot write ${path}`);
    }
    pendingDeletes = [];
    async list() {
        const out = [];
        for (const p of this.folders)
            out.push({ path: p, kind: "folder" });
        for (const [p, body] of this.files) {
            if (this.suspectPaths.has(p)) {
                out.push({ path: p, kind: "file", body: "", size: body.length, suspectRead: true });
            }
            else {
                out.push({ path: p, kind: "file", body });
            }
        }
        for (const [p, b] of this.binaries)
            out.push({ path: p, kind: "attachment", size: b.bytes.length, mtime: b.mtime });
        return out;
    }
    async listMeta() {
        return this.list();
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
        this.failIf(path);
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
        this.failIf(path);
        this.files.delete(path);
        this.folders.delete(path);
        this.binaries.delete(path);
    }
    async stat(path) {
        const b = this.binaries.get(path);
        if (b)
            return { size: b.bytes.length, mtime: b.mtime };
        const f = this.files.get(path);
        if (f !== undefined)
            return { size: f.length, mtime: 0 };
        return null;
    }
    async readBinary(path) {
        const b = this.binaries.get(path);
        if (!b)
            return new Uint8Array();
        if (this.suspectPaths.has(path))
            return b.bytes.slice(0, Math.floor(b.bytes.length / 2));
        return b.bytes.slice();
    }
    async writeBinary(path, bytes) {
        this.failIf(path);
        this.addAncestors(path);
        this.files.delete(path);
        this.binaries.set(path, { bytes: bytes.slice(), mtime: ++this.clock });
    }
    async move(from, to) {
        if (from !== to && (this.files.has(to) || this.folders.has(to) || this.binaries.has(to))) {
            throw new Error("Destination file already exists!");
        }
        this.failIf(to);
        this.failIf(from);
        this.addAncestors(to);
        if (this.files.has(from)) {
            this.files.set(to, this.files.get(from) ?? "");
            this.files.delete(from);
        }
        else if (this.binaries.has(from)) {
            this.binaries.set(to, this.binaries.get(from));
            this.binaries.delete(from);
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
            for (const [p, b] of [...this.binaries]) {
                if (p.startsWith(prefix)) {
                    this.binaries.delete(p);
                    this.binaries.set(to + p.slice(from.length), b);
                }
            }
        }
    }
    put(path, body) {
        this.addAncestors(path);
        this.files.set(path, body);
    }
    putBinary(path, bytes) {
        this.addAncestors(path);
        this.binaries.set(path, { bytes: bytes.slice(), mtime: ++this.clock });
    }
    binary(path) {
        return this.binaries.get(path)?.bytes.slice();
    }
    binaryPaths() {
        return [...this.binaries.keys()].sort();
    }
    hasFolder(path) {
        return this.folders.has(path);
    }
    del(path) {
        if (this.files.has(path) || this.folders.has(path) || this.binaries.has(path))
            this.pendingDeletes.push(path);
        this.files.delete(path);
        this.folders.delete(path);
        this.binaries.delete(path);
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
