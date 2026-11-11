# 🌌 Astra Talk - Autonomous Local AI System & Companion

**Astra Talk** is an enterprise-grade, privacy-first, fully autonomous local AI platform and companion. Designed for **Ubuntu Linux** and deeply optimized for high efficiency on **consumer GPUs (NVIDIA RTX 3050 Mobile - 4GB VRAM)** with 16GB system RAM.

Far beyond a traditional chat clone, Astra Talk combines:
- **Autonomous RAG & Private Meta-Search** (Strict conversation isolation, zero cross-chat contamination)
- **Continuous Long-Term Memory & Dual-Vector Recall** (PostgreSQL + Qdrant ONNX embeddings)
- **Zero-Footprint Incognito Mode**
- **Dynamic VRAM Handoff Image Studio** (Realistic Vision v6 & SDXL Base 1.0)
- **Interactive Living Companion Easter Egg (`/astra` & `/astraonly`)** with real-time reactive animations, tactile gestures, realistic cat purrs, and spoken dialogue.

---

## ⚡ The Astra Companion Easter Egg (`/astra` & `/astraonly`)

Astra is not just an interface—she is an animated, voice-capable companion living directly inside your workspace.

```
       .-''''-.
     .'  __    '.
    /   /  \     \      "Yaaay! Astra is here to help! ✨"
   |   | () |     |
   |    \__/      |     [ Interactive Companion System ]
    \            /
     '.        .'
       '-....-'
```

### 1. Activating the Companion
- Type **`/astra`** (or `\astro`): Summons the floating, draggable interactive Astra widget in the corner of your screen.
- Type **`/astraonly`**: Hides regular chat and message histories, entering a full-screen immersive companion studio with large visual animations and natural voice synthesis.

### 2. State-Driven Animations
Astra reacts to every stage of the AI pipeline with customized frame-by-frame animations:
- **Entry Greeting**: [`hi.gif`](public/astra_gifs/hi.gif) plays upon summoning with an animated welcome bubble.
- **Thinking / Processing**: [`think.gif`](public/astra_gifs/think.gif) ponders continuously while local LLMs generate or SearXNG performs meta-search.
- **Speaking & Streaming**: [`speak.gif`](public/astra_gifs/speak.gif) syncs with the streaming tokens and audio synthesis output.
- **Victory Celebration**: [`celebration.gif`](public/astra_gifs/celebration.gif) celebrates when an answer completes before settling into idle.
- **Active Idle State**: [`idle.gif`](public/astra_gifs/idle.gif) breathes naturally while awaiting your next prompt.
- **12-Second Inactivity & Sleep Loop**: Transitions through [`sleep_begin.gif`](public/astra_gifs/sleep_begin.gif) into a peaceful, continuous [`sleep_loop.gif`](public/astra_gifs/sleep_loop.gif).
- **Keystroke Surprise Wakeup**: The instant you type any new key into the prompt box, Astra jolts awake with a surprise reaction via [`wake_up.gif`](public/astra_gifs/wake_up.gif).

### 3. Tactile Interactions & Audio Engine
- 🖐️ **Head Poke / Boop**: Tap Astra's head to boop her. Alternates between a custom `boop.mp3` pop and a human voice saying *"Boop!"*.
- 💆 **Head Rub & Petting**: Scrub your mouse back and forth across Astra's head to trigger [`head_rub.gif`](public/astra_gifs/head_rub.gif) accompanied by an authentic acoustic **cat purr rumble** (`purr.wav`) without speech interruption.
- 🎙️ **Cute Spoken Voice**: Integrates natural speech synthesis tuned with an upbeat cadence (`pitch: 1.35`, `rate: 0.90`) and regex-based emoji filtering so Astra never speaks out raw emoji names.
- 🔇 **One-Click Mute & Minimizer**: Controls to mute audio or return to standard chat without interrupting background generations.

---

## ✨ Core Platform Capabilities

### 1. 💬 Modern Streaming Workspace
- Single-page responsive application built with **React 18**, **Vite**, and **Lucide Icons**.
- Real-time token streaming with Server-Sent Events (SSE).
- `<think>` deep reasoning process collapse viewer (engineered for DeepSeek-R1 and reasoning models).
- Dynamic model switcher supporting all 11 locally installed Ollama models (`gemma3:latest`, `qwen2.5vl:7b`, `deepseek-r1:7b`, `hello:latest`, etc.).
- Multi-conversation management with renaming, auto-naming, and conversation deletion.

### 2. 🛡️ Incognito Mode (Zero Footprint)
- One-click toggle in the header dock.
- **Zero Database Writes**: Messages are held purely in memory and never written to PostgreSQL.
- **Zero Vector Leakage**: Vector indexing and memory persistence are suspended during incognito sessions.
- Displays an active purple privacy banner.

### 3. 🧠 Persistent Long-Term Memory System
- **Dual-Store Architecture**: Memories are indexed in Qdrant's vector collection (`chat_memories`) using ONNX `BAAI/bge-small-en-v1.5` embeddings and stored in PostgreSQL.
- **In-Chat Commands**:
  - `remember <fact>` / `remember that <fact>`: Permanently saves facts into long-term memory.
  - `list remember` / `list memories`: Lists everything remembered with unique IDs.
  - `forget <keyword>` / `forget <id>`: Deletes matching memories from both Qdrant and PostgreSQL.
  - `forget all`: Clears the entire memory store.
- **Automatic Semantic Recall**: Relevant user preferences and facts are automatically retrieved and injected into the LLM system prompt.
- **UI Memory Manager**: Interactive dashboard to view, add, or delete memories.

### 4. 📁 Strictly Isolated Document RAG (Zero Cross-Chat Leakage)
- Attach `.pdf`, `.docx`, `.txt`, `.csv`, `.xlsx`, or `.md` files.
- Extracted and chunked (500 tokens with 50-token overlap) with an animated upload progress bar.
- **Hard Vector Isolation**: All vectors in Qdrant have a mandatory `conversation_id` payload filter. Documents uploaded to Conversation A can **never** be retrieved or leaked into Conversation B.
- **Strict RAG-Only Grounding Mode**: Toggleable mode that strictly binds responses to uploaded files, preventing model hallucinations when information is absent.
- Automatic document cleanup when a conversation is deleted.

### 5. 🎨 Local Stable Diffusion Image Generation
- Powered by your local **Realistic Vision v6 (FP16)** pipeline from `/home/lone-warrior/sd`.
- **Dynamic VRAM Handoff**: Automatically calls Ollama (`/api/ps`) to release LLM VRAM before rendering, preventing any `CUDA out of memory` errors on 4GB VRAM.
- **Fast Inference**: Runs at ~3.2 steps/sec, delivering high-resolution 512×512 photorealistic images in **under 7 seconds** (~2.0GB VRAM footprint).
- **Direct In-Chat Trigger**: Type `create a image of <prompt>` to trigger inline image generation with live shimmer loading animations.
- **Clean Static Asset Serving**: Generates and serves clean URLs via `/storage/images/<id>.png`.
- Standalone generation studio and gallery tab included.

### 6. 🌐 Private Web & Image Search (SearXNG)
- Local private metasearch engine running via Docker on `http://localhost:8888`.
- **Strictly Gated Keyword Trigger**: Web search will **only** trigger when the user explicitly prefixes or includes the word `research` (e.g. `research latest quantum computing breakthroughs`).
- **Image Search**: Type `research images of <topic>` to fetch and render image markdown links inline.
- Live system date anchoring prevents hallucinations regarding current events and news.

### 7. 👁️ Local Vision & Audio
- **Multimodal Vision**: Upload images via the chat input dock or top bar to analyze them with `gemma3:latest` or `qwen2.5vl:7b`.
- **Faster-Whisper STT**: Local audio transcription via `base.en`.
- **Piper TTS**: Local ultra-low-latency neural text-to-speech synthesis (`en_US-lessac-medium.onnx`).

---

## 🏗️ Architecture & Tech Stack

| Component | Technology | Port / Path | Purpose |
| :--- | :--- | :--- | :--- |
| **Frontend** | React 18, Vite, Lucide | `http://localhost:3000` | Chat UI, Companion Mascot, Memory Manager, Gallery |
| **Backend** | FastAPI, Python 3.12, Uvicorn | `http://localhost:8000` | REST API, SSE Streaming, Orchestration |
| **Relational DB** | PostgreSQL 16 (Alpine) | `5433` (`local-chat-postgres`) | Conversations, Messages, Metadata |
| **Vector DB** | Qdrant | `6333` (`vibrant_greider`) | Document chunks & Semantic Memory |
| **Embeddings** | FastEmbed (`bge-small-en-v1.5`) | Local ONNX | 384-dimensional dense embeddings |
| **LLM Inference** | Ollama | `http://localhost:11434` | Gemma 3, DeepSeek, Qwen models |
| **Image Generation** | Diffusers / SD 1.5 FP16 | `/home/lone-warrior/sd` | Realistic Vision v6 generation |
| **Private Search** | SearXNG | `http://localhost:8888` | Aggregated Web & Image Search |

---

## 🚀 Quick Start Guide

### 1. Prerequisites Check
Make sure Docker, NVIDIA drivers, and Ollama are active:
```bash
docker ps
ollama list
nvidia-smi
```

### 2. Start Supporting Infrastructure
Run the official container services if they are not already active:
```bash
# PostgreSQL 16
docker start local-chat-postgres

# Qdrant Vector DB
docker start vibrant_greider

# SearXNG Metasearch Engine
docker start local-searxng
```

### 3. Launch the Application
Run the root startup script to spin up the backend and frontend simultaneously:
```bash
./start.sh
```

Open your browser at:
👉 **`http://localhost:3000`**

To access from mobile or external networks:
```bash
ngrok http 3000
```
*(Vite is pre-configured with `allowedHosts: true` to support seamless mobile streaming).*

---

## ⌨️ In-Chat Commands Cheat Sheet

| Command | Action |
| :--- | :--- |
| `/astra` or `\astro` | Summon the floating interactive Astra Companion |
| `/astraonly` | Enter full-screen immersive Astra companion studio |
| `remember <fact>` | Store a fact permanently into long-term memory |
| `list remember` | View all stored memories with unique IDs |
| `forget <keyword or ID>` | Remove a specific memory |
| `forget all` | Wipe all memories from vector and relational storage |
| `research <topic>` | Query local SearXNG private search engine for live web data |
| `research images of <topic>` | Fetch and render web images directly in chat |
| `create a image of <prompt>` | Synthesize photorealistic images using local Stable Diffusion |
| Tap head / Rub head | Boop Astra or give head rubs for real cat purr reactions |

---

## 🔒 Privacy & Security Guarantee
- **100% Local Inference**: All language, vision, speech, and image models run entirely on your local hardware.
- **Zero Third-Party Telemetry**: Zero data leaves your machine unless you explicitly trigger private metasearch via SearXNG.
- **Isolated Storage**: Document embeddings are strictly bound to individual conversation IDs and automatically cleaned up upon conversation removal.
