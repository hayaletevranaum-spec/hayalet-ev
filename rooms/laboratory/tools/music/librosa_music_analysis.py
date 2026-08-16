#!/usr/bin/env python3

import argparse
import datetime as dt
import json
from pathlib import Path

import numpy as np
import librosa

PITCH_CLASSES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def summarize(values):
    array = np.asarray(values, dtype=float)
    if array.size == 0:
        return None
    return {
        "min": float(np.min(array)),
        "max": float(np.max(array)),
        "mean": float(np.mean(array)),
        "median": float(np.median(array)),
    }


def to_scalar_float(value):
    array = np.asarray(value, dtype=float)
    if array.size == 0:
        return None
    return float(array.reshape(-1)[0])


def build_music_summary(audio, sample_rate):
    onset_strength = librosa.onset.onset_strength(y=audio, sr=sample_rate)
    tempo_bpm, beat_frames = librosa.beat.beat_track(onset_envelope=onset_strength, sr=sample_rate)
    spectral_centroid = librosa.feature.spectral_centroid(y=audio, sr=sample_rate)[0]
    chroma = librosa.feature.chroma_cqt(y=audio, sr=sample_rate)
    chroma_profile = np.mean(chroma, axis=1) if chroma.size else np.zeros(12, dtype=float)
    dominant_index = int(np.argmax(chroma_profile)) if chroma_profile.size else None
    tuning = librosa.estimate_tuning(y=audio, sr=sample_rate)

    return {
        "durationSeconds": float(len(audio) / sample_rate) if sample_rate else 0.0,
        "tempoBpm": to_scalar_float(tempo_bpm),
        "beatCount": int(len(beat_frames)),
        "dominantPitchClass": PITCH_CLASSES[dominant_index] if dominant_index is not None else None,
        "dominantPitchClassScore": float(chroma_profile[dominant_index]) if dominant_index is not None else None,
        "tuningCents": float(tuning * 100.0),
        "spectralCentroidHz": summarize(spectral_centroid),
        "onsetStrength": summarize(onset_strength),
    }


def build_essentia_summary(audio):
    try:
        import essentia.standard as essentia
    except Exception as exc:
        return {
            "available": False,
            "error": f"Essentia unavailable: {exc}",
        }

    try:
        extractor = essentia.RhythmExtractor2013(method="multifeature")
        bpm, beats, confidence, _, intervals = extractor(audio.astype(np.float32))
        return {
            "available": True,
            "tempoBpm": float(bpm),
            "beatCount": int(len(beats)),
            "confidence": float(confidence),
            "intervalSummary": summarize(intervals),
        }
    except Exception as exc:
        return {
            "available": False,
            "error": f"Essentia extraction failed: {exc}",
        }


def main():
    parser = argparse.ArgumentParser(description="Generate a lightweight music/rhythm descriptor summary.")
    parser.add_argument("--input", required=True, help="Path to the prepared WAV input.")
    parser.add_argument("--output", required=True, help="Path to the JSON summary output.")
    parser.add_argument("--sample-rate", type=int, default=22050, help="Analysis sample rate.")
    parser.add_argument("--focus", default="balanced", choices=["balanced", "rhythm", "tonal"])
    parser.add_argument("--skip-essentia", action="store_true", help="Skip optional Essentia descriptors.")
    args = parser.parse_args()

    audio, sample_rate = librosa.load(args.input, sr=max(8000, args.sample_rate), mono=True)
    payload = {
        "generatedAt": dt.datetime.now(dt.UTC).isoformat().replace("+00:00", "Z"),
        "inputPath": args.input,
        "focus": args.focus,
        "sampleRate": int(sample_rate),
        "musicSummary": build_music_summary(audio, sample_rate),
        "essentia": {
            "available": False,
            "error": "Essentia extraction disabled by analysis settings.",
        }
        if args.skip_essentia
        else build_essentia_summary(audio),
    }

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
