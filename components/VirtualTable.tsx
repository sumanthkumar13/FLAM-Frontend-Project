"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";

const ROW_HEIGHT = 28;

export default function VirtualTable() {
  const [rows, setRows] = useState<any[]>([]);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(600);

  // Listen to metric stream
  useEffect(() => {
    const handler = (e: any) => {
      const p = e.detail;
      setRows((prev) => [...prev.slice(-20000), p]); // keep last 20k
    };
    document.addEventListener("metric-update", handler);
    return () => document.removeEventListener("metric-update", handler);
  }, []);

  // Measure viewport height
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => setViewportH(el.clientHeight));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const total = rows.length;
  const visibleCount = Math.ceil(viewportH / ROW_HEIGHT) + 6;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 3);
  const endIndex = Math.min(total - 1, startIndex + visibleCount);
  const offsetY = startIndex * ROW_HEIGHT;

  const visibleRows = useMemo(
    () => rows.slice(startIndex, endIndex + 1),
    [rows, startIndex, endIndex]
  );

  // formatters
  const f = {
    ts: (t: number) => {
      const d = new Date(t);
      return `${d.getHours()}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}.${String(d.getMilliseconds()).padStart(3,"0")}`;
    },
    pct: (v: number) => `${v.toFixed(0)}%`,
    gb: (mb: number) => `${(mb / 1024).toFixed(2)} GB`,
    mbps: (v: number) => `${v.toFixed(1)} MB/s`,
    c: (v: number) => `${v.toFixed(1)}°C`,
  };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        background: "#0a0a0a",
      }}
    >
      {/* Header */}
      <div className="vt-header">
        <div className="vt-title">Complete System Metrics (Live History)</div>
        <div className="vt-sub">Virtualized table — smooth scrolling always</div>
      </div>

      {/* Table header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "160px 80px 110px 110px 130px 120px 110px",
          padding: "8px 14px",
          fontSize: 12,
          color: "#93a3b8",
          borderBottom: "1px solid #1f2937",
          position: "sticky",
          top: 56,
          background: "#0a0a0a",
          zIndex: 2,
        }}
      >
        <div>Timestamp</div>
        <div>CPU</div>
        <div>Memory</div>
        <div>Disk</div>
        <div>Net ↓</div>
        <div>Net ↑</div>
        <div>Temp</div>
      </div>

      {/* Scroll area */}
      <div
        ref={scrollerRef}
        onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
        style={{
          flex: 1,
          overflowY: "auto",
          position: "relative",
        }}
      >
        <div style={{ height: total * ROW_HEIGHT, position: "relative" }}>
          <div
            style={{
              position: "absolute",
              top: offsetY,
              left: 0,
              right: 0,
            }}
          >
            {visibleRows.map((r, i) => (
              <div
                key={startIndex + i}
                style={{
                  height: ROW_HEIGHT,
                  display: "grid",
                  gridTemplateColumns:
                    "160px 80px 110px 110px 130px 120px 110px",
                  alignItems: "center",
                  padding: "0 14px",
                  borderBottom: "1px solid #111",
                  color: "#e5e7eb",
                  fontSize: 12.5,
                }}
              >
                <div>{f.ts(r.timestamp)}</div>
                <div>{f.pct(r.cpu)}</div>
                <div>{f.gb(r.memory)}</div>
                <div>{f.mbps(r.disk)}</div>
                <div>{f.mbps(r.networkDown)}</div>
                <div>{f.mbps(r.networkUp)}</div>
                <div>{f.c(r.temperature)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
