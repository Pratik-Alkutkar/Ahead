import psycopg

from config import DATABASE_URL


def connect():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL missing in backend/.env")
    return psycopg.connect(DATABASE_URL, connect_timeout=5)
