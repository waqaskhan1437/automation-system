#!/usr/bin/env python3
"""
Dubbing Engine – Stage 6: Voice Synthesis (Clone)

Usage:
    python clone.py --input translation.json --output-dir /path/to/audio \\
        --output-manifest manifest.json --voice-engine voxcpm2 \\
        --reference /path/to/vocals.wav --ref-seconds 18 \\
        --source-language en --target-language ur \\
        --voice-mode ultimate --voice-style "(neutral, clear)"

Modes (voice-engine=voxcpm2):
  - design:      Zero-shot Voice Design — describe voice in text, no reference needed
  - controllable: Reference audio + optional style instructions
  - ultimate:     Reference audio + original transcript = best fidelity

Engine fallback chain:
  voxcpm2 -> xtts -> edge-tts -> silent placeholder
"""
import argparse
import json
import os
import sys
import time


# Fix Windows console encoding for Unicode output
try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except AttributeError:
    try:
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')
    except Exception:
        pass


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
    parser.add_argument("--voice-mode", default="ultimate",
                        help="VoxCPM2 mode: design, controllable, or ultimate")
    parser.add_argument("--voice-style", default="",
                        help="Optional style instruction e.g. '(slightly faster, cheerful tone)'")
    parser.add_argument("--script", default="",
                        help="Script mode: 'devanagari-urdu' for Urdu vocabulary in Devanagari")
    args = parser.parse_args()

    input_file = args.input
    output_dir = args.output_dir
    output_manifest = args.output_manifest
    voice_engine = args.voice_engine
    reference_file = args.reference
    ref_seconds = args.ref_seconds
    target_lang = args.target_language
    voice_mode = args.voice_mode
    voice_style = args.voice_style
    script_mode = args.script

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
        # voxcpm2 — try primary path, fallback to xtts, then edge
        cloned_segments = synthesize_voxcpm2(
            segments, output_dir, reference_file, ref_seconds,
            target_lang, voice_mode, voice_style
        )

    result = {
        "engine": voice_engine,
        "voice_mode": voice_mode if voice_engine == "voxcpm2" else None,
        "segments": cloned_segments,
    }

    with open(output_manifest, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    audio_count = sum(1 for s in cloned_segments if s.get("audio_file"))
    print(f"[CLONE] Done - {audio_count}/{len(cloned_segments)} segment(s) with audio")


def get_edge_voice(target_lang, script_mode=""):
    """Get the best Edge TTS voice for the target language.

    Supports 30+ languages covering VoxCPM2's full language list plus more.
    """
    voice_map = {
        "ur": "ur-PK-AsadNeural",
        "hi": "hi-IN-MadhurNeural",
        "en": "en-US-JennyNeural",
        "ar": "ar-SA-HamedNeural",
        "bn": "bn-BD-PradeepNeural",
        "tr": "tr-TR-AhmetNeural",
        "es": "es-ES-AlvaroNeural",
        "fr": "fr-FR-DeniseNeural",
        "de": "de-DE-KatjaNeural",
        "pt": "pt-BR-AntonioNeural",
        "it": "it-IT-DiegoNeural",
        "ru": "ru-RU-SvetlanaNeural",
        "ja": "ja-JP-KeitaNeural",
        "ko": "ko-KR-SunHiNeural",
        "zh": "zh-CN-XiaoxiaoNeural",
        "id": "id-ID-ArdiNeural",
        "vi": "vi-VN-NamMinhNeural",
        "th": "th-TH-NiwatNeural",
        "nl": "nl-NL-MaartenNeural",
        "pl": "pl-PL-MarekNeural",
        "sv": "sv-SE-MattiasNeural",
        "el": "el-GR-NestorasNeural",
        "ro": "ro-RO-EmilNeural",
        "hu": "hu-HU-TamasNeural",
        "cs": "cs-CZ-AntoninNeural",
        "uk": "uk-UA-OstapNeural",
        "fi": "fi-FI-HarriNeural",
        "da": "da-DK-JeppeNeural",
        "ms": "ms-MY-OsmanNeural",
        "no": "nb-NO-FinnNeural",
        "sw": "sw-KE-RafikiNeural",
        "tl": "fil-PH-AngeloNeural",
        "my": "my-MM-NilarNeural",
        "km": "km-KH-PisethNeural",
        "lo": "lo-LA-KeomanyNeural",
        "he": "he-IL-AvriNeural",
    }
    # If Urdu target with Devanagari script, use Hindi voice (better quality, reads Devanagari)
    if target_lang == "ur" and script_mode == "devanagari-urdu":
        return "hi-IN-MadhurNeural"
    return voice_map.get(target_lang, "en-US-JennyNeural")


def synthesize_edge(segments, output_dir, target_lang):
    """Use edge-tts to synthesize speech."""
    cloned_segments = []

    for i, seg in enumerate(segments):
        text = seg.get("translated_text", "").strip()
        if not text:
            cloned_segments.append({
                "index": i, "start": seg.get("start", 0), "end": seg.get("end", 1),
                "original_text": seg.get("original_text", ""),
                "translated_text": "", "audio_file": None,
            })
            continue

        seg_file = os.path.join(output_dir, f"segment_{str(i).zfill(4)}.wav")
        voice = get_edge_voice(target_lang, script_mode)
        print(f"[CLONE] edge-tts segment {i}: '{text[:50]}...' ({voice})")
        sys.stdout.flush()

        try:
            import edge_tts
            import asyncio

            async def _synth():
                communicate = edge_tts.Communicate(text, voice)
                await communicate.save(seg_file)

            asyncio.run(_synth())
            audio_file = seg_file if os.path.exists(seg_file) else None
        except ImportError:
            print(f"[CLONE] edge-tts not installed, segment {i} skipped")
            audio_file = None
        except Exception as e:
            print(f"[CLONE] edge-tts error for segment {i}: {e}", file=sys.stderr)
            audio_file = None

        cloned_segments.append({
            "index": i, "start": seg.get("start", 0), "end": seg.get("end", 1),
            "original_text": seg.get("original_text", ""),
            "translated_text": text, "audio_file": audio_file,
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
                    "index": i, "start": seg.get("start", 0), "end": seg.get("end", 1),
                    "original_text": seg.get("original_text", ""),
                    "translated_text": "", "audio_file": None,
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
                "index": i, "start": seg.get("start", 0), "end": seg.get("end", 1),
                "original_text": seg.get("original_text", ""),
                "translated_text": text,
                "audio_file": seg_file if os.path.exists(seg_file) else None,
            })

    except ImportError as e:
        print(f"[CLONE] XTTS not available: {e}")
        print("[CLONE] Falling back to edge-tts")
        return synthesize_edge(segments, output_dir, target_lang)
    except Exception as e:
        print(f"[CLONE] XTTS error: {e}", file=sys.stderr)

    return cloned_segments


def synthesize_voxcpm2(segments, output_dir, reference_file, ref_seconds,
                       target_lang, voice_mode, voice_style):
    """
    VoxCPM2 voice synthesis with three modes:
      - design:      Zero-shot — describe voice in text
      - controllable: Reference audio + optional style
      - ultimate:     Reference audio + transcript (best fidelity)
    """
    VOXCPM_AVAILABLE = False
    model = None

    # Try to load VoxCPM2
    try:
        from voxcpm import VoxCPM
        print(f"[CLONE] Loading VoxCPM2 model ('openbmb/VoxCPM2')...")
        sys.stdout.flush()
        model = VoxCPM.from_pretrained("openbmb/VoxCPM2")
        VOXCPM_AVAILABLE = True
        print(f"[CLONE] VoxCPM2 loaded successfully (2B params)")
        sys.stdout.flush()
    except ImportError:
        print("[CLONE] voxcpm package not installed (pip install voxcpm)")
    except Exception as e:
        print(f"[CLONE] VoxCPM2 load error: {e}", file=sys.stderr)

    if not VOXCPM_AVAILABLE:
        # Fallback chain: xtts -> edge
        print("[CLONE] VoxCPM2 not available — trying XTTS fallback")
        xtts_result = synthesize_xtts(segments, output_dir, reference_file, target_lang)
        # If xtts returned edge fallback, check if we should try edge directly
        if all(s.get("audio_file") is None for s in xtts_result):
            print("[CLONE] XTTS produced no audio — falling back to edge-tts")
            return synthesize_edge(segments, output_dir, target_lang)
        return xtts_result

    # Determine if reference audio exists
    has_reference = reference_file and os.path.exists(reference_file)
    reference_for_clone = reference_file if has_reference else None

    cloned_segments = []

    for i, seg in enumerate(segments):
        text = seg.get("translated_text", "").strip()
        if not text:
            cloned_segments.append({
                "index": i, "start": seg.get("start", 0), "end": seg.get("end", 1),
                "original_text": seg.get("original_text", ""),
                "translated_text": "", "audio_file": None,
            })
            continue

        seg_file = os.path.join(output_dir, f"segment_{str(i).zfill(4)}.wav")
        original_text = seg.get("original_text", "").strip()
        print(f"[CLONE] VoxCPM2 segment {i} (mode={voice_mode}): '{text[:50]}...'")
        sys.stdout.flush()

        try:
            # Build generation parameters
            gen_kwargs = {
                "text": text,
                "cfg_value": 2.0,
                "inference_timesteps": 10,
            }

            if voice_mode == "design" or (voice_mode != "design" and not has_reference):
                # === VOICE DESIGN MODE (zero-shot) ===
                # Build a voice description prompt based on target language
                lang_hint = {
                    "ur": "Urdu, clear and natural voice",
                    "hi": "Hindi, clear and natural voice",
                    "en": "English, clear and natural voice",
                    "ar": "Arabic, clear and natural voice",
                    "bn": "Bengali, clear and natural voice",
                    "tr": "Turkish, clear and natural voice",
                    "es": "Spanish, clear and natural voice",
                    "fr": "French, clear and natural voice",
                    "de": "German, clear and natural voice",
                    "pt": "Portuguese, clear and natural voice",
                    "it": "Italian, clear and natural voice",
                    "ru": "Russian, clear and natural voice",
                    "ja": "Japanese, clear and natural voice",
                    "ko": "Korean, clear and natural voice",
                    "zh": "Mandarin Chinese, clear and natural voice",
                    "id": "Indonesian, clear and natural voice",
                    "vi": "Vietnamese, clear and natural voice",
                    "th": "Thai, clear and natural voice",
                    "nl": "Dutch, clear and natural voice",
                    "pl": "Polish, clear and natural voice",
                    "sv": "Swedish, clear and natural voice",
                    "el": "Greek, clear and natural voice",
                    "ro": "Romanian, clear and natural voice",
                    "hu": "Hungarian, clear and natural voice",
                    "cs": "Czech, clear and natural voice",
                    "uk": "Ukrainian, clear and natural voice",
                    "fi": "Finnish, clear and natural voice",
                    "da": "Danish, clear and natural voice",
                    "ms": "Malay, clear and natural voice",
                    "no": "Norwegian, clear and natural voice",
                    "sw": "Swahili, clear and natural voice",
                    "tl": "Tagalog, clear and natural voice",
                    "my": "Burmese, clear and natural voice",
                    "km": "Khmer, clear and natural voice",
                    "lo": "Lao, clear and natural voice",
                    "he": "Hebrew, clear and natural voice",
                }.get(target_lang, "clear and natural voice")

                style_hint = voice_style if voice_style else "(neutral, conversational tone)"
                voice_prompt = f"({lang_hint}, {style_hint}) {text}"

                # If we have reference audio but user selected design mode, also pass reference
                if reference_for_clone:
                    gen_kwargs["reference_wav_path"] = reference_for_clone

                gen_kwargs["text"] = voice_prompt
                print(f"[CLONE] Voice Design mode — using style prompt")
                sys.stdout.flush()

            elif voice_mode == "ultimate" and original_text and reference_for_clone:
                # === ULTIMATE CLONING (reference + transcript) ===
                gen_kwargs["prompt_wav_path"] = reference_for_clone
                gen_kwargs["prompt_text"] = original_text
                gen_kwargs["reference_wav_path"] = reference_for_clone
                print(f"[CLONE] Ultimate Cloning — ref + transcript ({len(original_text)} chars)")
                sys.stdout.flush()

            else:
                # === CONTROLLABLE CLONING (reference + optional style) ===
                gen_kwargs["reference_wav_path"] = reference_for_clone

                if voice_style:
                    # Inject style into the text (VoxCPM2 supports inline style hints)
                    gen_kwargs["text"] = f"({voice_style}) {text}"

                print(f"[CLONE] Controllable Cloning — ref audio{ ' + style' if voice_style else ''}")
                sys.stdout.flush()

            # Run generation
            wav = model.generate(**gen_kwargs)

            # Save to file
            import torch
            if isinstance(wav, torch.Tensor):
                wav_np = wav.cpu().numpy()
            else:
                wav_np = wav

            # Write as WAV using scipy or soundfile
            try:
                import soundfile as sf
                sf.write(seg_file, wav_np, samplerate=48000)
            except ImportError:
                try:
                    from scipy.io import wavfile
                    wavfile.write(seg_file, 48000, wav_np)
                except ImportError:
                    # Last resort: write raw using struct
                    import struct
                    import numpy as np
                    wav_int16 = np.clip(wav_np * 32767, -32768, 32767).astype(np.int16)
                    with open(seg_file, "wb") as f:
                        # Write minimal WAV header (mono, 48kHz, 16-bit)
                        data_len = len(wav_int16) * 2
                        f.write(b"RIFF")
                        f.write(struct.pack("<I", 36 + data_len))
                        f.write(b"WAVE")
                        f.write(b"fmt ")
                        f.write(struct.pack("<IHHIIHH", 16, 1, 1, 48000, 96000, 2, 16))
                        f.write(b"data")
                        f.write(struct.pack("<I", data_len))
                        wav_int16.tofile(f)

            audio_file = seg_file if os.path.exists(seg_file) and os.path.getsize(seg_file) > 100 else None
            if not audio_file:
                print(f"[CLONE] VoxCPM2 output too small or missing for segment {i}", file=sys.stderr)

        except Exception as e:
            print(f"[CLONE] VoxCPM2 error segment {i}: {e}", file=sys.stderr)
            audio_file = None

        cloned_segments.append({
            "index": i, "start": seg.get("start", 0), "end": seg.get("end", 1),
            "original_text": original_text,
            "translated_text": text, "audio_file": audio_file,
        })

    # If all segments failed, fallback
    if all(s.get("audio_file") is None for s in cloned_segments):
        print("[CLONE] VoxCPM2 produced no usable audio — falling back to edge-tts")
        return synthesize_edge(segments, output_dir, target_lang)

    return cloned_segments


if __name__ == "__main__":
    main()
