import { type Capability, type HttpTransport, type NotifyPort, type NotifyStatus, type RenameHint, type ReorderOp, type StatePort, type VaultPort } from "./ports.js";
export interface SyncClientOpts {
    foldPath?: (p: string) => string;
    workspaceId: string;
    clientId: string;
    vault: VaultPort;
    transport: HttpTransport;
    state: StatePort;
    pageLimit?: number;
    onConflict?: (info: {
        original: string;
        savedAs: string;
    }) => void;
    onRecover?: (info: {
        from: string;
        to: string;
    }) => void;
    onSupersede?: (info: {
        localPath: string;
        serverPath: string;
    }) => void;
    notify?: NotifyPort;
    onMassDelete?: (info: {
        count: number;
        total: number;
    }) => Promise<boolean>;
    onCapabilities?: (caps: Capability[]) => void;
    scope?: (path: string) => boolean;
}
export declare const SUSPECT_RESTORE_AFTER = 2;
export declare function isMassDelete(trash: number, trackedLive: number): boolean;
export declare class SyncClient {
    private readonly o;
    private s;
    private refusedMoves;
    private attachmentsOn;
    constructor(o: SyncClientOpts);
    private inScope;
    attachmentsCapable(): boolean;
    private noteCapabilities;
    private adoptPersistedCapability;
    private scopePulled;
    private knownKindPulled;
    private adoptContentMoves;
    listen(onTrigger: () => void, onStatus?: (status: NotifyStatus) => void): () => void;
    sync(hints?: RenameHint[], drainDeletes?: () => string[]): Promise<{
        unapplied: RenameHint[];
        needsReadopt: boolean;
    }>;
    queueReorder(op: ReorderOp): Promise<void>;
    private reapplyOutboxDeletes;
    bootstrap(opts?: {
        recoverMoves?: boolean;
    }): Promise<boolean>;
    private pushBatch;
    private parkConfirmedTrashes;
    private unparkFresh;
    private sendChunked;
    private pullDelta;
    private retryQuarantined;
    private clearQuarantineForResync;
    private localFileMap;
}
