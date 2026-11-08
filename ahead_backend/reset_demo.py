"""Wipe Maya in Nessie, reseed, rebuild Tiger tables. Must finish under 60s."""
import sys
import time

import seed
import sync

t0 = time.time()
try:
    seed.wipe()
    seed.seed()
except Exception as e:
    print(f"Nessie seed failed ({type(e).__name__}: {e}); ledger will use fallback data")
balances = sync.write_ledger(sync.load_data())
elapsed = time.time() - t0
print({k: float(v) for k, v in balances.items()}, f"{elapsed:.1f}s")
if elapsed > 60:
    sys.exit("reset took over 60s")
