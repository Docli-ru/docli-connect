import type { StatePort, VaultPort } from "./ports.js";
export declare const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
export interface BlobPutOk {
    ok: true;
    generation: number;
    sha256: string;
}
export interface BlobPutConflict {
    ok: false;
    kind: "conflict";
    generation: number;
    sha256: string | null;
    divergence: "current-match" | "displaced-match" | "unknown";
}
export interface BlobPutFailed {
    ok: false;
    kind: "failed";
    detail?: string;
}
export interface BlobPutTooLarge {
    ok: false;
    kind: "too-large";
}
export type BlobPutResult = BlobPutOk | BlobPutConflict | BlobPutFailed | BlobPutTooLarge;
export interface BlobPort {
    putBlob(nodeId: string, baseGeneration: number, sha256: string, bytes: Uint8Array): Promise<BlobPutResult>;
    download(nodeId: string, blobUrl: string | null): Promise<{
        bytes: Uint8Array;
    } | "failed">;
    uploadNew(path: string, bytes: Uint8Array): Promise<{
        id: string;
        generation: number;
        sha256: string;
        path?: string;
    } | "failed" | "skipped-large">;
}
export type AttachmentNotice = {
    kind: "conflict";
    path: string;
    savedAs: string;
} | {
    kind: "download-failed";
    path: string;
    detail?: string;
} | {
    kind: "upload-failed";
    path: string;
    detail?: string;
} | {
    kind: "skipped-large";
    path: string;
} | {
    kind: "held";
    path: string;
    detail: string;
} | {
    kind: "transferred";
    path: string;
};
export interface AttachmentSyncOpts {
    vault: VaultPort;
    state: StatePort;
    blob: BlobPort;
    scope?: (path: string) => boolean;
    enabled: boolean;
    onNotice?: (n: AttachmentNotice) => void;
}
export declare function syncAttachmentBytes(o: AttachmentSyncOpts): Promise<void>;
