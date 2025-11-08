// console.log("[BarChartWorker] started")

// let ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null = null;
// let color = "#00bfff";
// let width = 0;
// let height = 0;
// let lastFrame = 0;
// let fpsFrameCount = 0;
// let lastFpsUpdate = 0;
// let frameCount = 0;

// let current = { memory: 0, disk: 0, network: 0 };

// self.onmessage = (e: MessageEvent) => {
//   const { type, payload } = e.data;

//   if (type === "init") {
//     const { canvas, options } = payload;

//     // @ts-ignore
//     ctx = canvas.getContext("2d");
//     width = canvas.width;
//     height = canvas.height;
//     color = options.color || "#00bfff";
//     console.log("✅ BarChartWorker initialized", width, height);
//     return;
//   }

//   if (type === "append") {
//     // ✅ Handle both real and missing data
//     current.memory = payload.memory ?? Math.abs(Math.sin(frameCount / 30)) * 100;
//     current.disk = payload.disk ?? Math.abs(Math.sin(frameCount / 40)) * 80;
//     current.network = payload.network ?? Math.abs(Math.sin(frameCount / 50)) * 120;
//     frameCount++;

//     const now = performance.now();
//     if (now - lastFrame > 16) {
//       drawFrame();
//       lastFrame = now;
//       fpsFrameCount++;
//     }

//     if (now - lastFpsUpdate > 1000) {
//       postMessage({ type: "fps", payload: fpsFrameCount });
//       fpsFrameCount = 0;
//       lastFpsUpdate = now;
//     }
//   }
// };

// function drawFrame() {
//   if (!ctx) return;
//   // @ts-ignore
//   ctx.clearRect(0, 0, width, height);

//   const keys = ["memory", "disk", "network"];
//   const values = [current.memory, current.disk, current.network];
//   const maxVal = Math.max(...values, 1);
//   const barWidth = width / keys.length - 20;

//   // @ts-ignore
//   ctx.font = "14px monospace";
//   // @ts-ignore
//   ctx.textAlign = "center";

//   values.forEach((val, i) => {
//     const h = (val / maxVal) * (height - 40);
//     const x = i * (barWidth + 30) + 30;
//     const y = height - h - 20;

//     // @ts-ignore
//     const grad = ctx.createLinearGradient(0, y, 0, height - 20);
//     grad.addColorStop(0, color);
//     grad.addColorStop(1, "black");

//     // @ts-ignore
//     ctx.fillStyle = grad;
//     // @ts-ignore
//     ctx.fillRect(x, y, barWidth, h);

//     // Label
//     // @ts-ignore
//     ctx.fillStyle = color;
//     // @ts-ignore
//     ctx.fillText(keys[i], x + barWidth / 2, height - 5);
//   });
// }
// // console.log("[BarChartWorker] started")

// // let ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null = null;
// // let color = "#00bfff";
// // let width = 0;
// // let height = 0;
// // let frameCount = 0;

// // self.onmessage = (e: MessageEvent) => {
// //   const { type, payload } = e.data;
// //   if (type === "init") {
// //     const { canvas, options } = payload;
// //     // @ts-ignore
// //     ctx = canvas.getContext("2d");
// //     width = canvas.width;
// //     height = canvas.height;
// //     color = options.color;
// //     console.log("✅ init", width, height, !!ctx);
// //     return;
// //   }

// //   if (type === "append") {
// //     if (!ctx) {
// //       console.warn("⚠️ ctx missing at append");
// //       return;
// //     }

// //     frameCount++;
// //     // draw a quick test pattern
// //     ctx.clearRect(0, 0, width, height);
// //     ctx.fillStyle = color;
// //     const h = Math.abs(Math.sin(frameCount / 10)) * height * 0.8;
// //     ctx.fillRect(40, height - h - 20, 60, h);
// //     ctx.fillRect(140, height - h / 1.5 - 20, 60, h / 1.5);
// //     ctx.fillRect(240, height - h / 2 - 20, 60, h / 2);
// //   }
// // };

