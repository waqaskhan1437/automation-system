#!/usr/bin/env python3
"""
Dubbing Engine – Stage 3: Transcription (WhisperX)

Usage:
    python transcribe.py --input audio_mono.wav --output transcription.json --language en

Produces JSON with segments containing word-level timestamps.
"""
import argparse
import json
import os
import sys
import time


def main():
    parser = argparse.ArgumentParser(description="WhisperX transcription")
    parser.add_argument("--input", required=True, help="Input mono WAV file (16kHz)")
    parser.add_argument("--output", required=True, help="Output JSON path")
    parser.add_argument("--language", default="en", help="Source language code")
    args = parser.parse_args()

    input_file = args.input
    output_file = args.output
    language = args.language

    if not os.path.exists(input_file):
        print(f"[TRANSCRIBE] Error: Input not found: {input_file}", file=sys.stderr)
        sys.exit(1)

    os.makedirs(os.path.dirname(output_file), exist_ok=True)

    print(f"[TRANSCRIBE] Transcribing: {input_file} (language: {language})")
    sys.stdout.flush()

    result = {
        "engine": "placeholder",
        "language": language,
        "segments": [],
        "text": "",
    }

    try:
        # Try WhisperX first (has word-level timestamps)
        try:
            import whisperx
            print("[TRANSCRIBE] Using WhisperX with word timestamps")

            device = "cuda" if whisperx.utils.is_cuda_available() else "cpu"
            compute_type = "float16" if device == "cuda" else "int8"

            model = whisperx.load_model("large-v3", device=device, compute_type=compute_type, language=language)
            audio = whisperx.load_audio(input_file)
            transcribe_result = model.transcribe(audio, batch_size=16)

            # Align whisper output to get word-level timestamps
            try:
                model_a, metadata = whisperx.load_align_model(language_code=language, device=device)
                transcribe_result = whisperx.align(
                    transcribe_result["segments"],
                    model_a,
                    metadata,
                    audio,
                    device,
                    return_char_alignments=False,
                )
            except Exception:
                print("[TRANSCRIBE] Word alignment not available for this language")

            segments = []
            for seg in transcribe_result.get("segments", []):
                words = []
                for w in seg.get("words", []):
                    words.append({
                        "text": w.get("word", ""),
                        "start": round(w.get("start", seg["start"]), 3),
                        "end": round(w.get("end", seg["end"]), 3),
                        "confidence": round(w.get("score", 1.0), 4),
                    })

                segments.append({
                    "start": round(seg["start"], 3),
                    "end": round(seg["end"], 3),
                    "text": seg.get("text", "").strip(),
                    "words": words,
                    "confidence": round(seg.get("confidence", 1.0), 4),
                })

            result = {
                "engine": "whisperx",
                "language": language,
                "segments": segments,
                "text": " ".join(s["text"] for s in segments),
            }

        except ImportError:
            # Fallback to whisper
            import whisper
            print("[TRANSCRIBE] Using Whisper (base)")

            model = whisper.load_model("base")
            whisper_result = model.transcribe(input_file, language=language, word_timestamps=True)

            segments = []
            for seg in whisper_result.get("segments", []):
                words = []
                for w in seg.get("words", []):
                    words.append({
                        "text": w.get("word", ""),
                        "start": round(w.get("start", seg["start"]), 3),
                        "end": round(w.get("end", seg["end"]), 3),
                        "confidence": round(w.get("confidence", 1.0), 4),
                    })

                segments.append({
                    "start": round(seg["start"], 3),
                    "end": round(seg["end"], 3),
                    "text": seg.get("text", "").strip(),
                    "words": words,
                    "confidence": round(seg.get("confidence", 1.0), 4),
                })

            result = {
                "engine": "whisper",
                "language": language,
                "segments": segments,
                "text": " ".join(s["text"] for s in segments),
            }

    except ImportError as e:
        print(f"[TRANSCRIBE] Warning: whisper/whisperx not available: {e}")
        # Placeholder: single segment with entire duration
        try:
            import subprocess
            proc = subprocess.run(
                ["ffprobe", "-v", "error", "-show_entries", "format=duration",
                 "-of", "default=noprint_wrappers=1:nokey=1", input_file],
                capture_output=True, text=True, timeout=15
            )
            duration = float(proc.stdout.strip()) if proc.stdout.strip() else 0
        except Exception:
            duration = 0

        segments = [{
            "start": 0.0,
            "end": round(duration, 3),
            "text": "[Transcription unavailable - install whisper or whisperx]",
            "words": [],
            "confidence": 0.0,
        }]
        result = {
            "engine": "placeholder",
            "language": language,
            "segments": segments,
            "text": segments[0]["text"],
        }

    except Exception as e:
        print(f"[TRANSCRIBE] Error during transcription: {e}", file=sys.stderr)
        sys.exit(1)

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    seg_count = len(result.get("segments", []))
    print(f"[TRANSCRIBE] ✅ Done - {seg_count} segment(s), text length: {len(result.get('text', ''))}")


if __name__ == "__main__":
    main()
