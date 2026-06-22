export declare function siblingPath(path: string, taken: (p: string) => boolean): string;
export declare function folderScope(folders: string[]): (path: string) => boolean;
export declare function isScopeWiden(prev: string[], next: string[]): boolean;
