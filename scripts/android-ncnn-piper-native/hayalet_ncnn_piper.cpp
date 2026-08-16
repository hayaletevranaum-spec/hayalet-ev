#include <jni.h>
#include <android/asset_manager_jni.h>
#include <android/log.h>

#include <mutex>
#include <string>
#include <vector>

#include "net.h"
#include "piper.h"

namespace {

std::mutex g_lock;
Piper* g_piper = nullptr;
std::string g_language;

bool is_supported_language(const std::string& language)
{
    return language == "tr" || language == "en";
}

void release_locked()
{
    delete g_piper;
    g_piper = nullptr;
    g_language.clear();
}

} // namespace

extern "C" {

JNIEXPORT jint JNI_OnLoad(JavaVM*, void*)
{
    ncnn::create_gpu_instance();
    return JNI_VERSION_1_6;
}

JNIEXPORT void JNI_OnUnload(JavaVM*, void*)
{
    std::lock_guard<std::mutex> guard(g_lock);
    release_locked();
    ncnn::destroy_gpu_instance();
}

JNIEXPORT jboolean JNICALL Java_com_hayaletev_androidcompanion_tts_NcnnPiperNative_loadModel(
    JNIEnv* env,
    jobject,
    jobject asset_manager,
    jstring language
)
{
    const char* raw_language = env->GetStringUTFChars(language, nullptr);
    std::string resolved_language = raw_language ? raw_language : "";
    if (raw_language)
        env->ReleaseStringUTFChars(language, raw_language);

    if (!is_supported_language(resolved_language))
        return JNI_FALSE;

    AAssetManager* manager = AAssetManager_fromJava(env, asset_manager);
    if (!manager)
        return JNI_FALSE;

    std::lock_guard<std::mutex> guard(g_lock);
    if (g_piper && g_language == resolved_language)
        return JNI_TRUE;

    release_locked();
    g_piper = new Piper;
    g_piper->load(manager, resolved_language.c_str(), false);
    g_language = resolved_language;

    __android_log_print(
        ANDROID_LOG_INFO,
        "HayaletNcnnTts",
        "Loaded ncnn Piper model for %s",
        resolved_language.c_str()
    );
    return JNI_TRUE;
}

JNIEXPORT jshortArray JNICALL Java_com_hayaletev_androidcompanion_tts_NcnnPiperNative_synthesize(
    JNIEnv* env,
    jobject,
    jstring text,
    jint speaker_id,
    jfloat length_scale
)
{
    const char* raw_text = env->GetStringUTFChars(text, nullptr);
    if (!raw_text)
        return env->NewShortArray(0);

    std::vector<short> pcm;
    {
        std::lock_guard<std::mutex> guard(g_lock);
        if (g_piper)
        {
            const float noise_scale = 0.667f;
            const float noise_scale_w = g_language == "en" ? 0.333f : 0.8f;
            g_piper->synthesize(
                raw_text,
                static_cast<int>(speaker_id),
                noise_scale,
                static_cast<float>(length_scale),
                noise_scale_w,
                pcm
            );
        }
    }

    env->ReleaseStringUTFChars(text, raw_text);

    jshortArray output = env->NewShortArray(static_cast<jsize>(pcm.size()));
    if (output && !pcm.empty())
    {
        env->SetShortArrayRegion(output, 0, static_cast<jsize>(pcm.size()), pcm.data());
    }
    return output;
}

JNIEXPORT void JNICALL Java_com_hayaletev_androidcompanion_tts_NcnnPiperNative_release(
    JNIEnv*,
    jobject
)
{
    std::lock_guard<std::mutex> guard(g_lock);
    release_locked();
}

} // extern "C"
