# Real-Time System Monitoring Dashboard

This project implements a real-time system performance dashboard built with Next.js 14.
It streams and visualizes live metrics using Web Workers and OffscreenCanvas to ensure stable rendering at high data volumes. The application is designed to maintain 60 FPS rendering, sub-100 ms interaction latency, and reliable performance when retaining more than 10,000 data points in memory.

---

## Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Data Generation & Model](#data-generation--model)
- [Controls (Time Range, Resolution, Aggregation)](#controls-time-range-resolution-aggregation)
- [Rendering & Windowing](#rendering--windowing)
- [Performance Targets](#performance-targets)
- [Measured Performance & How to Test](#measured-performance--how-to-test)
- [Setup & Run](#setup--run)
- [Project Structure](#project-structure)
- [Next.js / React / Canvas Optimizations](#nextjs--react--canvas-optimizations)
- [Browser Compatibility](#browser-compatibility)
---

## Overview

This app streams synthetic system metrics from a **data worker** to the UI and forwards them to dedicated **chart workers** that draw on **OffscreenCanvas**. Each chart keeps a sliding window of recent points and can optionally aggregate raw samples into time buckets (avg/min/max) for clarity at larger windows.

---

## Features

- **Real-time charts**: line, area, bar, heatmap, multi-line, and scatter.
- **60 FPS rendering** via OffscreenCanvas + workers.
- **Zoom & pan** on charts; hover tooltips with aggregated stats.
- **Time range** windowing in points (e.g., 10s, 1m, 5m, 1h).
- **Resolution** control to cap per-chart buffer size.
- **Aggregation** by bucket (ms) with `*_avg/_min/_max` fields.
- **Virtualized table** for large record sets.
- **Built-in performance monitor** (FPS, worker throughput).

---

## Architecture

### Pipeline

1. **Data Worker (`workers/dataWorker.ts`)**  
   Generates points at a fixed interval (`updateInterval`, e.g., 100 ms). Keeps a rolling buffer up to `visiblePoints`.
   - Sends `{ type: "append", payload: point }` to the main thread.

2. **Main Thread (Dashboard page)**  
   Receives points, updates a shared ring buffer, and **broadcasts** a `metric-update` `CustomEvent`.
   - Forwards controls via a `controls-change` event (time range, resolution, aggregation, live pause).

3. **Chart Workers (`workers/chartWorker.ts`)**  
   Listen for `metric-update`, maintain a per-chart buffer (bounded by per-chart `visiblePoints`), apply **windowing**, **zoom/pan**, and optional **aggregation** (`aggregationMs`), and draw with **OffscreenCanvas**.

4. **UI Components**  
   - Charts subscribe to events and forward data/controls to their workers.
   - Performance monitor shows FPS, worker throughput, and timing stats.
   - Virtualized table renders records efficiently.

### Threads

- **Main thread**: React UI, event dispatch, DOM updates.
- **Data worker**: generates the metric stream.
- **Chart workers**: one per chart type/instance (rendering only).

---

## Data Generation & Model

### Data Worker Init

The main thread starts the data worker:

```
new Worker(new URL("../../workers/dataWorker.ts", import.meta.url), { type: "module" });

worker.postMessage({
  type: "init",
  payload: { pointCount: 10000, updateInterval: 100, visiblePoints: 10000 }
});
```

**pointCount**: number of seed points generated at startup.  
**updateInterval** (ms): how often a new point is produced (e.g., 100 ms = 10 points/sec).  
**visiblePoints**: rolling size of the worker’s buffer (older points are shifted out).

### Point Shape

```
{
  timestamp: number,          // ms since epoch
  cpu: number,                 // %
  memory: number,              // MB or arbitrary units
  disk: number,                // throughput
  networkDown: number,         // Mbps (simulated)
  networkUp: number,           // Mbps (simulated)
  temperature: number          // °C (simulated physics)
}
```

### Aggregated Point Shape

When aggregation is enabled in a chart worker, each numeric key produces:

```
<key>_avg, <key>_min, <key>_max
```

The bucket’s timestamp is set to the end of the bucket (common in TS DBs).

---

## Controls (Time Range, Resolution, Aggregation)

Controls are provided via a context (`useDashboardControls`) and broadcast to all charts:

```
document.dispatchEvent(new CustomEvent("controls-change", {
  detail: { timeWindowPoints, resolution, metrics, live }
}));
```

### Time Range → Window Points

The page maps a time range to a number of points in a chart’s visible window:

```
const timeWindowPoints =
  timeRange === "10s" ? 100  :
  timeRange === "1m"  ? 600  :
  timeRange === "5m"  ? 3000 :
  /* "1h" */            6000 ;
```

Charts then show that many points (window) out of their local buffer.

### Resolution

“Resolution” caps each chart’s local buffer (not the visual window) via:

```
if (type === "setResolution") {
  visiblePoints = Math.max(50, payload | 0);
  if (buffer.length > visiblePoints) buffer = buffer.slice(-visiblePoints);
  maxWindow = Math.max(dynamicVisibleWindow, Math.min(visiblePoints, 36000));
}
```

If resolution is 5000, each chart keeps at most 5,000 recent points in its buffer.

The visible window (e.g., 300 points for “10s”) is a slice of that buffer.

### Aggregation

Aggregation groups the current window into buckets of aggregationMs:

Input: raw points in the current window.  
Output: array with *_avg/_min/_max per key, and bucket-end timestamp.  
Rendering uses *_avg keys by default (with min/max for tooltips).

---

## Rendering & Windowing

Each chart worker maintains:

- **buffer**: last N = resolution points (rolling).
- **windowPoints**: current visible window length (e.g., 300 for “10s”).
- **windowStart**: start index for pan/zoom.

Zoom focuses around the cursor anchor and eases towards a targetWindowPoints.  
Hover hit-testing maps pointer → buffer index (or nearest point in scatter).

---

## Performance Targets

- 60 FPS during real-time updates.
- < 100 ms response to interactions (zoom, pan, toggle metrics).
- Handle 10,000+ points in memory and chart workers without UI freezes.

These targets are met by:

- Offloading generation and drawing to workers.
- OffscreenCanvas rendering (no main-thread layout/paint for charts).
- Bounded buffers per chart (resolution).
- Optional aggregation for large windows.

---

## Measured Performance & How to Test

### Built-In Performance Monitor

Open the Worker Performance card in the UI:

- **FPS**: target ~60.  
- **Worker rate**: messages per second from the data worker.  
- **Timings**: frame time, draw time.

If worker rate shows 10 msg/s with updateInterval = 100 ms, that’s expected (10 points/sec per stream).  
To maintain 10,000 points, the system keeps a rolling buffer; it does not need 10,000 new points every second.

### Manual Profiling

- Chrome DevTools → Performance  
  Record while interacting (zoom/pan).  
  Ensure main-thread idle time stays high; chart drawing runs in workers.
- Chrome DevTools → Lighthouse (Desktop)  
  Validate interactivity and smoothness.

### Stress Test

- Increase page-level visiblePoints per chart (e.g., 10,000).
- Increase timeWindowPoints and enable aggregationMs (e.g., 100–500 ms).
- Confirm FPS ~60 and interactions < 100 ms.

---

## Setup & Run

```
# 1) Install
npm install

# 2) Dev server
npm run dev

# 3) Open in browser
# usually http://localhost:3000
```

Environment: Node 18+, modern Chromium/Firefox/Safari.

---

## Project Structure

```
app/
  dashboard/
    DashboardControlsContext.tsx
    page.tsx                # DashboardPage (wires data worker, broadcasts)
  components/
    charts/
      LineChart.tsx
      AreaChart.tsx
      DiskBarChart.tsx
      NetworkLineChart.tsx
    PerformanceMonitor.tsx
    MetricCard.tsx
    VirtualTableInline.tsx
    VirtualTableSection.tsx
    UseAutoOpenVirtualTableOnScrollEnd.tsx
hooks/
  useDataStreamTyped.ts
lib/
  ringBuffer.ts
  drawHelpers.ts            # drawLineChart/drawAreaChart/... (canvas)
workers/
  dataWorker.ts             # generates stream, rolling buffer in worker
  chartWorker.ts            # per-chart OffscreenCanvas rendering
public/
```

---

## Next.js / React / Canvas Optimizations

- App Router (Next.js 14).
- Client components only where needed ("use client").
- Web Workers for generation and rendering.
- OffscreenCanvas in workers to bypass main-thread painting.
- Event broadcasting (`CustomEvent`) to avoid prop drilling and re-renders.
- Bounded buffers (resolution) to cap memory & GC pressure.
- Virtualized table for large datasets.
- Throttled UI posts (e.g., aggregated stats at ~250 ms).

---

## Browser Compatibility

This dashboard relies on modern Web APIs such as Web Workers, OffscreenCanvas, ResizeObserver, and ES module–based workers.  
Because of this, browser support differs:

###  Fully Supported
- **Google Chrome (recommended)**
- **Microsoft Edge (Chromium)**

These browsers support OffscreenCanvas inside workers, enabling true 60 FPS rendering.

###  Partially Supported
- **Firefox** – Works, but OffscreenCanvas is not fully supported, so FPS may drop under load.
- **Safari (macOS/iOS)** – Lacks OffscreenCanvas; charts render on the main thread, reducing performance.

### Not Supported
- Internet Explorer

For the best performance during evaluation, Chrome is strongly recommended.




