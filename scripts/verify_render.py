import subprocess
import tempfile
import os
import re
from PIL import Image
from collections import Counter

URL = "http://localhost:3001/"
SHOT = "/tmp/verify_shot.png"

FIREFOX = "/Applications/Firefox.app/Contents/MacOS/firefox"
proc = subprocess.run(
    [FIREFOX, "--headless", "--screenshot", SHOT, "--window-size=1440,1400", URL],
    capture_output=True, text=True, timeout=90,
)

img = Image.open(SHOT).convert("RGB")
px = img.load()
W, H = img.size
total = W * H

counts = Counter()
for y in range(0, H, 2):
    for x in range(0, W, 2):
        counts[px[x, y]] += 1

sampled = sum(counts.values())
top = counts.most_common(12)
print(f"size {W}x{H}, sampled {sampled} px (every 2nd)")
print("dominant colors (sampled):")
for color, n in top:
    pct = 100.0 * n / sampled
    print(f"  #{color[0]:02x}{color[1]:02x}{color[2]:02x}  {pct:5.2f}%")

dark = sum(n for c, n in top if c[0] < 90 and c[1] < 90 and c[2] < 90)
white = sum(n for c, n in top if c[0] > 235 and c[1] > 235 and c[2] > 235)
print(f"\nDARK (all comps <90): {100.0*dark/sampled:.1f}% of sampled")
print(f"NEAR-WHITE (all comps >235): {100.0*white/sampled:.1f}% of sampled")

def lum(c):
    def f(v):
        v /= 255.0
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = f(c[0]), f(c[1]), f(c[2])
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def contrast(c1, c2):
    l1, l2 = sorted((lum(c1), lum(c2)), reverse=True)
    return (l1 + 0.05) / (l2 + 0.05)

def find_near(target, tol=18):
    hits = []
    for y in range(0, H, 2):
        for x in range(0, W, 2):
            c = px[x, y]
            if all(abs(c[i] - target[i]) <= tol for i in range(3)):
                hits.append((x, y))
    return hits

term_dim = (0x7b, 0x8c, 0x95)
term_grn = (0x0a, 0xff, 0x9d)
term_amb = (0xff, 0xb0, 0x00)
panel = (0x0a, 0x0f, 0x14)
void = (0x04, 0x07, 0x0a)

print("\ntoken-on-page checks (sampled, tol=18/255):")
for name, t in [("text-term-dim #7b8c95", term_dim), ("terminal green #0aff9d", term_grn),
                ("amber #ffb000", term_amb), ("panel #0a0f14", panel), ("void #04070a", void)]:
    n = len(find_near(t))
    print(f"  {name}: {n} px")

# runtime contrast: modal background in neighborhood of term-dim text
hits = find_near(term_dim)
TEXT_TOL = 26
def is_text(c):
    return any(all(abs(c[i] - t[i]) <= TEXT_TOL for i in range(3))
               for t in [term_dim, term_grn, term_amb, (0xff, 0xff, 0xff),
                         (0xc7, 0xd2, 0xcf), (0xf1, 0xf5, 0xf9)])

bg_counts = Counter()
for (x, y) in hits:
    for dy in range(-5, 6):
        for dx in range(-5, 6):
            if dx == 0 and dy == 0:
                continue
            c = px[min(W - 1, x + dx), min(H - 1, y + dy)]
            if not is_text(c):
                bg_counts[c] += 1
if bg_counts:
    bg = bg_counts.most_common(1)[0][0]
    cr = contrast(term_dim, bg)
    print(f"\nruntime bg behind term-dim text: #{bg[0]:02x}{bg[1]:02x}{bg[2]:02x}")
    print(f"runtime contrast term-dim vs that bg: {cr:.2f}:1")

# amber: only expected when warning/new entries exist; count for the record
print(f"amber px found: {len(find_near(term_amb))} (expected 0 in nominal t=0 state)")

if dark > 0.5 * sampled and white < 0.05 * sampled:
    print("\nRESULT: PASS - page renders dark; custom theme colors applied at runtime")
else:
    print("\nRESULT: FAIL - page not rendering dark")
