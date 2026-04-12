// processor.js
const HEADER_SIZE = 4; // Int32 elements (4 × 4 bytes = 16 bytes header)
const DATA_CAPACITY = 4096; // 4096 Int32 slots = 2048 pairs
const TOTAL_SIZE = HEADER_SIZE + DATA_CAPACITY;

const IDX_WRITE_PTR = 0;
const IDX_READ_PTR = 1;
const IDX_DROP_COUNT = 2;

class MonitorProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.port.onmessage = (e) => {
            if (e.data.sab) {
                this.sharedBuffer = new Int32Array(e.data.sab);
            }
            if (e.data.expectedDelta) {
                this.expectedDelta = e.data.expectedDelta;
            }
            // 用于红队测试：强制锁死音频线程
            if (e.data.stallWorklet) {
                const start = this.getRealTime();
                while (this.getRealTime() - start < e.data.stallWorklet) {
                    // 纯同步死循环，死锁 Audio Thread
                }
            }
        };
        // 强制使用真实世界时钟源，兼容不同浏览器的 Worklet 环境
        this.getRealTime = () => {
            if (typeof performance !== 'undefined' && performance.now) {
                return performance.now();
            }
            // Fallback to Date.now() if performance is missing
            return Date.now();
        };
        
        this.lastProcessTime = this.getRealTime();
        this.lastOutputData = new Float32Array(128);
        this.expectedDelta = (128 / sampleRate) * 1000; // in ms
        this.hardwareBurstDelta = this.expectedDelta;
    }

    process(inputs, outputs, parameters) {
        const now = this.getRealTime();
        const delta = now - this.lastProcessTime;
        this.lastProcessTime = now;

        // 动态学习底层操作系统的 Audio Hardware Buffer Burst 周期 (通常为 5.8ms 或 11.6ms)
        // 这能过滤掉由于浏览器批量调度以及 Date.now() 1ms 精度带来的"假 STW"
        if (delta > this.hardwareBurstDelta && delta < 30) {
            this.hardwareBurstDelta = delta;
        }

        // 1. Report Delta to SAB (无锁原子操作)
        if (this.sharedBuffer) {
            const writePtr = Atomics.load(this.sharedBuffer, IDX_WRITE_PTR);
            const readPtr = Atomics.load(this.sharedBuffer, IDX_READ_PTR);

            const nextWritePtr = (writePtr + 2) % DATA_CAPACITY;

            if (nextWritePtr === readPtr) {
                // Buffer overflow 发生，记录 drop_count
                Atomics.add(this.sharedBuffer, IDX_DROP_COUNT, 1);
            } else {
                const dataIndex = HEADER_SIZE + writePtr;
                // Int32 scaling (ms * 1,000,000 -> ns) 以避免 Float 半读风险
                this.sharedBuffer[dataIndex] = Math.floor(now * 1000000); 
                this.sharedBuffer[dataIndex + 1] = Math.floor(delta * 1000000);
                Atomics.store(this.sharedBuffer, IDX_WRITE_PTR, nextWritePtr);
            }
        }

        // 2. Audio Processing & Simple PLC (自适应水位与降级)
        const input = inputs[0];
        const output = outputs[0];
        
        let needPLC = false;
        // 只有当 delta 显著大于动态学习到的硬件周期，且绝对时间 > 10ms 时，才认定为真实的 STW 异常并触发 PLC
        if (delta > this.hardwareBurstDelta * 1.5 && delta > 10) {
            needPLC = true;
        }

        if (input && input.length > 0 && output && output.length > 0) {
            const inChannel = input[0];
            const outChannel = output[0];
            
            if (needPLC) {
                // 极简版 WSOLA (Cross-fading)：利用前一帧末尾数据进行平滑过渡
                // 确保计算耗时 < 0.5ms，避免自噬风险
                for (let i = 0; i < 128; i++) {
                    const fade = i / 128;
                    outChannel[i] = (this.lastOutputData[i] * (1 - fade)) + (inChannel[i] * fade);
                    this.lastOutputData[i] = outChannel[i];
                }
            } else {
                // 正常拷贝
                for (let i = 0; i < 128; i++) {
                    outChannel[i] = inChannel[i];
                    this.lastOutputData[i] = inChannel[i];
                }
            }
        }

        return true;
    }
}

registerProcessor('monitor-processor', MonitorProcessor);
