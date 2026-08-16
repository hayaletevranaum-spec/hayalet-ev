#!/usr/bin/env python3

import argparse
import csv
import json
from pathlib import Path

import numpy as np
from scipy import signal
from scipy.io import wavfile
import tensorflow as tf
import tensorflow_hub as hub


MODEL_URL = "https://tfhub.dev/google/yamnet/1"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run YAMNet inference on a mono wav file.")
    parser.add_argument("--input", required=True, help="Path to the input wav file.")
    parser.add_argument("--output", required=True, help="Path to the output JSON file.")
    parser.add_argument("--top-k", type=int, default=8, help="Number of top classes to keep.")
    parser.add_argument(
        "--threshold",
        type=float,
        default=0.15,
        help="Minimum mean score threshold for including a class.",
    )
    return parser.parse_args()


def class_names_from_csv(class_map_path: str) -> list[str]:
    class_names: list[str] = []
    with tf.io.gfile.GFile(class_map_path) as csv_file:
        reader = csv.DictReader(csv_file)
        for row in reader:
            class_names.append(row["display_name"])
    return class_names


def ensure_sample_rate(
    original_sample_rate: int, waveform: np.ndarray, desired_sample_rate: int = 16000
) -> tuple[int, np.ndarray]:
    if original_sample_rate == desired_sample_rate:
        return desired_sample_rate, waveform

    desired_length = int(round(float(len(waveform)) / original_sample_rate * desired_sample_rate))
    resampled = signal.resample(waveform, desired_length)
    return desired_sample_rate, resampled.astype(np.float32)


def normalize_waveform(waveform: np.ndarray) -> np.ndarray:
    normalized = waveform
    if normalized.ndim > 1:
        normalized = normalized.mean(axis=1)

    if np.issubdtype(normalized.dtype, np.integer):
        normalized = normalized.astype(np.float32) / np.iinfo(normalized.dtype).max
    else:
        normalized = normalized.astype(np.float32)

    return np.clip(normalized, -1.0, 1.0)


def main() -> int:
    args = parse_args()
    input_path = Path(args.input)
    output_path = Path(args.output)

    sample_rate, wav_data = wavfile.read(str(input_path), "rb")
    waveform = normalize_waveform(wav_data)
    sample_rate, waveform = ensure_sample_rate(sample_rate, waveform)

    model = hub.load(MODEL_URL)
    scores, embeddings, spectrogram = model(waveform)
    scores_np = scores.numpy()
    mean_scores = np.mean(scores_np, axis=0)

    class_map_path = model.class_map_path().numpy()
    if isinstance(class_map_path, bytes):
        class_map_path = class_map_path.decode("utf-8")
    class_names = class_names_from_csv(class_map_path)

    top_indices = np.argsort(mean_scores)[::-1]
    top_classes = []
    for index in top_indices:
        score = float(mean_scores[index])
        if score < args.threshold:
            continue
        top_classes.append(
            {
                "classIndex": int(index),
                "label": class_names[index],
                "score": round(score, 6),
            }
        )
        if len(top_classes) >= max(1, args.top_k):
            break

    payload = {
        "generatedAt": tf.timestamp().numpy().item(),
        "modelUrl": MODEL_URL,
        "modelVersion": getattr(tf, "__version__", None),
        "inputPath": str(input_path),
        "sampleRate": int(sample_rate),
        "sampleCount": int(len(waveform)),
        "durationSeconds": round(float(len(waveform)) / float(sample_rate), 3) if sample_rate else None,
        "frameCount": int(scores_np.shape[0]),
        "embeddingFrameCount": int(embeddings.shape[0]),
        "spectrogramFrameCount": int(spectrogram.shape[0]),
        "topClasses": top_classes,
        "warning": "YAMNet predictions are broad AudioSet labels and should be reviewed manually.",
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
