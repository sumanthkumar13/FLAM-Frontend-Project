"use client";

import { useEffect, useRef, useState } from "react";
import { useDashboardControls } from "@/app/dashboard/DashboardControlsContext";

export default function TemperatureHeatmap() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartWorkerRef = useRef<Worker | null>(null);
  const dataWorkerRef = useRef<Worker | null>(null);

  const { metrics } = useDashboardControls();

  const [temp, setTemp] = useState(0);

  // ✅ Tooltip state
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

    // Chart worker
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
            type: "grid-heatmap",
            visiblePoints: 300,
            metricKey: "temperature",
          },
        },
      },
      [offscreen]
    );

    // Data worker
    const dataWorker = new Worker(
      new URL("../../workers/dataWorker.ts", import.meta.url),
      { type: "module" }
    );
    dataWorkerRef.current = dataWorker;

    dataWorker.postMessage({
      type: "init",
      payload: {
        pointCount: 300,
        updateInterval: 150,
        visiblePoints: 300,
      },
    });

    // Forward data → chart worker
    dataWorker.onmessage = (e) => {
      if (e.data.type === "append") {
        chartWorker.postMessage({ type: "append", payload: e.data.payload });
      }
    };

    // Stats + tooltip
    chartWorker.onmessage = (e) => {
      const { type, payload } = e.data;
      if (type === "agg-stats") {
  document.dispatchEvent(new CustomEvent("agg-stats", { detail: payload }));
}


      if (type === "stats") {
        setTemp(payload.current);
      }

      if (type === "tooltip") {
        if (!payload.visible) {
          setTooltip((t) => ({ ...t, visible: false }));
        } else {
          setTooltip({
            x: payload.screenX,
            y: payload.screenY,
            value: payload.values?.temperature ?? null,
            visible: true,
          });
        }
      }
    };

    // ✅ Tooltip pointer events
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
      canvasEl.removeEventListener("pointermove", onPointerMove);
      canvasEl.removeEventListener("pointerleave", onPointerLeave);
      chartWorker.terminate();
      dataWorker.terminate();
    };
  }, []);

  // ✅ Forward metric toggles → worker
  useEffect(() => {
    chartWorkerRef.current?.postMessage({
      type: "setEnabledMetrics",
      payload: metrics,
    });
  }, [metrics]);

  // ✅ DASHBOARD CONTROLS → WORKER
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
  <div
    style={{
      position: "relative",
      width: "100%",
      height: "100%",
      zIndex: 9999,            // ✅ FIX: ensures tooltip stays above right panel
    }}
  >
    {/* Heatmap Canvas */}
    <canvas
      ref={canvasRef}
      width={250}
      height={400}
      style={{
        width: "100%",
        height: "100%",
        borderRadius: "12px",
        background: "rgba(0,0,0,0.15)",
      }}
    />

    {/* ✅ Tooltip Overlay */}
    {tooltip.visible && (
      <div
        style={{
          position: "absolute",
          left: tooltip.x + 10,
          top: tooltip.y - 20,
          zIndex: 9999,         // ✅ Always above everything
          padding: "4px 8px",
          background: "#000",
          border: "1px solid #333",
          borderRadius: 4,
          color: "#fff",
          fontSize: 12,
          pointerEvents: "none",
          whiteSpace: "nowrap",
        }}
      >
        Temp: {(tooltip.value ?? 0).toFixed(1)}°C
      </div>
    )}

    {/* Gradient legend */}
    <div
      style={{
        position: "absolute",
        bottom: 6,
        left: 10,
        fontSize: 12,
        color: "#ccc",
        display: "flex",
        alignItems: "center",
        gap: 8,
        zIndex: 9999,          // ✅ Legend must stay above panels too
      }}
    >
      <span>Cool</span>
      <div
        style={{
          flex: 1,
          height: 6,
          borderRadius: 4,
          zIndex: 9999,
          background:
            "linear-gradient(to right, #00f, #0ff, #0f0, #ff0, #f00)",
        }}
      />
      <span>Hot</span>
    </div>
  </div>
);

}
