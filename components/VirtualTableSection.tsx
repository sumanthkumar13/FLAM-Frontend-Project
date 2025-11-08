"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

// one row = fixed height → simple virtualization
const ROW_HEIGHT = 28;
const MAX_ROWS = 50000; // safety cap

type MetricRow = {
  timestamp: number;
  cpu: number;
  memory: number;        // MB
  disk: number;          // MB/s
  networkDown: number;   // MB/s
  networkUp: number;     // MB/s
  temperature: number;   // °C
};

export default function VirtualTableSection() {
  const [rows, setRows] = useState<MetricRow[]>([]);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(600);

  // subscribe to your existing metric stream (document “metric-update”)
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

  // keep viewportH up-to-date
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => setViewportH(el.clientHeight));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // virtualization math
  const total = rows.length;
  const visibleCount = Math.ceil(viewportH / ROW_HEIGHT) + 6; // overscan
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 3);
  const endIndex = Math.min(total - 1, startIndex + visibleCount);
  const offsetY = startIndex * ROW_HEIGHT;

  const visibleRows = useMemo(
    () => rows.slice(startIndex, endIndex + 1),
    [rows, startIndex, endIndex]
  );

  // formatters
  const fmtPct = (v: number) => `${v.toFixed(0)}%`;
  const fmtGB = (mb: number) => `${(mb / 1024).toFixed(2)} GB`;
  const fmtMBs = (v: number) => `${v.toFixed(1)} MB/s`;
  const fmtC = (v: number) => `${v.toFixed(1)}°C`;
  const fmtTs = (t: number) => {
    const d = new Date(t);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    const ms = String(d.getMilliseconds()).padStart(3, "0");
    return `${hh}:${mm}:${ss}.${ms}`;
  };

  return (
    <section className="vt-wrap">
      {/* sticky header inside the table area */}
      <div className="vt-header">
        <div className="vt-title">Detailed Metrics (Virtual Table)</div>
      </div>

      {/* table header row */}
      <div className="vt-cols vt-cols--head">
        <div>Timestamp</div>
        <div>CPU</div>
        <div>Memory</div>
        <div>Disk</div>
        <div>Network ↓</div>
        <div>Network ↑</div>
        <div>Temp</div>
      </div>

      {/* scroller + virtualization layer */}
      <div
        ref={scrollerRef}
        onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
        className="vt-scroller"
      >
        {/* spacer total height */}
        <div style={{ height: total * ROW_HEIGHT, position: "relative" }}>
          {/* window */}
          <div
            style={{
              position: "absolute",
              top: offsetY,
              left: 0,
              right: 0,
            }}
          >
            {visibleRows.map((r, i) => (
              <div key={startIndex + i} className="vt-row vt-cols">
                <div>{fmtTs(r.timestamp)}</div>
                <div>{fmtPct(r.cpu)}</div>
                <div>{fmtGB(r.memory)}</div>
                <div>{fmtMBs(r.disk)}</div>
                <div>{fmtMBs(r.networkDown)}</div>
                <div>{fmtMBs(r.networkUp)}</div>
                <div>{fmtC(r.temperature)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style jsx>{`
        .vt-wrap {
          width: 100%;
          background: #0a0a0a;
          border: 1px solid #1f2937;
          border-radius: 12px 12px 0 0;
          box-shadow: 0 -10px 30px rgba(0, 0, 0, 0.35);
          /* collapsed by default; expanded when .vt-open class is on .middle-panel */
          max-height: 0;
          overflow: hidden;
          transition: max-height 320ms cubic-bezier(.2,.8,.2,1);
        }

        /* when open, fill the viewport height */
        :global(.middle-panel.vt-open) .vt-wrap {
          max-height: 100vh;
        }

        .vt-header {
          position: sticky;
          top: 0;
          z-index: 2;
          background: #0a0a0a;
          border-bottom: 1px solid #1f2937;
          padding: 10px 14px;
        }
        .vt-title {
          font-weight: 700;
          color: #e5e7eb;
        }

        .vt-cols {
          display: grid;
          grid-template-columns: 160px 80px 110px 110px 130px 120px 110px;
          gap: 0;
        }
        .vt-cols--head {
          position: sticky;
          top: 44px; /* below header */
          z-index: 1;
          padding: 8px 14px;
          font-size: 12px;
          color: #93a3b8;
          border-bottom: 1px solid #1f2937;
          background: #0a0a0a;
        }
        .vt-scroller {
          height: calc(100vh - 44px - 38px); /* viewport minus sticky strips */
          overflow: auto;
          will-change: transform;
        }
        .vt-row {
          height: ${ROW_HEIGHT}px;
          align-items: center;
          padding: 0 14px;
          border-bottom: 1px solid #111;
          color: #e5e7eb;
          font-size: 12.5px;
          background: #0a0a0a;
        }
      `}</style>
    </section>
  );
}
