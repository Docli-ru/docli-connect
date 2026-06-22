import type { PersistedState, RenameHint, VaultEntry } from "./ports.js";
export declare function matchableBody(body: string | undefined): string | null;
export declare function contentRenameHints(entries: VaultEntry[], state: PersistedState, explicitHints?: RenameHint[], tombstoned?: Set<string>, uniqueness?: {
    liveEntries: VaultEntry[];
    trackedBaseBodies: Array<string | undefined>;
}): RenameHint[];
