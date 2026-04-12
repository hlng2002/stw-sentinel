// src/index.ts
var STWSentinel = class {
  audioContext = null;
  _buffer = null;
  _sab = null;
  _isRunning = false;
  _dropCount = 0;
  _readPtr = 0;
  _pollTimer = null;
  options;
  constructor(options = {}) {
    this.options = {
      thresholdMs: options.thresholdMs ?? 10,
      onSpike: options.onSpike ?? (() => {
      }),
      processorUrl: options.processorUrl ?? "/processor.js",
      sampleRate: options.sampleRate ?? 48e3
    };
  }
  /** SharedArrayBuffer Int32Array view (diagnostic access) */
  get buffer() {
    return this._buffer;
  }
  get isRunning() {
    return this._isRunning;
  }
  get dropCount() {
    return this._dropCount;
  }
  /**
   * Initialize the sentinel: create SAB, start AudioWorklet, connect audio graph.
   * Must be called after a user gesture (e.g. button click) due to autoplay policy.
   */
  async init() {
    if (this._isRunning) return;
    if (typeof SharedArrayBuffer === "undefined") {
      throw new Error(
        "SharedArrayBuffer is not defined. Ensure COOP/COEP headers are set:\n  Cross-Origin-Opener-Policy: same-origin\n  Cross-Origin-Embedder-Policy: require-corp"
      );
    }
    const HEADER_INTS = 4;
    const DATA_INTS = 4096;
    const TOTAL_INTS = HEADER_INTS + DATA_INTS;
    this._sab = new SharedArrayBuffer(TOTAL_INTS * 4);
    this._buffer = new Int32Array(this._sab);
    Atomics.store(this._buffer, 0, 0);
    Atomics.store(this._buffer, 1, 0);
    Atomics.store(this._buffer, 2, 0);
    Atomics.store(this._buffer, 3, 0);
    this.audioContext = new AudioContext({ sampleRate: this.options.sampleRate });
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
    await this.audioContext.audioWorklet.addModule(
      `${this.options.processorUrl}?t=${Date.now()}`
    );
    const oscillator = new OscillatorNode(this.audioContext, {
      type: "sine",
      frequency: 0
    });
    const monitorNode = new AudioWorkletNode(
      this.audioContext,
      "monitor-processor"
    );
    monitorNode.port.postMessage({
      type: "INIT_SAB",
      sab: this._sab
    });
    oscillator.connect(monitorNode);
    monitorNode.connect(this.audioContext.destination);
    oscillator.start();
    this._isRunning = true;
    this._readPtr = 0;
    this._dropCount = 0;
    console.log("[STW Sentinel] Initialized. Monitoring GC spikes...");
  }
  /**
   * Drain all available entries from the ring buffer.
   * Each entry contains { timestampNs, deltaNs } — the Worklet's
   * scheduling interval data. Large deltas indicate STW pauses.
   */
  drain() {
    if (!this._buffer) return [];
    const writePtr = Atomics.load(this._buffer, 0);
    const HEADER_INTS = 4;
    const entries = [];
    while (this._readPtr !== writePtr) {
      const dataIdx = HEADER_INTS + this._readPtr;
      const timestampNs = this._buffer[dataIdx];
      const deltaNs = this._buffer[dataIdx + 1];
      entries.push({ timestampNs, deltaNs });
      const deltaMs = deltaNs / 1e6;
      if (deltaMs > this.options.thresholdMs) {
        this.options.onSpike(deltaMs);
      }
      this._readPtr = (this._readPtr + 2) % 4096;
    }
    Atomics.store(this._buffer, 1, this._readPtr);
    const sabDrops = Atomics.load(this._buffer, 2);
    if (sabDrops > this._dropCount) {
      this._dropCount = sabDrops;
    }
    return entries;
  }
  /** Stop the sentinel and release resources */
  stop() {
    this._isRunning = false;
    if (this._pollTimer !== null) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this._buffer = null;
    this._sab = null;
    console.log("[STW Sentinel] Stopped.");
  }
};
export {
  STWSentinel
};
