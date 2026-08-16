plugins {
  id("com.android.application")
}

val ncnnPiperRoot = file("${rootProject.projectDir}/../dist/android-ncnn-piper")
val ncnnPiperAssetsRoot = file("${ncnnPiperRoot}/assets")
val ncnnPiperJniLibsRoot = file("${ncnnPiperRoot}/jniLibs")

android {
  namespace = "com.hayaletev.androidcompanion"
  compileSdk = 37
  ndkVersion = "26.3.11579264"

  defaultConfig {
    applicationId = "com.hayaletev.androidcompanion"
    minSdk = 28
    targetSdk = 35
    versionCode = 2
    versionName = "0.2.0-dev"

    testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    vectorDrawables {
      useSupportLibrary = true
    }

    ndk {
      abiFilters += listOf("armeabi-v7a", "arm64-v8a")
    }

  }

  buildTypes {
    release {
      isMinifyEnabled = false
      proguardFiles(
        getDefaultProguardFile("proguard-android-optimize.txt"),
        "proguard-rules.pro"
      )
    }
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }

  buildFeatures {
    viewBinding = true
  }

  sourceSets {
    getByName("main") {
      kotlin.srcDir(file("${rootProject.projectDir}/../dist/android-sherpa-tts/generated/kotlin"))
      jniLibs.srcDirs(
        file("${rootProject.projectDir}/../dist/android-sherpa-tts/jniLibs"),
        ncnnPiperJniLibsRoot
      )
      assets.srcDirs(file("${rootProject.projectDir}/../dist/android-sherpa-tts/assets"), ncnnPiperAssetsRoot)
    }
  }

  packaging {
    resources {
      excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
  }
}

dependencies {
  implementation("androidx.core:core-ktx:1.19.0")
  implementation("androidx.appcompat:appcompat:1.7.1")
  implementation("com.google.android.material:material:1.14.0")
  implementation("androidx.constraintlayout:constraintlayout:2.2.1")
  implementation("androidx.activity:activity-ktx:1.13.0")
  implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.10.0")
  implementation("androidx.lifecycle:lifecycle-service:2.10.0")
  implementation("androidx.camera:camera-core:1.6.1")
  implementation("androidx.camera:camera-camera2:1.6.1")
  implementation("androidx.camera:camera-lifecycle:1.6.1")
  implementation("androidx.camera:camera-view:1.6.1")
  implementation("com.squareup.okhttp3:okhttp:5.3.2")
  implementation("com.alphacephei:vosk-android:0.3.75")
  // Keep openWakeWord's ONNX JNI aligned with the sherpa runtime bundled through jniLibs.
  implementation("com.microsoft.onnxruntime:onnxruntime-android:1.24.3")
  implementation("xyz.rementia:openwakeword:0.1.5")
}
