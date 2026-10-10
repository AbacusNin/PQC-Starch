"""Validate a JSON array of documents against the bundled CycloneDX 1.7 schema and print one verdict per document.

bom.test.mjs uses this to compare the browser validator with the Python jsonschema reference.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cyclonedx_schema import validator  # noqa: E402

check = validator()
documents = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
print(json.dumps([check.is_valid(document) for document in documents]))
