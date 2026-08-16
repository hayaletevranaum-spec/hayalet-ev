package com.hayaletev.androidcompanion.transcript

import com.hayaletev.androidcompanion.transport.BridgeTranscriptModelProfile

private const val ANDROID_VOSK_MODEL_ID = "vosk-model-small-tr-0.3"
private const val ANDROID_VOSK_MODEL_FILE = "vosk-model-small-tr-0.3.zip"
private const val ANDROID_VOSK_MODEL_SHA1 = "1bc2391ea03d6091c39c4ff42b627c811501d41f"
private const val ANDROID_VOSK_MODEL_BYTES = 36_855_784L

fun defaultAndroidVoskModelProfile(): BridgeTranscriptModelProfile {
    return BridgeTranscriptModelProfile(
        backend = "vosk",
        modelId = ANDROID_VOSK_MODEL_ID,
        fileName = ANDROID_VOSK_MODEL_FILE,
        expectedSha1 = ANDROID_VOSK_MODEL_SHA1,
        expectedBytes = ANDROID_VOSK_MODEL_BYTES,
        language = "tr",
        variant = "light",
        archiveFormat = "zip-directory",
    )
}

fun requireAndroidVoskModelProfile(
    profile: BridgeTranscriptModelProfile?
): BridgeTranscriptModelProfile {
    return profile
        ?.takeIf {
            it.backend == "vosk" &&
                it.modelId == ANDROID_VOSK_MODEL_ID &&
                it.fileName == ANDROID_VOSK_MODEL_FILE &&
                it.archiveFormat == "zip-directory"
        }
        ?: defaultAndroidVoskModelProfile()
}
