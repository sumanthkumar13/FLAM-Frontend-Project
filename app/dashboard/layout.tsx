"use client";

import Link from "next/link";
import "./styles.css";
import React from "react";
import TemperatureHeatmap from "@/components/charts/TemperatureHeatmap";

import { DashboardControlsProvider } from "./DashboardControlsContext";
import DashboardControls from "./DashboardControls";
import UseAutoOpenVirtualTableOnScrollEnd from "@/components/UseAutoOpenVirtualTableOnScrollEnd";


export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardControlsProvider>
      <div className="dash-shell">

        {/* LEFT PANEL */}
        <aside className="panel left-panel">
          <div className="brand">🔷 System Core</div>

          <nav className="nav-buttons">
            <Link href="/dashboard" className="nav-btn">Dashboard</Link>
            <Link href="/dashboard/cpu-vs-temperature" className="nav-btn">
              CPU vs Temperature
            </Link>
          </nav>

          {/* ✅ Added chart-container for hover lift */}
          <div className="card heatmap-card chart-container">
            <div className="card-title">System Temperature</div>
            <div className="card-body heatmap-body">
              <TemperatureHeatmap />
            </div>
          </div>

          <div className="version">v1.0 · Local Demo</div>
        </aside>

        {/* CENTER PANEL */}
        <main className="panel middle-panel">
          {children}
        </main>

        {/* RIGHT PANEL — Controls */}
        <aside className="panel right-panel">
          <div className="card chart-container">
            <div className="card-title">Controls</div>
            <DashboardControls />
          </div>
        </aside>

      </div>
      <UseAutoOpenVirtualTableOnScrollEnd />
    </DashboardControlsProvider>
  );
}
