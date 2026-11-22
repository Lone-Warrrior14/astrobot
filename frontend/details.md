# 📘 AstraTalk PWA / Desktop Web - Comprehensive Code Details

This document provides an exhaustive, code-level explanation of every major component, architectural layer, hook, state variable, and API route in the **AstraTalk Desktop PWA** (`frontend/` and connected `backend/`).

---

## 📑 Table of Contents
1. [System Overview & Architecture](#1-system-overview--architecture)
2. [Frontend Core: `src/App.jsx`](#2-frontend-core-srcappjsx)
3. [Interactive Mascot Engine: `src/AstraCompanion.jsx`](#3-interactive-mascot-engine-srcastracompanionjsx)
4. [Entrypoint & Styling: `src/main.jsx` & `src/index.css`](#4-entrypoint--styling-srcmainjsx--srcindexcss)
5. [Backend Orchestration: `backend/app/main.py` & Endpoints](#5-backend-orchestration-backendappmainpy--endpoints)
6. [LLM Inference & Memory Injection: `ollama_service.py`](#6-llm-inference--memory-injection-ollama_servicepy)
7. [Vector Storage & Retrieval: Qdrant Engine](#7-vector-storage--retrieval-qdrant-engine)
8. [Photorealistic Image Studio: Stable Diffusion Service](#8-photorealistic-image-studio-stable-diffusion-service)
9. [Multimodal Vision & Audio Pipelines](#9-multimodal-vision--audio-pipelines)

---

## 1. System Overview & Architecture

AstraTalk Desktop PWA operates on a decoupled client-server architecture:
- **Client (PWA / React 18 + Vite)**: Renders the chat interface, manages multi-conversation tabs, renders interactive Markdown, and drives the animated mascot. It communicates with the backend via Server-Sent Events (SSE) and REST JSON APIs.
- **Backend (FastAPI / Uvicorn)**: Orchestrates local LLM inference (via Ollama API), handles document parsing and chunking for Qdrant vector retrieval, executes SQL queries in PostgreSQL, and controls local PyTorch Stable Diffusion.

---

## 2. Frontend Core: `src/App.jsx`

`src/App.jsx` is the primary controller and interface container. It manages global state, routing between tabs, sending prompts, and receiving streaming tokens.

### Key State Variables
- `conversations`: Array of conversation objects `[{ id, title, updated_at }]` loaded from the PostgreSQL backend via `/api/conversations`.
- `activeConvId`: ID of the currently selected conversation. When changed, fetches the message history for that conversation.
- `messages`: Array of chat turns `[{ id, role: 'user' | 'assistant', content, created_at }]`.
- `input`: Current text in the chat input textarea.
- `models`: List of models fetched dynamically from Ollama (`/api/models`).
- `selectedModel`: Active model tag (e.g. `gemma3:latest`, `deepseek-r1:7b`).
- `isStreaming`: Boolean flag indicating whether an active generation is receiving token deltas.
- `activeTab`: View selector:
  - `'chat'`: Main chat messages and input dock.
  - `'documents'`: File upload and indexed document chunk browser.
  - `'memories'`: Long-term memory manager table.
  - `'hardware'`: Live VRAM, GPU temperature, CPU, and RAM gauges.
  - `'image_gen'`: Standalone Stable Diffusion creative studio.
- `isIncognito`: Privacy toggle. When `true`, prevents message logging to PostgreSQL and suspends vector memory indexing.
- `isRagOnly`: Grounding toggle. When `true`, forces the model to answer only using uploaded documents.
- `isAstraActive` & `isAstraOnly`: Mascot visibility states.
  - `isAstraActive`: Renders floating companion in corner.
  - `isAstraOnly`: Hides message feed, full-screen companion mode.

### Message Pipeline & Streaming (`handleSend`)
1. **Command Routing**:
   - `/astra` / `\astro`: Activates companion widget.
   - `/astraonly`: Switches to fullscreen mascot companion mode.
   - `/image <prompt>` or natural image commands (`create a image of ...`): Dispatches payload to `/api/images/generate` with live shimmer placeholders.
2. **Streaming Execution**:
   - Dispatches `fetch('/api/chat/stream', ...)` with `ReadableStream`.
   - Iterates over chunks using `TextDecoder`.
   - Parses SSE lines starting with `data: ` and appends token deltas incrementally to the active assistant message bubble.
   - Strips deep reasoning tags (`<think> ... </think>`) for voice speech synthesis and companion status bubbles while preserving the collapsible thought UI.

---

## 3. Interactive Mascot Engine: `src/AstraCompanion.jsx`

`src/AstraCompanion.jsx` implements the animated, voice-synthesizing AI companion.

### State-Driven Animations
The companion dynamically swaps high-resolution GIF assets located in `public/astra_gifs/`:
- `hi.gif`: Welcome greeting played when first summoned.
- `think.gif`: Continuous pondering loop while `isThinking` is true.
- `speak.gif`: Talking animation while tokens stream or speech plays.
- `celebration.gif`: Victory bounce when generation finishes.
- `idle.gif`: Default breathing loop while waiting.
- `sleep_begin.gif` & `sleep_loop.gif`: Auto-sleep triggered after 12 seconds of inactivity.
- `wake_up.gif`: Surprise jolt triggered the moment the user types in the input box.

### Audio & Tactile Gestures
- **Head Poke / Boop**: Detects clicks/touches on Astra's head coordinate zone. Plays `boop.mp3` or a spoken *"Boop!"*.
- **Head Rub & Petting**: Tracks mouse/finger scrubbing across the head. Triggers `head_rub.gif` and streams `purr.wav` (authentic cat purr sound effect).
- **Speech Synthesis (`speakAstra`)**: Uses the browser's Web Speech API (`SpeechSynthesisUtterance`).
  - Pre-wakes audio drivers with Web Audio API context.
  - Filters out raw markdown syntax and emojis using regex before speaking.
  - Tuned with friendly voice parameters (`pitch: 1.35`, `rate: 0.90`).

---

## 4. Entrypoint & Styling: `src/main.jsx` & `src/index.css`

- **`src/main.jsx`**: Bootstraps the React 18 application with `createRoot(document.getElementById('root')).render(<App />)`.
- **`src/index.css`**: Defines CSS variables for Dark and Light themes (`--bg-primary`, `--accent`, `--border`, `--text-main`), flexbox layouts, markdown typography formatting, syntax highlighting blocks, and floating mascot keyframe transitions.

---

## 5. Backend Orchestration: `backend/app/main.py` & Endpoints

- **`backend/app/main.py`**: Initializes FastAPI application with CORS middleware, mounts static image directories (`/storage/images`), and registers modular routers:
  - `/api/chat`: Handles chat streaming and session histories.
  - `/api/models`: Scans local Ollama instance for installed models.
  - `/api/documents`: File upload, parsing, text splitting, and Qdrant ingestion.
  - `/api/memories`: Querying, creating, and deleting long-term semantic memories.
  - `/api/images`: Local Stable Diffusion image generation pipeline.
  - `/api/hardware`: System metrics (VRAM via `pynvml`, RAM/CPU via `psutil`).

---

## 6. LLM Inference & Memory Injection: `ollama_service.py`

`backend/app/llm/ollama_service.py` manages the inference loop:
1. **Dynamic System Prompting**: Injects current calendar date and time anchoring.
2. **Semantic Memory Recall**: Queries Qdrant collection `chat_memories` with the user's prompt to retrieve matching facts previously remembered via `remember <fact>`.
3. **Document Context Ingestion**: If RAG is enabled, retrieves top-k chunks from Qdrant filtered by `conversation_id`.
4. **Streaming Generator**: Yields server-sent event frames (`data: {"delta": token}`) directly to the HTTP stream.

---

## 7. Vector Storage & Retrieval: Qdrant Engine

- **Dense Embedding Model**: FastEmbed using `BAAI/bge-small-en-v1.5` (384-dimensional dense vectors running locally via ONNX Runtime).
- **Strict Isolation**: Collections enforce a mandatory `conversation_id` payload match. Documents uploaded to Conversation A cannot be leaked or retrieved in Conversation B.
- **Hybrid Grounding**: Computes cosine similarity scores, ranking relevant chunks before formatting into system context.

---

## 8. Photorealistic Image Studio: Stable Diffusion Service

- **Model**: Realistic Vision v6 (SD 1.5 FP16).
- **Dynamic VRAM Handoff**: Inspects Ollama processes; temporarily offloads LLM models from GPU memory before launching PyTorch diffusers denoising to prevent CUDA Out-Of-Memory errors on 4GB VRAM.
- **Output**: Saves output PNG to `storage/images/<id>.png` and returns a clean URL for inline chat rendering.

---

## 9. Multimodal Vision & Audio Pipelines

- **Vision**: Analyzes uploaded JPEG/PNG images by encoding to base64 and streaming to vision-capable models (`gemma3`, `qwen2.5vl`).
- **Audio STT**: `faster-whisper` (`base.en`) transcribes audio recordings locally with sub-second response times.
- **Audio TTS**: Local neural voice engine fallback using Piper TTS (`en_US-lessac-medium.onnx`).
