package com.hayaletev.androidcompanion.debug

import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.CopyOnWriteArraySet

enum class CompanionLogLevel {
    DEBUG,
    INFO,
    WARN,
    ERROR,
}

data class CompanionLogEntry(
    val timestampMs: Long,
    val level: CompanionLogLevel,
    val category: String,
    val message: String,
    val details: String? = null,
)

data class CompanionDiagnosticsSnapshot(
    val stateEntries: List<Pair<String, String>>,
    val logEntries: List<CompanionLogEntry>,
)

fun interface CompanionDiagnosticsListener {
    fun onDiagnosticsChanged(snapshot: CompanionDiagnosticsSnapshot)
}

object CompanionDiagnostics {
    private const val LOG_TAG = "HEVCompanion"
    private const val MAX_LOG_ENTRIES = 400
    private const val MAX_DETAILS_CHARS = 6_000

    private val lock = Any()
    private val logEntries = ArrayDeque<CompanionLogEntry>()
    private val stateEntries = linkedMapOf<String, String>()
    private val listeners = CopyOnWriteArraySet<CompanionDiagnosticsListener>()
    private val timeFormatter = SimpleDateFormat("HH:mm:ss.SSS", Locale.US)

    fun addListener(listener: CompanionDiagnosticsListener) {
        listeners.add(listener)
        listener.onDiagnosticsChanged(snapshot())
    }

    fun removeListener(listener: CompanionDiagnosticsListener) {
        listeners.remove(listener)
    }

    fun setState(key: String, value: String?) {
        val normalizedKey = key.trim()
        if (normalizedKey.isEmpty()) {
            return
        }

        val normalizedValue = value?.trim().orEmpty()
        val changed =
            synchronized(lock) {
                if (normalizedValue.isEmpty()) {
                    stateEntries.remove(normalizedKey) != null
                } else if (stateEntries[normalizedKey] != normalizedValue) {
                    stateEntries[normalizedKey] = normalizedValue
                    true
                } else {
                    false
                }
            }
        if (changed.not()) {
            return
        }
        notifyListeners(snapshot())
    }

    fun clearState(key: String) {
        val normalizedKey = key.trim()
        if (normalizedKey.isEmpty()) {
            return
        }

        val changed =
            synchronized(lock) {
                stateEntries.remove(normalizedKey) != null
            }
        if (changed.not()) {
            return
        }
        notifyListeners(snapshot())
    }

    fun clearLogs() {
        synchronized(lock) {
            logEntries.clear()
        }
        notifyListeners(snapshot())
    }

    fun d(category: String, message: String, details: String? = null) {
        record(CompanionLogLevel.DEBUG, category, message, details = details)
    }

    fun i(category: String, message: String, details: String? = null) {
        record(CompanionLogLevel.INFO, category, message, details = details)
    }

    fun w(category: String, message: String, details: String? = null, throwable: Throwable? = null) {
        record(CompanionLogLevel.WARN, category, message, details = details, throwable = throwable)
    }

    fun e(category: String, message: String, details: String? = null, throwable: Throwable? = null) {
        record(CompanionLogLevel.ERROR, category, message, details = details, throwable = throwable)
    }

    fun formatEntry(entry: CompanionLogEntry): String {
        val prefix = buildString {
            append("[")
            append(formatTimestamp(entry.timestampMs))
            append("] ")
            append(entry.level.name.padEnd(5, ' '))
            append(" ")
            append(entry.category.uppercase(Locale.US))
            append(" ")
            append(entry.message)
        }
        return if (entry.details.isNullOrBlank()) {
            prefix
        } else {
            "$prefix\n${entry.details}"
        }
    }

    fun snapshot(): CompanionDiagnosticsSnapshot =
        synchronized(lock) {
            CompanionDiagnosticsSnapshot(
                stateEntries = stateEntries.entries.map { it.key to it.value },
                logEntries = logEntries.toList(),
            )
        }

    fun buildShareText(): String {
        return buildShareText(snapshot())
    }

    fun buildSnapshotPayload(deviceId: String): JSONObject {
        val snapshot = snapshot()
        val stateJson =
            JSONArray().apply {
                snapshot.stateEntries.forEach { (key, value) ->
                    put(JSONObject().put("key", key).put("value", value))
                }
            }
        val logsJson =
            JSONArray().apply {
                snapshot.logEntries.forEach { entry ->
                    put(
                        JSONObject()
                            .put("timestampMs", entry.timestampMs)
                            .put("level", entry.level.name)
                            .put("category", entry.category)
                            .put("message", entry.message)
                            .put("details", entry.details ?: JSONObject.NULL)
                    )
                }
            }

        return JSONObject()
            .put("deviceId", deviceId)
            .put("generatedAtMs", System.currentTimeMillis())
            .put("stateEntries", stateJson)
            .put("logEntries", logsJson)
            .put("text", buildShareText(snapshot))
    }

    private fun buildShareText(snapshot: CompanionDiagnosticsSnapshot): String {
        val stateText =
            if (snapshot.stateEntries.isEmpty()) {
                "No state entries yet."
            } else {
                snapshot.stateEntries.joinToString("\n") { (key, value) -> "$key: $value" }
            }
        val logText =
            if (snapshot.logEntries.isEmpty()) {
                "No diagnostic log entries yet."
            } else {
                snapshot.logEntries.asReversed().joinToString("\n\n", transform = ::formatEntry)
            }

        return buildString {
            appendLine("Hayalet Ev Companion Diagnostics")
            appendLine()
            appendLine("State")
            appendLine(stateText)
            appendLine()
            appendLine("Logs")
            append(logText)
        }
    }

    private fun record(
        level: CompanionLogLevel,
        category: String,
        message: String,
        details: String? = null,
        throwable: Throwable? = null,
    ) {
        val normalizedMessage = message.trim()
        if (normalizedMessage.isEmpty()) {
            return
        }

        val normalizedCategory = category.trim().ifEmpty { "general" }
        val normalizedDetails =
            buildList {
                details?.trim()?.takeIf { it.isNotEmpty() }?.let(::add)
                throwable?.stackTraceToString()?.trim()?.takeIf { it.isNotEmpty() }?.let(::add)
            }
                .joinToString("\n")
                .take(MAX_DETAILS_CHARS)
                .ifEmpty { null }

        val entry =
            CompanionLogEntry(
                timestampMs = System.currentTimeMillis(),
                level = level,
                category = normalizedCategory,
                message = normalizedMessage,
                details = normalizedDetails,
            )

        synchronized(lock) {
            while (logEntries.size >= MAX_LOG_ENTRIES) {
                logEntries.removeFirst()
            }
            logEntries.addLast(entry)
        }

        writeToLogcat(entry)
        notifyListeners(snapshot())
    }

    private fun notifyListeners(snapshot: CompanionDiagnosticsSnapshot) {
        listeners.forEach { listener ->
            listener.onDiagnosticsChanged(snapshot)
        }
    }

    private fun writeToLogcat(entry: CompanionLogEntry) {
        val message =
            buildString {
                append("[")
                append(entry.category)
                append("] ")
                append(entry.message)
                entry.details?.takeIf { it.isNotBlank() }?.let {
                    append('\n')
                    append(it)
                }
            }
        when (entry.level) {
            CompanionLogLevel.DEBUG -> Log.d(LOG_TAG, message)
            CompanionLogLevel.INFO -> Log.i(LOG_TAG, message)
            CompanionLogLevel.WARN -> Log.w(LOG_TAG, message)
            CompanionLogLevel.ERROR -> Log.e(LOG_TAG, message)
        }
    }

    private fun formatTimestamp(timestampMs: Long): String =
        synchronized(timeFormatter) {
            timeFormatter.format(Date(timestampMs))
        }
}
