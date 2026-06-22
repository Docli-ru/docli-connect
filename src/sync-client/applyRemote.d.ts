import type { PersistedState, PulledNode, VaultPort } from "./ports.js";
export interface ApplyRemoteOpts {
    pushedBodies?: Map<string, string>;
    reserved?: (p: string) => boolean;
    localFiles?: Map<string, string>;
    onConflict?: (info: {
        original: string;
        savedAs: string;
    }) => void;
}
export declare function applyRemote(nodes: PulledNode[], vault: VaultPort, state: PersistedState, opts?: ApplyRemoteOpts): Promise<Set<string>>;
