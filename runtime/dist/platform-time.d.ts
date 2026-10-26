export type PlatformTimer = ReturnType<typeof setTimeout>;
export declare function platformTimeout(fn: () => void, ms: number): PlatformTimer;
export declare function clearPlatformTimeout(id: PlatformTimer | undefined): void;
