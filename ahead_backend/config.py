import os
from tempfile import gettempdir
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).parent
CACHE = Path(gettempdir()) / "ahead-demo-cache"
CACHE.mkdir(exist_ok=True)
load_dotenv(ROOT / ".env")

NESSIE_URL = os.getenv("NESSIE_URL", "https://v2-prod-api.nessieisreal.com")
NESSIE_API_KEY = os.getenv("NESSIE_API_KEY", "")
DATABASE_URL = os.getenv("DATABASE_URL", "")
