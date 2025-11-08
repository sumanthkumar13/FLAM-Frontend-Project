// hooks/useDataStreamTyped.ts
"use client"

import { useEffect, useRef, useState } from "react"
import { createRingBuffer, appendPoint, RingBuffer } from "@/lib/ringBuffer"
import { generateMetrics } from "@/lib/dataGenerator" // kept for bootstrap/demo
import type { IncomingPoint } from "@/lib/ringBuffer"

export function useDataStreamTyped(pointCount = 10000, updateInterval = 100) {
  // bufferRef holds the typed arrays; no per-point re-renders.
  const bufferRef = useRef<RingBuffer | null>(null)
  const timerRef = useRef<number | null>(null)

  // minimal meta to display occasionally (size, latest timestamp)
  const [meta, setMeta] = useState({ size: 0, latestTimestamp: 0 })

  // create buffer once
  useEffect(() => {
    bufferRef.current = createRingBuffer(pointCount)

    // bootstrap with initial data so charts have full buffer to draw
    // generateMetrics returns an array of objects (older -> newer)
    const initial = generateMetrics(pointCount)
    for (let i = 0; i < initial.length; i++) {
      appendPoint(bufferRef.current, {
        timestamp: initial[i].timestamp,
        cpu: initial[i].cpu,
        memory: initial[i].memory,
        disk: initial[i].disk,
        network: initial[i].network,
        temperature: initial[i].temperature,
      } as IncomingPoint)
    }

    // set initial meta
    if (bufferRef.current) {
      setMeta({
        size: bufferRef.current.size,
        latestTimestamp: bufferRef.current.t[(bufferRef.current.head + bufferRef.current.capacity - 1) % bufferRef.current.capacity] ?? 0,
      })
    }

    return () => {
      // cleanup if any
      bufferRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointCount])

  // main generator loop (main-thread). Very small allocations only for the newPoint object.
  useEffect(() => {
    if (!bufferRef.current) return

    timerRef.current = window.setInterval(() => {
      if (!bufferRef.current) return

      // generate a new point -- lightweight inline generator for demo; replace with worker later
      const lastIdx = (bufferRef.current.head + bufferRef.current.capacity - 1) % bufferRef.current.capacity
      const lastTs = bufferRef.current.size > 0 ? bufferRef.current.t[lastIdx] : Date.now()

      const newPoint: IncomingPoint = {
        timestamp: lastTs + updateInterval,
        cpu: 40 + Math.random() * 60,
        memory: 2000 + Math.random() * 1000,
        disk: Math.random() * 500,
        network: Math.random() * 200,
        temperature: 50 + Math.random() * 20,
      }

      appendPoint(bufferRef.current, newPoint)

      // update meta occasionally — throttle UI updates to avoid re-render storms
      // e.g., update UI once every 10 appends
      if ((bufferRef.current.head % 10) === 0) {
        setMeta({
          size: bufferRef.current.size,
          latestTimestamp: bufferRef.current.t[(bufferRef.current.head + bufferRef.current.capacity - 1) % bufferRef.current.capacity] ?? 0,
        })
      }
    }, updateInterval)

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [updateInterval])

  return { bufferRef, meta }
}
