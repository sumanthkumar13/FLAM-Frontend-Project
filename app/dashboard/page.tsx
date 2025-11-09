"use client";

import { useEffect, useRef } from "react";
import { appendPoint } from "@/lib/ringBuffer";
import { useDataStreamTyped } from "@/hooks/useDataStreamTyped";

import DiskBarChart from "@/components/charts/DiskBarChart";
import AreaChart from "@/components/charts/AreaChart";
import LineChart from "@/components/charts/LineChart";
import PerformanceMonitor from "@/components/PerformanceMonitor";
import NetworkLineChart from "@/components/charts/NetworkLineChart";
import { useDashboardControls } from "./DashboardControlsContext";
import UseAutoOpenVirtualTableOnScrollEnd from "@/components/UseAutoOpenVirtualTableOnScrollEnd";
import VirtualTableSection from "@/components/VirtualTableSection";
import VirtualTableInline from "@/components/VirtualTableInline";

import MetricCard from "./components/MetricCard";

export default function DashboardPage() {
  const dataWorkerRef = useRef<Worker | null>(null);
  const { bufferRef } = useDataStreamTyped();

  // ✅ Controls (from right panel context)
  const { timeRange, resolution, metrics, live } = useDashboardControls();

  // Keep latest "live" in a ref so onmessage sees updates
  const liveRef = useRef(live);
  useEffect(() => {
    liveRef.current = live;
  }, [live]);

  // ✅ Map timeRange to visible window size (points)
  const timeWindowPoints =
    timeRange === "10s" ? 100 :
    timeRange === "1m"  ? 600 :
    timeRange === "5m"  ? 3000 :
    /* "1h" */            6000;

  // ✅ Broadcast control changes so ALL charts can react
  useEffect(() => {
    document.dispatchEvent(
      new CustomEvent("controls-change", {
        detail: {
          timeWindowPoints,
          resolution,
          metrics,
          live,
        },
      })
    );
  }, [timeRange, resolution, metrics, live]);
    const sentinelRef = useRef<HTMLDivElement | null>(null);

  // when sentinel enters viewport -> open table (add class on middle panel)
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const middle = document.querySelector(".middle-panel");
    if (!middle) return;

    const io = new IntersectionObserver(
      (entries) => {
        const ent = entries[0];
        if (ent.isIntersecting) {
          middle.classList.add("vt-open");
        } else {
          middle.classList.remove("vt-open");
        }
      },
      { root: null, threshold: 0.1 }
    );

    io.observe(el);
    return () => io.disconnect();
  }, []);


  // ✅ Worker setup
  useEffect(() => {
    const worker = new Worker(
      new URL("../../workers/dataWorker.ts", import.meta.url),
      { type: "module" }
    );
    dataWorkerRef.current = worker;

    worker.postMessage({
      type: "init",
      payload: { pointCount: 10000, updateInterval: 100, visiblePoints: 10000 },
    });

    worker.onmessage = (e) => {
      const { type, payload } = e.data;
      if (type === "append") {
        // If paused → don’t mutate buffer or notify charts
        if (!liveRef.current) return;

        if (bufferRef.current) appendPoint(bufferRef.current, payload);

        // ✅ Broadcast to all charts (they forward to their chartWorkers)
        document.dispatchEvent(
          new CustomEvent("metric-update", { detail: payload })
        );
      }
    };

    return () => worker.terminate();
  }, [bufferRef]);

  return (
    <>
      {/* Dashboard Title */}
      <h1
        style={{
          fontSize: "26px",
          fontWeight: 700,
          marginBottom: 6,
          color: "#00ff88",
        }}
      >
        System Monitoring Dashboard
      </h1>

      <p style={{ color: "#9ca3af", marginBottom: 26 }}>
        Real-time metrics streamed from worker threads for accurate live
        monitoring.
      </p>

      {/* ✅ CPU Usage */}
      <MetricCard
        title="CPU Usage"
        description="Tracks real-time CPU utilization across all cores."
      >
        <LineChart metricKey="cpu" color="#00e0ff" visiblePoints={10000} />
      </MetricCard>

      {/* ✅ Memory Usage */}
      <MetricCard
        title="Memory Usage"
        description="Shows real-time RAM consumption (8GB – 16GB)."
      >
        <AreaChart metricKey="memory" color="#00bfff" visiblePoints={10000} />
      </MetricCard>

      {/* ✅ Disk I/O */}
      <MetricCard
        title="Disk Activity"
        description="Read/write throughput over time (smoothed, real-time)."
      >
        <DiskBarChart metricKey="disk" color="#f59e0b" visiblePoints={10000} />
      </MetricCard>

      {/* ✅ Network */}
      <MetricCard
        title="Network Usage (Download / Upload)"
        description="Real-time network throughput, smoothed. Downlink (blue) and uplink (green)."
      >
        <NetworkLineChart />
      </MetricCard>

      {/* ✅ Bottom: Performance Monitor */}
      <MetricCard
        title="Worker Performance"
        description="FPS, worker speed, and offscreen canvas sync performance."
      >
        <PerformanceMonitor />
      </MetricCard>
       <div ref={sentinelRef} style={{ height: 1 }} />
       <VirtualTableInline />

    </>
  );
}
