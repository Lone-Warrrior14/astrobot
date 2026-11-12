// Offline Model Registry and Engine Configuration for Astra Talk Mobile
// Tailored for high-end flagship chips like Snapdragon 8 Gen 2 (Adreno 740 + Hexagon NPU, 8GB-16GB LPDDR5X)
export const OFFLINE_MODELS = {
  chat: {
    id: "llama-3.2-3b-instruct-q4",
    name: "Llama 3.2 3B Instruct (Snapdragon Optimized Q4_K_M)",
    size: "2.0 GB",
    filename: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
    downloadUrl: "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf",
    description: "Meta's state-of-the-art 3B instruction-tuned model. Delivers 35-45+ tokens/sec on Snapdragon 8 Gen 2 with high reasoning quality."
  },
  chat_ultra: {
    id: "qwen2.5-3b-instruct-q4",
    name: "Qwen 2.5 3B Instruct (Q4_K_M)",
    size: "1.9 GB",
    filename: "qwen2.5-3b-instruct-q4_k_m.gguf",
    downloadUrl: "https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf",
    description: "Alibaba's benchmark-topping 3B model. Outstanding for coding, logic, multilingual conversation, and structured tasks."
  },
  image: {
    id: "sd-turbo-q4",
    name: "Stable Diffusion Turbo (Q4 Mobile GGUF)",
    size: "1.6 GB",
    filename: "sd-turbo-q4.gguf",
    downloadUrl: "https://huggingface.co/second-state/stable-diffusion-turbo-GGUF/resolve/main/sd_turbo-q4_0.gguf",
    description: "1-step Adversarial Diffusion Distillation (ADD). Generates 512x512 images in ~2-4 seconds on Snapdragon 8 Gen 2."
  }
};

