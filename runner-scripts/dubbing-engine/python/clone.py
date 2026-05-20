#!/usr/bin/env python3
"""
Dubbing Engine – Stage 6: Voice Synthesis (Clone)

Usage:
    python clone.py --input translation.json --output-dir /path/to/audio \\
        --output-manifest manifest.json --voice-engine voxcpm2 \\
        --reference /path/to/vocals.wav --ref-seconds 18 \\
        --source-language en --target-language ur

Supports:
  - voxcpm2: Voice cloning via VoxCeleb-based models
  - xtts:    Coqui XTTS voice cloning
  - edge:    Microsoft Edge TTS (no voice cloning, uses standard voices)
"""
import argparse
import json
import os
import sys
import time


def main():
    parser = argparse.ArgumentParser(description="Voice synthesis")
    parser.add_argument("--input", required=True, help="Input translation JSON")
    parser.add_argument("--output-dir", required=True, help="Output audio directory")
    parser.add_argument("--output-manifest", required=True, help="Output manifest JSON path")
    parser.add_argument("--voice-engine", default="voxcpm2", help="Voice engine (voxcpm2, xtts, edge)")
    parser.add_argument("--reference", default="", help="Reference audio for voice cloning (WAV)")
    parser.add_argument("--ref-seconds", type=int, default=18, help="Reference audio duration in seconds")
    parser.add_argument("--source-language", default="en", help="Source language code")
    parser.add_argument("--target-language", default="ur", help="Target language code")
    args = parser.parse_args()

    input_file = args.input
    output_dir = args.output_dir
    output_manifest = args.output_manifest
    voice_engine = args.voice_engine
    reference_file = args.reference
    ref_seconds = args.ref_seconds
    target_lang = args.target_language

    if not os.path.exists(input_file):
        print(f"[CLONE] Error: Input not found: {input_file}", file=sys.stderr)
        sys.exit(1)

    os.makedirs(output_dir, exist_ok=True)

    with open(input_file, "r", encoding="utf-8") as f:
        translation = json.load(f)

    segments = translation.get("segments", [])
    print(f"[CLONE] Synthesizing {len(segments)} segment(s) with engine: {voice_engine}")
    sys.stdout.flush()

    cloned_segments = []

    if voice_engine == "edge":
        cloned_segments = synthesize_edge(segments, output_dir, target_lang)
    elif voice_engine == "xtts":
        cloned_segments = synthesize_xtts(segments, output_dir, reference_file, target_lang)
    else:
        # voxcpm2 or fallback
        cloned_segments = synthesize_voxcpm2(segments, output_dir, reference_file, ref_seconds, target_lang)

    result = {
        "engine": voice_engine,
        "segments": cloned_segments,
    }

    with open(output_manifest, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    audio_count = sum(1 for s in cloned_segments if s.get("audio_file"))
    print(f"[CLONE] ✅ Done - {audio_count}/{len(cloned_segments)} segment(s) with audio")


def get_edge_voice(target_lang):
    """Get the best Edge TTS voice for the target language."""
    voice_map = {
        "ur": "ur-PK-AsadNeural",
        "hi": "hi-IN-MadhurNeural",
        "en": "en-US-JennyNeural",
        "es": "es-ES-AlvaroNeural",
        "fr": "fr-FR-DeniseNeural",
        "ar": "ar-SA-HamedNeural",
        "bn": "bn-BD-PradeepNeural",
        "tr": "tr-TR-AhmetNeural",
        "de": "de-DE-KatjaNeural",
        "ja": "ja-JP-KeitaNeural",
        "ko": "ko-KR-SunHiNeural",
        "zh": "zh-CN-XiaoxiaoNeural",
        "ru": "ru-RU-SvetlanaNeural",
        "pt": "pt-BR-AntonioNeural",
        "it": "it-IT-DiegoNeural",
    }
    return voice_map.get(target_lang, "en-US-JennyNeural")


def synthesize_edge(segments, output_dir, target_lang):
    """Use edge-tts to synthesize speech."""
    cloned_segments = []

    for i, seg in enumerate(segments):
        text = seg.get("translated_text", "").strip()
        if not text:
            cloned_segments.append({
                "index": i,
                "start": seg.get("start", 0),
                "end": seg.get("end", 1),
                "original_text": seg.get("original_text", ""),
                "translated_text": "",
                "audio_file": None,
            })
            continue

        seg_file = os.path.join(output_dir, f"segment_{str(i).zfill(4)}.wav")
        voice = get_edge_voice(target_lang)
        print(f"[CLONE] edge-tts segment {i}: '{text[:50]}...' ({voice})")
        sys.stdout.flush()

        try:
            import edge_tts
            import asyncio

            async def _synth():
                communicate = edge_tts.Communicate(text, voice)
                await communicate.save(seg_file)

            asyncio.run(_synth())

            if os.path.exists(seg_file):
                cloned_segments.append({
                    "index": i,
                    "start": seg.get("start", 0),
                    "end": seg.get("end", 1),
                    "original_text": seg.get("original_text", ""),
                    "translated_text": text,
                    "audio_file": seg_file,
                })
            else:
                cloned_segments.append({
                    "index": i,
                    "start": seg.get("start", 0),
                    "end": seg.get("end", 1),
                    "original_text": seg.get("original_text", ""),
                    "translated_text": text,
                    "audio_file": None,
                })
        except ImportError:
            print(f"[CLONE] edge-tts not installed, segment {i} skipped")
            cloned_segments.append({
                "index": i,
                "start": seg.get("start", 0),
                "end": seg.get("end", 1),
                "original_text": seg.get("original_text", ""),
                "translated_text": text,
                "audio_file": None,
            })
        except Exception as e:
            print(f"[CLONE] edge-tts error for segment {i}: {e}", file=sys.stderr)
            cloned_segments.append({
                "index": i,
                "start": seg.get("start", 0),
                "end": seg.get("end", 1),
                "original_text": seg.get("original_text", ""),
                "translated_text": text,
                "audio_file": None,
            })

    return cloned_segments


def synthesize_xtts(segments, output_dir, reference_file, target_lang):
    """Use Coqui XTTS for voice cloning."""
    cloned_segments = []

    try:
        from TTS.api import TTS
        tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2", gpu=False)

        for i, seg in enumerate(segments):
            text = seg.get("translated_text", "").strip()
            if not text:
                cloned_segments.append({
                    "index": i,
                    "start": seg.get("start", 0),
                    "end": seg.get("end", 1),
                    "original_text": seg.get("original_text", ""),
                    "translated_text": "",
                    "audio_file": None,
                })
                continue

            seg_file = os.path.join(output_dir, f"segment_{str(i).zfill(4)}.wav")
            print(f"[CLONE] XTTS segment {i}: '{text[:50]}...'")
            sys.stdout.flush()

            speaker_wav = reference_file if reference_file and os.path.exists(reference_file) else None
            if speaker_wav:
                tts.tts_to_file(text=text, speaker_wav=speaker_wav, language=target_lang, file_path=seg_file)
            else:
                tts.tts_to_file(text=text, file_path=seg_file)

            cloned_segments.append({
                "index": i,
                "start": seg.get("start", 0),
                "end": seg.get("end", 1),
                "original_text": seg.get("original_text", ""),
                "translated_text": text,
                "audio_file": seg_file if os.path.exists(seg_file) else None,
            })

    except ImportError as e:
        print(f"[CLONE] XTTS not available: {e}")
        # Fallback: try edge-tts
        print("[CLONE] Falling back to edge-tts")
        return synthesize_edge(segments, output_dir, target_lang)
    except Exception as e:
        print(f"[CLONE] XTTS error: {e}", file=sys.stderr)

    return cloned_segments


def synthesize_voxcpm2(segments, output_dir, reference_file, ref_seconds, target_lang):
    """Use VoxCPM2 (or any available voice cloning model) for synthesis."""
    cloned_segments = []
    voxcpm2_available = False

    # Check for VoxCPM2 or similar
    try:
        # Try various voice cloning model imports
        import torch
        print(f"[CLONE] PyTorch available: {torch.__version__}")
        sys.stdout.flush()

        # Try VoxCPM2 specific import
        try:
            import voxcpm2
            voxcpm2_available = True
            print("[CLONE] VoxCPM2 detected")
        except ImportError:
            try:
                from speechbrain.inference import SpeakerRecognition
                print("[CLONE] SpeechBrain detected (VoxCeleb-based)")
            except ImportError:
                pass
    except ImportError:
        print("[CLONE] PyTorch not available")

    if voxcpm2_available and reference_file and os.path.exists(reference_file):
        # Use actual VoxCPM2 model
        for i, seg in enumerate(segments):
            text = seg.get("translated_text", "").strip()
            if not text:
                cloned_segments.append({
                    "index": i,
                    "start": seg.get("start", 0),
                    "end": seg.get("end", 1),
                    "original_text": seg.get("original_text", ""),
                    "translated_text": "",
                    "audio_file": None,
                })
                continue

            seg_file = os.path.join(output_dir, f"segment_{str(i).zfill(4)}.wav")
            print(f"[CLONE] VoxCPM2 segment {i}: '{text[:50]}...'")
            sys.stdout.flush()

            try:
                # Call VoxCPM2 synthesis
                from voxcpm2 import VoiceClone
                cloner = VoiceClone()
                cloner.clone(
                    source_audio=reference_file,
                    source_text=seg.get("original_text", ""),
                    target_text=text,
                    output_path=seg_file,
                )
                cloned_segments.append({
                    "index": i,
                    "start": seg.get("start", 0),
                    "end": seg.get("end", 1),
                    "original_text": seg.get("original_text", ""),
                    "translated_text": text,
                    "audio_file": seg_file if os.path.exists(seg_file) else None,
                })
            except Exception as e:
                print(f"[CLONE] VoxCPM2 error segment {i}: {e}", file=sys.stderr)
                cloned_segments.append({
                    "index": i,
                    "start": seg.get("start", 0),
                    "end": seg.get("end", 1),
                    "original_text": seg.get("original_text", ""),
                    "translated_text": text,
                    "audio_file": None,
                })
    else:
        # Fallback: edge-tts
        print(f"[CLONE] VoxCPM2 not ready (reference: {bool(reference_file)}, available: {voxcpm2_available})")
        print("[CLONE] Falling back to edge-tts")
        return synthesize_edge(segments, output_dir, target_lang)

    return cloned_segments


if __name__ == "__main__":
    main()
