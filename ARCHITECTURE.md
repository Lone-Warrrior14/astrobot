# 🧭 Astra Talk — Codebase Architectural Guide & Deep Dive

This document is a technical walkthrough of how **Astra Talk** works under the hood. Whether you want to add new animations, connect new local models, or extend tools, this guide explains each file, data flow, and design decision.

---

## 🏛️ High-Level System Architecture

Astra Talk operates as an orchestrated pipeline where the **React Frontend** talks to a **FastAPI Backend**, coordinating with three local Docker containers and your local GPU drivers:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        REACT FRONTEND (Vite / Port 3000)               │
│   App.jsx (Chat State)           AstraCompanion.jsx (Living Mascot)   │
└─────────────────────────────────▲──────────────────────────────────────┘
                                  │ SSE Stream & REST API
┌─────────────────────────────────▼──────────────────────────────────────┐
│                        FASTAPI BACKEND (Uvicorn / Port 8000)           │
│   endpoints.py ──────────────► ollama_service.py                      │
│        │                               │                               │
│        ├──► vector_store.py            ├──► SearXNG Search (8888)     │
│        └──► sd_service.py              └──► Tool Registry              │
└────────▲────────────────▲──────────────▲───────────────────────────────┘
         │                │              │
┌────────▼───────┐ ┌──────▼───────┐ ┌────▼────────┐ ┌────────────────────┐
│ PostgreSQL 16  │ │ Qdrant Vector│ │ Ollama LLM  │ │ RTX 3050 (4GB VRAM)│
│ (Port 5433)    │ │ (Port 6333)  │ │ (Port 11434)│ │ PyTorch / CUDA     │
└────────────────┘ └──────────────┘ └─────────────┘ └────────────────────┘
```

---

## 📂 Project Directory Structure

```
chat/
├── backend/
│   └── app/
│       ├── main.py                  # FastAPI application entrypoint & middleware
│       ├── core/
│       │   └── config.py            # Global settings (ports, database URLs, VRAM limits)
│       ├── database/
│       │   ├── session.py           # Async (asyncpg) & Sync (psycopg2) SQLAlchemy engines
│       │   └── init_db.py           # Database migration & table bootstrap
│       ├── models/
│       │   └── entities.py          # SQLAlchemy ORM models (Conversation, Message, Memory)
│       ├── api/
│       │   ├── endpoints.py         # REST routers: /chat/stream, /conversations, /memories
│       │   └── multimodal.py        # Vision & Audio upload routers
│       ├── llm/
│       │   └── ollama_service.py    # Master LLM streaming engine, prompt routing & SearXNG
│       ├── rag/
│       │   ├── vector_store.py      # Qdrant client & FastEmbed ONNX vector indexer
│       │   └── doc_processor.py     # PDF/Word/Text parsing & chunking
│       ├── image_generation/
│       │   ├── sd_service.py        # Realistic Vision v6 (FP16) generator with VRAM handoff
│       │   └── sdxl_service.py      # SDXL Base 1.0 generator (sequential offload)
│       ├── tools/
│       │   └── registry.py          # Function-calling tools (time, hardware specs)
│       └── audio/
│           └── service.py           # Faster-Whisper (STT) and Piper (TTS)
├── frontend/
│   ├── index.html                   # HTML entrypoint
│   ├── vite.config.js               # Vite bundler, proxy configuration & allowedHosts
│   └── src/
│       ├── main.jsx                 # React root renderer
│       ├── App.jsx                  # Main application state, views, chat loop
│       ├── AstraCompanion.jsx       # Living Mascot component (animations, boop, purr, voice)
│       └── index.css                # Custom CSS variables, themes, animations
├── gif/ & public/astra_gifs/        # Animation assets (.gif) and audio sound effects (.mp3, .wav)
├── storage/                         # Local disk storage for uploads, images, and vectors
└── start.sh                         # Unified startup script
```

---

## 🔍 Detailed Component Deep Dive

### 1. The Living Mascot: `frontend/src/AstraCompanion.jsx`
This component controls the visual states, audio effects, and touch interactions for Astra.

- **State Machine (`animState`)**:
  - `'entry'`: Plays `hi.gif` when summoned.
  - `'idle'`: Plays `idle.gif` when active and waiting.
  - `'thinking'`: Displays `think.gif` while the LLM or search engine is working.
  - `'speaking'`: Plays `speak.gif` while voice synthesis emits sound or text streams.
  - `'celebrating'`: Plays `celebration.gif` right after an answer finishes.
  - `'sleep_begin'`: Plays `sleep_begin.gif` when inactive for 12 seconds.
  - `'sleeping'`: Plays `sleep_loop.gif` in an infinite sleep loop.
  - `'waking'`: Plays `wake_up.gif` on keypress or click.
  - `'poking'`: Plays `poke.gif` on click.
  - `'rubbing'`: Plays `head_rub.gif` on mouse scrubbing.

- **Interaction Handlers**:
  - `handleHeadPoke`:
    - Plays `boop.mp3`.
    - Forces a state re-trigger via `requestAnimationFrame` so rapid clicking repeats without getting stuck.
  - `handleHeadRub`:
    - Listens to `onMouseMove` events throttled at 80ms over Astra's head.
    - Plays the synthesized acoustic rumble (`purr.wav`) and displays *"Purrrrr... 🥰💖"*.
  - `wakeUpOnType`:
    - Tracks `currentVal.length > prevVal.length` to only wake Astra when you genuinely type new keys into the prompt box.

---

### 2. The Main Controller: `frontend/src/App.jsx`
`App.jsx` manages the global chat interface and communication channels:
- **Command Interceptor (`handleSend`)**:
  - Checks if the user typed `/astra` &rarr; activates the floating companion.
  - Checks if the user typed `/astraonly` &rarr; switches to full-screen companion mode.
  - Checks for `create a image of ...` &rarr; activates the SD 1.5 generator.
- **Server-Sent Events Reader**:
  - Reads chunked streams from `POST /api/chat/stream`.
  - Parses real-time tokens (`data.delta`) and dynamically tracks `<think>` tags to toggle `isAstraThinking`.

---

### 3. The Orchestration Brain: `backend/app/llm/ollama_service.py`
This is the core pipeline executing every user prompt. When a query arrives:
1. **Command Processing**:
   - Detects `list remember`, `forget <id>`, or `remember <fact>` &rarr; directly writes/deletes points in PostgreSQL and Qdrant without wasting LLM compute.
2. **Context & Memory Injection**:
   - Searches Qdrant for semantic memories related to the prompt.
   - Injects active user facts (e.g. *"User is a Python lover"*) into the system prompt.
3. **Conversation-Isolated RAG**:
   - Searches Qdrant with a mandatory `conversation_id` filter.
   - Injects document chunks exclusively from the active chat.
4. **SearXNG Meta-Search**:
   - Detects the `research` keyword &rarr; queries `http://localhost:8888`.
   - Injects verified web results and anchors the LLM to today's date.
5. **Ollama Streaming**:
   - Streams the assembled prompt to the selected Ollama model (`gemma3`, `deepseek-r1`, etc.) via HTTP streaming.

---

### 4. Vector Storage: `backend/app/rag/vector_store.py`
Operates with **Qdrant** and local **FastEmbed** (`BAAI/bge-small-en-v1.5`):
- Runs dense 384-dimensional vector embeddings on CPU via ONNX Runtime without eating into GPU VRAM.
- Two isolated Qdrant collections:
  - `chat_documents`: Document chunks tagged with `conversation_id`.
  - `chat_memories`: Long-term facts tagged with `memory_id`.

---

### 5. Stable Diffusion & VRAM Handoff: `backend/app/image_generation/sd_service.py`
How Astra Talk avoids `CUDA out of memory` on a 4GB GPU:
```
User sends prompt: "create an image of a cat"
               │
               ▼
1. Free Ollama VRAM:
   POST http://localhost:11434/api/generate {"model": model, "keep_alive": 0}
               │
               ▼
2. PyTorch VRAM Flush:
   torch.cuda.empty_cache() & torch.cuda.ipc_collect()
               │
               ▼
3. Load Realistic Vision v6 (FP16):
   Euler Ancestral Scheduler, 20 steps, ~6.5 seconds
               │
               ▼
4. Save to /storage/images/<id>.png and return markdown link:
   ![cat](/storage/images/<id>.png)
```

---

## 🛠️ How to Extend the Codebase

### Adding a New Voice Line or Sound
1. Place your audio file in `frontend/public/astra_gifs/<sound>.<wav|mp3>`.
2. In [`AstraCompanion.jsx`](file:///home/lone-warrior/chat/frontend/src/AstraCompanion.jsx), initialize a ref:
   ```javascript
   const myAudioRef = useRef(new Audio('/astra_gifs/<sound>.wav'));
   ```
3. Call `myAudioRef.current.play()` inside any interaction handler.

### Adding a New In-Chat Slash Command
1. Open [`frontend/src/App.jsx`](file:///home/lone-warrior/chat/frontend/src/App.jsx).
2. Locate `handleSend()` around line 200:
   ```javascript
   if (normalizedCmd === '/mycommand') {
     // Execute your custom logic
     return;
   }
   ```

### Adding a New Backend Tool / Function Calling
1. Open [`backend/app/tools/registry.py`](file:///home/lone-warrior/chat/backend/app/tools/registry.py).
2. Define your tool with a descriptor and an execution handler:
   ```python
   @tool_registry.register("my_tool", "Tool description")
   async def my_tool_handler(params: dict) -> dict:
       return {"result": "data"}
   ```
3. It will automatically be callable within `ollama_service.py`.

---

## 🧪 Testing and Verification Commands

- **Build Frontend**:
  ```bash
  cd frontend && npm run build
  ```
- **Inspect Running Docker Infrastructure**:
  ```bash
  docker ps
  ```
- **Check Memory Vectors in Qdrant**:
  ```bash
  curl -s -X POST http://127.0.0.1:6333/collections/chat_memories/points/scroll -H "Content-Type: application/json" -d '{"limit": 5, "with_payload": true}'
  ```
- **Verify Live LLM Models in Ollama**:
  ```bash
  curl -s http://localhost:11434/api/tags
  ```

