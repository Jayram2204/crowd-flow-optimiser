# The Free Live Deployment Playbook

This document outlines the 100% free live deployment strategy for Crowd Flow Optimiser, utilizing Vercel for the frontend and Render.com's free tier for the backend and AI services.

## 1. Frontend: Vercel
Vercel natively understands Next.js, automatically provisions HTTPS (required for webcam access), and supports WebSockets on the client side.
- **Action**: Connect your GitHub repo to [Vercel](https://vercel.com). Leave the build command as `npm run build`. It will deploy instantly.
- **Env Vars**: Set `NEXT_PUBLIC_TELEMETRY_WS_URL` to your Render Go backend's production WSS URL (e.g., `wss://cfo-backend.onrender.com`).

## 2. Backend (Go Logic Engine): Render.com
Render provides a free tier for Web Services that natively builds Dockerfiles and supports secure `wss://` WebSocket connections.
- **Action**: Log into [Render.com](https://render.com) -> **New** -> **Web Service** -> **Build and deploy from a Git repository**.
- **Configuration**:
  - **Root Directory**: `backend`
  - **Runtime**: `Docker` (Render will auto-detect the Dockerfile).
  - **Instance Type**: Free
- **Env Vars**:
  - `PORT=8080`
  - `BACKEND_ZONE_TOPOLOGY="GATE_A,GATE_B,CONCOURSE_A"` (Adjust as needed)

*Note: Render's free web services spin down after 15 minutes of inactivity. Just ping the URL before your hackathon pitch to wake it up.*

## 3. AI Telemetry (Python / YOLO11n): Render.com
You will deploy the Python layer as a second free service on Render. Because the free tier uses basic shared CPUs, it is highly recommended to run this in simulated mode unless you only need 1-2 FPS.
- **Action**: **New** -> **Web Service** -> **Build and deploy from a Git repository**.
- **Configuration**:
  - **Root Directory**: `ai-telemetry`
  - **Runtime**: `Docker`
  - **Instance Type**: Free
- **Env Vars**:
  - `PORT=8000`
  - `AI_EMIT_TO_BACKEND="https://<YOUR-RENDER-BACKEND-URL>/api/v1/telemetry"`
  - `AI_MODE="simulated"` (or `live` if you want to push the free CPU to its limit).
