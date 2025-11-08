"use client";

import { useEffect, useRef, useState } from "react";
import { MetricPoint } from "@/lib/dataGenerator";

type DiskBarChartProps = {
  metricKey?: keyof MetricPoint;
  color?: string;
  visiblePoints?: number;
};

export default function DiskBarChart({
  metricKey = "disk",
  color = "#f59e0b",
  visiblePoints = 300,
}: DiskBarChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartWorkerRef = useRef<Worker | null>(null);
  const dataWorkerRef = useRef<Worker | null>(null);

  const [current, setCurrent] = useState(0);
  const [minVal, setMinVal] = useState(0);
  const [maxVal, setMaxVal] = useState(0);
  const [avgVal, setAvgVal] = useState(0);

  // ✅ Tooltip
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    value: number | null;
    visible: boolean;
  }>({
    x: 0,
    y: 0,
    value: null,
    visible: false,
  });

  // ✅ WORKER INIT
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // --- Chart worker ---
    const chartWorker = new Worker(
      new URL("../../workers/chartWorker.ts", import.meta.url),
      { type: "module" }
    );
    chartWorkerRef.current = chartWorker;

    const offscreen = canvas.transferControlToOffscreen();

    chartWorker.postMessage(
      {
        type: "init",
        payload: {
          canvas: offscreen,
          options: {
            type: "bar",
            metricKey,
            color,
            visiblePoints,
          },
        },
      },
      [offscreen]
    );

    // --- Data worker ---
    const dataWorker = new Worker(
      new URL("../../workers/dataWorker.ts", import.meta.url),
      { type: "module" }
    );
    dataWorkerRef.current = dataWorker;

    dataWorker.postMessage({
      type: "init",
      payload: {
        pointCount: visiblePoints,
        updateInterval: 100,
        visiblePoints,
      },
    });

    dataWorker.onmessage = (e) => {
      if (e.data.type === "append") {
        chartWorker.postMessage({ type: "append", payload: e.data.payload });
      }
    };

    // --- Worker stats + tooltip ---
    chartWorker.onmessage = (e) => {
      const { type, payload } = e.data;
      if (type === "agg-stats") {
  document.dispatchEvent(new CustomEvent("agg-stats", { detail: payload }));
}


      if (type === "stats") {
        setCurrent(payload.current);
        setMinVal(payload.min);
        setMaxVal(payload.max);
        setAvgVal(payload.avg);
      }

      // ✅ Tooltip handler
      if (type === "tooltip") {
        if (!payload.visible) {
          setTooltip((t) => ({ ...t, visible: false }));
        } else {
          setTooltip({
            x: payload.screenX,
            y: payload.screenY,
            value:
              payload.values?.[metricKey] ??
              payload.data?.[metricKey] ??
              null,
            visible: true,
          });
        }
      }
    };

    // ✅ ✅ ✅ EXISTING ZOOM + PAN (UNCHANGED)
    const canvasEl = canvasRef.current!;
    let dragging = false;
    let lastX = 0;

    const onWheel = (ev: WheelEvent) => {
      if (!chartWorkerRef.current) return;
      const rect = canvasEl.getBoundingClientRect();
      const cursorX = ev.clientX - rect.left;

      chartWorkerRef.current.postMessage({
        type: "wheelZoom",
        payload: { deltaY: ev.deltaY, cursorX, canvasWidth: rect.width },
      });

      ev.preventDefault();
    };

    const onPointerDown = (ev: PointerEvent) => {
      dragging = true;
      lastX = ev.clientX;
      canvasEl.setPointerCapture?.(ev.pointerId);
    };

    const onPointerMove = (ev: PointerEvent) => {
      const rect = canvasEl.getBoundingClientRect();

      // ✅ NEW: Send pointer to worker for tooltip
      chartWorkerRef.current?.postMessage({
        type: "pointerMove",
        payload: {
          x: ev.clientX - rect.left,
          y: ev.clientY - rect.top,
          width: rect.width,
          height: rect.height,
        },
      });

      // ✅ existing drag → pan
      if (!dragging) return;
      const dx = ev.clientX - lastX;
      lastX = ev.clientX;

      chartWorkerRef.current?.postMessage({
        type: "panByPixels",
        payload: { dx, canvasWidth: rect.width },
      });
    };

    const onPointerUp = (ev: PointerEvent) => {
      dragging = false;
      canvasEl.releasePointerCapture?.(ev.pointerId);
    };

    const onPointerLeave = () => {
      // ✅ NEW: hide tooltip
      chartWorkerRef.current?.postMessage({ type: "pointerLeave" });
    };

    // attach
    canvasEl.addEventListener("wheel", onWheel, { passive: false });
    canvasEl.addEventListener("pointerdown", onPointerDown);
    canvasEl.addEventListener("pointermove", onPointerMove);
    canvasEl.addEventListener("pointerup", onPointerUp);
    canvasEl.addEventListener("pointerleave", onPointerLeave);

    return () => {
      chartWorker.terminate();
      dataWorker.terminate();

      canvasEl.removeEventListener("wheel", onWheel);
      canvasEl.removeEventListener("pointerdown", onPointerDown);
      canvasEl.removeEventListener("pointermove", onPointerMove);
      canvasEl.removeEventListener("pointerup", onPointerUp);
      canvasEl.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [metricKey, color, visiblePoints]);

  // ✅ Global controls (untouched)
  useEffect(() => {
    const handler = (e: any) => {
      if (!chartWorkerRef.current) return;

      const { timeWindowPoints, resolution, metrics, live } = e.detail;

      chartWorkerRef.current.postMessage({
        type: "setVisibleWindow",
        payload: timeWindowPoints,
      });

      chartWorkerRef.current.postMessage({
        type: "setResolution",
        payload: resolution,
      });

      chartWorkerRef.current.postMessage({
        type: "setEnabledMetrics",
        payload: metrics,
      });

      chartWorkerRef.current.postMessage({
        type: live ? "resume" : "pause",
      });
    };

    document.addEventListener("controls-change", handler);
    return () => document.removeEventListener("controls-change", handler);
  }, []);

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <canvas
        ref={canvasRef}
        width={900}
        height={260}
        style={{
          width: "100%",
          background: "#0a0a0a",
          border: "1px solid #222",
          display: "block",
        }}
      />

      {/* ✅ Tooltip overlay */}
      {tooltip.visible && (
        <div
          style={{
            position: "absolute",
            left: tooltip.x + 10,
            top: tooltip.y - 20,
            padding: "4px 8px",
            background: "#000",
            border: "1px solid #333",
            borderRadius: 4,
            pointerEvents: "none",
            whiteSpace: "nowrap",
            color,
            fontSize: 12,
          }}
        >
          {metricKey}: {(tooltip.value ?? 0).toFixed(0)} MB/s
        </div>
      )}

      {/* ✅ Stats overlay */}
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 12,
          background: "rgba(0,0,0,0.35)",
          padding: "8px 12px",
          borderRadius: 8,
          fontSize: 13.5,
          lineHeight: 1.45,
          backdropFilter: "blur(4px)",
        }}
      >
        <div style={{ color, fontWeight: 700, marginBottom: 2 }}>
          Disk Usage
        </div>

        <div style={{ color: "#e5e7eb" }}>
          Current: {(current ?? 0).toFixed(0)} MB/s
        </div>
        <div style={{ color: "#bbb" }}>
          Min: {(minVal ?? 0).toFixed(0)} MB/s
        </div>
        <div style={{ color: "#bbb" }}>
          Max: {(maxVal ?? 0).toFixed(0)} MB/s
        </div>
        <div style={{ color: "#bbb" }}>
          Avg: {(avgVal ?? 0).toFixed(0)} MB/s
        </div>
      </div>
    </div>
  );
}
