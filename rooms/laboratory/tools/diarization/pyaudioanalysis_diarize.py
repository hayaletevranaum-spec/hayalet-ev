#!/usr/bin/env python3

import argparse
import contextlib
import datetime as dt
import json
import os
import wave
from pathlib import Path

import numpy as np


def patch_numpy_binary_fromstring() -> None:
    original_fromstring = np.fromstring
    if getattr(original_fromstring, "_hayalet_binary_compat", False):
        return

    def compat_fromstring(data, dtype=float, count=-1, sep="", *args, **kwargs):
        if sep == "" and isinstance(data, (bytes, bytearray, memoryview)):
            if count in (-1, None):
                return np.frombuffer(data, dtype=dtype)
            return np.frombuffer(data, dtype=dtype, count=count)
        return original_fromstring(data, dtype=dtype, count=count, sep=sep, *args, **kwargs)

    setattr(compat_fromstring, "_hayalet_binary_compat", True)
    np.fromstring = compat_fromstring


def configure_room_local_ffmpeg() -> None:
    script_path = Path(__file__).resolve()
    candidate_roots = [script_path.parent] + list(script_path.parents)
    for root in candidate_roots:
        runtime_root = root / "data" / "room-storage" / "laboratory" / "tools" / "runtime"
        if not runtime_root.exists():
            continue

        ffmpeg_candidates = sorted(runtime_root.glob("*/ffmpeg/ffmpeg*"))
        ffprobe_candidates = sorted(runtime_root.glob("*/ffmpeg/ffprobe*"))
        if not ffmpeg_candidates and not ffprobe_candidates:
            continue

        ffmpeg_dir = str((ffmpeg_candidates or ffprobe_candidates)[0].parent)
        path_parts = os.environ.get("PATH", "").split(os.pathsep)
        if ffmpeg_dir not in path_parts:
            os.environ["PATH"] = ffmpeg_dir + os.pathsep + os.environ.get("PATH", "")
        if ffmpeg_candidates:
            os.environ.setdefault("FFMPEG_BINARY", str(ffmpeg_candidates[0]))
        if ffprobe_candidates:
            os.environ.setdefault("FFPROBE_BINARY", str(ffprobe_candidates[0]))
        return


configure_room_local_ffmpeg()
patch_numpy_binary_fromstring()
from pyAudioAnalysis import audioSegmentation as aS
from scipy.signal import medfilt
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score


def read_wav_duration_seconds(file_path: str) -> float:
    with contextlib.closing(wave.open(file_path, "rb")) as wav_file:
        frames = wav_file.getnframes()
        sample_rate = wav_file.getframerate()
        return float(frames) / float(sample_rate) if sample_rate else 0.0


def build_segments(labels, mid_step: float, duration_seconds: float):
    if len(labels) == 0:
        return []

    segments = []
    start_index = 0
    current_label = int(labels[0])

    for index in range(1, len(labels)):
        next_label = int(labels[index])
        if next_label == current_label:
            continue
        segments.append(
            {
                "speakerId": f"speaker_{current_label + 1}",
                "speakerIndex": current_label,
                "startSeconds": round(start_index * mid_step, 3),
                "endSeconds": round(min(duration_seconds, index * mid_step), 3),
                "windowCount": index - start_index,
            }
        )
        start_index = index
        current_label = next_label

    segments.append(
        {
            "speakerId": f"speaker_{current_label + 1}",
            "speakerIndex": current_label,
            "startSeconds": round(start_index * mid_step, 3),
            "endSeconds": round(min(duration_seconds, len(labels) * mid_step), 3),
            "windowCount": len(labels) - start_index,
        }
    )
    return segments


def should_retry_with_local_fallback(error: Exception) -> bool:
    message = str(error).lower()
    retry_markers = [
        "'diag' covars must be positive",
        "fromstring is removed",
        "speaker models are unavailable",
        "couldn't find file",
        "didn't find file",
        "knnspeaker",
    ]
    return any(marker in message for marker in retry_markers)


def py_audio_analysis_has_speaker_models() -> bool:
    data_dir = Path(aS.__file__).resolve().parent / "data"
    legacy_model_paths = [
        data_dir / "knnSpeakerAll",
        data_dir / "knnSpeakerFemaleMale",
    ]
    modern_model_paths = [
        data_dir / "models" / "svm_rbf_speaker_10",
        data_dir / "models" / "svm_rbf_speaker_10MEANS",
        data_dir / "models" / "svm_rbf_speaker_male_female",
        data_dir / "models" / "svm_rbf_speaker_male_femaleMEANS",
    ]
    return all(path.exists() for path in legacy_model_paths) or all(
        path.exists() for path in modern_model_paths
    )


def run_speaker_diarization(
    input_path: str,
    requested_speaker_count: int,
    mid_window: float,
    mid_step: float,
    short_window: float,
    lda_dim: int,
):
    if not py_audio_analysis_has_speaker_models():
        raise RuntimeError("pyAudioAnalysis speaker models are unavailable in this runtime.")
    diarization_fn = getattr(aS, "speaker_diarization", None)
    if diarization_fn is None:
        diarization_fn = getattr(aS, "speakerDiarization", None)
    if diarization_fn is None:
        raise AttributeError(
            "pyAudioAnalysis.audioSegmentation does not expose a speaker diarization entry point."
        )
    return diarization_fn(
        input_path,
        requested_speaker_count,
        mid_window,
        mid_step,
        short_window,
        lda_dim,
        False,
    )


def read_wav_mono_samples(file_path: str):
    with contextlib.closing(wave.open(file_path, "rb")) as wav_file:
        frame_count = wav_file.getnframes()
        channel_count = wav_file.getnchannels()
        sample_rate = wav_file.getframerate()
        sample_width = wav_file.getsampwidth()
        raw_frames = wav_file.readframes(frame_count)

    dtype_map = {
        1: np.uint8,
        2: np.int16,
        4: np.int32,
    }
    dtype = dtype_map.get(sample_width)
    if dtype is None:
        raise ValueError(f"Unsupported WAV sample width for diarization fallback: {sample_width}")

    samples = np.frombuffer(raw_frames, dtype=dtype).astype(np.float32)
    if samples.size == 0:
        return sample_rate, samples

    if channel_count > 1:
        samples = samples.reshape(-1, channel_count).mean(axis=1)

    if sample_width == 1:
        samples = (samples - 128.0) / 128.0
    elif sample_width == 2:
        samples /= 32768.0
    else:
        samples /= 2147483648.0

    return sample_rate, samples


def compute_window_features(samples, sample_rate: int):
    if samples.size == 0:
        return np.zeros((7,), dtype=np.float32)

    energy = float(np.sqrt(np.mean(np.square(samples))))
    abs_mean = float(np.mean(np.abs(samples)))
    zero_crossings = float(np.mean(np.abs(np.diff(np.signbit(samples))))) if samples.size > 1 else 0.0

    if samples.size > 1:
        window = np.hanning(samples.size)
        magnitudes = np.abs(np.fft.rfft(samples * window)) + 1e-8
        freqs = np.fft.rfftfreq(samples.size, d=1.0 / float(sample_rate))
        magnitude_sum = float(np.sum(magnitudes))
        spectral_centroid = float(np.sum(freqs * magnitudes) / magnitude_sum)
        spectral_bandwidth = float(
            np.sqrt(np.sum(np.square(freqs - spectral_centroid) * magnitudes) / magnitude_sum)
        )
        cumulative = np.cumsum(magnitudes)
        rolloff_target = 0.85 * float(cumulative[-1])
        rolloff_index = int(np.searchsorted(cumulative, rolloff_target))
        spectral_rolloff = float(freqs[min(rolloff_index, freqs.size - 1)])
        spectral_flatness = float(np.exp(np.mean(np.log(magnitudes))) / np.mean(magnitudes))
    else:
        spectral_centroid = 0.0
        spectral_bandwidth = 0.0
        spectral_rolloff = 0.0
        spectral_flatness = 0.0

    max_frequency = max(float(sample_rate) / 2.0, 1.0)
    return np.asarray(
        [
            energy,
            abs_mean,
            zero_crossings,
            spectral_centroid / max_frequency,
            spectral_bandwidth / max_frequency,
            spectral_rolloff / max_frequency,
            spectral_flatness,
        ],
        dtype=np.float32,
    )


def build_feature_matrix(samples, sample_rate: int, mid_window: float, mid_step: float):
    window_size = max(int(round(mid_window * float(sample_rate))), 1)
    step_size = max(int(round(mid_step * float(sample_rate))), 1)

    if samples.size <= window_size:
        return np.asarray([compute_window_features(samples, sample_rate)], dtype=np.float32)

    window_starts = list(range(0, samples.size - window_size + 1, step_size))
    last_start = samples.size - window_size
    if window_starts[-1] != last_start:
        window_starts.append(last_start)

    feature_rows = [
        compute_window_features(samples[start_index : start_index + window_size], sample_rate)
        for start_index in window_starts
    ]
    return np.asarray(feature_rows, dtype=np.float32)


def cluster_feature_windows(feature_matrix, requested_speaker_count: int):
    if feature_matrix.shape[0] == 0:
        return np.zeros((0,), dtype=int)

    if feature_matrix.shape[0] == 1 or requested_speaker_count == 1:
        return np.zeros((feature_matrix.shape[0],), dtype=int)

    feature_means = np.mean(feature_matrix, axis=0, keepdims=True)
    feature_stds = np.std(feature_matrix, axis=0, keepdims=True)
    feature_stds[feature_stds < 1e-6] = 1.0
    normalized_features = np.nan_to_num((feature_matrix - feature_means) / feature_stds, copy=False)

    if not np.any(np.abs(normalized_features) > 1e-3):
        return np.zeros((feature_matrix.shape[0],), dtype=int)

    max_candidate_speakers = min(6, feature_matrix.shape[0])
    if requested_speaker_count > 0:
        candidate_speaker_counts = [max(1, min(requested_speaker_count, max_candidate_speakers))]
    else:
        candidate_speaker_counts = list(range(2, max_candidate_speakers + 1))

    best_labels = None
    best_score = None
    for speaker_count in candidate_speaker_counts:
        if speaker_count <= 1:
            return np.zeros((feature_matrix.shape[0],), dtype=int)

        labels = KMeans(n_clusters=speaker_count, n_init=10, random_state=0).fit_predict(
            normalized_features
        )
        unique_labels = np.unique(labels)
        if unique_labels.size < 2:
            score = -1.0
        elif unique_labels.size >= normalized_features.shape[0]:
            score = 0.0
        else:
            try:
                score = float(silhouette_score(normalized_features, labels))
            except Exception:
                score = 0.0

        if best_score is None or score > best_score:
            best_score = score
            best_labels = labels

    if best_labels is None:
        return np.zeros((feature_matrix.shape[0],), dtype=int)

    if requested_speaker_count <= 0 and feature_matrix.shape[0] >= 4 and (best_score or 0.0) < 0.02:
        return np.zeros((feature_matrix.shape[0],), dtype=int)

    raw_labels = np.asarray(best_labels).astype(int)
    kernel_size = min(5, feature_matrix.shape[0] if feature_matrix.shape[0] % 2 == 1 else feature_matrix.shape[0] - 1)
    if kernel_size >= 3:
        smoothed_labels = np.asarray(medfilt(raw_labels, kernel_size=kernel_size)).astype(int)
        if requested_speaker_count > 1 and np.unique(smoothed_labels).size < np.unique(raw_labels).size:
            return raw_labels
        return smoothed_labels
    return raw_labels


def run_local_kmeans_diarization(
    input_path: str,
    requested_speaker_count: int,
    mid_window: float,
    mid_step: float,
    short_window: float,
):
    _ = short_window
    sampling_rate, signal = read_wav_mono_samples(input_path)
    feature_matrix = build_feature_matrix(signal, sampling_rate, mid_window, mid_step)
    labels = cluster_feature_windows(feature_matrix, requested_speaker_count)
    return labels.astype(int), None, None


def main():
    parser = argparse.ArgumentParser(description="Run pyAudioAnalysis speaker diarization and emit JSON.")
    parser.add_argument("--input", required=True, help="Path to the prepared WAV file.")
    parser.add_argument("--output", required=True, help="Path to the JSON output.")
    parser.add_argument("--num-speakers", type=int, default=0, help="Known number of speakers, or 0 to infer.")
    parser.add_argument("--mid-window", type=float, default=2.0, help="Mid-term window in seconds.")
    parser.add_argument("--mid-step", type=float, default=0.2, help="Mid-term step in seconds.")
    parser.add_argument("--short-window", type=float, default=0.05, help="Short-term window in seconds.")
    parser.add_argument("--lda-dim", type=int, default=0, help="Optional LDA dimension, 0 disables it.")
    args = parser.parse_args()

    effective_num_speakers = args.num_speakers
    fallback_applied = False
    fallback_reason = None
    try:
        labels, purity_cluster, purity_speaker = run_speaker_diarization(
            args.input,
            args.num_speakers,
            args.mid_window,
            args.mid_step,
            args.short_window,
            args.lda_dim,
        )
    except Exception as error:
        fallback_applied = True
        fallback_reason = str(error)
        try:
            labels, purity_cluster, purity_speaker = run_local_kmeans_diarization(
                args.input,
                args.num_speakers,
                args.mid_window,
                args.mid_step,
                args.short_window,
            )
        except Exception as fallback_error:
            raise RuntimeError(
                "pyAudioAnalysis diarization failed and the room-local fallback could not recover: "
                f"{error}; fallback error: {fallback_error}"
            ) from fallback_error

    labels_array = np.asarray(labels).astype(int)
    duration_seconds = read_wav_duration_seconds(args.input)
    segments = build_segments(labels_array.tolist(), args.mid_step, duration_seconds)
    unique_labels = sorted({int(label) for label in labels_array.tolist()})
    if effective_num_speakers <= 0:
        effective_num_speakers = len(unique_labels)

    payload = {
        "generatedAt": dt.datetime.now(dt.UTC).isoformat().replace("+00:00", "Z"),
        "inputPath": args.input,
        "durationSeconds": duration_seconds,
        "numSpeakersRequested": args.num_speakers,
        "effectiveNumSpeakers": effective_num_speakers,
        "speakerCountMode": "fixed" if args.num_speakers > 0 else "auto",
        "fallbackApplied": fallback_applied,
        "fallbackReason": fallback_reason,
        "speakerCount": len(unique_labels),
        "midWindowSeconds": args.mid_window,
        "midStepSeconds": args.mid_step,
        "shortWindowSeconds": args.short_window,
        "ldaDimension": args.lda_dim,
        "purityCluster": None if purity_cluster is None or purity_cluster < 0 else float(purity_cluster),
        "puritySpeaker": None if purity_speaker is None or purity_speaker < 0 else float(purity_speaker),
        "labels": labels_array.tolist(),
        "segments": segments,
    }

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
