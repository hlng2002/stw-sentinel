declare class STWSentinel {
    private audioContext;
    private sab;
    private stateArray;
    private ringBuffer;
    private readIndex;
    private isRunning;
    private options;
    constructor(options?: SentinelOptions);
    init(): Promise<void>;
    private poll;
    stop(): void;
}
interface SentinelOptions {
    bufferSize?: number;
    onSpike?: (deltaMs: number) => void;
    thresholdMs?: number;
    processorUrl?: string;
}

export { STWSentinel, type SentinelOptions };
