#!/usr/bin/env python3
"""
Dubbing Engine – Stage 4: Speaker Diarization (pyannote.audio)

Usage:
    python speakers.py --input audio_mono.wav --output speakers.json
"""
import argparse
import json
import os
import sys


def main():
    parser = argparse.ArgumentParser(description="pyannote speaker diarization")
    parser.add_argument("--input", required=True, help="Input mono WAV file")
    parser.add_argument("--output", required=True, help="Output JSON path")
    args = parser.parse_args()

    input_file = args.input
    output_file = args.output

    if not os.path.exists(input_file):
        print(f"[SPEAKERS] Error: Input not found: {input_file}", file=sys.stderr)
        sys.exit(1)

    os.makedirs(os.path.dirname(output_file), exist_ok=True)

    print(f"[SPEAKERS] Running speaker diarization on: {input_file}")
    sys.stdout.flush()

    result = {
        "skipped": True,
        "reason": "pyannote.audio not available or failed",
        "speakers": [
            {
                "label": "SPEAKER_00",
                "segments": [{"start": 0, "end": 300}],
            }
        ],
    }

    try:
        from pyannote.audio import Pipeline
        import torch

        # Try loading the diarization pipeline
        # Uses pretrained model from huggingface
        print("[SPEAKERS] Loading pyannote pipeline...")
        sys.stdout.flush()

        pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            use_auth_token=os.environ.get("HUGGINGFACE_TOKEN", None),
        )

        if torch.cuda.is_available():
            pipeline.to(torch.device("cuda"))

        print("[SPEAKERS] Running diarization...")
        sys.stdout.flush()

        diarization = pipeline(input_file)

        # Process results
        speakers = {}
        for turn, _, speaker in diarization.itertracks(yield_label=True):
            if speaker not in speakers:
                speakers[speaker] = []
            speakers[speaker].append({
                "start": round(turn.start, 3),
                "end": round(turn.end, 3),
            })

        speaker_list = []
        for label, segments in sorted(speakers.items()):
            speaker_list.append({
                "label": label,
                "segments": segments,
            })

        result = {
            "skipped": False,
            "engine": "pyannote/speaker-diarization-3.1",
            "speakers": speaker_list,
        }

        print(f"[SPEAKERS] Found {len(speaker_list)} speaker(s)")

    except ImportError as e:
        print(f"[SPEAKERS] pyannote.audio not installed: {e}")
    except Exception as e:
        print(f"[SPEAKERS] Error: {e}", file=sys.stderr)

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    if not result.get("skipped", True):
        print(f"[SPEAKERS] Done - {len(result.get('speakers', []))} speaker(s)")


if __name__ == "__main__":
    main()
