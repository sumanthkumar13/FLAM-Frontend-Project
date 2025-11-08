# Performance Report — Real-Time System Monitoring Dashboard

## 1. Performance Architecture Overview

This dashboard renders real-time system metrics at high frequency using Next.js 14,
React, Web Workers, and OffscreenCanvas. A central goal during development was to make the interface feel “live” without stutters or frame drops, even under stress conditions. Through iterative tuning and profiling,the system now consistently maintains a 60 FPS rendering loop while handling more than
10,000 samples per metric

### 1.1 Design goals

- Maintain 60 FPS frame stability.
- Minimize main-thread CPU and DOM work.
- Support memory-efficient handling of 10,000+ samples per metric (ring buffers).

## 2. Data Pipeline

### 2.1 Data generation worker

All data originates from a dedicated worker that simulates continuous system load.
The worker emits a compact metric packet every 100 ms. Each sample includes the
following fields:

- CPU utilization (percentage)
- Memory consumption
- Disk read/write throughput
- Network upload/download speeds
- Temperature (simulated)

### 2.2 Broadcast mechanism

Samples are forwarded to the main application using a non-blocking postMessage
protocol. Example:

```js
postMessage({ type: "append", payload });
```

This approach keeps the UI thread from blocking on data production.

## 3. Rendering Pipeline

### 3.1 OffscreenCanvas renderer

Each chart type (line, area, bar, scatter, heatmap) is drawn in a background worker
using OffscreenCanvas. Key features:

- Custom requestAnimationFrame loop inside the worker
- Dynamic windowing (zoom/pan) without main-thread stalls
- Independent hit-testing for hover interactions
- Algorithms tuned for consistent frame times

### 3.2 Performance benefits

Off-main-thread rendering yields:

- No React re-renders during continuous animations
- Canvas draws do not trigger layout/style recalculations
- Consistent 60 FPS under expected loads
- Responsive UI for controls and interactions

## 4. Performance Controls

### 4.1 Time range

The viewport can be adjusted; table below shows sample counts for common ranges.

| Time range | Points rendered |
|------------|----------------:|
| 10s        |             100 |
| 1m         |             600 |
| 5m         |           3,000 |
| 1h         |           6,000 |

### 4.2 Resolution

Resolution is the number of raw data points accepted per 100 ms cycle. Typical
settings include 300 (normal), 1000 (heavy), and 5000 (stress).

### 4.3 Aggregation

Ingest-time bucket aggregation reduces per-frame computation. Buckets include: Raw
(100 ms), 1s, 5s, 10s. Each bucket produces statistical summaries such as
cpu_avg, cpu_min, cpu_max, memory_avg, memory_min, memory_max.

## 5. Virtualized Data Table

### 5.1 Design

The table uses virtualization and fixed row heights so that only ~20–40 rows are in
the DOM at once; index calculations are O(1). IntersectionObserver and
ResizeObserver help maintain correct boundaries. Scrolling remains fluid up to 50k
rows.

### 5.2 Layout integration

The table expands smoothly to full width when scrolled into view; side panels fold to
avoid layout shifts and preserve a polished UX.

## 6. System Performance Metrics

A performance card surfaces internal health metrics:

- Real-time FPS
- Frame render time
- Worker throughput (messages/sec)
- Approximate memory usage

These indicators were instrumental during tuning.

## 7. Memory Management

### 7.1 Ring buffers

All streams use fixed-size ring buffers (default max: 10,000 points) to keep memory
usage predictable; oldest samples auto-evict.

### 7.2 Worker memory stability

Verified properties:

- No per-frame array allocations in the renderer
- Aggregation buckets reset cleanly
- Virtual table capped at 50,000 rows

## 8. Next.js and React strategy

Client components provide controls and UI; heavy work runs in workers.

### 8.1 Optimizations

Key patterns used:

- useRef for stable canvas references
- useMemo for virtualization math
- useCallback for event handlers
- Avoid React state updates on continuous rendering paths

## 9. Stress test capabilities

High-resolution stress mode (5,000 pts / 100 ms) yields ~50,000 pts/sec input. The
system remains stable thanks to worker-based rendering and fixed ring buffers, though
memory pressure increases and the virtual table grows rapidly.

## 10. Performance targets (achieved)

| Target                                  | Status   |
|----------------------------------------|:--------:|
| 60 FPS real-time rendering              | Achieved |
| 10k+ point handling per metric          | Achieved |
| 100 ms update frequency                 | Achieved |
| Interactive zoom/pan without lag        | Achieved |
| Memory stability over long sessions     | Achieved |
| Virtual scrolling (50k rows)            | Achieved |
| Worker-based rendering engine           | Achieved |

## 11. Conclusion

Combining React for structure and Web Workers + OffscreenCanvas for rendering
enables a high-performance real-time telemetry dashboard that meets the stated
performance objectives.

---

## Appendix A — Original report (preserved)

The original technical write-up follows verbatim for traceability.

---

PERFORMANCE REPORT
Real-Time System Monitoring Dashboard
1 Performance Architecture Overview
This dashboard renders real-time system metrics at high frequency using Next.js 14,
React, Web Workers, and OffscreenCanvas. The system is engineered for 60 FPS frame
stability, low main-thread load, and memory-efficient handling of 10,000+ samples per
metric.

A central goal during development was to make the interface feel “live” without stutters or frame drops, even under stress conditions. Through iterative tuning and profiling,
the system now consistently maintains a 60 FPS rendering loop while handling more than
10,000 samples per metric.

2 Data Pipeline
2.1 Data Generation Worker
All data originates from a separate worker that simulates continuous system load. I designed this worker to behave similarly to how actual monitoring agents operate—pushing
a small packet of system metrics every 100 ms. Each sample contains fields such as:
• CPU utilization percentage
• Memory consumption
• Disk read/write throughput
• Network upload/download speeds
• Temperature values (simulated)

Although synthetic, this stream mimics real telemetry systems in both frequency and
structure. The main challenge was ensuring that the dashboard would remain smooth
regardless of how aggressively data was being produced.


2.2 Broadcast Mechanism
Every generated sample is sent to the main application through:
postMessage({ type: "append", payload })

1
This non-blocking communication approach ensures the UI thread never waits on
data generation. The worker simply emits the event, and the rendering worker picks it
up immediately for chart updates.


3 Rendering Pipeline
3.1 OffscreenCanvas Renderer
Each chart (line, area, bar, scatter plot, or heatmap) is drawn entirely in a background
worker using OffscreenCanvas. This means that none of the drawing work touches the
main thread. Throughout development, I gradually added the following features:
• A custom requestAnimationFrame loop inside the worker
• Dynamic windowing to support zooming and panning without lag
• Independent hit-testing for hover interactions
• Algorithms tuned for consistent frame times
Because all charts share one rendering model, the system remains predictable even as
features scale.

3.2 Performance Benefits
Shifting rendering off the main thread resulted in concrete improvements:
• No React re-renders during continuous animations
• Canvas operations do not trigger layout or style recalculations
• Frame rate remains locked at 60 FPS
• UI remains responsive (buttons, controls, scrolling)
This architecture is closer to how professional dashboards (Grafana, Datadog) handle
high-frequency visuals.

4 Performance Controls
4.1 Time Range
The viewport can be adjusted to show more or fewer points depending on the user’s focus.
This directly affects the number of samples the render worker must process per frame.

2
Time Range Points Rendered
10s 100
1m 600
5m 3000
1h 6000


4.2 Resolution
Resolution defines how many raw data points are accepted per 100 ms cycle. This slider
exists mainly for stress-testing:
• 300 (recommended normal load)
• 1000 (heavy load)
• 5000 (extreme stress test)


4.3 Aggregation
To avoid graphs updating too frequently, I implemented ingest-time bucket aggregation.
Instead of recalculating averages every frame, raw values are batched into fixed window
buckets:
• Raw (updates every 100 ms)
• 1s (one consolidated point per second)
• 5s
• 10s
Each bucket produces familiar statistical summaries:
cpu_avg, cpu_min, cpu_max,
memory_avg, memory_min, memory_max, ...
This ensures the charts remain stable and readable when zoomed out.


5 Virtualized Data Table
5.1 Design
I implemented a full virtualized scrolling table to display large volumes of historical
metrics. The challenge was to maintain smooth scrolling even with tens of thousands of
rows.

3
• Only around 20–40 rows are mounted in the DOM at any moment
• Fixed row height simplifies index calculations to O(1)
• IntersectionObserver and ResizeObserver help maintain proper boundaries
Testing showed that even at 50,000 rows, scrolling remained fluid and did not affect
chart rendering.

5.2 Smooth Layout Integration
A key UI decision was to let the table expand into full width only when the user scrolled
far enough down. The moment the table header reaches the viewport:
• Side panels smoothly fold or contract
• The central layout opens up for clarity
• There is no jumpy or sudden layout shift
This improves readability and gives the dashboard a polished feel.

6 System Performance Metrics
A dedicated performance card continuously displays the internal health of the dashboard:
• Real-time FPS (to catch frame drops early)
• Frame render time
• Worker throughput (messages per second)
• Approximate memory usage
This helped identify bottlenecks during development and tune the architecture accordingly.


7 Memory Management
7.1 Ring Buffers
To prevent uncontrolled memory growth, all metric streams use fixed-size ring buffers
(maximum 10,000 points). Once the limit is reached, old values are discarded automatically. This design keeps memory predictable even during hour-long runs.


4
7.2 Worker Memory Stability
I ensured through debugging that:
• No chart keeps allocating new arrays during every frame
• Aggregation buckets reset cleanly after completion
• Virtualized table uses a hard cap of 50,000 rows
The overall memory footprint remains well controlled.


8 Next.js and React Strategy
8.1 Architecture
The dashboard is composed of several Client Components, but all expensive computations
run outside React. The core strategy:
• Layout shells remain persistent across navigation
• Rendering workers absorb the CPU-heavy operations
• React is used only for controls, not animation loops


8.2 Performance Optimizations
Throughout development I relied heavily on:
• useRef for stable canvas references
• useMemo to avoid recalculations in virtualization
• useCallback for event handlers
• No React state updates inside continuous rendering paths
These choices were essential to keeping the UI lightweight.


8.3 No Chart Libraries
All charts are implemented from scratch—mathematical scaling, axes, color mapping,
drawing logic, and hit-testing. This gave complete freedom to optimize for the exact
behavior I needed.
5


9 Stress Test Capabilities
9.1 High-Resolution Mode
When the system is switched to 5000 points per 100 ms:
• The renderer receives 50,000 points per second
• Charts must handle rapid buffer updates
• The virtual table grows faster than usual
• Memory pressure increases significantly
Despite this, the system remains stable because of the worker-based pipeline and fixed
buffer limits.


10 Performance Targets
60 FPS real-time rendering Achieved
10k+ point handling per metric Achieved
100 ms update frequency Achieved
Interactive zoom/pan without lag Achieved
Memory stability over long sessions Achieved
Virtual scrolling (50k rows) Achieved
Worker-based rendering engine Achieved


11 Conclusion
By combining React for structure and Web Workers for heavy lifting, the project successfully achieves a balance between interactivity, performance, and visual clarity. The
architecture has proven reliable across different loads, preserves smooth frame rates, and
handles data gracefully through aggregation, virtualization, and efficient memory usage.
Overall, the architecture is robust, efficient, and production-grade for real-time telemetry dashboards.