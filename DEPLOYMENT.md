# The Live Deployment Playbook

## 1. Frontend: Vercel
Vercel is the only choice here. It natively understands Next.js, automatically provisions HTTPS (which you absolutely need for the browser to allow `navigator.mediaDevices.getUserMedia` for your webcam), and supports WebSockets on the client side.
- **Action**: Connect your GitHub repo to Vercel. Leave the build command as `npm run build`. It will deploy instantly.
- **Env Vars**: Set `NEXT_PUBLIC_WS_BACKEND_URL` to your Go backend's production WSS URL.

## 2. Backend (Go Logic Engine): Railway.app
Serverless platforms (like AWS Lambda or Vercel functions) kill WebSocket connections after a few seconds. Railway provisions continuous containers that keep your Go P2P agent mesh and WebSocket streams alive indefinitely.
- **Action**: Connect your GitHub repo to Railway, select the `/backend` folder. Railway will automatically detect the Dockerfile or Go modules and build it.
- **Networking**: Railway automatically provisions the SSL certificate, so your local `ws://` endpoint becomes a secure `wss://` endpoint.

## 3. AI Telemetry (Python / YOLO11n)
You have two choices here depending on how much hardware you want to throw at the live demo:
- **The Easy Route (Railway.app)**: Deploy the `/ai-telemetry` folder as a second service on Railway. It will run on CPU. It might only get 5–10 FPS, but it requires zero extra configuration and keeps everything in one dashboard.
- **The High-Performance Route (RunPod)**: If you want to flex a flawless 30+ FPS stream for the judges, deploy the Python Docker container to a serverless GPU platform like RunPod. You get an Nvidia RTX GPU for cents per hour.
- **Env Vars**: Point the Python service's `BACKEND_INGEST_URL` to the Railway Go URL.
