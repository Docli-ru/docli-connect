export const KNOWN_KINDS = ["file", "folder", "attachment"];
export function isKnownKind(kind) {
    return KNOWN_KINDS.includes(kind);
}
export const NIL_UUID = "00000000-0000-0000-0000-000000000000";
export function emptyState() {
    return { epoch: 1, cursor: { rev: 0, id: NIL_UUID }, lastMutationId: 0, byPath: {} };
}
export const RESERVED_SEGMENTS = [".obsidian", ".trash", ".git"];
export function hasReservedSegment(path) {
    return path.split("/").some((seg) => RESERVED_SEGMENTS.includes(seg.toLowerCase()));
}
