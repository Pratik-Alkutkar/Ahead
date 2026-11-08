import os
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).parent
CACHE = ROOT / "cache"
CACHE.mkdir(exist_ok=True)
load_dotenv(ROOT / ".env")

NESSIE_URL = "http://api.nessieisreal.com"
NESSIE_API_KEY = os.getenv("NESSIE_API_KEY", "")
DATABASE_URL = os.getenv("DATABASE_URL", "")
