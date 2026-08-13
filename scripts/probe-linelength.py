import json
import socket
import subprocess
import sys
import tempfile
import time

FIREFOX = "/Applications/Firefox.app/Contents/MacOS/firefox"
PORT = 2828
url = sys.argv[1]

profile = tempfile.mkdtemp(prefix="ffprobe-")
proc = subprocess.Popen(
    [FIREFOX, "--headless", "--marionette", "--no-remote", f"--profile={profile}", "about:blank"],
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
)

def recv_packet(sock):
    buf = b""
    while b":" not in buf:
        buf += sock.recv(1)
    length = int(buf[:-1]); data = b""
    while len(data) < length:
        data += sock.recv(length - len(data))
    return json.loads(data)

def send_packet(sock, obj):
    payload = json.dumps(obj).encode()
    sock.sendall(str(len(payload)).encode() + b":" + payload)

try:
    time.sleep(2)
    sock = socket.create_connection(("127.0.0.1", PORT), timeout=30)
    recv_packet(sock)

    def cmd(command, parameters=None, cid=1):
        send_packet(sock, [0, cid, command, parameters or {}])
        while True:
            resp = recv_packet(sock)
            if resp[1] == cid and resp[0] == 1:
                if resp[2]:
                    raise RuntimeError(f"{command}: {resp[2]} {resp[3]}")
                return resp[3]

    cmd("WebDriver:NewSession", {"capabilities": {"alwaysMatch": {"moz:firefoxOptions": {"args": ["-headless"]}}, "firstMatch": [{}]}}, cid=0)
    cmd("WebDriver:SetWindowRect", {"x": 0, "y": 0, "width": 1440, "height": 1400})
    cmd("WebDriver:Navigate", {"url": url})
    time.sleep(6)

    probe = """
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      const t = walker.currentNode.textContent.replace(/\\s+/g, ' ').trim();
      if (!t || t.length < 12) continue;
      nodes.push({ text: t, el: walker.currentNode.parentElement });
    }
    const seen = new Set();
    for (const { text, el } of nodes) {
      if (!el || seen.has(el)) continue;
      seen.add(el);
      const cs = getComputedStyle(el);
      const w = el.getBoundingClientRect().width;
      const fs = parseFloat(cs.fontSize);
      const ch = fs ? (w / (fs * 0.6)) : 0;
      if (ch > 80 && !['nav','button'].includes(el.tagName.toLowerCase())) {
        out.push({
          tag: el.tagName,
          cls: (el.className || '').toString().slice(0, 70),
          w: Math.round(w),
          fs: fs,
          ch: Math.round(ch),
          lh: cs.lineHeight,
          text: text.slice(0, 80),
        });
      }
    }
    return out;
    """
    res = cmd("WebDriver:ExecuteScript", {"script": probe, "args": []}, cid=3)
    vals = res.get("value") if isinstance(res, dict) else res
    for v in vals:
        print(f"{v['tag']} ch={v['ch']} w={v['w']}px fs={v['fs']} lh={v['lh']} cls=({v['cls']}) text=«{v['text']}»")
finally:
    try:
        proc.terminate()
    except Exception:
        pass
