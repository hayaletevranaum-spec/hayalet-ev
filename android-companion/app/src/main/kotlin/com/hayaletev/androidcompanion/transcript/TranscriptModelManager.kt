package com.hayaletev.androidcompanion.transcript

import android.content.Context
import com.hayaletev.androidcompanion.debug.CompanionDiagnostics
import com.hayaletev.androidcompanion.transport.BridgeTranscriptModelProfile
import com.hayaletev.androidcompanion.transport.DesktopBridgeClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileNotFoundException
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.zip.ZipInputStream

private const val LOCAL_TRANSCRIPT_ASSET_ROOT = "transcript-models"

class TranscriptModelManager(
    private val context: Context,
    private val bridgeClient: DesktopBridgeClient,
) {
    suspend fun ensureModel(profile: BridgeTranscriptModelProfile): File = withContext(Dispatchers.IO) {
        val directory = File(context.filesDir, "transcript-models").apply { mkdirs() }
        if (profile.archiveFormat == "zip-directory") {
            return@withContext ensureZipDirectoryModel(directory, profile)
        }

        val modelFile = File(directory, profile.fileName)
        if (modelFile.isFile && validateModel(modelFile, profile)) {
            return@withContext modelFile
        }

        val downloadFile = File(directory, "${profile.fileName}.download")
        if (downloadFile.exists()) {
            downloadFile.delete()
        }

        CompanionDiagnostics.i(
            "transcript",
            "Requesting transcript model from desktop bridge.",
            "model=${profile.modelId}, file=${profile.fileName}",
        )
        bridgeClient.downloadTranscriptModel(profile.fileName, downloadFile)
        if (validateModel(downloadFile, profile).not()) {
            downloadFile.delete()
            throw IllegalStateException("Downloaded transcript model checksum did not match.")
        }
        if (modelFile.exists()) {
            modelFile.delete()
        }
        downloadFile.renameTo(modelFile)
        modelFile
    }

    suspend fun ensureLocalModel(profile: BridgeTranscriptModelProfile): File = withContext(Dispatchers.IO) {
        val directory = File(context.filesDir, "transcript-models").apply { mkdirs() }
        if (profile.archiveFormat == "zip-directory") {
            return@withContext ensureLocalZipDirectoryModel(directory, profile)
        }

        return@withContext ensureLocalFileModel(directory, profile)
    }

    private fun ensureLocalFileModel(
        directory: File,
        profile: BridgeTranscriptModelProfile,
    ): File {
        val modelFile = File(directory, profile.fileName)
        if (modelFile.isFile && validateModel(modelFile, profile)) {
            return modelFile
        }

        val assetFile = File(directory, "${profile.fileName}.asset")
        if (copyAssetModelIfAvailable(profile.fileName, assetFile)) {
            if (validateModel(assetFile, profile).not()) {
                assetFile.delete()
                throw IllegalStateException("Bundled local transcript model checksum did not match.")
            }
            if (modelFile.exists()) {
                modelFile.delete()
            }
            assetFile.renameTo(modelFile)
            return modelFile
        }

        throw missingLocalModelError(profile)
    }

    private fun ensureLocalZipDirectoryModel(
        directory: File,
        profile: BridgeTranscriptModelProfile,
    ): File {
        val modelDirectory = File(directory, profile.modelId)
        val markerFile = File(modelDirectory, ".hayalet-ev-model.sha1")
        if (isZipDirectoryModelReady(modelDirectory, markerFile, profile)) {
            return modelDirectory
        }

        val assetFile = File(directory, "${profile.fileName}.asset")
        if (copyAssetModelIfAvailable(profile.fileName, assetFile)) {
            if (validateModel(assetFile, profile).not()) {
                assetFile.delete()
                throw IllegalStateException("Bundled local Vosk model checksum did not match.")
            }
            return installZipDirectoryModel(assetFile, directory, profile, deleteArchive = true)
        }

        throw missingLocalModelError(profile)
    }

    private suspend fun ensureZipDirectoryModel(
        directory: File,
        profile: BridgeTranscriptModelProfile,
    ): File {
        val modelDirectory = File(directory, profile.modelId)
        val markerFile = File(modelDirectory, ".hayalet-ev-model.sha1")
        if (isZipDirectoryModelReady(modelDirectory, markerFile, profile)) {
            return modelDirectory
        }

        val assetFile = File(directory, "${profile.fileName}.asset")
        if (copyAssetModelIfAvailable(profile.fileName, assetFile)) {
            if (validateModel(assetFile, profile).not()) {
                assetFile.delete()
                throw IllegalStateException("Bundled local Vosk model checksum did not match.")
            }
            return installZipDirectoryModel(assetFile, directory, profile, deleteArchive = true)
        }

        val downloadFile = File(directory, "${profile.fileName}.download")
        val extractDirectory = File(directory, "${profile.modelId}.extract")
        if (downloadFile.exists()) {
            downloadFile.delete()
        }
        if (extractDirectory.exists()) {
            extractDirectory.deleteRecursively()
        }

        CompanionDiagnostics.i(
            "transcript",
            "Requesting Android Vosk transcript model from desktop bridge.",
            "model=${profile.modelId}, file=${profile.fileName}",
        )
        bridgeClient.downloadTranscriptModel(profile.fileName, downloadFile)
        if (validateModel(downloadFile, profile).not()) {
            downloadFile.delete()
            throw IllegalStateException("Downloaded Vosk transcript model checksum did not match.")
        }

        return installZipDirectoryModel(downloadFile, directory, profile, deleteArchive = true)
    }

    private fun isZipDirectoryModelReady(
        modelDirectory: File,
        markerFile: File,
        profile: BridgeTranscriptModelProfile,
    ): Boolean {
        return modelDirectory.isDirectory &&
            markerFile.isFile &&
            markerFile.readText().trim().equals(profile.expectedSha1, ignoreCase = true)
    }

    private fun installZipDirectoryModel(
        archiveFile: File,
        directory: File,
        profile: BridgeTranscriptModelProfile,
        deleteArchive: Boolean,
    ): File {
        val modelDirectory = File(directory, profile.modelId)
        val markerFile = File(modelDirectory, ".hayalet-ev-model.sha1")
        val extractDirectory = File(directory, "${profile.modelId}.extract")
        if (extractDirectory.exists()) {
            extractDirectory.deleteRecursively()
        }

        extractZip(archiveFile, extractDirectory)
        val extractedRoot = File(extractDirectory, profile.modelId)
        if (extractedRoot.isDirectory.not()) {
            extractDirectory.deleteRecursively()
            if (deleteArchive) {
                archiveFile.delete()
            }
            throw IllegalStateException("Downloaded Vosk transcript model archive was not recognized.")
        }

        if (modelDirectory.exists()) {
            modelDirectory.deleteRecursively()
        }
        if (extractedRoot.renameTo(modelDirectory).not()) {
            extractedRoot.copyRecursively(modelDirectory, overwrite = true)
        }
        markerFile.writeText(profile.expectedSha1)
        extractDirectory.deleteRecursively()
        if (deleteArchive) {
            archiveFile.delete()
        }
        return modelDirectory
    }

    private fun copyAssetModelIfAvailable(fileName: String, destination: File): Boolean {
        val assetPath = "$LOCAL_TRANSCRIPT_ASSET_ROOT/$fileName"
        return try {
            context.assets.open(assetPath).use { input ->
                destination.parentFile?.mkdirs()
                FileOutputStream(destination).use { output ->
                    input.copyTo(output)
                }
            }
            true
        } catch (_: FileNotFoundException) {
            false
        }
    }

    private fun missingLocalModelError(profile: BridgeTranscriptModelProfile): IllegalStateException {
        return IllegalStateException(
            "Local ${profile.backend} model is not available on this phone. " +
                "Cache ${profile.fileName} first or bundle it as app/src/main/assets/$LOCAL_TRANSCRIPT_ASSET_ROOT/${profile.fileName}."
        )
    }

    private fun extractZip(zipFile: File, destination: File) {
        destination.mkdirs()
        val destinationRoot = destination.canonicalFile
        val destinationPrefix = "${destinationRoot.path}${File.separator}"
        ZipInputStream(zipFile.inputStream().buffered()).use { zip ->
            while (true) {
                val entry = zip.nextEntry ?: break
                val target = File(destinationRoot, entry.name).canonicalFile
                if (target != destinationRoot && target.path.startsWith(destinationPrefix).not()) {
                    throw IllegalStateException("Vosk model archive contains an unsafe path.")
                }
                if (entry.isDirectory) {
                    target.mkdirs()
                } else {
                    target.parentFile?.mkdirs()
                    FileOutputStream(target).use { output ->
                        zip.copyTo(output)
                    }
                }
                zip.closeEntry()
            }
        }
    }

    private fun validateModel(file: File, profile: BridgeTranscriptModelProfile): Boolean {
        if (file.isFile.not()) {
            return false
        }
        if (profile.expectedBytes != null && file.length() != profile.expectedBytes) {
            return false
        }
        return sha1(file).equals(profile.expectedSha1, ignoreCase = true)
    }

    private fun sha1(file: File): String {
        val digest = MessageDigest.getInstance("SHA-1")
        file.inputStream().use { input ->
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            while (true) {
                val read = input.read(buffer)
                if (read <= 0) {
                    break
                }
                digest.update(buffer, 0, read)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }
}
