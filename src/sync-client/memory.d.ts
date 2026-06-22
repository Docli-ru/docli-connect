import { type NotifyHandlers, type NotifyPort, type PersistedState, type StatePort, type VaultEntry, type VaultPort } from "./ports.js";
export declare class MemoryVault implements VaultPort {
    private files;
    private folders;
    private pendingDeletes;
    list(): Promise<VaultEntry[]>;
    scan(drainDeletes?: () => string[]): Promise<{
        entries: VaultEntry[];
        deletedPaths: string[];
    }>;
    drainDeletes(): string[];
    readFile(path: string): Promise<string>;
    writeFile(path: string, body: string): Promise<void>;
    mkdir(path: string): Promise<void>;
    private addAncestors;
    remove(path: string): Promise<void>;
    move(from: string, to: string): Promise<void>;
    put(path: string, body: string): void;
    del(path: string): void;
    snapshot(): Record<string, string>;
}
export declare class MemoryStatePort implements StatePort {
    private s;
    load(): Promise<PersistedState>;
    save(s: PersistedState): Promise<void>;
}
export declare class MemoryNotifyPort implements NotifyPort {
    private subs;
    connect(workspaceId: string, handlers: NotifyHandlers): () => void;
    poke(workspaceId: string): void;
    fireConnect(workspaceId: string): void;
    subscriberCount(workspaceId: string): number;
}
