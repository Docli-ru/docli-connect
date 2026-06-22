export type MergeOutcome = {
    kind: "clean";
    text: string;
} | {
    kind: "conflict";
    server: string;
    client: string;
};
export declare function threeWayMerge(base: string, client: string, server: string): MergeOutcome;
