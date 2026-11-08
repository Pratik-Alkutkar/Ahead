"""Nemotron Speech (Riva on build.nvidia.com): ASR and TTS over gRPC. 8s timeout, 3 retries with backoff.
When keys/ffmpeg are missing or calls fail, raise VoiceUnavailable so the browser falls back to Web Speech."""
import io
import os
import re
import shutil
import subprocess
import time
import wave

from config import ROOT  # noqa: F401  (loads .env)

GRPC_URI = "grpc.nvcf.nvidia.com:443"
TIMEOUT = 8.0
TTS_RATE = 22050
TTS_VOICE = os.getenv("TTS_VOICE", "Magpie-Multilingual.EN-US.Aria")  # verify on the model's build.nvidia.com page


class VoiceUnavailable(Exception):
    pass


def status() -> dict:
    key = bool(os.getenv("NVIDIA_API_KEY"))
    ff = shutil.which("ffmpeg") is not None
    return {"asr": key and bool(os.getenv("ASR_FUNCTION_ID")) and ff, "tts": key and bool(os.getenv("TTS_FUNCTION_ID")),
            "ffmpeg": ff}


def _auth(function_env: str):
    import riva.client
    # each speech model may have its own key (ASR_API_KEY / TTS_API_KEY); fall back to the main one
    fid = os.getenv(function_env)
    key = os.getenv(function_env.replace("FUNCTION_ID", "API_KEY")) or os.getenv("NVIDIA_API_KEY")
    if not (fid and key):
        raise VoiceUnavailable(f"{function_env} or NVIDIA_API_KEY not set")
    return riva.client.Auth(uri=GRPC_URI, use_ssl=True,
                            metadata_args=[["function-id", fid], ["authorization", f"Bearer {key}"]])


def _retry(fn):
    last = None
    for attempt in range(3):
        try:
            return fn()
        except Exception as e:  # grpc errors, timeouts
            last = e
            time.sleep(0.4 * 2**attempt)
    raise VoiceUnavailable(type(last).__name__)


def to_wav16k(audio: bytes) -> bytes:
    """Browser webm/ogg -> 16 kHz, 16-bit, mono WAV."""
    if not shutil.which("ffmpeg"):
        raise VoiceUnavailable("ffmpeg not installed")
    try:
        p = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-ar", "16000", "-ac", "1",
                            "-sample_fmt", "s16", "-f", "wav", "pipe:1"], input=audio, capture_output=True, timeout=TIMEOUT)
    except subprocess.TimeoutExpired:
        raise VoiceUnavailable("ffmpeg timeout")
    if p.returncode != 0 or len(p.stdout) < 100:
        raise VoiceUnavailable("could not read audio")
    return p.stdout


def transcribe(audio: bytes) -> str:
    import riva.client
    wav = to_wav16k(audio)
    asr = riva.client.ASRService(_auth("ASR_FUNCTION_ID"))
    cfg = riva.client.RecognitionConfig(encoding=riva.client.AudioEncoding.LINEAR_PCM, sample_rate_hertz=16000,
                                        language_code="en-US", max_alternatives=1, audio_channel_count=1,
                                        enable_automatic_punctuation=True)
    resp = _retry(lambda: asr.offline_recognize(wav, cfg, future=True).result(timeout=TIMEOUT))
    return " ".join(r.alternatives[0].transcript.strip() for r in resp.results if r.alternatives).strip()


def safe_to_speak(text: str) -> str:
    """Never speak account numbers; keep it to 2 sentences."""
    text = re.sub(r"\d[\d\s-]{7,}\d", "your account", text)
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return " ".join(parts[:2])


def pcm_to_wav(pcm: bytes, rate: int = TTS_RATE) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
    return buf.getvalue()


def speak(text: str) -> bytes:
    import riva.client
    tts = riva.client.SpeechSynthesisService(_auth("TTS_FUNCTION_ID"))
    clean = safe_to_speak(text)
    resp = _retry(lambda: tts.synthesize(clean, voice_name=TTS_VOICE, language_code="en-US",
                                         sample_rate_hz=TTS_RATE, future=True).result(timeout=TIMEOUT))
    return pcm_to_wav(resp.audio)
