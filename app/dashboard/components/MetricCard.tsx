"use client";

import React from "react";

export default function MetricCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="metric-card">
      <div className="metric-header">
        <div className="metric-title">{title}</div>
        {description && <div className="metric-desc">{description}</div>}
      </div>

      <div className="metric-body">{children}</div>

      <style jsx>{`
        .metric-card {
          background: #0d0d0d;
          padding: 18px;
          border-radius: 12px;
          border: 1px solid #1c1c1c;
          margin-bottom: 22px;
          transition: all 0.25s ease;
          transform: translateY(0px) scale(1);
          box-shadow: 0 0 0 rgba(0,0,0,0);
          cursor: default;
        }

        /* ✅ HOVER LIFT EFFECT (PREMIUM INTERACTION) */
        .metric-card:hover {
          transform: translateY(-6px) scale(1.03);
          border-color: #00ff88;
          box-shadow: 0 8px 24px rgba(0, 255, 136, 0.15);
        }

        .metric-header {
          margin-bottom: 14px;
        }

        .metric-title {
          font-size: 18px;
          font-weight: 700;
          color: #e9fef3;
          margin-bottom: 4px;
        }

        .metric-desc {
          font-size: 13px;
          color: #9ca3af;
        }

        .metric-body {
          margin-top: 8px;
        }
      `}</style>
    </div>
  );
}
