# stw-sentinel

A lock-free AudioWorklet probe to detect V8 GC Stop-The-World events in real-time.

Traditional performance monitoring tools (like `requestAnimationFrame` hooks) run on the main thread and will be paused ("Stop-The-World") alongside your code during garbage collection. This means they are inherently blind to the very GC spikes they are trying to measure.

`stw-sentinel` bypasses this limitation by running an observer inside an isolated `AudioWorklet` thread. It uses a high-priority real-time audio thread and a lock-free `SharedArrayBuffer` + `Atomics` to stream nanosecond-precision scheduling data back to the main thread.

## v1.1.0 Changes

- **Critical Bug Fix**: `HEADER_SIZE` in processor.js corrected from 16 (bytes) to 4 (Int32 elements) — data was being written to wrong SAB offset
- **AudioContext Resume**: Added automatic `resume()` after user gesture to handle browser autoplay policy
- **drain() API**: New method to read all available entries from the ring buffer in one call
- **TypeScript Enhancements**: `SentinelEntry` interface, proper type declarations for `crossOriginIsolated`
- **Dual-Track Demo**: New `/lab` page showing main thread vs Worklet thread isolation in real-time

## Installation

```bash
npm install stw-sentinel
```

## Server Configuration (CRITICAL)

`SharedArrayBuffer` requires Cross-Origin Isolation headers. Without these, the probe cannot create the shared memory buffer.

### Nginx Configuration

```nginx
# Enable HTTP/2 + COOP/COEP for SharedArrayBuffer
server {
    listen 443 ssl http2;

    # Cross-Origin Isolation headers (required for SharedArrayBuffer)
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Embedder-Policy "require-corp" always;
}
```

### Express.js

```javascript
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});
```

Verify with `self.crossOriginIsolated === true` in your browser console.

## Usage

```typescript
import { STWSentinel } from 'stw-sentinel';

// Initialize the sentinel (call after user gesture, e.g. button click)
const sentinel = new STWSentinel({
  thresholdMs: 10,        // STW spike threshold (default: 10ms)
  processorUrl: '/processor.js',  // Path to AudioWorklet processor
  sampleRate: 48000,      // AudioContext sample rate
  onSpike: (deltaMs) => {
    console.error(`🚨 STW DETECTED: ${deltaMs.toFixed(2)}ms`);
    // Send to APM (Datadog, Sentry, etc.)
  },
});

// Start monitoring (must be called after user gesture)
await sentinel.init();

// Read all available entries from the ring buffer
const entries = sentinel.drain();
for (const entry of entries) {
  console.log(`Worklet Δ: ${(entry.deltaNs / 1_000_000).toFixed(2)}ms`);
}

// When done
sentinel.stop();
```

## API Reference

### `STWSentinel`

| Method | Description |
|--------|-------------|
| `init()` | Initialize SAB, AudioWorklet, and audio graph. Must be called after user gesture. |
| `drain()` | Read all available entries from ring buffer. Returns `SentinelEntry[]`. |
| `stop()` | Stop monitoring and release resources. |

| Property | Type | Description |
|----------|------|-------------|
| `buffer` | `Int32Array \| null` | Raw SAB Int32Array view (diagnostic access) |
| `isRunning` | `boolean` | Whether the sentinel is active |
| `dropCount` | `number` | Number of dropped entries due to ring buffer overflow |

### `SentinelEntry`

| Field | Type | Description |
|-------|------|-------------|
| `timestampNs` | `number` | Timestamp in nanoseconds (from Worklet) |
| `deltaNs` | `number` | Scheduling interval in nanoseconds |

## SAB Memory Layout

```
┌─────────────┬──────────────────────────────────┐
│  HEADER     │  DATA (Ring Buffer)              │
│  4 Int32    │  4096 Int32 = 2048 pairs         │
│  (16 bytes) │  [timestamp_ns, delta_ns] × 2048 │
├─────────────┼──────────────────────────────────┤
│ writePtr    │  Pair 0: ts, delta               │
│ readPtr     │  Pair 1: ts, delta               │
│ dropCount   │  ...                              │
│ reserved    │  Pair 2047: ts, delta             │
└─────────────┴──────────────────────────────────┘
Total: 4100 Int32 = 16400 bytes
```

## Processor File

You must host the `processor.js` file statically so the `AudioWorklet` can load it. Copy it from the package's `public/` directory to your project's static assets.

## Live Demo

See the dual-track contrast lab at [diffserv.xyz/lab](https://diffserv.xyz/lab) — main thread heartbeat vs AudioWorklet isolation in real-time.

## License

MIT
