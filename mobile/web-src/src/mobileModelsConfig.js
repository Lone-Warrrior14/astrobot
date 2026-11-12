// Dedicated Snapdragon 8 Gen 2 Mobile AI Models Config
export const SNAPDRAGON_MODELS = [
  {
    id: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
    name: "Llama 3.2 3B Instruct (Q4_K_M)",
    size: "2.0 GB",
    filename: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
    downloadUrl: "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf",
    description: "Meta's flagship 3B instruction model. Tuned for Snapdragon 8 Gen 2 (35-45+ tok/s)."
  },
  {
    id: "qwen2.5-3b-instruct-q4_k_m.gguf",
    name: "Qwen 2.5 3B Instruct (Q4_K_M)",
    size: "1.9 GB",
    filename: "qwen2.5-3b-instruct-q4_k_m.gguf",
    downloadUrl: "https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf",
    description: "Benchmark-topping 3B reasoning model. Exceptional at logic, code, and chat."
  },
  {
    id: "stable-diffusion-v1-5-Q4_0.gguf",
    name: "Stable Diffusion v1.5 (Q4_0)",
    size: "1.7 GB",
    filename: "stable-diffusion-v1-5-Q4_0.gguf",
    downloadUrl: "https://huggingface.co/gpustack/stable-diffusion-v1-5-GGUF/resolve/main/stable-diffusion-v1-5-Q4_0.gguf",
    description: "512x512 text-to-image generator using Adreno 740 GPU (~3-5s per image)."
  }
];
