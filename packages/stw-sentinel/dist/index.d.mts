/**
 * STW Sentinel — V8 Stop-The-World GC Spike Detector
 *
 * Uses AudioWorklet + SharedArrayBuffer + Atomics for lock-free
 * cross-thread communication. The Worklet thread runs independently
 * of the main thread, making it an ideal probe for detecting V8 GC
 * Stop-The-World pauses that freeze ALL threads in the isolate.
 *
 * SAB Layout (4100 Int32 = 16400 bytes):
 *   HEADER [4 Int32]: writePtr(0), readPtr(1), dropCount(2), reserved(3)
 *   DATA   [4096 Int32]: 2048 pairs of [timestamp_ns, delta_ns]
 *
 * @version 1.1.0
 */
declare class STWSentinel {
    private audioContext;
    private _buffer;
    private _sab;
    private _isRunning;
    private _dropCount;
    private _readPtr;
    private _pollTimer;
    private readonly options;
    constructor(options?: SentinelOptions);
    /** SharedArrayBuffer Int32Array view (diagnostic access) */
    get buffer(): Int32Array | null;
    get isRunning(): boolean;
    get dropCount(): number;
    /**
     * Initialize the sentinel: create SAB, start AudioWorklet, connect audio graph.
     * Must be called after a user gesture (e.g. button click) due to autoplay policy.
     */
    init(): Promise<void>;
    /**
     * Drain all available entries from the ring buffer.
     * Each entry contains { timestampNs, deltaNs } — the Worklet's
     * scheduling interval data. Large deltas indicate STW pauses.
     */
    drain(): SentinelEntry[];
    /** Stop the sentinel and release resources */
    stop(): void;
}
interface SentinelOptions {
    /** STW threshold in milliseconds (default: 10) */
    thresholdMs?: number;
    /** Callback when a STW spike is detected */
    onSpike?: (deltaMs: number) => void;
    /** URL to the AudioWorklet processor script (default: /processor.js) */
    processorUrl?: string;
    /** AudioContext sample rate (default: 48000) */
    sampleRate?: number;
}
interface SentinelEntry {
    /** Timestamp in nanoseconds (from processor) */
    timestampNs: number;
    /** Delta in nanoseconds (Worklet scheduling interval) */
    deltaNs: number;
}

export { STWSentinel, type SentinelEntry, type SentinelOptions };
