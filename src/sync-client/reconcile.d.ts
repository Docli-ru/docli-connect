import { type Mutation, type PersistedState, type RenameHint, type VaultEntry } from "./ports.js";
export interface RekeyRecord {
    hint: RenameHint;
    oldPath: string;
    newPath: string;
    mutationIds: number[];
}
export declare function reconcile(entries: VaultEntry[], state: PersistedState, hints?: RenameHint[], appliedRekeys?: RekeyRecord[]): Mutation[];
export declare function deriveFolderRenameHints(entries: VaultEntry[], state: PersistedState, explicitHints?: RenameHint[], tombstoned?: Set<string>): RenameHint[];
export declare function rekey(state: PersistedState, oldPath: string, newPath: string): void;
