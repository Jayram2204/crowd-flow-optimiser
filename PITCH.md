---
marp: true
theme: default
class: lead
backgroundColor: "#04070a"
color: "#c7d2cf"
style: |
  h1, h2, h3 { color: #0aff9d; font-family: 'JetBrains Mono', monospace; }
  strong { color: #ffb000; }
---

# CROWD_FLOW // OPTIMISER
### We Execute. We Don't Just Watch.

Decentralized multi-agent crowd management. 
Autonomous zone agents negotiate peer-to-peer and execute physical signage interventions — **no central point of failure.**

---

## 1. The Problem: The "Last Mile" Action Gap

Detection is cheap. Vision models have counted people for a decade.
**A density number is not a decision, it is raw material.**

When a stampede begins, a central map with a red blob is just an expensive mirror. 
You can watch a bottleneck form and still watch people get crushed because **nobody closed the loop**.

---

## 2. The Solution: Decentralized Autonomy

We treat the venue as a **dynamic network of autonomous zone agents**.
Every physical gate (`GATE_A`, `CONCOURSE_B`) is an independent **Go Goroutine**.

* **No Central Supervisor:** `GATE_A` reads its own density. If overflowing, it negotiates directly with `GATE_B` via Go channels.
* **Microsecond Negotiation:** Peer-to-peer offers and acceptance happen instantly.
* **Zero Saturation:** A hot zone never blocks a cold zone.

---

## 3. The Architecture

**1. Vision Node (Python / Edge)**
Runs ultra-low-latency **YOLO11n** object detection at 30+ FPS. Extracts density and flow vectors. 

**2. Decision Engine (Go / P2P)**
Consumes telemetry. Zones act as independent agents.

**3. Execution Layer (Next.js / WS)**
Displays real-time interventions and allows instant operator override over high-speed WebSockets.

---

## 4. Live Scenario Injection (Demo)

*Watch the system react under pressure.*

- **Trigger:** Inject `GATE_A` Bottleneck (1.45 pax/m²).
- **Reaction:** `GATE_A` goroutine detects critical threshold.
- **Negotiation:** Sends offer to `CORRIDOR_B`.
- **Execution:** Signage API flips. Flow diverted. 
- **Time Elapsed:** 42 microseconds.

**Monitoring doesn't save lives. Execution does.**
