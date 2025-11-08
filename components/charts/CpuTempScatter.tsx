"use client";

import { useEffect, useRef, useState } from "react";
import { useDashboardControls } from "@/app/dashboard/DashboardControlsContext";

export default function CpuTempScatter() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartWorkerRef = useRef<Worker | null>(null);

  const { metrics } = useDashboardControls();

  // ✅ Tooltip State
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    cpu: number | null;
    temp: number | null;
    visible: boolean;
  }>({
    x: 0,
    y: 0,
    cpu: null,
    temp: null,
    visible: false,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // ✅ Chart worker
    const chartWorker = new Worker(
      new URL("../../workers/chartWorker.ts", import.meta.url),
      { type: "module" }
    );
    chartWorkerRef.current = chartWorker;

    const offscreen = canvas.transferControlToOffscreen();

    // ✅ Init scatter chart
    chartWorker.postMessage(
      {
        type: "init",
        payload: {
          canvas: offscreen,
          options: {
            type: "scatter-cpu-temp",
            metricKeys: ["cpu", "temperature"],
            colors: ["#00e0ff", "#ff4444"],
            visiblePoints: 300,
          },
        },
      },
      [offscreen]
    );

    // ✅ Forward CPU+temperature stream (external producer)
    const metricHandler = (e: any) => {
      chartWorker.postMessage({ type: "append", payload: e.detail });
    };

    document.addEventListener("metric-update", metricHandler);

    // ✅ Tooltip listener
    chartWorker.onmessage = (e) => {
      const { type, payload } = e.data;
      if (type === "agg-stats") {
  document.dispatchEvent(new CustomEvent("agg-stats", { detail: payload }));
}


      if (type === "tooltip") {
        if (!payload.visible) {
          setTooltip((t) => ({ ...t, visible: false }));
        } else {
          setTooltip({
            x: payload.screenX,
            y: payload.screenY,
            cpu: payload.values?.cpu ?? null,
            temp: payload.values?.temperature ?? null,
            visible: true,
          });
        }
      }
    };

    // ✅ Add pointer events for tooltip
    const canvasEl = canvasRef.current!;

    const onPointerMove = (ev: PointerEvent) => {
      const rect = canvasEl.getBoundingClientRect();

      chartWorkerRef.current?.postMessage({
        type: "pointerMove",
        payload: {
          x: ev.clientX - rect.left,
          y: ev.clientY - rect.top,
          width: rect.width,
          height: rect.height,
        },
      });
    };

    const onPointerLeave = () => {
      chartWorkerRef.current?.postMessage({ type: "pointerLeave" });
    };

    canvasEl.addEventListener("pointermove", onPointerMove);
    canvasEl.addEventListener("pointerleave", onPointerLeave);

    return () => {
      document.removeEventListener("metric-update", metricHandler);
      canvasEl.removeEventListener("pointermove", onPointerMove);
      canvasEl.removeEventListener("pointerleave", onPointerLeave);
      chartWorker.terminate();
    };
  }, []);

  // ✅ PATCH 4 — Forward metric toggles → Worker
  useEffect(() => {
    if (!chartWorkerRef.current) return;

    chartWorkerRef.current.postMessage({
      type: "setEnabledMetrics",
      payload: metrics,
    });
  }, [metrics]);

  // ✅ PATCH 3 — Full controls-change forwarding
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
        height={300}
        style={{
          width: "100%",
          background: "#000",
          border: "1px solid #222",
          display: "block",
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
            background: "#000",
            border: "1px solid #333",
            borderRadius: 4,
            pointerEvents: "none",
            whiteSpace: "nowrap",
            fontSize: 12,
            color: "#fff",
          }}
        >
          <div style={{ color: "#00e0ff" }}>
            CPU: {(tooltip.cpu ?? 0).toFixed(1)}%
          </div>
          <div style={{ color: "#ff4444" }}>
            Temp: {(tooltip.temp ?? 0).toFixed(1)}°C
          </div>
        </div>
      )}
    </div>
  );
}

