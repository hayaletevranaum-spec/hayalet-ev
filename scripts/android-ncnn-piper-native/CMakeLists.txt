cmake_minimum_required(VERSION 3.10)

project(hayalet_tts_ncnn)

if(NOT DEFINED NCNN_ANDROID_SDK_DIR)
    message(FATAL_ERROR "NCNN_ANDROID_SDK_DIR is required for hayalet_tts_ncnn.")
endif()

set(ncnn_DIR "${NCNN_ANDROID_SDK_DIR}/${ANDROID_ABI}/lib/cmake/ncnn")
find_package(ncnn REQUIRED)

add_library(
    hayalet_tts_ncnn
    SHARED
    hayalet_ncnn_piper.cpp
    piper.cpp
    simpleg2p.cpp
)

target_link_libraries(
    hayalet_tts_ncnn
    ncnn
    android
    log
)
