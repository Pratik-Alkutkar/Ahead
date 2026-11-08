"""Nemotron via build.nvidia.com (OpenAI-compatible). Timeout, 3 retries with backoff, identical-request cache."""
import json
import os
import time

import httpx

from config import ROOT  # noqa: F401  (loads .env)

BASE = "https://integrate.api.nvidia.com/v1"
# Verify IDs on build.nvidia.com; override in .env.
SUPER = os.getenv("PLANNER_MODEL", "nvidia/llama-3.3-nemotron-super-49b-v1.5")
NANO = os.getenv("WORKER_MODEL", "nvidia/nvidia-nemotron-nano-9b-v2")
GUARD = os.getenv("GUARD_MODEL", "nvidia/llama-3.1-nemoguard-8b-content-safety")

_cache: dict[str, dict] = {}


class LLMUnavailable(Exception):
    pass


def chat(model, messages, tools=None, timeout=20.0, temperature=0.2, tries=3) -> dict:
    """Returns the first choice's message dict."""
    key = os.getenv("NVIDIA_API_KEY")
    if not key:
        raise LLMUnavailable("NVIDIA_API_KEY not set")
    body = {"model": model, "messages": messages, "temperature": temperature, "max_tokens": 1024}
    if tools:
        body["tools"] = tools
    ck = json.dumps(body, sort_keys=True, default=str)
    if ck in _cache:
        return _cache[ck]
    last = None
    for attempt in range(tries):
        try:
            r = httpx.post(f"{BASE}/chat/completions", json=body, timeout=timeout,
                           headers={"Authorization": f"Bearer {key}"})
            if r.status_code == 200:
                msg = r.json()["choices"][0]["message"]
                _cache[ck] = msg
                return msg
            last = f"HTTP {r.status_code}"
            if 400 <= r.status_code < 500 and r.status_code != 429:
                break
        except httpx.HTTPError as e:
            last = type(e).__name__
        time.sleep(0.5 * 2**attempt)
    raise LLMUnavailable(last)
