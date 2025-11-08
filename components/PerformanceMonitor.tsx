"use client";

import { useEffect, useRef, useState } from "react";

// ✅ Keep window clean (no extra props now)
declare global {
  interface Window {}
}

export default function PerformanceMonitor() {
  const [fps, setFps] = useState(0);
  const [frameTime, setFrameTime] = useState("0.0");
  const [workerRate, setWorkerRate] = useState(0);
  const [memoryUsed, setMemoryUsed] = useState("0");

  const frameCount = useRef(0);
  const messageCount = useRef(0);

  const lastFpsTime = useRef(performance.now());
  const lastWorkerTime = useRef(performance.now());
  const lastFrameRender = useRef(performance.now());

  useEffect(() => {
    let animationId: number;

    // ✅ Count worker updates
    const handleWorkerMsg = () => {
      messageCount.current++;
    };
    document.addEventListener("metric-update", handleWorkerMsg);

    const update = () => {
      const now = performance.now();

      // ✅ Frame time calculation
      const ft = now - lastFrameRender.current;
      lastFrameRender.current = now;
      setFrameTime(ft.toFixed(1));

      // ✅ FPS calculation
      frameCount.current++;
      if (now - lastFpsTime.current >= 1000) {
        setFps(frameCount.current);
        frameCount.current = 0;
        lastFpsTime.current = now;
      }

      // ✅ Worker message rate
      if (now - lastWorkerTime.current >= 1000) {
        setWorkerRate(messageCount.current);
        messageCount.current = 0;
        lastWorkerTime.current = now;
      }

      // ✅ Memory usage (Chrome only)
      // @ts-ignore
      if (performance.memory) {
        // @ts-ignore
        const used = performance.memory.usedJSHeapSize / (1024 * 1024);
        setMemoryUsed(used.toFixed(1));
      }

      animationId = requestAnimationFrame(update);
    };

    update();

    return () => {
      cancelAnimationFrame(animationId);
      document.removeEventListener("metric-update", handleWorkerMsg);
    };
  }, []);

  return (
    <div
      style={{
        background: "rgba(0,0,0,0.6)",
        padding: "12px 16px",
        borderRadius: 8,
        color: "#00ff88",
        fontFamily: "monospace",
        border: "1px solid #00ff88",
        width: "100%",
      }}
    >
      <div>FPS: <strong>{fps}</strong></div>
      <div>Frame Time: <strong>{frameTime} ms</strong></div>
      <div>Worker Rate: <strong>{workerRate} msg/sec</strong></div>
      <div>Memory Used: <strong>{memoryUsed} MB</strong></div>
    </div>
  );
}
