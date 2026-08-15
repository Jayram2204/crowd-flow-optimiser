"use client";

import { useEffect, useRef, useState } from "react";

export interface DemoControlsProps {
  onInjectBottleneck: () => void;
  onInjectEmergencyBlock: () => void;
  onResetFlow: () => void;
}

export default function DemoControls({
  onInjectBottleneck,
  onInjectEmergencyBlock,
  onResetFlow,
}: DemoControlsProps) {
  const [source, setSource] = useState<"WEBCAM" | "CONCOURSE" | "STADIUM">("WEBCAM");
  const [layers, setLayers] = useState({
    boxes: true,
    vectors: true,
    heatmap: true,
    choke: false,
  });
  const [densityThreshold, setDensityThreshold] = useState(1.5);
  const [speedFriction, setSpeedFriction] = useState(0.8);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let interval: ReturnType<typeof setInterval> | null = null;

    if (source === "WEBCAM") {
      let host = process.env.NEXT_PUBLIC_TELEMETRY_WS_URL || "ws://127.0.0.1:8000";
      // Auto-correct http(s) to ws(s) if the user misconfigured the .env
      host = host.replace("http://", "ws://").replace("https://", "wss://");
      const wsUrl = `${host}/api/v1/ws/live-inference`;
      
      try {
        wsRef.current = new WebSocket(wsUrl);
        wsRef.current.onopen = () => console.log("Live telemetry WS connected");
        wsRef.current.onerror = (e) => console.error("Live telemetry WS error on", wsUrl, e);
      } catch (err) {
        console.error("Failed to construct WebSocket:", err);
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        console.error("getUserMedia unsupported in this environment");
      } else {
        navigator.mediaDevices
          .getUserMedia({ video: { width: 640, height: 480, frameRate: 10 } })
          .then((s) => {
            stream = s;
            if (videoRef.current) {
              videoRef.current.srcObject = s;
              videoRef.current.play();
            }

            interval = setInterval(() => {
              if (
                wsRef.current?.readyState === WebSocket.OPEN &&
                videoRef.current &&
                canvasRef.current
              ) {
                const ctx = canvasRef.current.getContext("2d");
                if (ctx) {
                  ctx.drawImage(videoRef.current, 0, 0, 640, 480);
                  const frame = canvasRef.current.toDataURL("image/jpeg", 0.7);
                  wsRef.current.send(JSON.stringify({ event: "frame", data: frame }));
                }
              }
            }, 100); // 10 FPS
          })
          .catch((err) => console.error("Webcam access denied", err));
      }
    }

    return () => {
      if (interval) clearInterval(interval);
      if (stream) stream.getTracks().forEach((track) => track.stop());
      if (wsRef.current) wsRef.current.close();
    };
  }, [source]);

  const toggleLayer = (key: keyof typeof layers) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="border border-slate-800 bg-[#04070a] text-[10px] tracking-widest text-term-dim p-4 flex flex-col gap-6 relative">
      {/* Webcam preview feed */}
      <video 
        ref={videoRef} 
        className={source === "WEBCAM" ? "w-full border border-slate-800 aspect-video object-cover" : "hidden"}
        muted 
        playsInline 
      />
      {/* Hidden canvas for extracting frames */}
      <canvas ref={canvasRef} width={640} height={480} className="hidden" />

      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <span className="led bg-term-amber text-term-amber" aria-hidden="true" />
        <span className="text-term-amber font-bold">DEMO // OVERRIDE</span>
      </div>

      {/* Source Switcher */}
      <div className="space-y-2">
        <div className="text-slate-400 font-bold">SOURCE</div>
        <div className="flex flex-wrap gap-2">
          {(["WEBCAM", "CONCOURSE", "STADIUM"] as const).map((src) => (
            <button
              key={src}
              onClick={() => setSource(src)}
              className={`border px-2 py-1 transition-colors ${
                source === src
                  ? "border-terminal bg-terminal/10 text-terminal"
                  : "border-slate-800 hover:border-slate-600 hover:text-slate-300"
              }`}
            >
              [ {src === "WEBCAM" ? "WEBCAM (LIVE)" : src === "CONCOURSE" ? "STATION_CONCOURSE.MP4" : "STADIUM_EXIT_SURGE.MP4"} ]
            </button>
          ))}
        </div>
      </div>

      {/* Visual Layer Toggles */}
      <div className="space-y-2">
        <div className="text-slate-400 font-bold">VISUAL LAYERS</div>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries({
            boxes: "Bounding Boxes",
            vectors: "Velocity Vectors / Flow",
            heatmap: "Density Heatmap",
            choke: "Choke Polygons",
          }).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer hover:text-slate-300">
              <input
                type="checkbox"
                checked={layers[key as keyof typeof layers]}
                onChange={() => toggleLayer(key as keyof typeof layers)}
                className="accent-terminal bg-[#04070a] border-slate-800"
              />
              [{layers[key as keyof typeof layers] ? "x" : " "}] {label}
            </label>
          ))}
        </div>
      </div>

      {/* Sensitivity Sliders */}
      <div className="space-y-4">
        <div className="text-slate-400 font-bold">SENSITIVITY</div>
        <div className="space-y-1">
          <div className="flex justify-between">
            <span>Density Threshold (pax/m²)</span>
            <span className="text-terminal">{densityThreshold.toFixed(1)}</span>
          </div>
          <input
            type="range"
            min="0.5"
            max="2.5"
            step="0.1"
            value={densityThreshold}
            onChange={(e) => setDensityThreshold(parseFloat(e.target.value))}
            className="w-full accent-terminal"
          />
        </div>
        <div className="space-y-1">
          <div className="flex justify-between">
            <span>Speed Anomaly Friction</span>
            <span className="text-terminal">{speedFriction.toFixed(1)}</span>
          </div>
          <input
            type="range"
            min="0.1"
            max="1.0"
            step="0.1"
            value={speedFriction}
            onChange={(e) => setSpeedFriction(parseFloat(e.target.value))}
            className="w-full accent-terminal"
          />
        </div>
      </div>

      {/* Scenario Injectors */}
      <div className="space-y-2 border-t border-slate-800 pt-4 mt-2">
        <div className="text-term-red font-bold">SCENARIO INJECTORS</div>
        <div className="flex flex-col gap-2">
          <button
            onClick={onInjectBottleneck}
            className="border border-term-amber/50 bg-term-amber/10 text-term-amber px-3 py-2 text-left hover:bg-term-amber/20 transition-colors"
          >
            [ TRIGGER GATE_A BOTTLENECK ]
          </button>
          <button
            onClick={onInjectEmergencyBlock}
            className="border border-term-red/50 bg-term-red/10 text-term-red px-3 py-2 text-left hover:bg-term-red/20 transition-colors"
          >
            [ SIMULATE EMERGENCY EXIT BLOCK ]
          </button>
          <button
            onClick={onResetFlow}
            className="border border-terminal/40 bg-terminal/10 text-terminal px-3 py-2 text-left hover:bg-terminal/20 transition-colors"
          >
            [ RESET NORMAL FLOW ]
          </button>
        </div>
      </div>
    </div>
  );
}
