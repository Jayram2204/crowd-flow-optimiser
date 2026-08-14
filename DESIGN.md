# Design System & Architecture

## The Swiss-Editorial Aesthetic

Crowd Flow Optimiser is designed to feel like a high-stakes, real-time financial terminal. A crowd-control operator should not feel like a gamer; they should feel like a market trader responding instantly to shifting pressure points.

The visual language follows strict Swiss-Editorial principles: utilitarian, stark, and entirely data-driven.

### Color Palette

- **The Void (`#04070a`)**: Deep, abyss-like background meant to reduce eye strain in low-light control rooms while maximizing the contrast of critical data elements.
- **Hairline Borders (`#1e293b`)**: Used to demarcate zones and panels without introducing visual noise. Structure is implied through negative space and crisp lines.
- **Terminal Green (`#0aff9d`)**: Represents normal flow, successful handshakes, and baseline stability. It pops vividly against the void.
- **Alert Amber (`#ffb000`)**: Used for warnings, overrides, and friction. Indicates that automated negotiation is active or operator attention is required.
- **Critical Red (`#ff3366`)**: Reserved strictly for emergencies (e.g., EXIT BLOCKED, CRITICAL DENSITY). 

### Typography
We exclusively use **JetBrains Mono**. Every metric, log entry, and override button aligns perfectly on a rigid typographic grid. Numbers don't jump, and logs flow in a predictable column. 

---

## Decentralized Edge AI Architecture

Crowd Flow Optimiser abandons the centralized "monolithic simulation" model. When 100,000 people enter a stadium, O(n) centralized calculations buckle under the pressure.

We solve this using **Decentralized Edge AI** and **Go Goroutines**.

### 1. Vision Layer (YOLO11n + HF Fallback)
At the edge (the CCTV cameras), Python FastAPI servers run **YOLO11n** object detection. This happens at 30+ FPS, translating video into pure density matrices and optical flow vectors. If the primary hardware panics or accelerators drop, the vision node dynamically falls back to a cloud-based Hugging Face `facebook/detr-resnet-50` pipeline. 

### 2. Decision Layer (Go Agent Network)
The vision nodes stream numeric telemetry (density, velocity) to a Go backend. **Every physical zone is its own Goroutine.** 
`GATE_A` doesn't wait for a central supervisor. If `GATE_A` detects it is over capacity, it opens a Go Channel directly to `GATE_B` and negotiates an overflow reroute in sub-milliseconds.

### 3. Execution Layer (Next.js WS Terminal)
When a deal is struck, the backend pushes the intervention over WebSockets directly to the Next.js UI, giving the operator real-time visibility into the autonomous reroutes while allowing instant manual overrides via the `[ DEMO // OVERRIDE ]` panel.
