// lib/dataGenerator.ts
export type MetricPoint = {
  timestamp: number
  cpu: number
  memory: number
  disk: number
  network: number
  temperature: number
}

/**
 * Generates an array of simulated system metrics.
 * Each metric looks realistic, and values fluctuate over time.
 */
export function generateMetrics(count: number): MetricPoint[] {
  const now = Date.now()
  const data: MetricPoint[] = []

  for (let i = 0; i < count; i++) {
    data.push({
      timestamp: now - i * 100,
      cpu: 40 + Math.random() * 60, // %
      memory: 2000 + Math.random() * 1000, // MB
      disk: Math.random() * 500, // MB/s
      network: Math.random() * 200, // MB/s
      temperature: 50 + Math.random() * 20 // °C
    })
  }

  return data.reverse() // oldest → newest
}
