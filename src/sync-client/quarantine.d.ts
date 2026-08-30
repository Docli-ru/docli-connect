import type { PersistedState, PulledNode, QuarantineRecord } from "./ports.js";
export declare const MAX_QUARANTINE = 50;
export declare function isNoteName(name: string): boolean;
export declare function keysetLt(aRev: number, aId: string, bRev: number, bId: string): boolean;
export declare class QuarantineCtl {
    private readonly state;
    readonly enabled: boolean;
    private readonly prevOf;
    private readonly retryingPrefixes;
    private readonly retryingIds;
    constructor(state: PersistedState, enabled: boolean, prevOf: Map<string, {
        rev: number;
        id: string;
    }>, retryingPrefixes?: Set<string>, retryingIds?: Set<string>);
    shouldSkip(id: string): boolean;
    private records;
    groupPrefixes(): string[];
    inActiveGroup(serverPath: string): string | undefined;
    has(id: string): boolean;
    record(id: string): QuarantineRecord | undefined;
    park(n: PulledNode, reason: string, groupPrefix?: string): void;
    release(id: string): void;
    releaseGroup(prefix: string): PulledNode[];
    rememberPrev(id: string, rev: number, prevId: string): void;
}
export declare function ackFrontier(state: PersistedState, cursor: {
    rev: number;
    id: string;
}): {
    rev: number;
    id: string;
};
export declare function tickCooldowns(state: PersistedState): PulledNode[];
