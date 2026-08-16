package com.hayaletev.androidcompanion.model

import android.content.Context
import org.json.JSONObject

data class CompanionManifest(
    val applicationId: String,
    val mainActivity: String,
    val foregroundService: String,
    val versionName: String,
    val versionCode: Int,
    val bridgePort: Int,
    val commandPollIntervalMs: Int,
    val previewMode: String
) {
    companion object {
        fun load(context: Context): CompanionManifest {
            val rawJson = context.assets.open("companion-manifest.json").bufferedReader().use { it.readText() }
            val json = JSONObject(rawJson)
            return CompanionManifest(
                applicationId = json.optString("applicationId", "com.hayaletev.androidcompanion"),
                mainActivity = json.optString(
                    "mainActivity",
                    "com.hayaletev.androidcompanion/.MainActivity"
                ),
                foregroundService = json.optString(
                    "foregroundService",
                    "com.hayaletev.androidcompanion/.capture.CaptureForegroundService"
                ),
                versionName = json.optString("versionName", "0.2.0-dev"),
                versionCode = json.optInt("versionCode", 2),
                bridgePort = json.optInt("bridgePort", 48561),
                commandPollIntervalMs = json.optInt("commandPollIntervalMs", 1500),
                previewMode = json.optString("previewMode", "scrcpy-camera")
            )
        }
    }
}
