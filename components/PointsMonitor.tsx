"use client"

import { useEffect, useState } from "react"

type PointsMonitorProps = {
  getCount: () => number
}

export default function PointsMonitor({ getCount }: PointsMonitorProps) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setCount(getCount())
    }, 500) // update twice per second

    return () => clearInterval(interval)
  }, [getCount])

  return (
    <div
      style={{
        position: "fixed",
        top: 35,
        right: 10,
        background: "rgba(0,0,0,0.7)",
        color: "#0ff",
        fontFamily: "monospace",
        fontSize: 14,
        padding: "4px 8px",
        borderRadius: 4,
      }}
    >
      Points: {count.toLocaleString()}
    </div>
  )
}
