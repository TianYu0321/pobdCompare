export interface PoB2Installation {
    root: string;
    version: string;
    luaDllPath: string;
}
export declare const DEFAULT_POB2_ROOTS: string[];
export declare function detectPoB2Installation(candidates?: string[]): Promise<PoB2Installation>;
//# sourceMappingURL=environment.d.ts.map