#!/usr/bin/env python3
"""Simple image generator wrapper (OpenAI Images API, stdlib only)."""

import argparse
import base64
import datetime
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

OPENAI_URL = "https://api.openai.com/v1/images/generations"

SIZE_MAP = {
    "1K": "1024x1024",
    "2K": "1536x1024",
    "4K": "1536x1024",
}


def _require_api_key() -> str:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("ERROR: OPENAI_API_KEY is not set", file=sys.stderr)
        sys.exit(2)
    return api_key


def _post_json(payload: dict) -> dict:
    api_key = _require_api_key()
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        OPENAI_URL,
        data=data,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", "ignore")
        print(f"OpenAI API error: {err.code} {err.reason}\n{body}", file=sys.stderr)
        sys.exit(3)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a single image")
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--filename", required=True)
    parser.add_argument("--resolution", default="1K")
    parser.add_argument("-i", dest="inputs", action="append", default=[])
    args = parser.parse_args()

    if args.inputs:
        print("WARNING: edit/composition inputs are not supported in this build; ignoring -i", file=sys.stderr)

    size = SIZE_MAP.get(args.resolution.upper(), "1024x1024")

    payload = {
        "model": "gpt-image-1",
        "prompt": args.prompt,
        "n": 1,
        "size": size,
        "response_format": "b64_json",
        "quality": "high",
    }

    result = _post_json(payload)
    data = result.get("data", [])
    if not data or not data[0].get("b64_json"):
        print("ERROR: No image data returned", file=sys.stderr)
        sys.exit(4)

    out_path = Path(args.filename).expanduser()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    with open(out_path, "wb") as f:
        f.write(base64.b64decode(data[0]["b64_json"]))

    print(f"MEDIA: {out_path}")
    print(f"Image saved as: {out_path}")


if __name__ == "__main__":
    main()
