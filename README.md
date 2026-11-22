# 🌌 Astra Talk - Autonomous Local AI System & Companion

**Astra Talk** is an enterprise-grade, privacy-first, fully autonomous local AI platform and companion. Designed for **Ubuntu Linux** (deeply optimized for NVIDIA RTX GPUs) and **Android (deeply optimized for Snapdragon 8 Gen 2 with Hexagon HTP v73 NPU)**.

Far beyond a traditional chat clone, Astra Talk combines:
- **Dual-Platform Architecture**: Desktop Progressive Web App (PWA) + Native Offline Android App (OnePlus 11 / Snapdragon 8 Gen 2).
- **On-Device Mobile NPU Stable Diffusion**: Synthesizes 512×512 photorealistic images in **4.1 seconds** via Qualcomm Hexagon HTP v73 NPU completely offline.
- **On-Device Mobile Scoped RAG & ML Kit OCR**: In-chat document parsing (PDF/Images via Google ML Kit), 384-dimensional dense semantic vector database in IndexedDB, strictly scoped per conversation.
- **Interactive Companion Mascot (`/astra` & `/astraonly`)**: Reactive animations, tactile head rub/petting with authentic cat purrs, boop sounds, and spoken voice lip-sync.
- **Zero-Footprint Incognito Mode** & Continuous Long-Term Memory.
- **Comprehensive Flow & UML Architecture Documentation**: Detailed Mermaid diagrams for both PWA and Mobile.

---

## 📱 Mobile Native & Snapdragon 8 Gen 2 AI Capabilities

The `mobile/` directory contains an isolated, production-ready Android application built with **Capacitor 7**, **Custom C++ JNI (`llama.cpp`)**, **Google ML Kit**, and **Qualcomm QNN (Qualcomm Neural Network)**:

### 1. ⚡ On-Device NPU Image Generation (Qualcomm Hexagon HTP v73)
- Direct on-device image synthesis using Snapdragon 8 Gen 2's Hexagon NPU.
- **Performance**: Generates 512×512 images in **4.1 seconds** with zero cloud latency or data usage.
- **Natural Prompt Routing**: Multi-word descriptive prompts like `"create a black cat and white cat"` or `"draw a sunset over mountains"` are parsed and routed straight to the NPU engine.
- **Persistent Media Storage**: Generated PNGs are stored in Android app storage and bridge-served through `Capacitor.convertFileSrc`, persisting across app restarts.

### 2. 📄 Scoped In-Chat Document RAG & Google ML Kit OCR
- **Per-Chat Scoped Vector Database**: Powered by `localVectorDb.js` using client-side IndexedDB and cosine similarity search. Embeddings and document chunks are strictly isolated to the active `conversationId`—preventing cross-chat contamination.
- **Google ML Kit OCR**: Native Android OCR parses both image attachments and multi-page PDFs (rendered via Android `PdfRenderer`) in **20–40ms**.
- **Chat Dock Attachment**: In-chat paperclip button lets you attach documents directly into any active session.

### 3. 🎯 Android Native Back Button Interception
- Full gesture and hardware Back button handling:
  1. Closes the navigation drawer if open.
  2. Exits fullscreen companion mascot mode (`/astraonly`) back to chat.
  3. Switches secondary tabs (*Documents & OCR*, *Snapdragon Models*, *Cloud Endpoints*) back to the main chat.
  4. Exits the app only when pressed from the root main chat.

---

## ⚡ The Astra Companion Easter Egg (`/astra` & `/astraonly`)

Astra is an animated, voice-capable companion living directly inside your workspace and mobile device.

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
- Type **`/astra`** (or `\astro`): Summons the floating, draggable interactive Astra mascot.
- Type **`/astraonly`**: Hides message histories and chrome, entering a full-screen companion studio with animations and voice synthesis.

### 2. State-Driven Animations
- **Entry Greeting**: [`hi.gif`](mobile/web-src/public/astra_gifs/hi.gif) plays upon summoning with an animated welcome bubble.
- **Thinking / Processing**: [`think.gif`](mobile/web-src/public/astra_gifs/think.gif) ponders continuously while local LLMs generate or RAG search executes.
- **Speaking & Streaming**: [`speak.gif`](mobile/web-src/public/astra_gifs/speak.gif) syncs with streaming tokens and speech audio output.
- **Victory Celebration**: [`celebration.gif`](mobile/web-src/public/astra_gifs/celebration.gif) celebrates when an answer completes before settling into idle.
- **Active Idle State**: [`idle.gif`](mobile/web-src/public/astra_gifs/idle.gif) breathes naturally while awaiting your next prompt.
- **12-Second Inactivity & Sleep Loop**: Transitions through `sleep_begin.gif` into a peaceful `sleep_loop.gif`.
- **Keystroke Surprise Wakeup**: The moment you type any key, Astra wakes up via `wake_up.gif`.

### 3. Tactile Interactions & Audio Engine
- 🖐️ **Head Poke / Boop**: Tap Astra's head to boop her, alternating between a pop sound and a spoken *"Boop!"*.
- 💆 **Head Rub & Petting**: Scrub back and forth across Astra's head to trigger `head_rub.gif` with an acoustic **cat purr rumble** (`purr.wav`).
- 🎙️ **Natural Voice**: Real-time TTS synthesis tuned with an upbeat cadence (`pitch: 1.35`, `rate: 0.90`) and regex-based emoji filtering.

---

## ✨ Desktop PWA Core Platform Capabilities

### 1. 💬 Modern Streaming Workspace
- Single-page responsive application built with **React 18**, **Vite**, and **Lucide Icons**.
- Real-time token streaming with Server-Sent Events (SSE).
- `<think>` deep reasoning process collapse viewer (engineered for DeepSeek-R1 and reasoning models).
- Dynamic model switcher supporting all locally installed Ollama models (`gemma3`, `qwen2.5vl`, `deepseek-r1`, etc.).

### 2. 🛡️ Incognito Mode (Zero Footprint)
- One-click toggle in the header dock.
- **Zero Database Writes**: Messages are held purely in memory and never written to PostgreSQL.
- **Zero Vector Leakage**: Vector indexing and memory persistence are suspended during incognito sessions.

### 3. 🧠 Persistent Long-Term Memory System
- **Dual-Store Architecture**: Memories are indexed in Qdrant (`chat_memories`) using ONNX `BAAI/bge-small-en-v1.5` embeddings and stored in PostgreSQL.
- **In-Chat Commands**:
  - `remember <fact>` / `remember that <fact>`: Permanently saves facts into long-term memory.
  - `list remember` / `list memories`: Lists everything remembered with unique IDs.
  - `forget <keyword or ID>`: Deletes matching memories from Qdrant and PostgreSQL.
  - `forget all`: Clears the entire memory store.

### 4. 🎨 Desktop Stable Diffusion Image Generation
- Powered by local **Realistic Vision v6 (FP16)** pipeline from `/home/lone-warrior/sd`.
- **Dynamic VRAM Handoff**: Releases Ollama LLM VRAM before rendering to avoid OOM errors on 4GB VRAM.
- Fast generation delivering 512×512 photorealistic images in under 7 seconds.

### 5. 🌐 Private Web & Image Search (SearXNG)
- Local private metasearch engine running via Docker on `http://localhost:8888`.
- Gated trigger (`research <topic>`) prevents accidental search overhead.

---

## 📐 Architecture & UML Flow Diagrams

Detailed architecture guides and interactive Mermaid sequence diagrams are available in the repository:

- 🖥️ **Desktop PWA Flow & UML**: [frontend/FLOW_AND_UML.md](frontend/FLOW_AND_UML.md)
  - Component Hierarchy Class Diagram (`App.jsx`, `AstraCompanion.jsx`, etc.)
  - End-to-end Chat, RAG & Memory Sequence Diagram
  - Stable Diffusion PyTorch Denoising Pipeline
  - Document Ingestion & Vector Upsert Flow

- 📱 **Mobile Native Flow & UML**: [mobile/FLOW_AND_UML.md](mobile/FLOW_AND_UML.md)
  - Capacitor Bridge & Native Plugin Architecture (`OfflineEnginePlugin.java`)
  - On-Device Qualcomm Hexagon HTP v73 NPU Image Synthesis Flow
  - On-Device Scoped IndexedDB Vector RAG & Google ML Kit OCR Flow
  - Android Hardware Back Button State Machine

---

## 🏗️ Architecture & Tech Stack

| Component | Technology | Target / Port | Purpose |
| :--- | :--- | :--- | :--- |
| **Desktop Web PWA** | React 18, Vite, Lucide | `http://localhost:3000` | Desktop workspace, memory manager, companion |
| **Mobile App** | Capacitor 7, React, Android SDK | Android 14/15 (`ddac111f`) | Standalone offline mobile APK |
| **Mobile NPU SD** | Qualcomm QNN / Hexagon HTP v73 | On-Device (:8085) | Sub-5s offline Stable Diffusion |
| **Mobile OCR** | Google ML Kit (Text Recognition) | Android Native | 20-40ms on-device PDF & image OCR |
| **Mobile Vector DB** | IndexedDB (Cosine Similarity) | On-Device Client | Scoped semantic RAG per conversation |
| **Backend Server** | FastAPI, Python 3.12, Uvicorn | `http://localhost:8000` | Desktop REST API, SSE streaming, orchestration |
| **Relational DB** | PostgreSQL 16 (Alpine) | `5433` (`local-chat-postgres`) | Desktop chat history & memory storage |
| **Vector DB** | Qdrant | `6333` (`vibrant_greider`) | Desktop document chunks & memory vectors |
| **Desktop LLM** | Ollama | `http://localhost:11434` | Desktop local language model inference |
| **Desktop SD** | Diffusers / SD 1.5 FP16 | `/home/lone-warrior/sd` | Realistic Vision v6 image generation |

---

## 🚀 Quick Start Guide

### 1. Launching Desktop PWA & Backend
Ensure Docker and Ollama are running:
```bash
# Start PostgreSQL & Qdrant
docker start local-chat-postgres vibrant_greider local-searxng

# Start AstraTalk Backend & Frontend
./start.sh
```
Open your browser at 👉 **`http://localhost:3000`**.

### 2. Building & Installing Mobile APK
To compile and deploy to your connected Android device:
```bash
# Build web assets and sync Capacitor
cd mobile/web-src && npm run build
cp -r dist/* ../dist/ && cd .. && npx cap sync android

# Compile debug APK with JDK 21
JAVA_HOME=/home/lone-warrior/jdk21/jdk-21.0.13+9 PATH=/home/lone-warrior/jdk21/jdk-21.0.13+9/bin:$PATH ./android/gradlew -p android assembleDebug

# Install on connected device via ADB
adb -s <device_id> install -r -d AstraTalk-debug.apk
```

---

## ⌨️ In-Chat Commands Cheat Sheet

| Command | Action |
| :--- | :--- |
| `/astra` or `\astro` | Summon the floating interactive Astra Companion |
| `/astraonly` | Enter full-screen immersive Astra companion studio |
| `create a image of <prompt>` | Synthesize photorealistic images (Desktop SD or Mobile NPU) |
| `remember <fact>` | Store a fact permanently into long-term memory |
| `list remember` | View all stored memories with unique IDs |
| `forget <keyword or ID>` | Remove a specific memory |
| `forget all` | Wipe all memories from vector and relational storage |
| `research <topic>` | Query local SearXNG private search engine for live web data |
| `research images of <topic>` | Fetch and render web images directly in chat |
| Tap head / Rub head | Boop Astra or give head rubs for real cat purr reactions |
| Android Back Gesture | Navigates back to main chat from drawer, companion, or sub-tabs |

---

## 🔒 Privacy & Security Guarantee
- **100% Local Inference**: All language, vision, speech, and image models run entirely on your local PC hardware or on-device phone processors.
- **Zero Third-Party Telemetry**: Zero data leaves your devices.
- **Isolated Storage**: Document embeddings are strictly bound to individual conversation IDs and automatically cleaned up upon conversation removal.
