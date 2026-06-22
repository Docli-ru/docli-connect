export type Kind = "file" | "folder" | "attachment";
export declare const KNOWN_KINDS: readonly Kind[];
export declare function isKnownKind(kind: string): kind is Kind;
export interface VaultEntry {
    path: string;
    kind: Kind;
    body?: string;
}
export interface VaultPort {
    list(): Promise<VaultEntry[]>;
    scan(drainDeletes?: () => string[]): Promise<{
        entries: VaultEntry[];
        deletedPaths: string[];
    }>;
    readFile(path: string): Promise<string>;
    writeFile(path: string, body: string): Promise<void>;
    mkdir(path: string): Promise<void>;
    remove(path: string): Promise<void>;
    move(from: string, to: string): Promise<void>;
}
export interface HttpTransport {
    post(path: string, body: unknown): Promise<{
        status: number;
        json: unknown;
    }>;
}
export interface NodeState {
    id: string;
    kind: Kind;
    baseRev: number;
    baseBody?: string;
}
export interface ReleasedNode {
    path: string;
    rev: number;
}
export interface PersistedState {
    epoch: number;
    cursor: {
        rev: number;
        id: string;
    };
    lastMutationId: number;
    byPath: Record<string, NodeState>;
    releasedNodes?: Record<string, ReleasedNode>;
    missingStreak?: Record<string, number>;
    deleteOutbox?: Array<{
        id: string;
        path: string;
    }>;
}
export interface StatePort {
    load(): Promise<PersistedState>;
    save(s: PersistedState): Promise<void>;
}
export type NotifyStatus = "connecting" | "connected" | "disconnected";
export interface NotifyHandlers {
    onPoke: () => void;
    onConnect?: () => void;
    onStatus?: (status: NotifyStatus) => void;
}
export interface NotifyPort {
    connect(workspaceId: string, handlers: NotifyHandlers): () => void;
}
export declare const NIL_UUID = "00000000-0000-0000-0000-000000000000";
export declare function emptyState(): PersistedState;
export interface RenameHint {
    oldPath: string;
    newPath: string;
}
export declare const RESERVED_SEGMENTS: string[];
export declare function hasReservedSegment(path: string): boolean;
export interface WireCursor {
    rev: number;
    id: string;
}
export interface PulledNode {
    id: string;
    parentId: string | null;
    kind: Kind;
    name: string;
    path: string;
    rev: number;
    trashed: boolean;
    mime: string | null;
    contentBytes: number;
    body: string | null;
    blobUrl: string | null;
}
export interface Capability {
    feature: string;
    minClientVersion: string;
}
export interface PullResponse {
    epoch: number;
    cursor: WireCursor;
    nodes: PulledNode[];
    capabilities?: Capability[];
    resyncRequired: boolean;
    lastMutationId?: number;
}
export interface Mutation {
    mutationId: number;
    op: "createFolder" | "createNote" | "putBody" | "rename" | "move" | "trash" | "restore";
    args: Record<string, unknown>;
}
export interface OpResult {
    mutationId: number;
    status: "ok" | "skipped" | "conflict" | "error";
    id?: string;
    conflictSiblingId?: string;
    code?: string;
}
export interface PushResponse {
    epoch: number;
    lastMutationId: number;
    cursor: WireCursor;
    results: OpResult[];
}
