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

export class STWSentinel {
  private audioContext: AudioContext | null = null
  private _buffer: Int32Array | null = null
  private _sab: SharedArrayBuffer | null = null
  private _isRunning = false
  private _dropCount = 0
  private _readPtr = 0
  private _pollTimer: ReturnType<typeof setInterval> | null = null

  private readonly options: Required<SentinelOptions>

  constructor(options: SentinelOptions = {}) {
    this.options = {
      thresholdMs: options.thresholdMs ?? 10,
      onSpike: options.onSpike ?? (() => {}),
      processorUrl: options.processorUrl ?? '/processor.js',
      sampleRate: options.sampleRate ?? 48000,
    }
  }

  /** SharedArrayBuffer Int32Array view (diagnostic access) */
  get buffer(): Int32Array | null {
    return this._buffer
  }

  get isRunning(): boolean {
    return this._isRunning
  }

  get dropCount(): number {
    return this._dropCount
  }

  /**
   * Initialize the sentinel: create SAB, start AudioWorklet, connect audio graph.
   * Must be called after a user gesture (e.g. button click) due to autoplay policy.
   */
  async init(): Promise<void> {
    if (this._isRunning) return

    if (typeof SharedArrayBuffer === 'undefined') {
      throw new Error(
        'SharedArrayBuffer is not defined. Ensure COOP/COEP headers are set:\n' +
          '  Cross-Origin-Opener-Policy: same-origin\n' +
          '  Cross-Origin-Embedder-Policy: require-corp'
      )
    }

    // SAB Layout: HEADER(4 Int32) + DATA(4096 Int32) = 4100 elements = 16400 bytes
    const HEADER_INTS = 4
    const DATA_INTS = 4096
    const TOTAL_INTS = HEADER_INTS + DATA_INTS

    this._sab = new SharedArrayBuffer(TOTAL_INTS * 4)
    this._buffer = new Int32Array(this._sab)

    // Initialize header
    Atomics.store(this._buffer, 0, 0) // writePtr
    Atomics.store(this._buffer, 1, 0) // readPtr
    Atomics.store(this._buffer, 2, 0) // dropCount
    Atomics.store(this._buffer, 3, 0) // reserved

    // AudioContext with explicit sample rate
    this.audioContext = new AudioContext({ sampleRate: this.options.sampleRate })

    // Critical: resume AudioContext (autoplay policy requires user gesture)
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume()
    }

    // Load AudioWorklet processor
    await this.audioContext.audioWorklet.addModule(
      `${this.options.processorUrl}?t=${Date.now()}`
    )

    // Connect audio graph: oscillator → monitorNode → destination
    const oscillator = new OscillatorNode(this.audioContext, {
      type: 'sine',
      frequency: 0,
    }) // silent driver
    const monitorNode = new AudioWorkletNode(
      this.audioContext,
      'monitor-processor'
    )

    // Pass SAB to processor
    monitorNode.port.postMessage({
      type: 'INIT_SAB',
      sab: this._sab,
    })

    oscillator.connect(monitorNode)
    monitorNode.connect(this.audioContext.destination)
    oscillator.start()

    this._isRunning = true
    this._readPtr = 0
    this._dropCount = 0

    console.log('[STW Sentinel] Initialized. Monitoring GC spikes...')
  }

  /**
   * Drain all available entries from the ring buffer.
   * Each entry contains { timestampNs, deltaNs } — the Worklet's
   * scheduling interval data. Large deltas indicate STW pauses.
   */
  drain(): SentinelEntry[] {
    if (!this._buffer) return []

    const writePtr = Atomics.load(this._buffer, 0)
    const HEADER_INTS = 4

    const entries: SentinelEntry[] = []

    while (this._readPtr !== writePtr) {
      const dataIdx = HEADER_INTS + this._readPtr
      const timestampNs = this._buffer[dataIdx]
      const deltaNs = this._buffer[dataIdx + 1]

      entries.push({ timestampNs, deltaNs })

      // Check for STW spike
      const deltaMs = deltaNs / 1_000_000
      if (deltaMs > this.options.thresholdMs) {
        this.options.onSpike(deltaMs)
      }

      this._readPtr = (this._readPtr + 2) % 4096
    }

    // Update readPtr in SAB
    Atomics.store(this._buffer, 1, this._readPtr)

    // Update drop count from SAB
    const sabDrops = Atomics.load(this._buffer, 2)
    if (sabDrops > this._dropCount) {
      this._dropCount = sabDrops
    }

    return entries
  }

  /** Stop the sentinel and release resources */
  stop(): void {
    this._isRunning = false

    if (this._pollTimer !== null) {
      clearInterval(this._pollTimer)
      this._pollTimer = null
    }

    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }

    this._buffer = null
    this._sab = null
    console.log('[STW Sentinel] Stopped.')
  }
}

export interface SentinelOptions {
  /** STW threshold in milliseconds (default: 10) */
  thresholdMs?: number
  /** Callback when a STW spike is detected */
  onSpike?: (deltaMs: number) => void
  /** URL to the AudioWorklet processor script (default: /processor.js) */
  processorUrl?: string
  /** AudioContext sample rate (default: 48000) */
  sampleRate?: number
}

export interface SentinelEntry {
  /** Timestamp in nanoseconds (from processor) */
  timestampNs: number
  /** Delta in nanoseconds (Worklet scheduling interval) */
  deltaNs: number
}
