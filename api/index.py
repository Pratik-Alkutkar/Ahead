import os
import sys
from pathlib import Path

from fastapi import FastAPI

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ahead_backend"))
for name in (
    "NESSIE_API_KEY", "DATABASE_URL", "NVIDIA_API_KEY", "GEMINI_API_KEY",
    "ASR_API_KEY", "TTS_API_KEY", "ASR_FUNCTION_ID", "TTS_FUNCTION_ID",
):
    os.environ.pop(name, None)
from main import app as ahead_api

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.mount("/api/ahead", ahead_api)
