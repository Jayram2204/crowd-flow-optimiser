"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

const REPO_URL = "https://github.com/Jayram2204/crowd-flow-optimiser";

export default function LandingPage() {
  const [ready, setReady] = useState(false);
  const [pinged, setPinged] = useState(false);
  const pingRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    const el = pingRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setPinged(true);
          io.disconnect();
        }
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const leadIn = ready ? "landing-ready" : "";
  const pingOn = pinged ? "on" : "";

  return (
    <main className="min-h-screen">
      <noscript>
        <style>{`
          .landing-lead-in, .landing-thesis-in, .negotiation-ping,
          .negotiation-ping .ping-dot, .negotiation-ping .ping-accept {
            opacity: 1 !important; transform: none !important; animation: none !important; filter: none !important;
          }
        `}</style>
      </noscript>

      <header className="border-b border-edge">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-4">
          <div className="flex items-baseline gap-3">
            <a href="/" className="text-sm font-bold tracking-[0.25em] text-slate-100">
              CROWD<span className="text-terminal">_FLOW</span>
              <span className="text-term-dim">//</span>
              OPTIMISER
            </a>
            <span className="hidden text-[10px] tracking-widest text-term-dim sm:inline">
              DECENTRALIZED ZONE-AGENT NETWORK
            </span>
          </div>
          <nav className="flex items-center gap-6 text-[11px] tracking-widest">
            <a href="#how-it-works" className="text-term-dim transition-colors hover:text-slate-100">
              HOW IT WORKS
            </a>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="text-term-dim transition-colors hover:text-slate-100"
            >
              READ THE REPO
            </a>
            <a
              href="/operate"
              className="inline-flex min-h-[36px] items-center border border-terminal/60 px-4 py-2 font-bold text-terminal transition-colors hover:bg-terminal/10"
            >
              WATCH IT WORK
            </a>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4">
        <section className="pb-16 pt-14 lg:pb-24 lg:pt-20">
          <div className={`landing-display ${leadIn}`}>
            <span className="landing-lead-in block text-terminal">WE EXECUTE,</span>
            <span className="landing-lead-in block text-slate-100">WE DON&apos;T JUST</span>
            <span className="landing-lead-in block text-slate-100">
              WATCH<span className="text-terminal">.</span>
            </span>
          </div>

          <p className="landing-thesis-in mt-9 max-w-[42rem] text-base leading-relaxed text-[#c7d2cf] lg:text-lg">
            A decentralized network of autonomous zone agents that talks to itself,
            negotiates in microseconds, and changes physical signage, with no central point of failure,{" "}
            <span className="text-slate-100">with no central point of failure</span>, and no
            operator glued to a monitor.
          </p>

          <div className="landing-thesis-in mt-10 flex flex-wrap items-center gap-4">
            <a
              href="/operate"
              className="inline-flex min-h-[44px] items-center border border-terminal/60 px-5 text-[11px] font-bold tracking-widest text-terminal transition-colors hover:bg-terminal/10"
            >
              WATCH IT WORK ▸
            </a>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-[44px] items-center border border-edge px-5 text-[11px] font-bold tracking-widest text-term-dim transition-colors hover:border-slate-100 hover:text-slate-100"
            >
              READ THE REPO
            </a>
          </div>

          <div className="landing-thesis-in mt-14 flex flex-wrap items-center gap-x-8 gap-y-2 border-t border-edge pt-4 text-[10px] tracking-widest text-term-dim">
            <span>9 ZONE AGENTS · GO GOROUTINES</span>
            <span className="hidden sm:inline">PEER-TO-PEER · CHANNELS</span>
            <span className="hidden md:inline">SIGNAGE EXECUTION · AUDIT LOG</span>
            <span className="hidden lg:inline">SUB-MILLISECOND NEGOTIATION</span>
          </div>
        </section>

        <section className="border-t border-edge py-16 lg:py-20">
          <div className="max-w-[42rem]">
            <h2 className="text-[11px] font-bold tracking-widest text-term-dim">
              THE GAP — THE LAST MILE
            </h2>
            <div className="mt-8 space-y-6 text-base leading-relaxed text-[#c7d2cf]">
              <p>
                Detection is cheap. Vision models have been counting people for a decade: a
                density number is raw material, not a decision. The hard problem is what happens
                next.
              </p>
              <p>
                People follow signs, herd, and panic. You cannot predict your way out of that.
                You have to intervene your way out of it, in real time.
              </p>
            </div>
            <p className="mt-10 max-w-[42rem] text-xl font-medium leading-snug text-slate-100 lg:text-2xl">
              The last mile between{" "}
              <span className="text-term-amber">&ldquo;we know where it&rsquo;s crowded&rdquo;</span>{" "}
              and{" "}
              <span className="text-terminal">&ldquo;we changed where people go&rdquo;</span> is
              where people get hurt.
            </p>
          </div>
        </section>

        <section className="border-t border-edge py-16 lg:py-20">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[11px] font-bold tracking-widest text-term-dim">
              EVIDENCE — THE CONTROL ROOM
            </h2>
            <span className="text-[10px] tracking-widest text-term-dim">
              LIVE CAPTURE · 2026.08.13
            </span>
          </div>
          <figure className="border border-edge bg-panel">
            <div className="flex flex-wrap items-center gap-2 border-b border-edge px-3 py-2 text-[10px] tracking-widest">
              <span className="led bg-terminal text-terminal" aria-hidden="true" />
              <span className="text-terminal">STREAM::LIVE</span>
              <span className="text-term-dim">·</span>
              <span className="text-term-dim">DECENTRALIZED ZONE-AGENT NETWORK</span>
              <span className="ml-auto hidden text-term-dim sm:inline">
                telemetry: HF live inference · synthetic input
              </span>
            </div>
            <Image
              src="/operate-plate.png"
              alt="Live control room: a zone-agent network negotiating overflow peer-to-peer and executing signage reroutes on live HF-inferred telemetry"
              width={1440}
              height={1148}
              priority
              className="h-auto w-full"
            />
            <figcaption className="max-w-[69ch] border-t border-edge px-3 py-2 text-[11px] leading-relaxed text-term-dim">
              The actual control room, captured live: nine independent Go agents negotiating overflow
              peer-to-peer and executing signage reroutes, logged as they fire. No mockup: this
              is the running system, density derived from real HF person detection over synthetic footage.
            </figcaption>
          </figure>
        </section>

        <section id="how-it-works" className="scroll-mt-6 border-t border-edge py-16 lg:py-20">
          <h2 className="text-[11px] font-bold tracking-widest text-term-dim">
            HOW IT WORKS — NO CENTRAL POINT OF FAILURE
          </h2>
          <ol className="mt-10 space-y-12">
            <li className="grid gap-2 lg:grid-cols-[3.5rem_minmax(0,1fr)]">
              <span className="pt-1 text-[11px] font-bold text-term-dim">01</span>
              <div>
                <h3 className="font-bold text-slate-100">Zone agents, not a simulation</h3>
                <p className="mt-2 max-w-[42rem] leading-relaxed text-[#c7d2cf]">
                  Every zone is an independent decision-maker: a Go goroutine that reads its own
                  density and holds no global state. GATE_A does not wait for a central server to
                  tell it what to do.
                </p>
              </div>
            </li>
            <li className="grid gap-2 lg:grid-cols-[3.5rem_minmax(0,1fr)]">
              <span className="pt-1 text-[11px] font-bold text-term-dim">02</span>
              <div>
                <h3 className="font-bold text-slate-100">Peer negotiation over channels</h3>
                <p className="mt-2 max-w-[42rem] leading-relaxed text-[#c7d2cf]">
                  Agents talk directly, message-passing over channels. GATE_A offers its overflow
                  to the least-loaded neighbour it can reach; the neighbour accepts or refuses on
                  its own spare capacity. Microseconds. No coordinator.
                </p>
                <div ref={pingRef} className={`negotiation-ping mt-7 ${pingOn}`}>
                  <svg viewBox="0 0 260 96" aria-hidden="true" className="w-[260px] max-w-full">
                    <g fill="none" stroke="#16232b" strokeWidth="1">
                      <rect x="16" y="30" width="72" height="36" />
                      <rect x="172" y="30" width="72" height="36" />
                      <line x1="88" y1="48" x2="172" y2="48" />
                    </g>
                    <g className="font-mono" fontSize="10" letterSpacing="0.1em">
                      <text x="52" y="52" textAnchor="middle" fill="#7b8c95">
                        GATE_A
                      </text>
                      <text x="208" y="52" textAnchor="middle" fill="#7b8c95">
                        GATE_B
                      </text>
                      <text x="52" y="84" textAnchor="middle" fill="#7b8c95">
                        OFFER 36 →
                      </text>
                      <text className="ping-accept" x="130" y="84" textAnchor="middle" fill="#0aff9d">
                        ACCEPTED · 42µs
                      </text>
                    </g>
                    <circle className="ping-dot" cx="62" cy="48" r="3" fill="#ffb000" />
                  </svg>
                </div>
              </div>
            </li>
            <li className="grid gap-2 lg:grid-cols-[3.5rem_minmax(0,1fr)]">
              <span className="pt-1 text-[11px] font-bold text-term-dim">03</span>
              <div>
                <h3 className="font-bold text-slate-100">Autonomous signage execution</h3>
                <p className="mt-2 max-w-[42rem] leading-relaxed text-[#c7d2cf]">
                  An accepted deal becomes a physical intervention, a signage reroute or a hold,
                  fired against the intervention service and written to an audit log. Action, not
                  a recommendation.
                </p>
              </div>
            </li>
            <li className="grid gap-2 lg:grid-cols-[3.5rem_minmax(0,1fr)]">
              <span className="pt-1 text-[11px] font-bold text-term-dim">04</span>
              <div>
                <h3 className="font-bold text-slate-100">Operator override</h3>
                <p className="mt-2 max-w-[42rem] leading-relaxed text-[#c7d2cf]">
                  The system acts on its own. The operator confirms and can force signage from
                  the control room at any moment: autonomy with a kill switch.
                </p>
              </div>
            </li>
          </ol>
        </section>

        <section className="border-t border-edge py-16 lg:py-20">
          <h2 className="text-[11px] font-bold tracking-widest text-term-dim">
            STATUS — WHAT&apos;S REAL TODAY
          </h2>
          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <div className="border border-edge bg-panel">
              <div className="flex items-center gap-2 border-b border-edge px-4 py-2 text-[10px] tracking-widest">
                <span className="led bg-terminal text-terminal" aria-hidden="true" />
                <span className="text-[11px] text-terminal">TODAY</span>
              </div>
              <div className="max-w-[65ch] px-4 py-4 text-[11px] leading-relaxed text-[#c7d2cf]">
                Decentralized Go agent network: nine autonomous zone agents negotiating and
                executing live. Telemetry:{" "}
                <span className="text-slate-100">HF live inference · synthetic input</span> (real
                person detection over sample footage).
              </div>
            </div>
            <div className="border border-edge bg-panel">
              <div className="flex items-center gap-2 border-b border-edge px-4 py-2 text-[10px] tracking-widest">
                <span className="led bg-term-amber text-term-amber" aria-hidden="true" />
                <span className="text-[11px] text-term-amber">IN PROGRESS</span>
              </div>
              <div className="max-w-[65ch] px-4 py-4 text-[11px] leading-relaxed text-[#c7d2cf]">
                Real CCTV feeds: person detection runs live on sample footage today; wiring actual
                venue cameras is the remaining step. No real venue footage is implied.
              </div>
            </div>
          </div>
          <p className="mt-8 text-[10px] tracking-widest text-term-dim">
            SIMULATED INPUT IS CALLED SIMULATED INPUT — STATUS IS LABELED HONESTLY
            <span className="text-terminal">_</span>
          </p>
        </section>

        <section className="border-t border-edge py-20 lg:py-24">
          <p className="max-w-[30ch] text-3xl font-semibold leading-snug text-slate-100 lg:text-4xl">
            Monitoring a dashboard doesn&apos;t save lives. Executing interventions does.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <a
              href="/operate"
              className="inline-flex min-h-[44px] items-center border border-terminal/60 px-5 text-[11px] font-bold tracking-widest text-terminal transition-colors hover:bg-terminal/10"
            >
              WATCH IT WORK ▸
            </a>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-[44px] items-center border border-edge px-5 text-[11px] font-bold tracking-widest text-term-dim transition-colors hover:border-slate-100 hover:text-slate-100"
            >
              READ THE REPO
            </a>
          </div>
          <p className="mt-8 text-[10px] tracking-widest text-term-dim">
            HACKATHON PROTOTYPE · PRODUCTION-GRADE ARCHITECTURE · SIMULATED ACTUATORS
          </p>
        </section>
      </div>

      <footer className="border-t border-edge">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-8 gap-y-2 px-4 py-6 text-[10px] tracking-widest text-term-dim">
          <span>CROWD_FLOW // OPTIMISER</span>
          <span>MIT LICENSE · BUILD SOMETHING THAT KEEPS PEOPLE MOVING</span>
        </div>
      </footer>
    </main>
  );
}
