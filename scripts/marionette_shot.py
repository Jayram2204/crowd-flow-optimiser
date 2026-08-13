import base64
import json
import os
import socket
import subprocess
import tempfile
import time

FIREFOX = "/Applications/Firefox.app/Contents/MacOS/firefox"
PORT = 2828

profile = tempfile.mkdtemp(prefix="ffmar-")
proc = subprocess.Popen(
    [FIREFOX, "--headless", "--marionette", "--no-remote", f"--profile={profile}", "about:blank"],
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
)

def recv_packet(sock):
    buf = b""
    while b":" not in buf:
        buf += sock.recv(1)
    length = int(buf[:-1])
    data = b""
    while len(data) < length:
        chunk = sock.recv(length - len(data))
        if not chunk:
            break
        data += chunk
    return json.loads(data)

def send_packet(sock, obj):
    payload = json.dumps(obj).encode()
    sock.sendall(str(len(payload)).encode() + b":" + payload)

try:
    time.sleep(2)
    sock = socket.create_connection(("127.0.0.1", PORT), timeout=30)
    hello = recv_packet(sock)
    print("hello:", hello)

    def cmd(command, parameters=None, cid=1):
        send_packet(sock, [0, cid, command, parameters or {}])
        while True:
            resp = recv_packet(sock)
            if resp[1] == cid and resp[0] == 1:
                if resp[2]:
                    raise RuntimeError(f"{command} error: {resp[2]} {resp[3]}")
                return resp[3]

    new_sess = cmd("WebDriver:NewSession", {
        "capabilities": {"alwaysMatch": {"moz:firefoxOptions": {"args": ["-headless"]}}, "firstMatch": [{}]},
    }, cid=0)
    print("session:", new_sess.get("sessionId"))

    cmd("WebDriver:SetWindowRect", {"x": 0, "y": 0, "width": 1440, "height": 1400})
    cmd("WebDriver:Navigate", {"url": "http://localhost:3001/"})
    print("navigated, waiting for data...")
    time.sleep(6)
    result = cmd("WebDriver:TakeScreenshot", cid=2)
    with open("/tmp/shot_live.png", "wb") as f:
        f.write(base64.b64decode(result["value"]))
    print("saved /tmp/shot_live.png")

    result = cmd("WebDriver:GetPageSource", cid=3)
    html = result["value"]
    for s in ["CROWD_FLOW", "FORCE REROUTE", "BAG_CHECK", "CONCOURSE_A", "STREAM"]:
        print(s, "->", s in html)
    open("/tmp/page_live.html", "w").write(html)
finally:
    try:
        proc.terminate()
    except Exception:
        pass
