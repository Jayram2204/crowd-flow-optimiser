# Production Deployment Guide

This document outlines the live deployment strategy for Crowd Flow Optimiser. Our architecture consists of three decoupled layers: a Next.js frontend, a Go agent network, and a Python AI telemetry node. 

## 1. Frontend: Vercel
The frontend is a Next.js application designed to act as a high-speed financial terminal. 

**Platform**: [Vercel](https://vercel.com)
- **Why**: Native support for Next.js App Router, edge caching, HTTPS termination, and flawless handling of long-lived WebSocket connections required by the UI.
- **Steps**:
  1. Import the repository in Vercel.
  2. Set the **Root Directory** to `frontend`.
  3. Set the Environment Variable `NEXT_PUBLIC_API_URL` to point to the deployed Backend URL (e.g., `wss://backend-production.up.railway.app`).
  4. Deploy.

## 2. Backend: Railway.app
The Go backend acts as the decentralized decision engine and State Manager.

**Platform**: [Railway.app](https://railway.app)
- **Why**: Natively builds the Go Dockerfile. Railway provides excellent support for persistent, long-lived WebSocket (WSS) and Server-Sent Events (SSE) connections without aggressive timeout culling, which is critical for our Go Agent mesh.
- **Steps**:
  1. Create a New Project -> Deploy from GitHub repo.
  2. Set the **Root Directory** to `backend` (Railway will automatically detect the Dockerfile).
  3. Configure Environment Variables:
     - `PORT=8080`
     - `BACKEND_ZONE_TOPOLOGY="GATE_A,GATE_B,CONCOURSE_A"` (Adjust as needed)
  4. Deploy and copy the generated public URL.

## 3. AI Telemetry: Railway.app OR RunPod
The Python telemetry layer translates CCTV frames into density matrices using YOLO11n.

### Option A: Railway.app (CPU Inference)
For basic deployments or using the simulated MP4 loop.
- **Why**: Simple deployment alongside the Go backend.
- **Steps**:
  1. Deploy a new service from the repo, setting **Root Directory** to `ai-telemetry`.
  2. Configure Environment Variables:
     - `PORT=8000`
     - `AI_EMIT_TO_BACKEND="https://<YOUR-BACKEND-URL>.up.railway.app/api/v1/telemetry"`
     - `AI_MODE="simulated"` (or `live` for CPU inference)

### Option B: RunPod (GPU Inference for 30+ FPS)
For high-density, real-world live deployments requiring heavy GPU acceleration for YOLO11n.
- **Why**: Dedicated GPUs (e.g., RTX 3090 / A4000) for uncompromised vision throughput.
- **Steps**:
  1. Build and push the `ai-telemetry/Dockerfile` to Docker Hub or a private registry.
  2. Spin up a RunPod serverless or pod instance using the image.
  3. Expose port 8000.
  4. Map Environment Variables:
     - `AI_EMIT_TO_BACKEND="https://<YOUR-BACKEND-URL>.up.railway.app/api/v1/telemetry"`
     - `AI_MODE="live"`
