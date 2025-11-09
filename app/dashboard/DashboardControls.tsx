"use client";

import React, { useState, useEffect } from "react";
import { useDashboardControls } from "./DashboardControlsContext";

export default function DashboardControls() {
  const {
    timeRange,
    setTimeRange,

    resolution,
    setResolution,

    live,
    pause,
    resume,

    metrics, // ✅ enabled metrics
  } = useDashboardControls();

  // ✅ Aggregation level
  const [aggregation, setAggregation] = useState<number>(0);

  // ✅ Aggregation stats received from worker
  const [aggStats, setAggStats] = useState<{
    bucketMs: number;
    windowPoints: number;
    stats: Record<
      string,
      { avg: number; min: number; max: number }
    >;
  } | null>(null);

  // ✅ Listen for worker aggregation results
  useEffect(() => {
    const handler = (e: any) => {
      setAggStats(e.detail);
    };
    document.addEventListener("agg-stats", handler);
    return () => document.removeEventListener("agg-stats", handler);
  }, []);

  // ✅ Emit event to all charts
  function emitControlsChange() {
    document.dispatchEvent(
      new CustomEvent("controls-change", {
        detail: {
          timeWindowPoints: timeRange,
          resolution,
          metrics,
          live,
          aggregation,
        },
      })
    );
  }

  return (
    <div style={{ padding: "12px" }}>
      {/* ✅ TIME RANGE */}
      <div style={{ marginBottom: 20 }}>
        <div className="section-title">⏱ Time Range</div>
        <div className="btn-group">
          {["10s", "1m", "5m", "1h"].map((t) => (
            <button
              key={t}
              className={`ctrl-btn ${timeRange === t ? "active" : ""}`}
              onClick={() => {
                setTimeRange(t as any);
                emitControlsChange();
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* ✅ RESOLUTION */}
      <div style={{ marginBottom: 20 }}>
        <div className="section-title">📊 Resolution (points)</div>
        <div className="btn-group">
          {[300, 1000, 10000].map((r) => (
            <button
              key={r}
              className={`ctrl-btn ${resolution === r ? "active" : ""}`}
              onClick={() => {
                setResolution(r as any);
                emitControlsChange();
              }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* ✅ LIVE MODE */}
      <div style={{ marginBottom: 20 }}>
        <div className="section-title">🟢 Live Mode</div>
        <button
          className="ctrl-btn full"
          onClick={() => {
            live ? pause() : resume();
            emitControlsChange();
          }}
          style={{
            background: live ? "#ff4444" : "#00c853",
            color: "white",
            fontWeight: 600,
          }}
        >
          {live ? "Pause" : "Resume"}
        </button>
      </div>

      {/* ✅ AGGREGATION */}
      <div style={{ marginTop: 10 }}>
        <div style={{ color: "#aaa", fontSize: 12, marginBottom: 6 }}>
          Aggregation
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            { label: "Raw", ms: 0 },
            { label: "1s", ms: 1000 },
            { label: "5s", ms: 5000 },
            { label: "10s", ms: 10000 },
          ].map((opt) => (
            <button
              key={opt.ms}
              onClick={() => {
                setAggregation(opt.ms);
                emitControlsChange();
              }}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid #333",
                background: aggregation === opt.ms ? "#1f2937" : "#0b0b0b",
                color: "#e5e7eb",
                cursor: "pointer",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ✅ AGGREGATION STATS — VERTICAL SCROLLABLE */}
      <div
        style={{
          marginTop: 18,
          maxHeight: 300,
          overflowY: "auto",
          borderTop: "1px solid #222",
          paddingTop: 12,
        }}
      >
        <div
          style={{
            color: "#93a3b8",
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 12,
          }}
        >
          Aggregation Results{" "}
          {aggStats?.bucketMs
            ? `(${aggStats.bucketMs / 1000}s buckets)`
            : "(Raw)"}
        </div>

        {(() => {
          const s = aggStats?.stats || {};
          const fmt = (v?: number, unit = "") =>
            v == null ? "-" : `${v.toFixed(1)}${unit}`;

          const Row = ({ title, data, unit }: any) =>
            data ? (
              <div style={{ marginBottom: 14 }}>
                <div
                  style={{
                    color: "#e5e7eb",
                    fontWeight: 600,
                    fontSize: 14,
                    marginBottom: 4,
                  }}
                >
                  {title}
                </div>
                <div
                  style={{
                    color: "#cbd5e1",
                    fontSize: 12,
                    lineHeight: 1.5,
                  }}
                >
                  <div>Avg: {fmt(data.avg, unit)}</div>
                  <div>Min: {fmt(data.min, unit)}</div>
                  <div>Max: {fmt(data.max, unit)}</div>
                </div>
              </div>
            ) : null;

          return (
            <>
              <Row title="CPU" data={s.cpu} unit="%" />
              <Row title="Memory" data={s.memory} unit=" GB" />
              <Row title="Disk" data={s.disk} unit=" MB/s" />
              <Row title="Network Download" data={s.networkDown} unit=" MB/s" />
              <Row title="Network Upload" data={s.networkUp} unit=" MB/s" />
              <Row title="Temperature" data={s.temperature} unit="°C" />
            </>
          );
        })()}
      </div>

      {/* ✅ Styles */}
      <style jsx>{`
        .section-title {
          font-size: 14px;
          font-weight: 600;
          color: #93a3b8;
          margin-bottom: 6px;
        }

        .btn-group {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .ctrl-btn {
          padding: 6px 10px;
          font-size: 13px;
          border: 1px solid #444;
          background: #111;
          color: #ccc;
          border-radius: 6px;
          cursor: pointer;
          transition: 0.15s;
        }

        .ctrl-btn:hover {
          background: #222;
        }

        .ctrl-btn.active {
          background: #00ff88;
          color: #000;
          border-color: #00ff88;
        }

        .ctrl-btn.full {
          width: 100%;
          margin-top: 6px;
        }
      `}</style>
    </div>
  );
}
