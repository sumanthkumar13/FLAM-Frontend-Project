"use client";

import { createContext, useContext, useState, useEffect } from "react";

type TimeRange = "10s" | "1m" | "5m" | "1h";
type Resolution = 300 | 1000 | 10000;

export type MetricsState = {
  cpu: boolean;
  memory: boolean;
  disk: boolean;
  network: boolean;  
};

type DashboardControls = {
  timeRange: TimeRange;
  setTimeRange: (t: TimeRange) => void;

  resolution: Resolution;
  setResolution: (r: Resolution) => void;

  metrics: MetricsState;
  toggleMetric: (key: keyof MetricsState) => void;

  live: boolean;
  pause: () => void;
  resume: () => void;
};

const DashboardControlsContext = createContext<DashboardControls | null>(null);

// ✅ STEP 1 — Convert timeRange → # visible points
function timeRangeToPoints(range: TimeRange) {
  switch (range) {
    case "10s": return 100;
    case "1m": return 600;
    case "5m": return 3000;
    case "1h": return 36000;
  }
}

export function DashboardControlsProvider({ children }: { children: React.ReactNode }) {
  const [timeRange, setTimeRangeState] = useState<TimeRange>("10s");
  const [resolution, setResolutionState] = useState<Resolution>(1000);

  const [metrics, setMetrics] = useState<MetricsState>({
    cpu: true,
    memory: true,
    disk: true,
    network: true, // UI toggle only
  });

  const [live, setLive] = useState(true);

  // ✅ Normalize UI-level keys
  function normalizeKey(key: keyof MetricsState): string {
    if (key === "network") return "networkDown";
    return key;
  }

  // ✅ Toggle metric
  const toggleMetric = (key: keyof MetricsState) => {
    setMetrics((prev) => {
      const normalized = normalizeKey(key);
      return {
        ...prev,
        [normalized]: !prev[normalized as keyof MetricsState],
      } as MetricsState;
    });
  };

  const setTimeRange = (t: TimeRange) => setTimeRangeState(t);
  const setResolution = (r: Resolution) => setResolutionState(r);
  const pause = () => setLive(false);
  const resume = () => setLive(true);

  // ✅ STEP 1 — notify charts ONLY when timeRange changes
  useEffect(() => {
    const points = timeRangeToPoints(timeRange);

    document.dispatchEvent(
      new CustomEvent("controls-change", {
        detail: {
          type: "setVisibleWindow",
          timeWindowPoints: points,
        },
      })
    );
  }, [timeRange]);

  // ✅ PATCH 5 — Global broadcast of FULL control state
  useEffect(() => {
    const normalizedMetrics = {
      cpu: metrics.cpu,
      memory: metrics.memory,
      disk: metrics.disk,
      networkDown: metrics.network,
      networkUp: metrics.network,
    };

    const payload = {
      timeWindowPoints: timeRangeToPoints(timeRange),
      resolution,
      metrics: normalizedMetrics,
      live,
    };

    document.dispatchEvent(
      new CustomEvent("controls-change", { detail: payload })
    );
  }, [metrics, timeRange, resolution, live]);

  return (
    <DashboardControlsContext.Provider
      value={{
        timeRange,
        setTimeRange,
        resolution,
        setResolution,
        metrics,
        toggleMetric,
        live,
        pause,
        resume,
      }}
    >
      {children}
    </DashboardControlsContext.Provider>
  );
}

export function useDashboardControls() {
  const ctx = useContext(DashboardControlsContext);
  if (!ctx) throw new Error("useDashboardControls must be used inside provider");
  return ctx;
}
