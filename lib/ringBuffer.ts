// lib/ringBuffer.ts
export type RBMetricNames = "t" | "timestamp" | "cpu" | "mem" | "memory" | "disk" | "network" | "net" | "temp" | "temperature"

export type RingBuffer = {
  capacity: number
  head: number           // next write index
  size: number           // number of valid points (<= capacity)
  baseTimestamp: number  // base timestamp (ms) for relative storage
  // typed arrays
  t: Float64Array        // absolute timestamps in ms (Float64 gives safety)
  cpu: Float32Array
  memory: Float32Array
  disk: Float32Array
  network: Float32Array
  temperature: Float32Array
}

/**
 * Create a new typed-array ring buffer for metrics.
 * capacity: number of points to store (e.g., 10_000)
 */
export function createRingBuffer(capacity: number): RingBuffer {
  return {
    capacity,
    head: 0,
    size: 0,
    baseTimestamp: 0,
    t: new Float64Array(capacity),
    cpu: new Float32Array(capacity),
    memory: new Float32Array(capacity),
    disk: new Float32Array(capacity),
    network: new Float32Array(capacity),
    temperature: new Float32Array(capacity),
  }
}

/**
 * Normalize incoming point keys and return a canonical object.
 * Accepts variations you've used in different files.
 */
export type IncomingPoint = Partial<{
  t: number
  timestamp: number
  cpu: number
  mem: number
  memory: number
  disk: number
  net: number
  network: number
  temp: number
  temperature: number
}>

function normalizePoint(p: IncomingPoint) {
  const timestamp = p.timestamp ?? p.t ?? Date.now()
  return {
    timestamp,
    cpu: (p.cpu ?? 0),
    memory: (p.memory ?? p.mem ?? 0),
    disk: (p.disk ?? 0),
    network: (p.network ?? p.net ?? 0),
    temperature: (p.temperature ?? p.temp ?? 0),
  }
}

/**
 * Append a point into the ring buffer (in-place).
 * Very hot path — written to avoid allocations.
 */
export function appendPoint(rb: RingBuffer, rawPoint: IncomingPoint) {
  const p = normalizePoint(rawPoint)

  // initialize baseTimestamp on first append
  if (rb.size === 0 && rb.baseTimestamp === 0) {
    rb.baseTimestamp = p.timestamp
  }

  const i = rb.head
  rb.t[i] = p.timestamp
  rb.cpu[i] = p.cpu
  rb.memory[i] = p.memory
  rb.disk[i] = p.disk
  rb.network[i] = p.network
  rb.temperature[i] = p.temperature

  rb.head = (i + 1) % rb.capacity
  if (rb.size < rb.capacity) rb.size++
}

/**
 * Read a contiguous window of up to `count` points ending at the latest point.
 * Returns an object of typed-array views (no copies).
 *
 * startIndex is inclusive index in logical order where 0 is oldest, size-1 is newest.
 * If you want the most-recent `count` points, call with startIndex = Math.max(0, size-count)
 */
export function readWindow(rb: RingBuffer, startIndex: number, count: number) {
  // clamp
  if (count <= 0) return null
  if (rb.size === 0) return null

  const actualCount = Math.min(count, rb.size)
  // produce typed views in chronological order (oldest -> newest)
  // Because physical storage is circular, we may need two slices.
  const oldestPos = (rb.head + rb.capacity - rb.size) % rb.capacity
  const windowStart = (oldestPos + startIndex) % rb.capacity

  // If window doesn't wrap:
  if (windowStart + actualCount <= rb.capacity) {
    return {
      t: rb.t.subarray(windowStart, windowStart + actualCount),
      cpu: rb.cpu.subarray(windowStart, windowStart + actualCount),
      memory: rb.memory.subarray(windowStart, windowStart + actualCount),
      disk: rb.disk.subarray(windowStart, windowStart + actualCount),
      network: rb.network.subarray(windowStart, windowStart + actualCount),
      temperature: rb.temperature.subarray(windowStart, windowStart + actualCount),
      count: actualCount,
    }
  }

  // If it wraps, build a temporary Float32Array-backed view that concatenates two slices.
  // NOTE: this does allocate a new Float32Array of length actualCount for each metric only in wrap case.
  // We can avoid allocation by changing renderer to accept two slices — but this is simpler to start.
  const firstLen = rb.capacity - windowStart
  const secondLen = actualCount - firstLen

  function concatFloat32(a: Float32Array, b: Float32Array) {
    const out = new Float32Array(actualCount)
    out.set(a, 0)
    out.set(b, firstLen)
    return out
  }
  function concatFloat64(a: Float64Array, b: Float64Array) {
    const out = new Float64Array(actualCount)
    out.set(a, 0)
    out.set(b, firstLen)
    return out
  }

  const aT = rb.t.subarray(windowStart, rb.capacity)
  const bT = rb.t.subarray(0, secondLen)
  const aCpu = rb.cpu.subarray(windowStart, rb.capacity)
  const bCpu = rb.cpu.subarray(0, secondLen)
  const aMem = rb.memory.subarray(windowStart, rb.capacity)
  const bMem = rb.memory.subarray(0, secondLen)
  const aDisk = rb.disk.subarray(windowStart, rb.capacity)
  const bDisk = rb.disk.subarray(0, secondLen)
  const aNet = rb.network.subarray(windowStart, rb.capacity)
  const bNet = rb.network.subarray(0, secondLen)
  const aTemp = rb.temperature.subarray(windowStart, rb.capacity)
  const bTemp = rb.temperature.subarray(0, secondLen)

  return {
    t: concatFloat64(aT, bT),
    cpu: concatFloat32(aCpu, bCpu),
    memory: concatFloat32(aMem, bMem),
    disk: concatFloat32(aDisk, bDisk),
    network: concatFloat32(aNet, bNet),
    temperature: concatFloat32(aTemp, bTemp),
    count: actualCount,
  }
}
