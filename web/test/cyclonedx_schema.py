"""Offline CycloneDX 1.7 validator built from the schema files bundled in web/schema.

The main schema refers to spdx.schema.json, jsf-0.82.schema.json, and cryptography-defs.schema.json. Without a
registry, jsonschema fetches those from cyclonedx.org over the network. This module registers the bundled copies
and refuses any other reference, so a check never depends on a download.
"""

import json
import re
from datetime import date
from pathlib import Path

from jsonschema import Draft7Validator, FormatChecker
from referencing import Registry, Resource
from referencing.exceptions import NoSuchResource

SCHEMA_DIR = Path(__file__).resolve().parents[1] / "schema"
FILES = ["bom-1.7.schema.json", "spdx.schema.json", "jsf-0.82.schema.json", "cryptography-defs.schema.json"]
DATE_TIME = re.compile(r"^(\d{4})-(\d{2})-(\d{2})[Tt ](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-](\d{2}):(\d{2}))$")


def refuse(uri):
    raise NoSuchResource(ref=uri)


def date_time(value):
    """RFC 3339 date-time, the same rule the browser validator applies."""
    if not isinstance(value, str):
        return True
    match = DATE_TIME.match(value)
    if not match:
        return False
    year, month, day, hour, minute, second = (int(part) for part in match.groups()[:6])
    try:
        date(year, month, day)
    except ValueError:
        return False
    offset_ok = match.group(7) is None or (int(match.group(7)) < 24 and int(match.group(8)) < 60)
    return hour < 24 and minute < 60 and second <= 60 and offset_ok


URI = re.compile(r"^[A-Za-z][A-Za-z0-9+.-]*:\S*$")


def uri(value):
    """Absolute URI with a scheme, the same rule the browser validator applies.

    JSF's algorithm field is a oneOf of a name list and a URI. Without this check "ES256" matches both
    branches and every standard signature fails the schema.
    """
    return not isinstance(value, str) or bool(URI.match(value))


def validator():
    documents = {name: json.loads((SCHEMA_DIR / name).read_text(encoding="utf-8")) for name in FILES}
    registry = Registry(retrieve=refuse).with_resources(
        (document["$id"], Resource.from_contents(document)) for document in documents.values()
    )
    checker = FormatChecker()
    checker.checks("date-time")(date_time)
    checker.checks("uri")(uri)
    return Draft7Validator(documents["bom-1.7.schema.json"], registry=registry, format_checker=checker)
