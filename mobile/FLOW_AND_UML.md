# AstraTalk Mobile Architecture & On-Device Flow

This document details the mobile system architecture, native bridge layers, hardware-accelerated on-device inference, vector database RAG, and navigation flows for the **AstraTalk Android App** located in `mobile/`.

---

## 1. High-Level Mobile Architecture Diagram

```mermaid
graph TD
    User([Android User])

    subgraph WebViewApp ["Capacitor WebView (React / web-src)"]
        MobileUI[App.jsx & Mobile Shell]
        Mascot[AstraCompanion.jsx]
        LocalVDB[Local Vector DB (localVectorDb.js / IndexedDB)]
        CapacitorCore[Capacitor Core Bridge]
    end

    subgraph NativePlugin ["Android Native Layer (OfflineEnginePlugin.java)"]
        PluginBridge[OfflineEnginePlugin Bridge]
        MLKit[Google ML Kit Text Recognition OCR]
        PdfRender[Android PdfRenderer Service]
        FileStore[Android Internal App Storage (/files)]
        DaemonManager[Qualcomm QNN Daemon Manager]
    end

    subgraph NativeInference ["On-Device Hardware AI Accelerators"]
        JNI[JNI llama.cpp native-lib.cpp]
        HexagonNPU[Qualcomm Hexagon HTP v73 NPU (SD Turbo / AnythingV5)]
        AdrenoGPU[Adreno 740 GPU / OpenCL CLBlast]
        KryoCPU[ARM Cortex-X3 / A715 CPU Multi-threading]
    end

    User -->|Touch & Gestures| MobileUI
    MobileUI <--> Mascot
    MobileUI <--> LocalVDB
    MobileUI -->|Capacitor Plugins API| CapacitorCore
    CapacitorCore <--> PluginBridge

    PluginBridge -->|Process PDF| PdfRender
    PdfRender -->|Bitmaps| MLKit
    PluginBridge -->|Process Image OCR| MLKit
    PluginBridge -->|HTTP :8085 / SSE| DaemonManager
    DaemonManager -->|HTP / QNN Direct| HexagonNPU

    PluginBridge -->|JNI Calls| JNI
    JNI -->|GPU Offload| AdrenoGPU
    JNI -->|Multi-threaded Kernels| KryoCPU
    HexagonNPU -->|Rendered PNG| FileStore
    FileStore -->|Capacitor.convertFileSrc| MobileUI
```

---

## 2. Component Hierarchy Diagram

```mermaid
classDiagram
    class MobileApp {
        +conversations: Array
        +activeConvId: String
        +messages: Array
        +models: Array
        +selectedModel: String
        +isStreaming: Boolean
        +activeTab: String ('chat' | 'documents' | 'mobile_models' | 'cloud_endpoints')
        +isMobileSidebarOpen: Boolean
        +isAstraActive: Boolean
        +isAstraOnly: Boolean
        +handleSend()
        +runOnDeviceInference()
        +handleBackNavigation()
    }

    class AstraCompanion {
        +isAstraOnly: Boolean
        +latestReply: String
        +onSendMessage()
        +onExitAstraOnly()
        +detectEmotion()
        +synthesizeSpeech()
    }

    class LocalVectorDB {
        +openDB()
        +insertDocument(doc, convId)
        +queryVectorDb(query, convId, topK)
        +deleteDocument(id)
        +deleteConversationDocuments(convId)
    }

    class OfflineEnginePlugin {
        +loadModel(filename)
        +startInference(prompt, nPredict)
        +getNextToken()
        +generateImageNative(prompt)
        +performOcrOnPdf(base64Pdf)
        +performOcrOnImage(base64Image)
    }

    class NativeLibCpp {
        +nativeLoadModel()
        +nativeProcessPrompt()
        +nativeGetNextToken()
        +nativeGenerateImage()
    }

    MobileApp *-- AstraCompanion
    MobileApp *-- LocalVectorDB
    MobileApp --> OfflineEnginePlugin: Capacitor Bridge
    OfflineEnginePlugin --> NativeLibCpp: JNI
```

---

## 3. On-Device Chat & Scoped RAG Sequence

This sequence diagram illustrates how document OCR and vector embeddings are stored per chat in IndexedDB, and subsequently retrieved to augment the local GGUF model via JNI.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant UI as App.jsx (WebView)
    participant VDB as localVectorDb.js (IndexedDB)
    participant Bridge as OfflineEnginePlugin (Java)
    participant MLKit as Google ML Kit OCR
    participant JNI as llama.cpp (C++)
    participant NPU as Snapdragon 8 Gen 2

    %% Phase 1: Scoped Document Ingestion
    opt In-Chat Document Upload
        User->>UI: Attach PDF / Image via Paperclip button
        UI->>Bridge: performOcrOnPdf({base64Pdf})
        activate Bridge
        Bridge->>MLKit: Extract text via Android PdfRenderer + ML Kit
        MLKit-->>Bridge: Extracted raw text
        Bridge-->>UI: Return parsed text
        deactivate Bridge
        UI->>VDB: insertDocument(text, conversationId)
        activate VDB
        VDB->>VDB: Generate 384d semantic embeddings & store in IndexedDB
        VDB-->>UI: Confirm indexed
        deactivate VDB
    end

    %% Phase 2: In-Chat Question Answering
    User->>UI: Submit question in active chat
    UI->>VDB: queryVectorDb(question, conversationId, topK=3)
    activate VDB
    VDB-->>UI: Scoped relevant context chunks
    deactivate VDB
    UI->>UI: Formulate ChatML Prompt ([System] + Context + [User])
    UI->>Bridge: startInference({prompt, nPredict: 512})
    activate Bridge
    Bridge->>JNI: nativeProcessPrompt(prompt)
    JNI->>NPU: Offload attention kernels to NPU/GPU
    Bridge-->>UI: {status: "started"}
    deactivate Bridge

    %% Phase 3: Token Streaming Loop
    loop While generating tokens
        UI->>Bridge: getNextToken()
        activate Bridge
        Bridge->>JNI: nativeGetNextToken()
        JNI-->>Bridge: Token string / done flag
        Bridge-->>UI: {token: "...", done: false}
        deactivate Bridge
        UI->>UI: Stream token into active message bubble
    end
    UI->>UI: Commit turn to localStorage (messages & conversation)
```

---

## 4. On-Device Stable Diffusion Image Generation Flow

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant UI as App.jsx
    participant Bridge as OfflineEnginePlugin.java
    participant QNN as QNN SD Daemon (:8085)
    participant NPU as Qualcomm Hexagon HTP v73
    participant Storage as Android Filesystem (/files/generated_images)

    User->>UI: Type: "create a cute black cat"
    UI->>UI: Regex matches image generation intent
    UI->>Bridge: generateImageNative({prompt: "a cute black cat"})
    activate Bridge
    Bridge->>QNN: POST http://127.0.0.1:8085/generate {prompt, steps: 15}
    activate QNN
    QNN->>NPU: Offload UNet & VAE to Hexagon HTP v73 NPU
    NPU-->>QNN: Synthesized raw RGB byte buffer (4.1s)
    QNN-->>Bridge: SSE complete {image: base64, timeMs: 4100}
    deactivate QNN
    Bridge->>Storage: Write sd_npu_[timestamp].png
    Bridge-->>UI: Return {status: "success", path: outFile, timeMs: 4100}
    deactivate Bridge

    UI->>UI: Convert path: Capacitor.convertFileSrc(path)
    UI->>UI: Display Markdown: ![prompt](_capacitor_file_...)
    UI->>UI: Commit image message to localStorage ('astratalk_mobile_conversations')
```

---

## 5. Android Back Button & View Navigation State Machine

This state diagram explains the interception and fallback routing when the Android system hardware or gesture back action occurs.

```mermaid
stateDiagram-v2
    [*] --> ChatTab: App Launch

    state ChatTab {
        [*] --> MainChatScreen
        MainChatScreen --> SidebarOpen: Tap Hamburger Menu
        SidebarOpen --> MainChatScreen: Press Back Button (Closes Sidebar)
        
        MainChatScreen --> CompanionFullscreen: Type /astraonly or Fullscreen Mascot
        CompanionFullscreen --> MainChatScreen: Press Back Button (Exits Mascot)
    }

    ChatTab --> DocumentsTab: Select Documents & OCR
    ChatTab --> SnapdragonModelsTab: Select Snapdragon Models
    ChatTab --> CloudEndpointsTab: Select Cloud Endpoints

    DocumentsTab --> MainChatScreen: Press Back Button
    SnapdragonModelsTab --> MainChatScreen: Press Back Button
    CloudEndpointsTab --> MainChatScreen: Press Back Button

    MainChatScreen --> AppExit: Press Back Button (Exit App)
    AppExit --> [*]
```

