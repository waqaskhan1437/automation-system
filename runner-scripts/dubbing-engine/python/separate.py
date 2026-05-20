#!/usr/bin/env python3
"""
Dubbing Engine – Stage 2: Vocal Separation (Demucs)

Usage:
    python separate.py --input audio_stereo.wav --output /path/to/output_dir

Produces:
    output_dir/vocals.wav
    output_dir/no_vocals.wav
"""
import argparse
import json
import os
import sys
import time


def main():
    parser = argparse.ArgumentParser(description="Demucs vocal separation")
    parser.add_argument("--input", required=True, help="Input stereo WAV file")
    parser.add_argument("--output", required=True, help="Output directory")
    args = parser.parse_args()

    input_file = args.input
    output_dir = args.output

    if not os.path.exists(input_file):
        print(f"[SEPARATE] Error: Input not found: {input_file}", file=sys.stderr)
        sys.exit(1)

    os.makedirs(output_dir, exist_ok=True)

    print(f"[SEPARATE] Separating vocals from: {input_file}")
    sys.stdout.flush()

    try:
        import torch
        import demucs.separate

        # Demucs API call
        demucs.separate.main([
            "--two-stems", "vocals",
            "-o", output_dir,
            input_file,
        ])

        # Find the output (Demucs creates subdir with model name)
        model_dirs = [d for d in os.listdir(output_dir)
                      if os.path.isdir(os.path.join(output_dir, d))]
        model_dir = model_dirs[0] if model_dirs else "htdemucs"
        src_dir = os.path.join(output_dir, model_dir)

        # Copy/rename to standard locations
        vocals_src = os.path.join(src_dir, "vocals.wav")
        no_vocals_src = os.path.join(src_dir, "no_vocals.wav")

        if os.path.exists(vocals_src):
            import shutil
            shutil.copy2(vocals_src, os.path.join(output_dir, "vocals.wav"))
            print(f"[SEPARATE] Vocals saved: {os.path.join(output_dir, 'vocals.wav')}")

        if os.path.exists(no_vocals_src):
            import shutil
            shutil.copy2(no_vocals_src, os.path.join(output_dir, "no_vocals.wav"))
            print(f"[SEPARATE] Background saved: {os.path.join(output_dir, 'no_vocals.wav')}")

    except ImportError as e:
        print(f"[SEPARATE] Dependency error: {e}", file=sys.stderr)
        # Fallback: just copy input as vocals, create silent background
        import shutil
        shutil.copy2(input_file, os.path.join(output_dir, "vocals.wav"))
        # Create a silent placeholder for no_vocals
        duration = 1.0
        try:
            import subprocess
            result = subprocess.run(
                ["ffprobe", "-v", "error", "-show_entries", "format=duration",
                 "-of", "default=noprint_wrappers=1:nokey=1", input_file],
                capture_output=True, text=True, timeout=15
            )
            if result.stdout.strip():
                duration = float(result.stdout.strip())
        except Exception:
            pass

        silent_file = os.path.join(output_dir, "no_vocals.wav")
        try:
            import subprocess
            subprocess.run(
                ["ffmpeg", "-y", "-f", "lavfi", "-t", str(duration),
                 "-i", "anullsrc=r=44100:cl=stereo",
                 "-acodec", "pcm_s16le", silent_file],
                capture_output=True, timeout=30
            )
        except Exception:
            # Can't create silent audio - that's ok, mix stage handles it
            pass

    except Exception as e:
        print(f"[SEPARATE] Error: {e}", file=sys.stderr)
        sys.exit(1)

    # Verify output
    vocals_file = os.path.join(output_dir, "vocals.wav")
    bg_file = os.path.join(output_dir, "no_vocals.wav")
    result = {
        "vocals_exist": os.path.exists(vocals_file),
        "no_vocals_exist": os.path.exists(bg_file),
    }
    print(f"[SEPARATE] Result: {json.dumps(result)}")


if __name__ == "__main__":
    main()
