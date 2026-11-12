// Offline Model Registry and Engine Configuration for Astra Talk Mobile
export const OFFLINE_MODELS = {
  chat: {
    id: "llama-3.2-3b-instruct-q4",
    name: "Llama 3.2 3B Instruct (Q4_K_M)",
    size: "1.9 GB",
    filename: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
    downloadUrl: "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf",
    description: "Compact high-accuracy 3B model optimized for on-device reasoning and conversational companions."
  },
  image: {
    id: "sd-turbo-q4",
    name: "Stable Diffusion Turbo (Q4)",
    size: "1.6 GB",
    filename: "sd-turbo-q4.gguf",
    downloadUrl: "https://huggingface.co/second-state/stable-diffusion-turbo-GGUF/resolve/main/sd_turbo-q4_0.gguf",
    description: "Ultra-fast single-step mobile diffusion model generating photorealistic imagery on edge hardware."
  }
};
