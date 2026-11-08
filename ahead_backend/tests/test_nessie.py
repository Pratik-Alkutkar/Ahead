import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
import nessie  # noqa: E402


def test_v2_shapes(monkeypatch, tmp_path):
    monkeypatch.setattr(nessie, "CACHE", tmp_path)
    monkeypatch.setattr(nessie, "_call", lambda m, p, b=None: {"id": "acc_1"} if m == "POST" else {"items": [{"id": "b1"}], "next_cursor": None})
    assert nessie.post("/accounts", {}) == "acc_1"
    assert nessie.get("/bills") == [{"id": "b1"}]
    assert nessie.cents(12.345) == 1234 or nessie.cents(12.345) == 1235
    assert nessie.cents(800) == 80000
