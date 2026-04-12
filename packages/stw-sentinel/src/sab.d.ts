/**
 * Type declarations for crossOriginIsolated and SharedArrayBuffer
 * required by STW Sentinel.
 */
interface Window {
  /** True when COOP/COEP headers enable cross-origin isolation */
  crossOriginIsolated: boolean
}
