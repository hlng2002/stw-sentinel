# stw-sentinel 🛡️

[![npm version](https://img.shields.io/npm/v/stw-sentinel.svg)](https://www.npmjs.com/package/stw-sentinel)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **High-precision, lock-free Stop-The-World (STW) sentinel for Web Audio using SharedArrayBuffer.**

When V8 Garbage Collection (Major GC) hits, the main thread freezes. Traditional timers (`requestAnimationFrame`, `setTimeout`) are completely paralyzed. However, `AudioWorklet` runs on a separate, high-priority OS thread. 

`stw-sentinel` leverages `SharedArrayBuffer` and `Atomics` to achieve **zero-copy, lock-free communication** between the AudioWorklet and the main thread. It can survive **700ms+ V8 STW nuclear explosions** without dropping a single audio frame.

## 🔬 Live Lab & Interactive Demo

Seeing is believing. We built a dual-track isolation lab to prove the exact difference between the Main Thread and the AudioWorklet during a V8 Garbage Collection meltdown.

👉 **[Enter the DiffServ Isolation Lab](https://diffserv.xyz/lab)**

*In the lab, you can click the **"Supernova Bomb"** to intentionally overload the V8 Concurrent Marker. You will see the main thread UI completely freeze (700ms+ spikes) while the `stw-sentinel` audio probe maintains a perfectly flat 2.67ms heart rate.*

---

## 📦 Installation

```bash
npm install stw-sentinel
```

## 🚀 The Secret Sauce: Server Configuration

**CRITICAL:** `SharedArrayBuffer` is disabled in modern browsers by default to prevent Spectre attacks. You **MUST** serve your application with Cross-Origin Isolation headers.

If you are using **Nginx**, add this to your server block:

```nginx
# Enable Cross-Origin Isolation for SharedArrayBuffer
add_header Cross-Origin-Opener-Policy "same-origin" always;
add_header Cross-Origin-Embedder-Policy "require-corp" always;
```

## 💻 Usage

### 1. Initialize the Sentinel

```typescript
import { STWSentinel } from 'stw-sentinel';

const sentinel = new STWSentinel({
  bufferSize: 4096, // Capacity of the SharedArrayBuffer
  thresholdMs: 10,  // Trigger STW alert if delta exceeds 10ms
  processorUrl: '/processor.js' // Path to your served processor file
});

await sentinel.init();
sentinel.start();
```

### 2. Drain Data (Monitoring Loop)

In your main thread (e.g., inside a `requestAnimationFrame` loop), consume the data lock-free:

```typescript
function poll() {
  const entries = sentinel.drain();
  
  if (entries.length > 0) {
    for (const { time, deltaMs } of entries) {
      if (deltaMs > 10) {
        console.warn(`🔥 STW Spike Detected: ${deltaMs}ms`);
      }
    }
  }
  requestAnimationFrame(poll);
}
poll();
```

## 🧠 Architecture: Memory Layout

We use a highly optimized memory layout within the `SharedArrayBuffer` to prevent the AudioWorklet and Main Thread from stepping on each other's toes.

```text
+---------------------------------------------------------------+
|                      SharedArrayBuffer (SAB)                  |
|                      Total Size: 16400 Bytes                  |
+---------------------------------------------------------------+
| HEADER (16 Bytes / 4 Int32 Elements)                          |
| [0] writePtr : Updated by Worklet                             |
| [1] readPtr  : Updated by Main Thread (drain)                 |
| [2] dropCount: Tracks overflow if Main Thread hangs too long  |
| [3] reserved : For future alignment                           |
+---------------------------------------------------------------+
| DATA CAP (16384 Bytes / 4096 Int32 Elements)                  |
| Contains 2048 Pairs of Data:                                  |
| [ Timestamp (ns) , Delta (ns) ]                               |
| [ Timestamp (ns) , Delta (ns) ]                               |
| ...                                                           |
+---------------------------------------------------------------+
```
*Note: We use `Atomics.load` and `Atomics.store` strictly to prevent race conditions during high-frequency I/O.*

## ⚖️ License

MIT License © 2026 DiffServ Lab
