export {}; // keep worker isolated

// ================================================
// ✅ CONFIG
// ================================================
let pointCount = 10000;
let updateInterval = 100;
let visiblePoints = 10000;
let buffer: any[] = [];

// ✅ MEMORY simulation (8GB → 16GB)
let memory = 8000;
const MEMORY_MIN = 8000;
const MEMORY_MAX = 16000;

// ================================================
// ✅ INIT from main thread
// ================================================
self.onmessage = (e: MessageEvent) => {
  const { type, payload } = e.data;

  if (type === "init") {
    pointCount = payload.pointCount ?? 10000;
    updateInterval = payload.updateInterval ?? 100;
    visiblePoints = payload.visiblePoints ?? 10000;

    buffer = generateInitial(pointCount);
    loop();
  }
};

// ================================================
// ✅ Generate initial dataset
// ================================================
function generateInitial(n: number) {
  const now = Date.now();
  const arr = [];

  for (let i = 0; i < n; i++) {
    const cpu = simulateCPU();
    const net = simulateNetwork();

    arr.push({
      timestamp: now - i * updateInterval,
      cpu,
      memory: simulateMemory(),
      disk: simulateDisk(),
      networkDown: net.down,
      networkUp: net.up,
      temperature: simulateTemperature(cpu),
    });
  }

  return arr.reverse();
}

// ================================================
// ✅ Main Loop
// ================================================
function loop() {
  setTimeout(() => {
    const last = buffer[buffer.length - 1];
    const cpu = simulateCPU();
    const net = simulateNetwork();

    const newPoint = {
      timestamp: last.timestamp + updateInterval,
      cpu,
      memory: simulateMemory(),
      disk: simulateDisk(),
      networkDown: net.down,
      networkUp: net.up,
      temperature: simulateTemperature(cpu),
    };

    buffer.push(newPoint);
    if (buffer.length > visiblePoints) buffer.shift();

    postMessage({ type: "append", payload: newPoint });

    loop();
  }, updateInterval);
}

// ================================================
// ✅ SIMULATION FUNCTIONS
// ================================================
function simulateCPU() {
  return 30 + Math.random() * 50 + Math.sin(Date.now() / 400) * 20;
}

function simulateMemory() {
  memory += (Math.random() - 0.5) * 50;

  if (Math.random() < 0.01) memory += 500 + Math.random() * 500;
  if (Math.random() < 0.005) memory -= 500 + Math.random() * 300;

  memory += Math.sin(Date.now() / 3000) * 20;
  memory = Math.max(MEMORY_MIN, Math.min(MEMORY_MAX, memory));

  return memory;
}

function simulateDisk() {
  if (Math.random() < 0.1) return 100 + Math.random() * 400;
  return Math.random() * 30;
}

// ✅ NEW — Realistic Up/Down network simulation
function simulateNetwork() {
  const baseDown = 20 + Math.random() * 50;
  const baseUp = 5 + Math.random() * 20;

  const spikeDown = Math.random() < 0.05 ? 50 + Math.random() * 150 : 0;
  const spikeUp = Math.random() < 0.03 ? 20 + Math.random() * 80 : 0;

  return {
    down: baseDown + spikeDown,
    up: baseUp + spikeUp,
  };
}

// ================================================
// ✅ NEW — Best Realistic Temperature Model
// ================================================
let currentTemp = 45;        // starting / idle temp
const AMBIENT = 35;          // room temp baseline
const MAX_TEMP = 95;         // thermal limit
const HEAT_GAIN = 0.12;      // CPU->heat coefficient
const COOL_RATE = 0.015;     // cooling factor
let fanSpeed = 0;            // 0–1 scale

function simulateTemperature(cpu: number) {
  // ✅ Fan speed auto adjusts with heat
  fanSpeed += ((currentTemp - 60) / 40 - fanSpeed) * 0.05;
  fanSpeed = Math.max(0, Math.min(1, fanSpeed));

  // ✅ Heating from CPU load
  const heat = (cpu / 100) * HEAT_GAIN * (1 - fanSpeed * 0.55);

  // ✅ Cooling curve based on difference from ambient
  const cooling = (currentTemp - AMBIENT) * COOL_RATE * (1 + fanSpeed);

  // ✅ Apply temperature update
  currentTemp += heat - cooling;

  // ✅ Small random jitter like real sensors
  currentTemp += (Math.random() - 0.5) * 0.8;

  // ✅ Final clamp
  currentTemp = Math.max(AMBIENT, Math.min(MAX_TEMP, currentTemp));

  return currentTemp;
}
