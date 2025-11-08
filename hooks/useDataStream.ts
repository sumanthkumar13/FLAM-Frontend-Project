"use client"

import { useEffect, useRef, useState } from "react"
import { generateMetrics, MetricPoint } from "@/lib/dataGenerator"

/**
 * Optimized real-time data stream.
 * Keeps a rolling buffer instead of regenerating the entire dataset.
 */
export function useDataStream(pointCount = 10000, updateInterval = 100) {
  const [data, setData] = useState<MetricPoint[]>(() => generateMetrics(pointCount))
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setData(prev => {
        const last = prev[prev.length - 1]
        const newPoint: MetricPoint = {
          timestamp: last.timestamp + updateInterval,
          cpu: 40 + Math.random() * 60,
          memory: 2000 + Math.random() * 1000,
          disk: Math.random() * 500,
          network: Math.random() * 200,
          temperature: 50 + Math.random() * 20,
        }

        // Keep buffer size fixed (drop oldest, add newest)
        const next = [...prev.slice(1), newPoint]
        return next
      })
    }, updateInterval)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [pointCount, updateInterval])

  return data
}
