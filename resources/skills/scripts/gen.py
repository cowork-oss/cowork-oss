#!/usr/bin/env python3
"""Minimal OpenAI image generation script (stdlib only)."""

import argparse
import base64
import datetime
import json
import os
import random
import sys
import urllib.error
import urllib.request
from pathlib import Path

OPENAI_URL = "https://api.openai.com/v1/images/generations"

DEFAULT_PROMPTS = [
    "ultra-detailed studio photo of a lobster astronaut",
    "cinematic wide shot of a glasshouse cafe in a tropical rainforest, morning mist",
    "macro photograph of dewdrops on a spiderweb at sunrise, shallow depth of field",
    "isometric cutaway of a cozy cabin library, warm lighting, rainy window",
    "surreal desert landscape with floating rocks, golden hour light",
]


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


def _model_supports_gpt_image(model: str) -> bool:
    return model.startswith("gpt-image")


def build_payload(args: argparse.Namespace, prompt: str) -> dict:
    payload = {
        "model": args.model,
        "prompt": prompt,
        "n": args.count,
        "size": args.size,
        "response_format": "b64_json",
    }

    if args.quality:
        payload["quality"] = args.quality
    if args.style and args.model.startswith("dall-e-3"):
        payload["style"] = args.style
    if _model_supports_gpt_image(args.model):
        if args.background:
            payload["background"] = args.background
        if args.output_format:
            payload["output_format"] = args.output_format

    return payload


def _resolve_output_format(args: argparse.Namespace) -> str:
    if args.output_format:
        return args.output_format
    return "png"


def _write_index(out_dir: Path, files: list[str]) -> None:
    index_path = out_dir / "index.html"
    rows = "\n".join([f'<div><img src="{Path(f).name}" alt="image" /></div>' for f in files])
    html = f"""<!doctype html>
<html>
<head>
  <meta charset=\"utf-8\" />
  <title>Image Gallery</title>
  <style>body{{font-family:Arial,sans-serif}} img{{max-width:100%;height:auto;margin:8px 0}}</style>
</head>
<body>
{rows}
</body>
</html>
"""
    index_path.write_text(html)


def main() -> None:
    parser = argparse.ArgumentParser(description="OpenAI image generation script")
    parser.add_argument("--prompt", help="Image prompt text")
    parser.add_argument("--count", type=int, default=1)
    parser.add_argument("--model", default="gpt-image-1")
    parser.add_argument("--size", default="1024x1024")
    parser.add_argument("--quality", default=None)
    parser.add_argument("--out-dir", default="./out/images")
    parser.add_argument("--output-format", default=None)
    parser.add_argument("--background", default=None)
    parser.add_argument("--style", default=None)
    args = parser.parse_args()

    if args.count < 1:
        print("ERROR: --count must be >= 1", file=sys.stderr)
        sys.exit(2)

    if args.model.startswith("dall-e-3") and args.count != 1:
        print("ERROR: dall-e-3 only supports --count 1", file=sys.stderr)
        sys.exit(2)

    prompt = args.prompt
    if not prompt:
        prompt = random.choice(DEFAULT_PROMPTS)

    payload = build_payload(args, prompt)
    result = _post_json(payload)
    data = result.get("data", [])
    if not data:
        print("ERROR: No image data returned", file=sys.stderr)
        sys.exit(4)

    out_dir = Path(args.out_dir).expanduser()
    out_dir.mkdir(parents=True, exist_ok=True)

    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    output_format = _resolve_output_format(args)

    files: list[str] = []
    for idx, item in enumerate(data, start=1):
        b64 = item.get("b64_json")
        if not b64:
            continue
        filename = out_dir / f"image_{ts}_{idx}.{output_format}"
        with open(filename, "wb") as f:
            f.write(base64.b64decode(b64))
        files.append(str(filename))
        print(f"MEDIA: {filename}")

    # Write prompts.json and index.html for quick browsing
    prompts_path = out_dir / "prompts.json"
    prompts_path.write_text(json.dumps({"prompt": prompt, "files": files}, indent=2))
    _write_index(out_dir, files)

    print(f"Saved {len(files)} image(s) to {out_dir}")


if __name__ == "__main__":
    main()
