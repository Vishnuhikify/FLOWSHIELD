"""Shared backend-lifecycle helper for the tools/e2e_*.py browser checks.

Two lifecycles are built on this module so all four scripts behave consistently and predictably,
regardless of whether a backend happens to be running on :8000 already:

  - AUTO (`with Backend() as bk:`): if a backend is already answering on :8000, it is adopted and left
    running when the script exits; if none is running, one is started and stopped automatically. Safe to
    run alongside a backend you started by hand. Used by e2e_map.py, e2e_demo.py and
    e2e_historical_zoom.py, none of which need the server to actually go down during the run.

  - MANAGED (`bk.force_down()` / `bk.force_up()`): used only by e2e_audit.py, which must exercise the
    app's "server offline" banner and therefore needs full, deliberate control of port 8000 for its run -
    including stopping whatever already answers there. It restores a healthy backend before finishing.

Needs `pip install psutil` for `force_down()` to be able to stop a backend it did not start itself
(e.g. one you launched by hand in another terminal). Without psutil, force_down() only stops a backend
this script started, and prints a note asking you to free port 8000 yourself otherwise.
"""
import subprocess
import time
import urllib.request
from pathlib import Path

try:
    import psutil
except ImportError:
    psutil = None

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
HEALTH_URL = "http://127.0.0.1:8000/api/health"
PORT = 8000


def backend_alive():
    try:
        urllib.request.urlopen(HEALTH_URL, timeout=1)
        return True
    except Exception:
        return False


def _wait_healthy(timeout=15):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if backend_alive():
            return True
        time.sleep(0.2)
    return False


def _kill_port(port=PORT):
    """Stop whatever process is actually listening on `port`, whoever started it."""
    if psutil is None:
        print(f"[_servers] psutil not installed - can't force-stop a backend on :{port} I didn't start; "
              "install it with `pip install psutil`, or stop the backend yourself before running this script.")
        return
    for conn in psutil.net_connections(kind="inet"):
        if conn.laddr and conn.laddr.port == port and conn.status == psutil.CONN_LISTEN and conn.pid:
            try:
                psutil.Process(conn.pid).terminate()
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
    time.sleep(0.3)


class Backend:
    """See module docstring for the AUTO vs MANAGED lifecycles."""

    def __init__(self):
        self.proc = None      # the process THIS object started, if any
        self.adopted = False  # True if it found one already running and left it alone

    def up(self, wait=15):
        """Start the backend if none is running yet; otherwise adopt the one already there."""
        if backend_alive():
            self.adopted = True
            return
        self.proc = subprocess.Popen(
            ["python3", "-m", "uvicorn", "app.main:app", "--port", str(PORT)],
            cwd=BACKEND_DIR, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        if not _wait_healthy(wait):
            raise RuntimeError(f"backend did not become healthy within {wait}s")

    def down(self):
        """Stop only the backend this object started; a backend it adopted is left running."""
        if self.proc is not None:
            self.proc.terminate()
            self.proc.wait()
            self.proc = None

    def force_down(self):
        """Stop whatever answers on the port, ours or not. For checks that need a genuine offline state."""
        self.down()
        if backend_alive():
            _kill_port()
        self.adopted = False

    def force_up(self, wait=15):
        """Guarantee a backend is answering, starting a fresh one if needed."""
        if not backend_alive():
            self.up(wait)

    def __enter__(self):
        self.up()
        return self

    def __exit__(self, exc_type, exc, tb):
        self.down()
