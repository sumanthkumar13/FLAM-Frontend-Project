// app/cpu-vs-temperature/page.tsx
"use client";

import { useEffect, useRef } from "react";

export default function CpuVsTempPage() {
  // Correctly typed refs (outside useEffect)
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartWorkerRef = useRef<Worker | null>(null);
  const dataWorkerRef = useRef<Worker | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Prevent double offscreen transfers in StrictMode
    if ((canvas as any)._offscreenTransferred) return;
    (canvas as any)._offscreenTransferred = true;

    // 1) Start chart worker
    const chartWorker = new Worker(
      new URL("../../../workers/chartWorker.ts", import.meta.url),
      { type: "module" }
    );
    chartWorkerRef.current = chartWorker;

    const offscreen = (canvas as any).transferControlToOffscreen();

    chartWorker.postMessage(
      {
        type: "init",
        payload: {
          canvas: offscreen,
          options: {
            type: "scatter-cpu-temp",           // <- uses your worker's custom branch
            colors: ["#00e0ff", "#ff4444"],     // CPU blue, Temp red
            visiblePoints: 300,
          },
        },
      },
      [offscreen]
    );

    // 2) Start a LOCAL data worker for this page
    //    (so this page works even when dashboard isn't mounted)
    const dataWorker = new Worker(
      new URL("../../../workers/dataWorker.ts", import.meta.url),
      { type: "module" }
    );
    dataWorkerRef.current = dataWorker;

    dataWorker.postMessage({
      type: "init",
      payload: { pointCount: 300, updateInterval: 120, visiblePoints: 300 },
    });

    // 3) Pipe local data into chart worker
    dataWorker.onmessage = (e) => {
      const { type, payload } = e.data;
      if (type === "append") {
        chartWorker.postMessage({ type: "append", payload });
      }
    };

    // (No global metric-update listener here — this page is self-contained)

    return () => {
      chartWorker.terminate();
      dataWorker.terminate();
      chartWorkerRef.current = null;
      dataWorkerRef.current = null;
    };
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1 style={{ color: "#00ff88", marginBottom: 12 }}>
        CPU vs Temperature Scatter
      </h1>

      <a
        href="/dashboard"
        style={{
          display: "inline-block",
          marginBottom: 16,
          padding: "8px 16px",
          border: "1px solid #00ff88",
          color: "#00ff88",
          borderRadius: 6,
          textDecoration: "none",
        }}
      >
        ← Back to Dashboard
      </a>

      <canvas
        ref={canvasRef}
        width={1000}
        height={500}
        style={{
          width: "100%",
          background: "#0a0a0a",
          border: "1px solid #222",
          borderRadius: 8,
          display: "block",
        }}
      />
    </div>
  );
}
