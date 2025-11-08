export {};

import {
  drawAreaChart,
  drawLineChart,
  drawMultiLineChart,
  drawHeatmapChart,
  drawGridHeatmap,
  drawScatterChart,
  drawScatterCpuTemp,
} from "../lib/drawHelpers";

// ================================================
// Worker State
// ================================================
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let width = 0;
let height = 0;

let options: any = {};
let metricKey = "cpu";
let metricKeys: string[] = [];
let colors: string[] = [];
let visiblePoints = 10000;
let chartType = "line";

let buffer: any[] = [];
let cachedMin = Infinity;
let cachedMax = -Infinity;
let isInitialized = false;

let enabledMetrics: Record<string, boolean> = {};
let isLive = true;

// -------- windowing --------
const DEFAULT_VISIBLE_WINDOW = 300;
let dynamicVisibleWindow = DEFAULT_VISIBLE_WINDOW;

// -------- zoom/pan --------
const MIN_WINDOW = 20;
let maxWindow = 36000;
let windowPoints = DEFAULT_VISIBLE_WINDOW;
let targetWindowPoints = DEFAULT_VISIBLE_WINDOW;
let windowStart = 0;
let followTail = true;
let lastPanAt = 0;
let lastAggPush = 0;
// --- Aggregation Stats Emit State ---


// Compute stats for current window
function computeWindowStats(view: any[], baseKeys: string[]) {
  const out: Record<string, { avg: number; min: number; max: number }> = {};
  for (const base of baseKeys) {
    const vals = view.map((d) => {
      const ak = `${base}_avg`; // aggregated version
      return (ak in d) ? d[ak] : (d[base] ?? 0);
    });
    if (vals.length === 0) continue;
    const sum = vals.reduce((a, b) => a + b, 0);
    const avg = sum / vals.length;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    out[base] = { avg, min, max };
  }
  return out;
}

// Send stats to UI (throttled)
function postAggStats(view: any[]) {
  const now = performance.now();
  if (now - lastAggPush < 250) return; // throttle
  lastAggPush = now;

  const bases = ["cpu","memory","disk","temperature","networkDown","networkUp"];
  const stats = computeWindowStats(view, bases);

  (self as any).postMessage({
    type: "agg-stats",
    payload: {
      bucketMs: aggregationMs,
      windowPoints: view.length,
      stats,
    },
  });
}

// -------- aggregation --------
let aggregationMs = 0; // 0 = raw; otherwise bucket size in ms

// -------- tooltip / hover --------
type TooltipOut = {
  visible: boolean;
  screenX: number;
  screenY: number;
  index?: number;
  data?: any;
  values?: Record<string, number>; // avg (for backward-compat)
  label?: string;
  aggr?: { avg?: Record<string, number>; min?: Record<string, number>; max?: Record<string, number> }; // NEW
};

let hoverActive = false;
let hoverScreenX = 0;
let hoverScreenY = 0;
let hoverCanvasW = 0;
let hoverCanvasH = 0;

// ================================================
// Pointer normalization
// ================================================
function normPointerX(): number {
  const scale = width / Math.max(1, hoverCanvasW || width);
  return hoverScreenX * scale;
}
function normPointerY(): number {
  const scale = height / Math.max(1, hoverCanvasH || height);
  return hoverScreenY * scale;
}

// ================================================
// Messages
// ================================================
self.onmessage = (e: MessageEvent) => {
  const { type, payload } = e.data;

  if (type === "init") {
    const { canvas, options: incoming } = payload;

    ctx = (canvas as OffscreenCanvas).getContext("2d");
    options = incoming;

    width = (canvas as OffscreenCanvas).width;
    height = (canvas as OffscreenCanvas).height;

    metricKey = options.metricKey;
    metricKeys = options.metricKeys ?? [];
    colors = options.colors ?? [];
    visiblePoints = options.visiblePoints ?? visiblePoints;
    chartType = options.type;

    buffer = [];
    cachedMin = Infinity;
    cachedMax = -Infinity;
    isInitialized = true;

    dynamicVisibleWindow = Math.max(MIN_WINDOW, options.visiblePoints ?? DEFAULT_VISIBLE_WINDOW);
    windowPoints = dynamicVisibleWindow;
    targetWindowPoints = dynamicVisibleWindow;
    maxWindow = Math.max(dynamicVisibleWindow, visiblePoints);

    requestAnimationFrame(loop);
    return;
  }

  if (type === "append") {
    buffer.push(payload);
    if (buffer.length > visiblePoints) buffer.shift();

    // update cached min/max for current metric(s) on raw stream (fine even if later aggregated)
    if (chartType === "line-multi") {
      metricKeys.forEach((k) => {
        const v = payload[k];
        if (v < cachedMin) cachedMin = v;
        if (v > cachedMax) cachedMax = v;
      });
    } else {
      const v = payload[metricKey];
      if (v < cachedMin) cachedMin = v;
      if (v > cachedMax) cachedMax = v;
    }

    if (isLive && followTail) {
      const wp = Math.round(windowPoints);
      windowStart = Math.max(0, buffer.length - wp);
    }
    return;
  }

  if (type === "setVisibleWindow") {
    dynamicVisibleWindow = Math.max(MIN_WINDOW, payload | 0);
    windowPoints = dynamicVisibleWindow;
    targetWindowPoints = dynamicVisibleWindow;
    maxWindow = Math.max(maxWindow, dynamicVisibleWindow);
    followTail = true;
    return;
  }

  if (type === "setEnabledMetrics") {
    enabledMetrics = payload || {};
    return;
  }

  if (type === "setResolution") {
    visiblePoints = Math.max(50, payload | 0);
    if (buffer.length > visiblePoints) buffer = buffer.slice(-visiblePoints);
    maxWindow = Math.max(dynamicVisibleWindow, Math.min(visiblePoints, 36000));
    return;
  }

  if (type === "setAggregation") {
    aggregationMs = Math.max(0, payload | 0);
    return;
  }

  if (type === "pause") {
    isLive = false;
    return;
  }
  if (type === "resume") {
    isLive = true;
    followTail = Date.now() - lastPanAt > 800;
    return;
  }
  if (type === "followTail") {
    followTail = true;
    return;
  }

  if (type === "wheelZoom") {
    const { deltaY, cursorX, canvasWidth } = payload as {
      deltaY: number;
      cursorX: number;
      canvasWidth: number;
    };

    const anchorRatio = Math.max(0, Math.min(1, cursorX / Math.max(1, canvasWidth)));
    const currentStart = windowStart;
    const currentWin = Math.max(MIN_WINDOW, Math.round(windowPoints));
    const anchorIndex = currentStart + Math.floor(anchorRatio * currentWin);

    const factor = Math.exp(-deltaY * 0.0015);
    const nextTarget = clamp(Math.round(currentWin * factor), MIN_WINDOW, maxWindow);
    targetWindowPoints = nextTarget;

    const newStart = clamp(
      anchorIndex - Math.floor(anchorRatio * nextTarget),
      0,
      Math.max(0, buffer.length - nextTarget)
    );
    windowStart = newStart;
    followTail = false;
    return;
  }

  if (type === "panByPixels") {
    const { dx, canvasWidth } = payload as { dx: number; canvasWidth: number };
    const wp = Math.max(MIN_WINDOW, Math.round(windowPoints));
    const pointsPerPixel = wp / Math.max(1, canvasWidth);
    const deltaPoints = Math.round(dx * pointsPerPixel) * -1;

    const maxStart = Math.max(0, buffer.length - wp);
    windowStart = clamp(windowStart + deltaPoints, 0, maxStart);

    followTail = false;
    lastPanAt = Date.now();
    return;
  }

  if (type === "pointerMove") {
    const { x, y, width: cw, height: ch } = payload;
    hoverActive = true;
    hoverScreenX = x;
    hoverScreenY = y;
    hoverCanvasW = cw;
    hoverCanvasH = ch;
    return;
  }

  if (type === "pointerLeave") {
    hoverActive = false;
    postTooltip({ visible: false, screenX: 0, screenY: 0 });
    return;
  }
};

// ================================================
// Render Loop (hover renders while paused)
// ================================================
function loop() {
  if (!isInitialized || !ctx) return;

  const ease = 0.18;
  windowPoints += (targetWindowPoints - windowPoints) * ease;
  windowPoints = clamp(windowPoints, MIN_WINDOW, maxWindow);

  if (isLive || hoverActive) drawFrame(buffer);

  requestAnimationFrame(loop);
}

// ================================================
// Frame
// ================================================
function drawFrame(data: any[]) {
  if (!ctx || !data.length) return;

  const wp = Math.max(MIN_WINDOW, Math.round(windowPoints));
  const maxStart = Math.max(0, data.length - wp);
  windowStart = clamp(windowStart, 0, maxStart);

  const start = windowStart;
  const end = start + wp;

  // Raw slice, then possibly aggregate
  let view = data.slice(start, end);
  if (aggregationMs > 0) {
    view = aggregateAvgMinMax(view, aggregationMs);
  }

  // ========= line-multi (e.g., Network) =========
  if (chartType === "line-multi") {
    // When aggregated, we render averages: key -> key_avg
    const renderKeys = metricKeys
      .filter((k) => enabledMetrics[k] !== false)
      .map((k) => (aggregationMs > 0 ? `${k}_avg` : k));
    const activeColors = colors.filter((_, i) => enabledMetrics[metricKeys[i]] !== false);

    drawMultiLineChart(ctx, view, renderKeys, activeColors, width, height, 0.25);

    if (hoverActive) {
      const sx = normPointerX();
      const sy = normPointerY();
      const baseKeys = metricKeys.filter((k) => enabledMetrics[k] !== false);
      const t = hitLineLike(view, renderKeys, width, height, sx, sy);
      drawCrosshairAndHighlight(t);
      postTooltip(toTooltipOutWithAggr(t, view, start, baseKeys));
    }

    // Stats (current avg values for active lines)
    const latestVals = renderKeys.map((k) => view[view.length - 1]?.[k] ?? 0);
    (self as any).postMessage({
      type: "stats",
      payload: { current: latestVals, min: cachedMin, max: cachedMax },
    });
    postAggStats(view);

    return;
  }

  // ========= heatmap =========
  if (chartType === "heatmap") {
    // If aggregated, temperature_avg is produced; drawHeatmapChart expects "temperature" -> lift avg
    if (aggregationMs > 0) {
      for (const d of view) {
        if (d.temperature_avg != null) d.temperature = d.temperature_avg;
      }
    }

    drawHeatmapChart(ctx, view, width, height);

    if (hoverActive) {
      const sx = normPointerX();
      const sy = normPointerY();
      const t = hitHeatmapSimple(view, width, height, sx, sy);
      drawCrosshairAndHighlight(t);
      postTooltip(toTooltipOutWithAggr(t, view, start, ["temperature"]));
    }

    (self as any).postMessage({
      type: "stats",
      payload: { current: view[view.length - 1]?.temperature ?? 0 },
    });
    postAggStats(view);

    return;
  }

  // ========= grid-heatmap =========
  if (chartType === "grid-heatmap") {
    if (aggregationMs > 0) {
      for (const d of view) {
        if (d.temperature_avg != null) d.temperature = d.temperature_avg;
      }
    }

    const cols = 12;
    const rows = 40;
    drawGridHeatmap(ctx, view, width, height, cols, rows);

    if (hoverActive) {
      const sx = normPointerX();
      const sy = normPointerY();
      const t = hitGridHeatmap(view, width, height, cols, rows, sx, sy);
      drawCrosshairAndHighlight(t);
      postTooltip(toTooltipOutWithAggr(t, view, start, ["temperature"]));
    }

    (self as any).postMessage({
      type: "stats",
      payload: { current: view[view.length - 1]?.temperature ?? 0 },
    });
    postAggStats(view);

    return;
  }

  // ========= scatter (generic x/y) =========
  if (chartType === "scatter") {
    const xKey = aggregationMs > 0 && view[0]?.[`${options.xKey}_avg`] != null ? `${options.xKey}_avg` : options.xKey;
    const yKey = aggregationMs > 0 && view[0]?.[`${options.yKey}_avg`] != null ? `${options.yKey}_avg` : options.yKey;

    drawScatterChart(ctx, view, xKey, yKey, width, height, options.color || "#00e0ff");

    if (hoverActive) {
      const sx = normPointerX();
      const sy = normPointerY();
      const t = hitScatter(view, xKey, yKey, width, height, sx, sy);
      drawCrosshairAndHighlight(t);
      postTooltip(toTooltipOutWithAggr(t, view, start, [options.xKey, options.yKey]));
    }

    const latest = view[view.length - 1] ?? {};
    (self as any).postMessage({
      type: "stats",
      payload: { x: latest[xKey], y: latest[yKey] },
    });
    postAggStats(view);

    return;
  }

  // ========= scatter-cpu-temp =========
  if (chartType === "scatter-cpu-temp") {
    // If aggregated, lift *_avg to base for drawing
    if (aggregationMs > 0) {
      for (const d of view) {
        if (d.cpu_avg != null) d.cpu = d.cpu_avg;
        if (d.temperature_avg != null) d.temperature = d.temperature_avg;
      }
    }

    drawScatterCpuTemp(ctx!, view, width, height, colors);

    if (hoverActive) {
      const sx = normPointerX();
      const sy = normPointerY();
      const t = hitScatter(view, "cpu", "temperature", width, height, sx, sy);
      drawCrosshairAndHighlight(t);
      postTooltip(toTooltipOutWithAggr(t, view, start, ["cpu", "temperature"]));
    }

    const latest = view[view.length - 1] ?? {};
    (self as any).postMessage({
      type: "stats",
      payload: { cpu: latest.cpu, temperature: latest.temperature },
    });
    postAggStats(view);

    return;
  }

  // ========= bar =========
  if (chartType === "bar") {
    // value accessor uses avg when available
    const n = view.length || 1;
    const vals = view.map((v) => val(v, metricKey));
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;

    ctx!.clearRect(0, 0, width, height);
    const bw = width / n;

    for (let i = 0; i < n; i++) {
      const v = vals[i];
      const scaled = (v - min) / range;
      const h = scaled * height;
      (ctx as any).fillStyle = colors[0] ?? "#ffaa00";
      ctx!.fillRect(i * bw, height - h, bw - 1, h);
    }

    if (hoverActive) {
      const sx = normPointerX();
      const t = hitBarWithAccessor(view, metricKey, width, height, sx);
      drawCrosshairAndHighlight(t);
      postTooltip(toTooltipOutWithAggr(t, view, start, [metricKey]));
    }

    const last = view[n - 1] ?? {};
    const avg = n ? vals.reduce((s, v) => s + v, 0) / n : 0;

    (self as any).postMessage({
      type: "stats",
      payload: { current: val(last, metricKey), min, max, avg },
    });
    postAggStats(view);

    return;
  }

  // ========= area =========
  if (chartType === "area") {
    const drawKey = aggregationMs > 0 ? `${metricKey}_avg` : metricKey;
    drawAreaChart(ctx!, view, drawKey, width, height, colors[0] ?? "#00bfff");

    if (hoverActive) {
      const sx = normPointerX();
      const sy = normPointerY();
      const t = hitLineLike(view, [drawKey], width, height, sx, sy);
      drawCrosshairAndHighlight(t);
      postTooltip(toTooltipOutWithAggr(t, view, start, [metricKey]));
    }

    (self as any).postMessage({
      type: "stats",
      payload: {
        current: view[view.length - 1]?.[drawKey] ?? 0,
        min: cachedMin,
        max: cachedMax,
      },
    });
    postAggStats(view);

    return;
  }
  // ========= simple line =========
if (chartType === "line") {
  const drawKey = aggregationMs > 0 ? `${metricKey}_avg` : metricKey;

  drawLineChart(ctx!, view, drawKey, width, height, colors[0] ?? "#00ff88");

  if (hoverActive) {
    const sx = normPointerX();
    const sy = normPointerY();

    const t = hitLineLike(view, [drawKey], width, height, sx, sy);
    drawCrosshairAndHighlight(t);
    postTooltip(toTooltipOutWithAggr(t, view, start, [metricKey]));
  }

  (self as any).postMessage({
    type: "stats",
    payload: {
      current: view[view.length - 1]?.[drawKey] ?? 0,
      min: cachedMin,
      max: cachedMax,
    },
  });

  postAggStats(view);
  return;
}

}
// ================================================
// Aggregation (avg + min + max) producing *_avg/_min/_max
// ================================================
function aggregateAvgMinMax(data: any[], bucketMs: number): any[] {
  if (!data.length || bucketMs <= 0) return data;

  const out: any[] = [];
  let s = 0;
  let bucketStart = data[0].timestamp ?? 0;

  for (let i = 0; i < data.length; i++) {
    const t = data[i].timestamp ?? 0;
    if (t - bucketStart >= bucketMs) {
      out.push(reduceBucket(data, s, i - 1));
      s = i;
      bucketStart = data[i].timestamp ?? t;
    }
  }
  if (s <= data.length - 1) out.push(reduceBucket(data, s, data.length - 1));

  return out;
}

function reduceBucket(arr: any[], s: number, e: number): any {
  const sample = arr[s];
  const keys = Object.keys(sample);
  const acc: any = {};
  const count = Math.max(1, e - s + 1);

  // timestamp: choose end of bucket (common in TS dbs)
  acc.timestamp = arr[e].timestamp ?? arr[s].timestamp ?? 0;

  for (const k of keys) {
    if (k === "timestamp") continue;
    // collect numeric series
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    for (let i = s; i <= e; i++) {
      const v = +((arr[i][k] ?? 0) as number);
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
    }
    const avg = sum / count;

    // output *_avg/_min/_max
    acc[`${k}_avg`] = avg;
    acc[`${k}_min`] = isFinite(min) ? min : 0;
    acc[`${k}_max`] = isFinite(max) ? max : 0;
  }

  return acc;
}

// ================================================
// Hit-testing (uses supplied keys; pass *_avg for aggregated renders)
// ================================================
type Hit =
  | { kind: "none" }
  | {
      kind: "point";
      screenX: number;
      screenY: number;
      index: number;
      values: Record<string, number>; // avg chosen for render key(s)
      label?: string;
    }
  | {
      kind: "bar";
      screenX: number;
      screenY: number;
      index: number;
      values: Record<string, number>; // avg chosen
      barRect: { x: number; y: number; w: number; h: number };
      label?: string;
    };

// For line-like, we pass the actual render keys (already *_avg in agg mode)
function hitLineLike(
  view: any[],
  renderKeys: string[],
  w: number,
  h: number,
  sx: number,
  sy: number
): Hit {
  const n = view.length;
  if (!n) return { kind: "none" };

  const idx = clamp(Math.round((sx / Math.max(1, w)) * (n - 1)), 0, n - 1);

  let bestKey = renderKeys[0];
  let bestDist = Infinity;
  let bestSy = 0;

  for (const k of renderKeys) {
    const vals = view.map((v) => v[k] ?? 0);
    const vmin = Math.min(...vals);
    const vmax = Math.max(...vals);
    const vr = Math.max(1e-6, vmax - vmin);
    const y = height - ((view[idx][k] - vmin) / vr) * h;
    const dist = Math.abs(sy - y);
    if (dist < bestDist) {
      bestDist = dist;
      bestKey = k;
      bestSy = y;
    }
  }

  const sxIdx = (idx / Math.max(1, n - 1)) * w;
  const values: Record<string, number> = {};
  for (const k of renderKeys) values[k] = view[idx][k] ?? 0;

  return {
    kind: "point",
    screenX: sxIdx,
    screenY: bestSy,
    index: idx,
    values,
    label: formatLabel(view[idx]),
  };
}

// Bar with accessor (avg in agg mode)
function hitBarWithAccessor(
  view: any[],
  key: string,
  w: number,
  h: number,
  sx: number
): Hit {
  const n = view.length;
  if (!n) return { kind: "none" };

  const bw = w / n;
  const idx = clamp(Math.floor(sx / Math.max(1e-6, bw)), 0, n - 1);

  const vals = view.map((v) => val(v, key));
  const vmin = Math.min(...vals);
  const vmax = Math.max(...vals);
  const vr = Math.max(1e-6, vmax - vmin);

  const value = vals[idx];
  const barH = ((value - vmin) / vr) * h;

  const x = idx * bw;
  const y = h - barH;

  return {
    kind: "bar",
    screenX: x + bw / 2,
    screenY: y,
    index: idx,
    values: { [key]: value },
    barRect: { x, y, w: Math.max(1, bw - 1), h: barH },
    label: formatLabel(view[idx]),
  };
}

function hitScatter(
  view: any[],
  xKey: string,
  yKey: string,
  w: number,
  h: number,
  sx: number,
  sy: number
): Hit {
  const n = view.length;
  if (!n) return { kind: "none" };

  const xs = view.map((v) => v[xKey] ?? 0);
  const ys = view.map((v) => v[yKey] ?? 0);
  const xmin = Math.min(...xs);
  const xmax = Math.max(...xs);
  const ymin = Math.min(...ys);
  const ymax = Math.max(...ys);
  const xr = Math.max(1e-6, xmax - xmin);
  const yr = Math.max(1e-6, ymax - ymin);

  let best = -1;
  let bestD = Infinity;
  let bestSX = 0;
  let bestSY = 0;

  for (let i = 0; i < n; i++) {
    const px = ((xs[i] - xmin) / xr) * w;
    const py = h - ((ys[i] - ymin) / yr) * h;
    const dx = px - sx;
    const dy = py - sy;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD) {
      bestD = d2;
      best = i;
      bestSX = px;
      bestSY = py;
    }
  }

  if (best < 0) return { kind: "none" };
  return {
    kind: "point",
    screenX: bestSX,
    screenY: bestSY,
    index: best,
    values: { [xKey]: xs[best], [yKey]: ys[best] },
    label: formatLabel(view[best]),
  };
}

// Simple heatmap hover: map column to index (uses temperature—already lifted to avg on agg)
function hitHeatmapSimple(view: any[], w: number, h: number, sx: number, _sy: number): Hit {
  const n = view.length;
  if (!n) return { kind: "none" };
  const idx = clamp(Math.round((sx / Math.max(1, w)) * (n - 1)), 0, n - 1);
  const val = view[idx]?.temperature ?? 0;

  return {
    kind: "point",
    screenX: (idx / Math.max(1, n - 1)) * w,
    screenY: h / 2,
    index: idx,
    values: { temperature: val },
    label: formatLabel(view[idx]),
  };
}

function hitGridHeatmap(
  view: any[],
  w: number,
  h: number,
  cols: number,
  rows: number,
  sx: number,
  sy: number
): Hit {
  const cw = w / cols;
  const rh = h / rows;

  const col = clamp(Math.floor(sx / Math.max(1e-6, cw)), 0, cols - 1);
  const row = clamp(Math.floor(sy / Math.max(1e-6, rh)), 0, rows - 1);

  const n = view.length;
  const idx = clamp(Math.round((col / Math.max(1, cols - 1)) * (n - 1)), 0, n - 1);
  const val = view[idx]?.temperature ?? 0;

  return {
    kind: "bar",
    screenX: col * cw + cw / 2,
    screenY: row * rh,
    index: idx,
    values: { temperature: val, row, col },
    barRect: { x: col * cw, y: row * rh, w: cw, h: rh },
    label: formatLabel(view[idx]),
  };
}
function postTooltip(p: TooltipOut) {
  (self as any).postMessage({ type: "tooltip", payload: p });
}
// ================================================
// Overlay & Tooltip packaging
// ================================================
function drawCrosshairAndHighlight(hit: Hit) {
  if (!ctx || hit.kind === "none") return;

  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.4)";

  // vertical line
  ctx.beginPath();
  ctx.moveTo(hit.screenX + 0.5, 0);
  ctx.lineTo(hit.screenX + 0.5, height);
  ctx.stroke();

  if (hit.kind === "point") {
    // horizontal line + dot
    ctx.beginPath();
    ctx.moveTo(0, hit.screenY + 0.5);
    ctx.lineTo(width, hit.screenY + 0.5);
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.arc(hit.screenX, hit.screenY, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (hit.kind === "bar") {
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    const r = hit.barRect;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, Math.max(0, r.w - 1), Math.max(0, r.h - 1));
  }

  ctx.restore();
}

// Build tooltip payload including aggregated min/max if present
function toTooltipOutWithAggr(hit: Hit, view: any[], startIndex: number, baseKeys: string[]): TooltipOut {
  if (hit.kind === "none") return { visible: false, screenX: 0, screenY: 0 };

  const idx = hit.index ?? 0;
  const row = view[idx] ?? {};

  // values (avg) — keep backward compatible
  const avgValues: Record<string, number> = {};
  const minValues: Record<string, number> = {};
  const maxValues: Record<string, number> = {};

  for (const base of baseKeys) {
    // what did we render for this key?
    // if aggregated: avg lives in `${base}_avg`, else raw `base`
    avgValues[base] = val(row, base);
    const mn = row[`${base}_min`];
    const mx = row[`${base}_max`];
    if (mn != null) minValues[base] = mn;
    if (mx != null) maxValues[base] = mx;
  }

  const out: TooltipOut = {
    visible: true,
    screenX: clamp(hit.screenX, 0, width),
    screenY: clamp(hit.screenY, 0, height),
    index: startIndex + idx,
    data: row,
    values: avgValues, // avg in the existing "values" slot (non-breaking)
    label: formatLabel(row),
    aggr: { avg: avgValues, min: Object.keys(minValues).length ? minValues : undefined, max: Object.keys(maxValues).length ? maxValues : undefined },
  };
  return out;
}

// ================================================
/** Access a metric value respecting aggregation (returns avg when aggregated) */
function val(d: any, key: string): number {
  if (!d) return 0;
  const avgKey = `${key}_avg`;
  if (avgKey in d) return d[avgKey];
  return d[key] ?? 0;
}

// ================================================
// Utils
// ================================================
function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function formatLabel(d: any) {
  const t = d?.timestamp;
  if (typeof t === "number") return String(t);
  return "";
}
// current code end
