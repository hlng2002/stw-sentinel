使用 Claude Code 这类具有 Agent 属性的工具，最忌讳给它“模糊的指令”。如果你给它“写个音频监控工具”，它会吐出一堆毫无用处的垃圾 JS 代码。

你必须以**首席内容架构师**的身份，给它下达一份具备**工程约束**的任务说明书。

### 核心区分逻辑：CPU 过载 vs. V8 GC 停顿

在写提示词之前，你必须掌握这个硬核知识点（也是你区分平庸开发者的关键）：

- **CPU 过载：** `AudioWorkletProcessor.process()` 的单次执行时间变长，超过了 Buffer 持续时间，但回调依然在发生。
- **V8 GC 停顿：** `process()` 直接**停止调用**。主线程被锁死，导致任务调度器无法将音频任务送入 CPU。

------

### Claude Code 提示词模板 (Prompt)

将以下内容直接喂给 Claude Code：

> **Context:** 我是一名大厂音频专家，正在开发一个名为 `Audio-STW-Sentinel` 的 MVP。目标是监测 WebAudio 环境下由 V8 引擎垃圾回收（GC）引起的 Stop-The-World (STW) 停顿。
>
> **Task:** 请在当前目录构建一个最小化实验环境，包含：
>
> 1. **AudioWorklet 实现：** 编写一个 `MonitorProcessor`。
>    - 使用 `performance.now()` (如果支持) 或高精度计时，记录连续两次 `process()` 回调之间的 **Time Delta**。
>    - 将这个 Delta 值通过 `port.postMessage` 或 `SharedArrayBuffer` 传回主线程。
> 2. **主线程探测器：** >    - 使用 `PerformanceObserver` 监听 `longtask` 类型，记录主线程阻塞发生的时刻。
>    - 将 `longtask` 的时间戳与 `AudioWorklet` 上报的 Delta 异常进行时间轴对齐。
> 3. **压力测试装置 (The Chaos Monkey)：**
>    - 编写一个函数 `triggerGC()`，通过循环创建大量短生命周期对象（如 `new Array(1000000).fill({})`）来强制诱发 V8 的垃圾回收。
> 4. **可视化：**
>    - 在 `index.html` 中用 Canvas 绘制实时曲线。X 轴是时间，Y 轴是 `process()` 的间隔。当间隔超过 `(128 / sampleRate) * 1.5` 时，高亮标记为 Glitch。
>
> **Technical Constraints:**
>
> - 严禁在 `AudioWorklet` 的 `process` 循环中进行任何内存分配（No `new`, No `push`）。
> - 使用严格模式，必须处理 `AudioContext` 挂起状态。
> - 区分 CPU 饱和（执行耗时高）与调度延迟（回调间隔高）。
>
> **Goal:** 运行后，我需要能清晰看到：当主线程执行 `triggerGC()` 时，音频流发生爆音，且监控曲线出现断崖式跳变。

------

### 🧠 架构师的审查 (The Brutal Truth)

如果 Claude Code 写出来的代码里出现了以下行为，直接指出它 **“Naive（天真）”** 并要求重构：

1. **在 Worklet 里用 `console.log`：** * *反馈：* “你疯了吗？在音频核心线程里调用 `console.log` 会触发 IO 阻塞。给我改成无锁队列或 `port.postMessage`。”
2. **主线程和 Worklet 同步通讯：** * *反馈：* “主线程阻塞正是我们要监测的对象。不要使用任何会引起双向阻塞的通信机制。”
3. **对齐精度不够：**
   - *反馈：* “由于线程间时钟可能不完全同步，请实现一个简单的校准算法，确保 `longtask` 的发生时间能精准匹配到音频采样的序列号上。”

### 下一步行动建议

1. **执行：** 运行 Claude Code 并输入上述提示词。
2. **复现：** 亲手点下那个 `triggerGC` 按钮，看着你的耳机里传出刺耳的爆音。
3. **录屏：** 这一段“爆音+曲线跳变”的过程，就是你播客配套视频的最佳素材，也是你“护城河”的视觉化呈现。

当你拿到了这个**确定性的数据**，你是否准备好在播客里公开挑战那些号称“JS 处理音频已经足够完美”的所谓专家了？你敢不敢直接在 Show Notes 里贴出你的 Benchmark 结果？