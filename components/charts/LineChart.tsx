"use client";

import { useEffect, useRef, useState } from "react";
import { MetricPoint } from "@/lib/dataGenerator";

type LineChartProps = {
  metricKey: keyof MetricPoint;
  color?: string;
  visiblePoints?: number;
};

export default function LineChart({
  metricKey,
  color = "#00ff88",
  visiblePoints = 10000,
}: LineChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartWorkerRef = useRef<Worker | null>(null);
  const dataWorkerRef = useRef<Worker | null>(null);

  const [pointCount, setPointCount] = useState(0);
  const [fps, setFps] = useState(0);

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

  // ✅ WORKER INITIALIZATION
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
            type: "line",
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

    chartWorker.onmessage = (e) => {
      const { type, payload } = e.data;
      if (type === "agg-stats") {
  document.dispatchEvent(new CustomEvent("agg-stats", { detail: payload }));
}


      if (type === "count") setPointCount(payload);
      if (type === "fps") setFps(payload);

      // ✅ NEW: Tooltip message
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

    // ✅ ✅ ✅ Existing zoom/pan logic — UNTOUCHED
    const canvasEl = canvasRef.current!;
    let dragging = false;
    let lastX = 0;

    const onWheel = (ev: WheelEvent) => {
      if (!chartWorkerRef.current) return;
      const rect = (ev.target as HTMLCanvasElement).getBoundingClientRect();
      const cursorX = ev.clientX - rect.left;

      chartWorkerRef.current.postMessage({
        type: "wheelZoom",
        payload: {
          deltaY: ev.deltaY,
          cursorX,
          canvasWidth: rect.width,
        },
      });

      ev.preventDefault();
    };

    const onPointerDown = (ev: PointerEvent) => {
      dragging = true;
      lastX = ev.clientX;
      (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId);
    };

    const onPointerMove = (ev: PointerEvent) => {
      const rect = (ev.target as HTMLCanvasElement).getBoundingClientRect();

      // ✅ NEW: send pointer position for tooltip
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
      if (dragging) {
        const dx = ev.clientX - lastX;
        lastX = ev.clientX;

        chartWorkerRef.current?.postMessage({
          type: "panByPixels",
          payload: { dx, canvasWidth: rect.width },
        });
      }
    };

    const onPointerUp = (ev: PointerEvent) => {
      dragging = false;
      (ev.target as HTMLElement).releasePointerCapture?.(ev.pointerId);
    };

    const onPointerLeave = () => {
      chartWorkerRef.current?.postMessage({ type: "pointerLeave" });
    };

    // attach
    canvasEl.addEventListener("wheel", onWheel, { passive: false });
    canvasEl.addEventListener("pointerdown", onPointerDown);
    canvasEl.addEventListener("pointermove", onPointerMove);
    canvasEl.addEventListener("pointerup", onPointerUp);
    canvasEl.addEventListener("pointerleave", onPointerLeave);

    // cleanup
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

  // ✅ STEP 3 — global controls listener (kept as is)
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
        width={800}
        height={300}
        style={{
          border: "1px solid #222",
          background: "#0a0a0a",
          display: "block",
          width: "100%",
          transform: "translateZ(0)",
        }}
      />

      {/* ✅ Tooltip Overlay */}
      {tooltip.visible && (
        <div
          style={{
            position: "absolute",
            left: tooltip.x + 10,
            top: tooltip.y - 20,
            padding: "4px 8px",
            background: "#111",
            border: "1px solid #333",
            borderRadius: "4px",
            fontSize: "12px",
            color: "#0f0",
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          {metricKey}: {tooltip.value}
        </div>
      )}
    </div>
  );
}
