#!/usr/bin/env python3
"""
Dubbing Engine – Stage 5: Translation

Usage:
    python translate.py --input transcription.json --output translation.json \\
        --source-lang en --target-lang ur --engine llm

Supports:
  - llm:  OpenAI-compatible API (uses OPENAI_API_KEY or OLLAMA_HOST)
  - nllb: Meta NLLB model via transformers
"""
import argparse
import json
import os
import sys
import time


def main():
    parser = argparse.ArgumentParser(description="Translation engine")
    parser.add_argument("--input", required=True, help="Input transcription JSON")
    parser.add_argument("--output", required=True, help="Output translation JSON")
    parser.add_argument("--source-lang", default="en", help="Source language code")
    parser.add_argument("--target-lang", default="ur", help="Target language code")
    parser.add_argument("--engine", default="llm", help="Translation engine (llm or nllb)")
    parser.add_argument("--ai-provider", default="", help="AI provider for LLM translation (openai, gemini, grok, cohere, openrouter, groq)")
    parser.add_argument("--script", default="", help="Script mode: 'devanagari-urdu' for Urdu vocabulary in Devanagari")
    args = parser.parse_args()

    input_file = args.input
    output_file = args.output
    source_lang = args.source_lang
    target_lang = args.target_lang
    engine = args.engine
    ai_provider = args.ai_provider.lower() if args.ai_provider else ""
    script_mode = args.script

    if not os.path.exists(input_file):
        print(f"[TRANSLATE] Error: Input not found: {input_file}", file=sys.stderr)
        sys.exit(1)

    os.makedirs(os.path.dirname(output_file), exist_ok=True)

    with open(input_file, "r", encoding="utf-8") as f:
        transcription = json.load(f)

    segments = transcription.get("segments", [])
    script_info = f" script={script_mode}" if script_mode else ""
    print(f"[TRANSLATE] Translating {len(segments)} segment(s): {source_lang} -> {target_lang} (engine: {engine}){script_info}")
    sys.stdout.flush()

    result = {
        "engine": engine,
        "source_language": source_lang,
        "target_language": target_lang,
        "segments": [],
        "text": "",
    }

    if engine == "nllb":
        result = translate_nllb(segments, source_lang, target_lang)
    else:
        result = translate_llm(segments, source_lang, target_lang, ai_provider, script_mode)

    # Attach original text and speaker info
    translated_segments = []
    for i, seg in enumerate(result.get("segments", [])):
        orig = segments[i] if i < len(segments) else {"text": "", "start": 0, "end": 0, "speaker": "SPEAKER_00"}
        translated_segments.append({
            "index": i,
            "start": orig.get("start", 0),
            "end": orig.get("end", 0),
            "original_text": orig.get("text", "").strip(),
            "translated_text": seg.get("text", "").strip() if isinstance(seg, dict) else str(seg or ""),
            "speaker": orig.get("speaker", "SPEAKER_00"),
        })

    final_result = {
        "engine": result.get("engine", engine),
        "source_language": source_lang,
        "target_language": target_lang,
        "segments": translated_segments,
        "text": " ".join(s["translated_text"] for s in translated_segments),
    }

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(final_result, f, indent=2, ensure_ascii=False)

    seg_count = len(final_result.get("segments", []))
    print(f"[TRANSLATE] Done - {seg_count} segment(s) translated")
    sys.stdout.flush()


def translate_llm(segments, source_lang, target_lang, ai_provider="", script_mode=""):
    """Translate using a configured AI provider API."""
    texts = [s.get("text", "").strip() for s in segments if s.get("text", "").strip()]
    full_text = " ".join(texts)

    # Build system prompt based on script mode
    if script_mode == "devanagari-urdu":
        system_prompt = (
            f"You are a Hindustani-to-Devanagari converter. Convert the following English text to Hindustani "
            f"(Hindi-Urdu mixed language) written in Devanagari script (देवनागरी लिपि). "
            f"CRITICAL: Use the EXACT SAME Urdu vocabulary, words, and phrasing — only change the script "
            f"from Nastaliq (Arabic) to Devanagari. Keep all Persian/Arabic loanwords intact. "
            f"Do NOT replace Urdu words with Sanskritized Hindi words. "
            f"For example: 'kya' (क्या), 'accha' (अच्छा), 'zindagi' (ज़िंदगी), 'shukriya' (शुक्रिया), "
            f"'tamasha' (तमाशा), 'duniya' (दुनिया) — same words, just Devanagari script. "
            f"Return ONLY the Devanagari Hindustani text, no explanations."
        )
    else:
        system_prompt = f"You are a professional translator. Translate the following text from {source_lang} to {target_lang}. Return ONLY the translation, no explanations."

    if not full_text:
        return {"engine": "llm", "segments": segments}

    # Resolve API key based on provider
    provider_api_keys = {
        "openai": ("OPENAI_API_KEY", "https://api.openai.com/v1"),
        "gemini": ("GEMINI_API_KEY", "https://generativelanguage.googleapis.com/v1beta"),
        "grok": ("XAI_API_KEY", "https://api.x.ai/v1"),
        "cohere": ("CO_API_KEY", "https://api.cohere.com/v2"),
        "openrouter": ("OPENROUTER_API_KEY", "https://openrouter.ai/api/v1"),
        "groq": ("GROQ_API_KEY", "https://api.groq.com/openai/v1"),
    }

    provider = ai_provider.lower() if ai_provider else "openai"
    if provider not in provider_api_keys:
        provider = "openai"

    env_key, base_url = provider_api_keys[provider]
    api_key = os.environ.get(env_key, "")
    ollama_host = os.environ.get("OLLAMA_HOST", "")

    print(f"[TRANSLATE] Using provider: {provider} (env: {env_key})")
    sys.stdout.flush()

    try:
        if api_key and provider == "gemini":
            # Use Gemini's dedicated API format
            import requests as req_lib
            model = "gemini-2.5-flash"
            url = f"{base_url}/models/{model}:generateContent?key={api_key}"
            response = req_lib.post(url, json={
                "contents": [{
                    "role": "user",
                    "parts": [{
                        "text": f"{system_prompt}\n\n{full_text}"
                    }]
                }],
                "generationConfig": {
                    "temperature": 0.3,
                    "maxOutputTokens": 4096,
                }
            }, timeout=120)
            if response.ok:
                data = response.json()
                candidates = data.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    translated = " ".join(p.get("text", "") for p in parts)
                else:
                    translated = ""
            else:
                print(f"[TRANSLATE] Gemini error: {response.status} {response.text}", file=sys.stderr)
                return {"engine": "llm_placeholder", "segments": [{"text": s.get("text", "")} for s in segments]}

        elif api_key:
            # OpenAI-compatible API (openai, grok, openrouter, groq, cohere)
            import openai
            client = openai.OpenAI(api_key=api_key, base_url=base_url)

            # Map provider to model
            model_map = {
                "openai": "gpt-4o-mini",
                "grok": "grok-4-fast-reasoning",
                "openrouter": "google/gemini-2.5-flash",
                "groq": "llama-3.1-8b-instant",
                "cohere": "command-a-03-2025",
            }
            model = model_map.get(provider, "gpt-4o-mini")

            response = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": full_text},
                ],
                temperature=0.3,
                max_tokens=4096,
            )
            translated = response.choices[0].message.content.strip()
        elif ollama_host:
            import requests
            response = requests.post(
                f"{ollama_host.rstrip('/')}/api/chat",
                json={
                    "model": "llama3",
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": full_text},
                    ],
                    "stream": False,
                },
                timeout=120,
            )
            data = response.json()
            translated = data.get("message", {}).get("content", "").strip()
        else:
            print(f"[TRANSLATE] No API key found for {provider} (env: {env_key})")
            return {"engine": "llm_placeholder", "segments": [{"text": s.get("text", "")} for s in segments]}

        # Map back to segments approximately
        if translated and len(segments) > 1:
            # Simple word-count based distribution
            total_source_words = sum(len(s.get("text", "").split()) for s in segments)
            translated_words = translated.split()
            word_idx = 0
            new_segments = []
            for s in segments:
                source_words = len(s.get("text", "").split())
                if total_source_words > 0 and source_words > 0:
                    ratio = source_words / total_source_words
                    n_words = max(1, int(len(translated_words) * ratio))
                    seg_text = " ".join(translated_words[word_idx:word_idx + n_words])
                    word_idx += n_words
                else:
                    seg_text = ""
                new_segments.append({"text": seg_text})
            return {"engine": f"llm_{provider}", "segments": new_segments}
        else:
            return {"engine": f"llm_{provider}", "segments": [{"text": translated or s.get("text", "")} for s in segments]}

    except Exception as e:
        print(f"[TRANSLATE] LLM translation error ({provider}): {e}", file=sys.stderr)
        return {"engine": "llm_placeholder", "segments": [{"text": s.get("text", "")} for s in segments]}


def translate_nllb(segments, source_lang, target_lang):
    """Translate using Meta NLLB model."""
    try:
        from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

        model_name = f"facebook/nllb-200-distilled-600M"
        tokenizer = AutoTokenizer.from_pretrained(model_name)
        model = AutoModelForSeq2SeqLM.from_pretrained(model_name)

        lang_map = {
            "en": "eng_Latn", "ur": "urd_Arab", "hi": "hin_Deva",
            "es": "spa_Latn", "fr": "fra_Latn", "ar": "arb_Arab",
            "bn": "ben_Beng", "tr": "tur_Latn", "de": "deu_Latn",
            "ja": "jpn_Jpan", "ko": "kor_Hang", "zh": "zho_Hans",
            "ru": "rus_Cyrl", "pt": "por_Latn", "it": "ita_Latn",
        }
        src_code = lang_map.get(source_lang, "eng_Latn")
        tgt_code = lang_map.get(target_lang, "urd_Arab")

        tokenizer.src_lang = src_code

        new_segments = []
        for s in segments:
            text = s.get("text", "").strip()
            if not text:
                new_segments.append({"text": ""})
                continue

            inputs = tokenizer(text, return_tensors="pt", padding=True, truncation=True, max_length=256)
            translated_tokens = model.generate(
                **inputs,
                forced_bos_token_id=tokenizer.convert_tokens_to_ids(tgt_code),
                max_length=256,
            )
            translated = tokenizer.batch_decode(translated_tokens, skip_special_tokens=True)[0]
            new_segments.append({"text": translated.strip()})

        return {"engine": "nllb", "segments": new_segments}

    except ImportError as e:
        print(f"[TRANSLATE] NLLB dependency error: {e}", file=sys.stderr)
        return {"engine": "nllb_placeholder", "segments": [{"text": s.get("text", "")} for s in segments]}
    except Exception as e:
        print(f"[TRANSLATE] NLLB error: {e}", file=sys.stderr)
        return {"engine": "nllb_placeholder", "segments": [{"text": s.get("text", "")} for s in segments]}


if __name__ == "__main__":
    main()
