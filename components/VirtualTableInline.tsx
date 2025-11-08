"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

const ROW_HEIGHT = 28;
const MAX_ROWS = 50000;

type MetricRow = {
  timestamp: number;
  cpu: number;
  memory: number;
  disk: number;
  networkDown: number;
  networkUp: number;
  temperature: number;
};

type SortKey =
  | "timestamp"
  | "cpu"
  | "memory"
  | "disk"
  | "networkDown"
  | "networkUp"
  | "temperature";

export default function VirtualTableInline() {
  const [rows, setRows] = useState<MetricRow[]>([]);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc" | null>(null);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);

  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(600);

  // ✅ Live metric updates continue regardless of sorting
  useEffect(() => {
    const handler = (e: any) => {
      const p = e.detail as MetricRow;
      setRows((prev) => {
        const next =
          prev.length >= MAX_ROWS ? [...prev.slice(1), p] : [...prev, p];
        return next;
      });
    };

    document.addEventListener("metric-update", handler);
    return () => document.removeEventListener("metric-update", handler);
  }, []);

  // ✅ Resize observer to track viewport height
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const obs = new ResizeObserver(() => setViewportH(el.clientHeight));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // ✅ IntersectionObserver to trigger vt-open class
  useEffect(() => {
    const shell = document.querySelector(".dash-shell") as HTMLElement | null;
    const middle = document.querySelector(".middle-panel") as HTMLElement | null;
    const target = headerRef.current;

    if (!shell || !middle || !target) return;

    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        const open = e.isIntersecting;
        shell.classList.toggle("vt-open", open);
        middle.classList.toggle("vt-open", open);
      },
      { root: middle, threshold: [0] }
    );

    io.observe(target);
    return () => io.disconnect();
  }, []);

  // ✅ SORT LOGIC
  function onSort(column: SortKey) {
    if (sortKey !== column) {
      setSortKey(column);
      setSortDir("asc");
    } else {
      if (sortDir === "asc") setSortDir("desc");
      else if (sortDir === "desc") {
        // third click → return to LIVE mode
        setSortKey(null);
        setSortDir(null);
      } else setSortDir("asc");
    }
  }

  const sortedRows = useMemo(() => {
    if (!sortKey || !sortDir) return rows;

    return [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];

      if (sortDir === "asc") return av - bv;
      return bv - av;
    });
  }, [rows, sortKey, sortDir]);

  // ✅ Virtualization math
  const total = sortedRows.length;
  const visibleCount = Math.ceil(viewportH / ROW_HEIGHT) + 6;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 3);
  const endIndex = Math.min(total - 1, startIndex + visibleCount);

  const offsetY = startIndex * ROW_HEIGHT;
  const visibleRows = useMemo(
    () => sortedRows.slice(startIndex, endIndex + 1),
    [sortedRows, startIndex, endIndex]
  );

  // ✅ Formatters
  const fmtPct = (v: number) => `${v.toFixed(0)}%`;
  const fmtGB = (mb: number) => `${(mb / 1024).toFixed(2)} GB`;
  const fmtMBs = (v: number) => `${v.toFixed(1)} MB/s`;
  const fmtC = (v: number) => `${v.toFixed(1)}°C`;
  const fmtTs = (t: number) => {
    const d = new Date(t);
    return `${d.getHours().toString().padStart(2, "0")}:${d
      .getMinutes()
      .toString()
      .padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}.${d
      .getMilliseconds()
      .toString()
      .padStart(3, "0")}`;
  };

  // ✅ soft color-coding (muted, professional)
  const cpuColor = (v: number) =>
    v > 85
      ? "#ff6b6b" // soft red
      : v > 60
      ? "#e5c07b" // soft yellow
      : "#8be9a4"; // soft green

  const tempColor = (v: number) =>
    v > 75 ? "#ff6b6b" : v > 55 ? "#e5c07b" : "#80d4ff";

  return (
    <section
      style={{
        marginTop: 24,
        marginBottom: 50,
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      {/* header sentinel */}
      <div
        ref={headerRef}
        style={{
          display: "flex",
          alignItems: "center",
          padding: "10px 14px",
          borderBottom: "1px solid var(--border)",
          gap: 8,
          position: "sticky",
          top: 0,
          background: "var(--panel)",
          zIndex: 1,
        }}
      >
        <div style={{ fontWeight: 700, color: "#e5e7eb" }}>
          Detailed Metrics (Virtualized Table)
        </div>
        <div style={{ marginLeft: "auto", color: "#93a3b8", fontSize: 12 }}>
          Rows: {total.toLocaleString()}
        </div>
      </div>

      {/* column header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "160px repeat(6, 1fr)",
          padding: "8px 14px",
          fontSize: 12,
          color: "#93a3b8",
          borderBottom: "1px solid var(--border)",
          position: "sticky",
          top: 40,
          background: "var(--panel)",
          zIndex: 1,
          userSelect: "none",
        }}
      >
        <div onClick={() => onSort("timestamp")} style={{ cursor: "pointer" }}>
          Timestamp{sortKey === "timestamp" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
        </div>
        <div onClick={() => onSort("cpu")} style={{ cursor: "pointer" }}>
          CPU{sortKey === "cpu" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
        </div>
        <div onClick={() => onSort("memory")} style={{ cursor: "pointer" }}>
          Memory{sortKey === "memory" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
        </div>
        <div onClick={() => onSort("disk")} style={{ cursor: "pointer" }}>
          Disk{sortKey === "disk" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
        </div>
        <div onClick={() => onSort("networkDown")} style={{ cursor: "pointer" }}>
          Net ↓{sortKey === "networkDown" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
        </div>
        <div onClick={() => onSort("networkUp")} style={{ cursor: "pointer" }}>
          Net ↑{sortKey === "networkUp" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
        </div>
        <div onClick={() => onSort("temperature")} style={{ cursor: "pointer" }}>
          Temp{sortKey === "temperature" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
        </div>
      </div>

      {/* virtualization container */}
      <div
        ref={scrollerRef}
        onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
        style={{
          maxHeight: "65vh",
          overflow: "auto",
          willChange: "transform",
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
                  gridTemplateColumns: "160px repeat(6, 1fr)",
                  alignItems: "center",
                  padding: "0 14px",
                  borderBottom: "1px solid #111",
                  fontSize: 12.5,
                }}
              >
                <div style={{ color: "#e5e7eb" }}>{fmtTs(r.timestamp)}</div>
                <div style={{ color: cpuColor(r.cpu) }}>{fmtPct(r.cpu)}</div>
                <div style={{ color: "#9cd2ff" }}>{fmtGB(r.memory)}</div>
                <div style={{ color: "#88b4ff" }}>{fmtMBs(r.disk)}</div>
                <div style={{ color: "#98ffa0" }}>{fmtMBs(r.networkDown)}</div>
                <div style={{ color: "#89ffcf" }}>{fmtMBs(r.networkUp)}</div>
                <div style={{ color: tempColor(r.temperature) }}>
                  {fmtC(r.temperature)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
