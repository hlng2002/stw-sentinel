var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  STWSentinel: () => STWSentinel
});
module.exports = __toCommonJS(index_exports);
var STWSentinel = class {
  audioContext = null;
  sab = null;
  stateArray = null;
  ringBuffer = null;
  readIndex = 0;
  isRunning = false;
  options;
  constructor(options = {}) {
    this.options = {
      bufferSize: options.bufferSize || 1024,
      onSpike: options.onSpike || (() => {
      }),
      thresholdMs: options.thresholdMs || 50,
      processorUrl: options.processorUrl || "/processor.js"
    };
  }
  async init() {
    if (this.isRunning) return;
    try {
      this.audioContext = new AudioContext();
      const totalSize = 2 + this.options.bufferSize;
      if (typeof SharedArrayBuffer === "undefined") {
        throw new Error("SharedArrayBuffer is not defined. Ensure COOP/COEP headers are set: Cross-Origin-Opener-Policy: same-origin, Cross-Origin-Embedder-Policy: require-corp");
      }
      this.sab = new SharedArrayBuffer(totalSize * 4);
      this.stateArray = new Int32Array(this.sab, 0, 2 * 4);
      this.ringBuffer = new Int32Array(this.sab, 2 * 4, this.options.bufferSize * 4);
      await this.audioContext.audioWorklet.addModule(`${this.options.processorUrl}?t=${Date.now()}`);
      const oscillator = new OscillatorNode(this.audioContext, { type: "sine", frequency: 0 });
      const monitorNode = new AudioWorkletNode(this.audioContext, "monitor-processor");
      monitorNode.port.postMessage({
        type: "INIT_SAB",
        sab: this.sab,
        bufferSize: this.options.bufferSize
      });
      oscillator.connect(monitorNode);
      monitorNode.connect(this.audioContext.destination);
      oscillator.start();
      this.isRunning = true;
      this.poll();
      console.log("STW Sentinel Initialized. Monitoring GC spikes...");
    } catch (err) {
      console.error("Failed to initialize STW Sentinel:", err);
      throw err;
    }
  }
  poll() {
    if (!this.isRunning || !this.stateArray || !this.ringBuffer) return;
    const writeIndex = Atomics.load(this.stateArray, 0);
    let drops = Atomics.load(this.stateArray, 1);
    while (this.readIndex !== writeIndex) {
      const deltaMs = this.ringBuffer[this.readIndex] / 1e3;
      if (deltaMs > this.options.thresholdMs) {
        this.options.onSpike(deltaMs);
      }
      this.readIndex = (this.readIndex + 1) % this.options.bufferSize;
    }
    requestAnimationFrame(() => this.poll());
  }
  stop() {
    this.isRunning = false;
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  STWSentinel
});
