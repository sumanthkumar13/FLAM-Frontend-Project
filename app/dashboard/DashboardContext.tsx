"use client";

import React, { createContext, useContext, useState } from "react";

type TimeRange = "10s" | "1m" | "5m" | "1h";
type Resolution = 300 | 1000 | 5000;

type DashboardState = {
  timeRange: TimeRange;
  setTimeRange: (v: TimeRange) => void;

  resolution: Resolution;
  setResolution: (v: Resolution) => void;

  filters: {
    cpu: boolean;
    memory: boolean;
    disk: boolean;
    network: boolean;
  };
  setFilters: (f: any) => void;

  live: boolean;
  setLive: (v: boolean) => void;
};

const DashboardContext = createContext<DashboardState | null>(null);

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [timeRange, setTimeRange] = useState<TimeRange>("10s");
  const [resolution, setResolution] = useState<Resolution>(300);
  const [live, setLive] = useState(true);

  const [filters, setFilters] = useState({
    cpu: true,
    memory: true,
    disk: true,
    network: true,
  });

  return (
    <DashboardContext.Provider
      value={{
        timeRange,
        setTimeRange,
        resolution,
        setResolution,
        filters,
        setFilters,
        live,
        setLive,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard must be used inside DashboardProvider");
  return ctx;
}
