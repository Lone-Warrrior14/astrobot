# AstraTalk PWA / Desktop Web Architecture & Flow

This document details the system architecture, component hierarchy, data flow, and interaction sequences for the **AstraTalk Progressive Web App (PWA) / Desktop Web application** located in `frontend/`.

---

## 1. High-Level Architecture Diagram

```mermaid
graph TD
    User([User / Browser])
    
    subgraph Frontend ["Frontend PWA (React + Vite)"]
        UI[App.jsx & UI Tabs]
        Mascot[AstraCompanion.jsx]
        State[React State & Hooks]
        SSEConsumer[SSE Stream Consumer]
    end

    subgraph BackendServer ["Local Backend Server (FastAPI :8000)"]
        Router[FastAPI API Router]
        ChatEngine[Chat & LLM Pipeline]
        RAGEngine[Hybrid RAG & Qdrant Engine]
        MemoryEngine[Memory & Graph Storage]
        ImageEngine[SD 1.5 Image Service]
        VisionEngine[Multimodal Vision Service]
        HardwareMon[Hardware Monitor Service]
    end

    subgraph StorageAI ["Local Services & Inference"]
        Ollama[(Ollama / Llama.cpp Host)]
        Qdrant[(Qdrant Vector DB)]
        SQLite[(SQLite Chat & Memory DB)]
        LocalTorch[(PyTorch SD / GPU VRAM)]
    end

    User -->|Interact| UI
    UI <--> Mascot
    UI --> State
    UI -->|HTTP POST / GET| Router
    Router --> ChatEngine
    Router --> RAGEngine
    Router --> MemoryEngine
    Router --> ImageEngine
    Router --> VisionEngine
    Router --> HardwareMon

    ChatEngine -->|LLM Inference| Ollama
    RAGEngine -->|Dense Embeddings| Qdrant
    MemoryEngine -->|Long-term facts| SQLite
    ImageEngine -->|Diffusers Denoising| LocalTorch
    ChatEngine -->|SSE Stream Response| SSEConsumer
    SSEConsumer --> UI
```

---

## 2. Component Hierarchy Diagram

```mermaid
classDiagram
    class App {
        +conversations: Array
        +activeConvId: String
        +messages: Array
        +models: Array
        +selectedModel: String
        +isStreaming: Boolean
        +activeTab: String
        +isAstraActive: Boolean
        +isAstraOnly: Boolean
        +handleSend()
        +fetchModels()
        +uploadDocument()
        +generateImage()
    }

    class AstraCompanion {
        +isThinking: Boolean
        +isStreaming: Boolean
        +latestReply: String
        +isAstraOnly: Boolean
        +onClose()
        +onSendMessage()
        +detectEmotion()
        +synthesizeSpeech()
    }

    class Sidebar {
        +NewChatButton
        +ConversationList
        +NavigationTabs: Chat, Documents, Memories, Hardware, ImageGen
        +SettingsToggle
    }

    class ChatWindow {
        +TopBar: ModelSelector, IncognitoToggle, AstraToggle
        +MessageList: ReactMarkdown, RehypeHighlight
        +InputDock: TextArea, FileUpload, ImageUpload, SendButton
    }

    class DocumentsView {
        +DocumentUploader
        +IndexedDocumentList
        +DeleteDocument()
    }

    class MemoriesView {
        +MemoryList
        +AddMemoryInput
        +DeleteMemory()
    }

    class HardwareView {
        +VRAMGauge
        +CPUGauge
        +RAMGauge
        +GPUSelector
    }

    App *-- Sidebar
    App *-- ChatWindow
    App *-- DocumentsView
    App *-- MemoriesView
    App *-- HardwareView
    App *-- AstraCompanion
```

---

## 3. Core Chat, RAG & Memory Execution Sequence

This sequence diagram depicts how a message is routed through memory retrieval, vector RAG search, LLM inference streaming, and companion TTS lip-sync.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant UI as App.jsx (PWA)
    participant Companion as AstraCompanion.jsx
    participant Backend as FastAPI Backend
    participant Qdrant as Qdrant Vector DB
    participant SQLite as SQLite DB
    participant LLM as Ollama / Local Engine

    User->>UI: Type question & click Send
    UI->>UI: Append user message to UI state
    UI->>Backend: POST /api/chat/stream {content, model, enable_rag, enable_memory}
    
    activate Backend
    opt Memory Enabled
        Backend->>SQLite: Query user facts & conversation graph
        SQLite-->>Backend: Relevant memory snippets
    end

    opt RAG Enabled
        Backend->>Qdrant: Hybrid Vector Search (Dense + BM25)
        Qdrant-->>Backend: Top-K context chunks
    end

    Backend->>Backend: Build augmented ChatML prompt with context
    Backend->>LLM: Stream inference prompt
    activate LLM

    loop Token Streaming
        LLM-->>Backend: Yield text delta
        Backend-->>UI: Server-Sent Events (SSE: data: {delta})
        UI->>UI: Incrementally render Markdown
    end
    deactivate LLM
    deactivate Backend

    UI->>Companion: Pass completed assistant reply
    opt Astra Companion Active
        Companion->>Companion: Analyze emotion & trigger expression GIF
        Companion->>Companion: Web Speech API / TTS Audio playback
    end
```

---

## 4. In-Chat & Dedicated Image Generation Flow

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant UI as App.jsx
    participant Router as /api/images/generate
    participant SD as Stable Diffusion Service (PyTorch)
    participant Storage as /storage/generated_images

    User->>UI: Prompt: "/image a futuristic city at sunset"
    UI->>UI: Regex routes command to image generator
    UI->>Router: POST /api/images/generate {prompt, steps, width, height}
    activate Router
    Router->>SD: Invoke pipeline (Realistic Vision v6 / SD 1.5)
    activate SD
    SD->>SD: Run U-Net denoising & VAE decode
    SD->>Storage: Save PNG image to disk
    SD-->>Router: Image file path / URL
    deactivate SD
    Router-->>UI: JSON {status: "success", image_url: "/api/images/static/..."}
    deactivate Router
    UI->>UI: Render Markdown: ![prompt](image_url)
```

---

## 5. Document Ingestion & Multimodal OCR Flow

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant UI as App.jsx
    participant UploadAPI as /api/documents/upload
    participant Parser as Doc Parser & Vision OCR
    participant Embedder as SentenceTransformer
    participant Qdrant as Qdrant Storage

    User->>UI: Attach PDF / Image document
    UI->>UploadAPI: Multipart form upload (file)
    activate UploadAPI
    UploadAPI->>Parser: Extract text / run OCR on scans
    Parser-->>UploadAPI: Raw extracted text
    UploadAPI->>UploadAPI: Recursive token chunking (500 tokens, 50 overlap)
    UploadAPI->>Embedder: Compute 384d / 768d embeddings
    Embedder-->>UploadAPI: Dense vectors
    UploadAPI->>Qdrant: Upsert points with payload metadata
    UploadAPI-->>UI: HTTP 200 {status: "indexed", chunks: N}
    deactivate UploadAPI
    UI->>UI: Refresh indexed documents badge
```

