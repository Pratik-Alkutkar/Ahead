"""Thin Nessie v2 client: Bearer key in the header, 3s timeout, 3 retries with backoff, GETs cached to cache/*.json.
v2 money is integer cents (amount_cents, balance_cents) except bills' payment_amount (dollars)."""
import hashlib
import json
import time

import httpx

from config import CACHE, NESSIE_API_KEY, NESSIE_URL

_client = httpx.Client(base_url=NESSIE_URL, timeout=3.0, headers={"Authorization": f"Bearer {NESSIE_API_KEY}"})


class NessieError(Exception):
    pass


def _call(method: str, path: str, body=None):
    last = None
    for attempt in range(3):
        try:
            r = _client.request(method, path, json=body)
            if r.status_code == 429 or r.status_code >= 500:
                raise NessieError(f"{method} {path} -> {r.status_code}")
            if r.status_code >= 400 and not (method == "DELETE" and r.status_code == 404):
                # 4xx won't fix itself; don't retry. Body may echo input but never the key.
                raise NessieError(f"{method} {path} -> {r.status_code}: {r.text[:200]}")
            return r.json() if r.content else None
        except (httpx.HTTPError, NessieError) as e:
            last = e
            if isinstance(e, NessieError) and "-> 4" in str(e) and "-> 429" not in str(e):
                break
            time.sleep(0.3 * 2**attempt)
    raise NessieError(str(last))


def _cache_file(path: str):
    return CACHE / f"get_{hashlib.sha1(path.encode()).hexdigest()[:12]}.json"


def get(path: str):
    """Returns the list (v2 wraps lists in {"items": [...]}) or the object."""
    f = _cache_file(path)
    try:
        data = _call("GET", path)
        data = data["items"] if isinstance(data, dict) and "items" in data else data
        f.write_text(json.dumps(data))
        return data
    except NessieError:
        if f.exists():
            return json.loads(f.read_text())
        raise


def post(path: str, body: dict) -> str:
    """Returns the created object's id."""
    res = _call("POST", path, body)
    return res.get("id") or res.get("_id") or res["objectCreated"]["_id"]


def delete(path: str):
    _call("DELETE", path)


def cents(dollars) -> int:
    return int(round(float(dollars) * 100))
