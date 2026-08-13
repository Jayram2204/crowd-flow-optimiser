import re, sys

CSS = "frontend/app/globals.css"
TSX = "frontend/components/landing/LandingPage.tsx"

def patch(path, replacements, label):
    s = open(path).read()
    results = []
    for old, new in replacements:
        if old not in s:
            results.append(f"  MISSING  [{label}] {old[:60]!r}")
            continue
        s = s.replace(old, new, 1)
        results.append(f"  ok       [{label}]")
    open(path, "w").write(s)
    print(f"## {path}")
    print("\n".join(results) if results else "  no-op")

patch(CSS, [
    (
        "@keyframes landing-lead-in {\n  from {\n    opacity: 0;\n    transform: translateY(0.55em);\n  }\n  to {\n    opacity: 1;\n    transform: translateY(0);\n  }\n}",
        "@keyframes landing-lead-in {\n  from {\n    opacity: 0;\n    transform: translateY(0.55em);\n    filter: blur(6px);\n  }\n  to {\n    opacity: 1;\n    transform: translateY(0);\n    filter: blur(0);\n  }\n}",
    ),
    (
        "@keyframes landing-thesis-in {\n  from {\n    opacity: 0;\n    transform: translateY(0.4em);\n  }\n  to {\n    opacity: 1;\n    transform: translateY(0);\n  }\n}",
        "@keyframes landing-thesis-in {\n  from {\n    opacity: 0;\n    transform: translateY(0.4em);\n    filter: blur(4px);\n  }\n  to {\n    opacity: 1;\n    transform: translateY(0);\n    filter: blur(0);\n  }\n}",
    ),
    (
        "  text-wrap: balance;\n",
        "",
    ),
    (
        "/* Blinking status cursor: the one idle beat the control room forbids,\n   earned here on the status ledger. */\n@keyframes landing-blink {\n  0%,\n  60% {\n    opacity: 1;\n  }\n  61%,\n  100% {\n    opacity: 0;\n  }\n}\n\n.landing-cursor {\n  animation: landing-blink 1.1s steps(1) infinite;\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .landing-lead-in,\n  .landing-thesis-in,\n  .negotiation-ping,\n  .negotiation-ping .ping-dot,\n  .negotiation-ping .ping-accept,\n  .landing-cursor {\n    opacity: 1 !important;\n    animation: none !important;\n    transform: none !important;\n  }\n}",
        "/* Blinking status cursor removed: the brief pins exactly two authored\n   motion moments (headline resolution + negotiation ping). The honesty\n   line's underscore stays as static terminal-green text. */\n\n@media (prefers-reduced-motion: reduce) {\n  .landing-lead-in,\n  .landing-thesis-in,\n  .negotiation-ping,\n  .negotiation-ping .ping-dot,\n  .negotiation-ping .ping-accept {\n    opacity: 1 !important;\n    animation: none !important;\n    transform: none !important;\n    filter: none !important;\n  }\n}",
    ),
], "globals")

patch(TSX, [
    (
        'className="border border-terminal/60 px-4 py-2 font-bold text-terminal transition-colors hover:bg-terminal/10"',
        'className="inline-flex min-h-[36px] items-center border border-terminal/60 px-4 py-2 font-bold text-terminal transition-colors hover:bg-terminal/10"',
    ),
    (
        "max-w-[46rem]",
        "max-w-[42rem]",
    ),
    (
        "counting people for a decade — a",
        "counting people for a decade: a",
    ),
    (
        "The actual control room, live — nine independent Go agents",
        "The actual control room, captured live — nine independent Go agents",
    ),
    (
        '<figcaption className="border-t border-edge px-3 py-2 text-[11px] leading-relaxed text-term-dim">',
        '<figcaption className="max-w-[72ch] border-t border-edge px-3 py-2 text-[11px] leading-relaxed text-term-dim">',
    ),
    (
        '<div className="px-4 py-4 text-[11px] leading-relaxed text-[#c7d2cf]">',
        '<div className="max-w-[65ch] px-4 py-4 text-[11px] leading-relaxed text-[#c7d2cf]">',
    ),
    (
        '<span className="text-terminal">TODAY</span>',
        '<span className="text-[11px] text-terminal">TODAY</span>',
    ),
    (
        '<span className="text-term-amber">IN PROGRESS</span>',
        '<span className="text-[11px] text-term-amber">IN PROGRESS</span>',
    ),
    (
        "HONESTY IS A PRODUCT PRINCIPLE — THE LABEL IS THE PROMISE\n            <span className=\"landing-cursor text-terminal\">_</span>",
        "SIMULATED INPUT IS CALLED SIMULATED INPUT — STATUS IS LABELED HONESTLY\n            <span className=\"text-terminal\">_</span>",
    ),
    (
        "max-w-[30ch] text-3xl font-semibold leading-tight text-slate-100",
        "max-w-[30ch] text-3xl font-semibold leading-snug text-slate-100",
    ),
    (
        "          .landing-lead-in, .landing-thesis-in, .negotiation-ping,\n          .negotiation-ping .ping-dot, .negotiation-ping .ping-accept,\n          .landing-cursor { opacity: 1 !important; transform: none !important; animation: none !important; }",
        "          .landing-lead-in, .landing-thesis-in, .negotiation-ping,\n          .negotiation-ping .ping-dot, .negotiation-ping .ping-accept {\n            opacity: 1 !important; transform: none !important; animation: none !important; filter: none !important;\n          }",
    ),
], "tsx")
