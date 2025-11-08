"use client";

import { useEffect, useRef, useState } from "react";
import { useDashboardControls } from "@/app/dashboard/DashboardControlsContext";

type NetworkStats = {
  current: number[];
  min: number;
  max: number;
};

export default function NetworkLineChart({
  downKey = "networkDown",
  upKey = "networkUp",
  colors = ["#00bfff", "#22c55e"],
  visiblePoints = 300,
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartWorkerRef = useRef<Worker | null>(null);
  const dataWorkerRef = useRef<Worker | null>(null);

  const { metrics } = useDashboardControls();
  const [stats, setStats] = useState<NetworkStats | null>(null);

  // ✅ Tooltip State
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    visible: boolean;
    down: number | null;
    up: number | null;
  }>({
    x: 0,
    y: 0,
    visible: false,
    down: null,
    up: null,
  });

  // ✅ WORKER INIT
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
            type: "line-multi",
            metricKeys: [downKey, upKey],
            colors,
            visiblePoints,
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


      if (type === "stats") {
        setStats(payload);
      }

      // ✅ Tooltip listener
      if (type === "tooltip") {
        if (!payload.visible) {
          setTooltip((t) => ({ ...t, visible: false }));
        } else {
          setTooltip({
            x: payload.screenX,
            y: payload.screenY,
            visible: true,
            down: payload.values?.[downKey] ?? null,
            up: payload.values?.[upKey] ?? null,
          });
        }
      }
    };

    // ✅ ✅ ✅ ZOOM + PAN (unchanged)
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

      // ✅ NEW: Tooltip pointer
      chartWorkerRef.current?.postMessage({
        type: "pointerMove",
        payload: {
          x: ev.clientX - rect.left,
          y: ev.clientY - rect.top,
          width: rect.width,
          height: rect.height,
        },
      });

      // ✅ PAN
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
      (ev.target as HTMLElement).releasePointerCapture?.(ev.pointerId);
    };

    const onPointerLeave = () => {
      chartWorkerRef.current?.postMessage({ type: "pointerLeave" });
    };

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
  }, []);

  // ✅ ✅ ✅ Option A — Same controls-change block as Line/Area/Bar/Scatter
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

  // ✅ Metric toggles → Worker
  useEffect(() => {
    chartWorkerRef.current?.postMessage({
      type: "setEnabledMetrics",
      payload: metrics,
    });
  }, [metrics]);

  const curDown = stats?.current?.[0] ?? 0;
  const curUp = stats?.current?.[1] ?? 0;

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <canvas
        ref={canvasRef}
        width={900}
        height={300}
        style={{
          width: "100%",
          background: "#0a0a0a",
          border: "1px solid #222",
          display: "block",
        }}
      />

      {/* ✅ Tooltip Overlay */}
      {tooltip.visible && (
        <div
          style={{
            position: "absolute",
            left: tooltip.x + 12,
            top: tooltip.y - 25,
            background: "#000",
            border: "1px solid #333",
            borderRadius: 4,
            padding: "4px 8px",
            fontSize: 12,
            color: "#fff",
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          <div style={{ color: colors[0] }}>
            ↓ {downKey}: {(tooltip.down ?? 0).toFixed(1)} MB/s
          </div>
          <div style={{ color: colors[1] }}>
            ↑ {upKey}: {(tooltip.up ?? 0).toFixed(1)} MB/s
          </div>
        </div>
      )}

      {/* ✅ Overlay */}
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
        <div style={{ color: colors[0], fontWeight: 700 }}>
          Network Usage
        </div>

        <div style={{ color: "#e5e7eb" }}>
          ↓ Down: {curDown.toFixed(1)} MB/s
        </div>
        <div style={{ color: "#e5e7eb" }}>
          ↑ Up: {curUp.toFixed(1)} MB/s
        </div>
      </div>
    </div>
  );
}
