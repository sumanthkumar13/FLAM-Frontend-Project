// lib/drawHelpers.ts

// Support BOTH normal + offscreen canvas
export type AnyCanvasCtx =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

// ------------------------------
// Line (used by CPU, fallback)
// ------------------------------
export function drawLineChart(
  ctx: AnyCanvasCtx,
  data: any[],
  metricKey: string,
  width: number,
  height: number,
  color = "#00ff88"
) {
  if (!ctx || !data || data.length < 2) return;

  const n = data.length;
  const min = Math.min(...data.map((d) => d[metricKey]));
  const max = Math.max(...data.map((d) => d[metricKey]));
  const safeMax = max === min ? min + 1 : max;

  const stepX = width / (n - 1);
  const scaleY = (v: number) =>
    height - ((v - min) / (safeMax - min)) * height;

  (ctx as any).clearRect(0, 0, width, height);

  ctx.beginPath();
  (ctx as any).strokeStyle = color;
  (ctx as any).lineWidth = 1.5;

  ctx.moveTo(0, scaleY(data[0][metricKey]));
  for (let i = 1; i < n; i++) {
    ctx.lineTo(i * stepX, scaleY(data[i][metricKey]));
  }
  (ctx as any).stroke();
}

// ------------------------------
// Area (used by Memory)
// ------------------------------
export function drawAreaChart(
  ctx: AnyCanvasCtx,
  data: any[],
  metricKey: string,
  width: number,
  height: number,
  color = "#00bfff"
) {
  if (!data || data.length < 2) return;

  const n = data.length;
  const min = Math.min(...data.map((d) => d[metricKey]));
  const max = Math.max(...data.map((d) => d[metricKey]));
  const safeMax = max === min ? min + 1 : max;

  const stepX = width / (n - 1);
  const scaleY = (v: number) =>
    height - ((v - min) / (safeMax - min)) * height;

  (ctx as any).clearRect(0, 0, width, height);

  const gradient = (ctx as CanvasRenderingContext2D).createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, color + "cc");
  gradient.addColorStop(1, color + "10");

  ctx.beginPath();
  ctx.moveTo(0, scaleY(data[0][metricKey]));
  for (let i = 1; i < n; i++) {
    ctx.lineTo(i * stepX, scaleY(data[i][metricKey]));
  }
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();

  (ctx as any).fillStyle = gradient;
  (ctx as any).fill();

  ctx.beginPath();
  (ctx as any).strokeStyle = color;
  (ctx as any).lineWidth = 1.4;
  ctx.moveTo(0, scaleY(data[0][metricKey]));
  for (let i = 1; i < n; i++) {
    ctx.lineTo(i * stepX, scaleY(data[i][metricKey]));
  }
  (ctx as any).stroke();
}

// ------------------------------
// Hybrid Cluster Bars (Disk)
//   – EMA smoothing to avoid jitter
//   – subtle trail (hybrid feel)
// ------------------------------
export function drawBarClusterChart(
  ctx: AnyCanvasCtx,
  data: any[],
  metricKey: string,
  width: number,
  height: number,
  color = "#f59e0b",   // amber for disk
  emaAlpha = 0.35      // smoothing (lower = smoother)
) {
  if (!data || data.length < 2) return;

  // Range & scale
  const series = data.map(d => Number(d[metricKey]) || 0);
  const min = Math.min(...series);
  const maxRaw = Math.max(...series);
  const max = maxRaw === min ? min + 1 : maxRaw;

  // Smooth with EMA to prevent “dancing”
  const smoothed: number[] = new Array(series.length);
  let ema = series[0];
  for (let i = 0; i < series.length; i++) {
    ema = emaAlpha * series[i] + (1 - emaAlpha) * ema;
    smoothed[i] = ema;
  }

  // Layout
  const n = smoothed.length;
  const gap = 1; // pixels between bars
  const barW = Math.max(1, Math.floor(width / n) - gap);
  const scaleY = (v: number) =>
    height - ((v - min) / (max - min)) * height;

  // Clear & subtle motion trail
  (ctx as any).globalAlpha = 0.9;
  (ctx as any).fillStyle = "rgba(0,0,0,0.28)";
  (ctx as any).fillRect(0, 0, width, height);
  (ctx as any).globalAlpha = 1;

  // Bars
  for (let i = 0; i < n; i++) {
    const x = i * (barW + gap);
    const y = scaleY(smoothed[i]);
    const h = Math.max(1, height - y);

    // gradient per bar (subtle)
    const g = (ctx as CanvasRenderingContext2D).createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, color + "cc");
    g.addColorStop(1, color + "33");

    (ctx as any).fillStyle = g;
    (ctx as any).fillRect(x, y, barW, h);
  }

  // Top highlight line (premium feel)
  (ctx as any).strokeStyle = color + "55";
  (ctx as any).lineWidth = 0.5;
  (ctx as any).beginPath();
  for (let i = 0; i < n; i++) {
    const xMid = i * (barW + gap) + barW / 2;
    const y = scaleY(smoothed[i]);
    if (i === 0) ctx.moveTo(xMid, y);
    else ctx.lineTo(xMid, y);
  }
  (ctx as any).stroke();
}
export function drawMultiLineChart(
  ctx: AnyCanvasCtx,
  data: any[],
  keys: string[],
  colors: string[],
  width: number,
  height: number,
  emaAlpha = 0.25,
  enabledMetrics?: Record<string, boolean>
) {
  if (!ctx || !data || data.length < 2 || keys.length === 0) return;

  // Compute shared min/max for consistent scaling
  let globalMin = Infinity;
  let globalMax = -Infinity;

  for (const k of keys) {
    if (enabledMetrics && enabledMetrics[k] === false) continue; // ✅ skip disabled
    for (let i = 0; i < data.length; i++) {
      const v = Number(data[i][k]) || 0;
      if (v < globalMin) globalMin = v;
      if (v > globalMax) globalMax = v;
    }
  }

  if (globalMax === globalMin) globalMax = globalMin + 1;

  const n = data.length;
  const stepX = width / (n - 1);
  const scaleY = (v: number) =>
    height - ((v - globalMin) / (globalMax - globalMin)) * height;

  (ctx as any).clearRect(0, 0, width, height);

  // ✅ draw each active metric
  for (let s = 0; s < keys.length; s++) {
    const k = keys[s];

    // ✅ skip disabled metrics
    if (enabledMetrics && enabledMetrics[k] === false) continue;

    const color = colors[s] ?? "#ffffff";

    // ✅ EMA smoothing
    let ema = Number(data[0][k]) || 0;
    const smoothed = new Array<number>(n);

    for (let i = 0; i < n; i++) {
      const raw = Number(data[i][k]) || 0;
      ema = emaAlpha * raw + (1 - emaAlpha) * ema;
      smoothed[i] = ema;
    }

    // ✅ Draw path
    (ctx as any).beginPath();
    (ctx as any).strokeStyle = color;
    (ctx as any).lineWidth = 1.6;

    (ctx as any).moveTo(0, scaleY(smoothed[0]));
    for (let i = 1; i < n; i++) {
      (ctx as any).lineTo(i * stepX, scaleY(smoothed[i]));
    }

    (ctx as any).stroke();
  }
}

export function drawScatterChart(
  ctx: AnyCanvasCtx,
  data: any[],
  xKey: string,
  yKey: string,
  width: number,
  height: number,
  dotColor = "#00e0ff"
) {
  if (!ctx || !data || data.length < 2) return;

  // Axes margins
  const margin = { left: 48, right: 16, top: 16, bottom: 36 };
  const w = width - margin.left - margin.right;
  const h = height - margin.top - margin.bottom;

  // Compute ranges
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;

  for (let i = 0; i < data.length; i++) {
    const x = Number(data[i][xKey]) || 0;
    const y = Number(data[i][yKey]) || 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (maxX === minX) maxX = minX + 1;
  if (maxY === minY) maxY = minY + 1;

  const scaleX = (v: number) => margin.left + ((v - minX) / (maxX - minX)) * w;
  const scaleY = (v: number) => margin.top + h - ((v - minY) / (maxY - minY)) * h;

  // Clear
  (ctx as any).clearRect(0, 0, width, height);

  // Grid (5x5)
  const gridLines = 5;
  (ctx as any).strokeStyle = "rgba(255,255,255,0.06)";
  (ctx as any).lineWidth = 1;

  (ctx as any).beginPath();
  for (let i = 0; i <= gridLines; i++) {
    const gx = margin.left + (i / gridLines) * w;
    (ctx as any).moveTo(gx, margin.top);
    (ctx as any).lineTo(gx, margin.top + h);
  }
  for (let j = 0; j <= gridLines; j++) {
    const gy = margin.top + (j / gridLines) * h;
    (ctx as any).moveTo(margin.left, gy);
    (ctx as any).lineTo(margin.left + w, gy);
  }
  (ctx as any).stroke();

  // Axes
  (ctx as any).strokeStyle = "rgba(255,255,255,0.18)";
  (ctx as any).lineWidth = 1.2;

  // X-axis
  (ctx as any).beginPath();
  (ctx as any).moveTo(margin.left, margin.top + h);
  (ctx as any).lineTo(margin.left + w, margin.top + h);
  (ctx as any).stroke();

  // Y-axis
  (ctx as any).beginPath();
  (ctx as any).moveTo(margin.left, margin.top);
  (ctx as any).lineTo(margin.left, margin.top + h);
  (ctx as any).stroke();

  // Dots
  (ctx as any).fillStyle = dotColor;
  const r = 2;
  for (let i = 0; i < data.length; i++) {
    const x = scaleX(Number(data[i][xKey]) || 0);
    const y = scaleY(Number(data[i][yKey]) || 0);
    (ctx as any).beginPath();
    (ctx as any).arc(x, y, r, 0, Math.PI * 2);
    (ctx as any).fill();
  }
}
export function drawHeatmapChart(
  ctx: AnyCanvasCtx,
  data: any[],
  width: number,
  height: number
) {
  if (!ctx || !data || data.length < 2) return;

  const temps = data.map((d) => d.temperature);
  const min = Math.min(...temps);
  const max = Math.max(...temps);

  const barWidth = Math.max(1, width / temps.length);

  (ctx as any).clearRect(0, 0, width, height);

  for (let i = 0; i < temps.length; i++) {
    const t = temps[i];
    const r = (t - min) / (max - min || 1);

    // ✅ Blue → Cyan → Green → Yellow → Red
    const color =
      r < 0.25
        ? `rgb(0, ${r * 4 * 255}, 255)`
        : r < 0.5
        ? `rgb(0, 255, ${255 - r * 2 * 255})`
        : r < 0.75
        ? `rgb(${(r - 0.5) * 4 * 255}, 255, 0)`
        : `rgb(255, ${255 - (r - 0.75) * 4 * 255}, 0)`;

    (ctx as any).fillStyle = color;
    (ctx as any).fillRect(i * barWidth, 0, barWidth, height);
  }
}
export function drawGridHeatmap(
  ctx: AnyCanvasCtx,
  data: any[],
  width: number,
  height: number,
  rows = 12,      // number of horizontal rows (temperature buckets)
  cols = 40       // number of columns (time slices)
) {
  if (!ctx || !data.length) return;

  // --- 1. Build grid ---
  const temps = data.map((d) => d.temperature);
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  const range = max - min || 1;

  // Reduce the time series to `cols` points
  const step = Math.max(1, Math.floor(temps.length / cols));
  const sampled = [];
  for (let i = 0; i < temps.length; i += step) {
    sampled.push(temps[i]);
  }
  while (sampled.length < cols) sampled.push(sampled[sampled.length - 1]);

  // --- 2. Draw grid ---
  (ctx as any).clearRect(0, 0, width, height);

  const cellW = width / cols;
  const cellH = height / rows;

  sampled.forEach((temp, c) => {
    const ratio = (temp - min) / range;
    const targetRow = Math.floor(ratio * (rows - 1));

    const color =
      ratio < 0.2
        ? `rgb(0,0,200)`
        : ratio < 0.4
        ? `rgb(0,150,255)`
        : ratio < 0.6
        ? `rgb(255,255,0)`
        : ratio < 0.8
        ? `rgb(255,150,0)`
        : `rgb(255,50,0)`;

    (ctx as any).fillStyle = color;
    (ctx as any).fillRect(
      c * cellW,
      height - (targetRow + 1) * cellH,
      cellW,
      cellH
    );
  });
}
export function drawScatterCpuTemp(
  ctx: OffscreenCanvasRenderingContext2D,
  view: any[],
  width: number,
  height: number,
  colors: string[]
) {
  const cpuColor = colors[0] ?? "#00e0ff";
  const tempColor = colors[1] ?? "#ff4444";

  const cpuVals = view.map((p) => p.cpu ?? 0);
  const tempVals = view.map((p) => p.temperature ?? 0);

  const cpuMin = Math.min(...cpuVals);
  const cpuMax = Math.max(...cpuVals);
  const tempMin = Math.min(...tempVals);
  const tempMax = Math.max(...tempVals);

  const cpuRange = Math.max(1e-6, cpuMax - cpuMin);
  const tempRange = Math.max(1e-6, tempMax - tempMin);

  ctx.clearRect(0, 0, width, height);

  for (let p of view) {
    const x = ((p.cpu - cpuMin) / cpuRange) * width;
    const y = height - ((p.temperature - tempMin) / tempRange) * height;

    ctx.fillStyle = cpuColor;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = tempColor;
    ctx.beginPath();
    ctx.arc(x + 4, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}





