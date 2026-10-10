"""Check a CycloneDX document against the bundled official 1.7 JSON Schema, with no network access."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cyclonedx_schema import validator  # noqa: E402

document = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
errors = sorted(validator().iter_errors(document), key=lambda error: list(map(str, error.path)))
for error in errors:
    print(f"/{'/'.join(map(str, error.path))}: {error.message}")
sys.exit(1 if errors else 0)
