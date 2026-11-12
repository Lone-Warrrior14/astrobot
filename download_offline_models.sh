#!/bin/bash
set -e

MODELS_DIR="$HOME/chat/mobile-models"
mkdir -p "$MODELS_DIR"

echo "=========================================="
echo " Astra Talk Mobile - Offline Model Fetcher"
echo "=========================================="
echo "Destination: $MODELS_DIR"
echo ""

# 1. 3B Chat Model (Llama-3.2-3B-Instruct Q4_K_M)
CHAT_FILE="$MODELS_DIR/Llama-3.2-3B-Instruct-Q4_K_M.gguf"
if [ ! -f "$CHAT_FILE" ]; then
    echo "[1/2] Downloading Llama-3.2-3B-Instruct-Q4_K_M.gguf (~1.9 GB)..."
    curl -L "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf" -o "$CHAT_FILE"
    echo "✓ Chat Model downloaded successfully."
else
    echo "✓ [1/2] Chat Model already exists: $CHAT_FILE"
fi

# 2. Offline Stable Diffusion Turbo Model (Q4 GGUF)
IMAGE_FILE="$MODELS_DIR/sd-turbo-q4.gguf"
if [ ! -f "$IMAGE_FILE" ]; then
    echo "[2/2] Downloading Stable Diffusion Turbo Q4 (~1.6 GB)..."
    curl -L "https://huggingface.co/second-state/stable-diffusion-turbo-GGUF/resolve/main/sd_turbo-q4_0.gguf" -o "$IMAGE_FILE"
    echo "✓ Image Model downloaded successfully."
else
    echo "✓ [2/2] SD Model already exists: $IMAGE_FILE"
fi

echo ""
echo "All offline models are ready in $MODELS_DIR."
echo "To copy them to your Android phone, connect via USB (with ADB enabled) and run:"
echo "  adb push $MODELS_DIR/* /sdcard/Android/data/com.astratalk.app/files/models/"
echo "=========================================="
