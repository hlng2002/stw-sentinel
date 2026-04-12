---
name: Audio-STW-Sentinel-MVP-Plan
overview: 规划实现 WebAudio V8 GC 停顿监控工具的 MVP。核心包括：无锁的 AudioWorklet 异常探测器、结合 PerformanceObserver 和 Canvas 的主线程可视化界面、引发 V8 停顿的压力测试函数，以及适配 Vercel 部署的安全头配置。
design:
  architecture:
    framework: html
  styleKeywords:
    - Industrial
    - Cyberpunk
    - Dashboard
    - Dark Mode
  fontSystem:
    fontFamily: Fira Code, Consolas, monospace
    heading:
      size: 24px
      weight: 700
    subheading:
      size: 16px
      weight: 600
    body:
      size: 14px
      weight: 400
  colorSystem:
    primary:
      - "#00FF41"
      - "#FF003C"
    background:
      - "#0D0D0D"
      - "#1A1A1A"
    text:
      - "#E0E0E0"
      - "#888888"
    functional:
      - "#FF003C"
      - "#00FF41"
      - "#F5A623"
todos:
  - id: create-processor
    content: 编写 processor.js 实现零内存分配的 AudioWorklet 和 SAB 通信
    status: completed
  - id: create-testbed
    content: 编写 index.html 实现 Canvas 可视化、GC 触发器与长任务对齐
    status: completed
    dependencies:
      - create-processor
  - id: setup-environment
    content: 生成 vercel.json 与本地 server.js 配置 COOP 和 COEP 安全策略
    status: completed
    dependencies:
      - create-testbed
---

## 产品概述

Audio-STW-Sentinel（音频 Stop-The-World 哨兵）是一个专门用于监测 WebAudio 环境下由 V8 引擎垃圾回收（GC）引起的主线程停顿现象的工业级实时探测器。

## 核心功能

- **原子化音频处理器**：运行在独立工作线程的 `AudioWorkletProcessor`，记录极小时间精度下连续 `process()` 调用的间隔（Delta）。
- **无锁无分配内存通信**：使用 `SharedArrayBuffer` 代替传统的 `postMessage` 进行线程间状态传递，消除通信机制本身导致的“观测者效应”和 GC 干扰。
- **混沌工程压力测试**：提供 `triggerGC()` 触发器，瞬间分配海量短生命周期对象诱导 V8 垃圾回收，复现主线程锁死场景。
- **高精度时间轴对齐**：使用 `PerformanceObserver` 监听主线程的 `longtask`，并与 Worklet 上报的异常 Delta 进行精确的时间点对齐。
- **实时波形可视化**：基于 Canvas 的实时渲染，绘制采样间隔时间曲线。当间隔大于理论阈值 `(128 / sampleRate) * 1.5` 时高亮标记为音频爆音（Glitch）。
- **跨域安全隔离环境支持**：提供 Vercel 部署配置及本地测试服务器配置，自动注入 COOP 和 COEP 请求头以激活高精度计时与 `SharedArrayBuffer` 权限。

## 技术栈

- 前端视图层：原生 HTML5 + Canvas API（避免框架层的 VDOM 计算和 GC 开销）
- 核心音频层：Web Audio API (AudioContext, AudioWorklet)
- 跨线程数据层：SharedArrayBuffer + Atomics（无锁环形缓冲区通信）
- 部署与本地服务：Node.js (`http` 模块) + Vercel 配置

## 技术架构设计

### 系统架构

系统由主线程（UI与调度）、音频线程（高优渲染）、和安全沙箱机制三部分组成，保持极简设计，拒绝一切非必要内存分配。

```mermaid
graph TD
    subgraph Main Thread [主线程 UI & Observer]
        UI[Canvas 可视化]
        GC[triggerGC 混沌测试]
        PerfObs[PerformanceObserver longtask]
        Reader[SAB 读取循环 requestAnimationFrame]
    end

    subgraph Audio Thread [音频渲染线程]
        Worklet[AudioWorkletProcessor]
        Writer[Atomics 写指针更新]
    end

    subgraph Memory [共享内存区]
        SAB[(SharedArrayBuffer RingBuffer)]
    end

    Worklet -- "1. 记录 Delta" --> Writer
    Writer -- "2. 无锁写入" --> SAB
    SAB -- "3. 无锁读取" --> Reader
    Reader -- "4. 渲染" --> UI
    PerfObs -- "对齐" --> UI
    GC -. "阻塞" .-> Main Thread
```

### 核心实现细节与约束

1. **Processor Kernel (`processor.js`)**：

- 严禁使用 `new`、`push` 及 `console.log`，彻底杜绝 Audio 线程内的垃圾回收和 IO 阻塞。
- 通过 `AudioWorkletProcessor` 侧高精度时间戳记录 Delta。

2. **测试台 (`index.html`)**：

- 包含激活按钮 `startAudio()`，初始化 `AudioContext` 并分配共享内存 `SharedArrayBuffer`。
- `triggerGC()`：执行 `let arr = new Array(1000000).fill({}); arr = null;`。

3. **安全上下文环境 (`vercel.json` & `server.js`)**：

- 必须通过设置 `Cross-Origin-Opener-Policy: same-origin` 和 `Cross-Origin-Embedder-Policy: require-corp` 来解除浏览器对 `SharedArrayBuffer` 和高精度 `performance.now()` 的禁用。

### 目录结构

```text
/
├── processor.js    # [NEW] AudioWorklet 核心逻辑，纯净且无内存分配，通过 SAB 传递 Delta。
├── index.html      # [NEW] 监控看板面板，包含 Canvas 可视化、PerformanceObserver 以及触发 GC 的按钮。
├── server.js       # [NEW] Node.js 简易静态服务器，强制注入 COOP/COEP Headers，用于本地调试。
└── vercel.json     # [NEW] Vercel 部署配置，确保线上环境携带正确的安全 Headers 以支持 SAB。
```

## 设计方案

由于这是一个性能极客和音频开发者的侦测工具，设计采用“工业控制台/赛博朋克”的深色硬核风格。注重数据可视化的高信噪比，移除多余的装饰，突出实时波形的跳变和爆音预警。

- 背景采用深邃暗色，突显工业仪表的质感。
- Canvas 渲染实时绿色的扫描线表示正常运作，红色尖峰（Spike）标识发生 STW 时的异常 Delta。
- 交互按钮提供真实的“物理仪表”按压感。