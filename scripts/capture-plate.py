import base64
import json
import socket
import subprocess
import tempfile
import time
import urllib.request

FIREFOX = "/Applications/Firefox.app/Contents/MacOS/firefox"
PORT = 2828
OUT = "/tmp/plate_capture.png"

profile = tempfile.mkdtemp(prefix="ffplate-")
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

def backend_critical():
    try:
        with urllib.request.urlopen("http://localhost:8080/api/v1/zones", timeout=3) as r:
            data = json.loads(r.read().decode())
        zones = data.get("zones", [])
        crit = [z for z in zones if z.get("congestion") == "CRITICAL"]
        high = [z for z in zones if z.get("congestion") == "HIGH"]
        return crit, high, len(zones)
    except Exception:
        return None, None, 0

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
    cmd("WebDriver:SetWindowRect", {"x": 0, "y": 0, "width": 1440, "height": 1200})
    cmd("WebDriver:Navigate", {"url": "http://localhost:3001/"})
    print("navigated; watching for a surge...")
    crit, high, n = backend_critical()
    print("initial zones:", n, "critical:", len(crit or []), "high:", len(high or []))
    deadline = time.time() + 75
    while time.time() < deadline:
        time.sleep(2)
        crit, high, n = backend_critical()
        if crit or high:
            print("surge seen: critical", len(crit or []), "high", len(high or []))
            time.sleep(2)  # let the UI paint the frame + log lines
            break
    else:
        print("no surge within window; capturing anyway")
    result = cmd("WebDriver:TakeScreenshot", cid=2)
    with open(OUT, "wb") as f:
        f.write(base64.b64decode(result["value"]))
    print("saved", OUT)
finally:
    try:
        proc.terminate()
    except Exception:
        pass
