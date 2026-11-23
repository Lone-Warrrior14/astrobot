# 🛠️ Astra Talk - Tools, Prerequisites & Complete Setup Guide

This guide contains the official download links, prerequisites, installation steps, and configuration details for every tool, service, runtime, and model used in **Astra Talk**.

---

## 📋 Table of Contents
1. [System Requirements & Hardware Recommendations](#-system-requirements--hardware-recommendations)
2. [Stack Overview & Download Directory](#-stack-overview--download-directory)
3. [Component Setup & Installation](#-component-setup--installation)
   - [1. Docker Engine & Docker Compose](#1-docker-engine--docker-compose)
   - [2. Ollama (Local LLM & Vision Runtime)](#2-ollama-local-llm--vision-runtime)
   - [3. PostgreSQL 16 (Relational Database)](#3-postgresql-16-relational-database)
   - [4. Qdrant (Vector Database)](#4-qdrant-vector-database)
   - [5. OpenSERP & SearXNG (Private Meta-Search)](#5-openserp--searxng-private-meta-search)
   - [6. Python 3.12 & Backend Virtual Environment](#6-python-312--backend-virtual-environment)
   - [7. Node.js & Vite Frontend](#7-nodejs--vite-frontend)
   - [8. Recommended Ollama Models](#8-recommended-ollama-models)
4. [One-Click Startup Script](#-one-click-startup-script)
5. [Ports & Endpoints Reference](#-ports--endpoints-reference)
6. [Troubleshooting & Verification](#-troubleshooting--verification)

---

## 💻 System Requirements & Hardware Recommendations

- **Operating System:** Ubuntu 22.04 LTS / 24.04 LTS, Debian 12+, Arch Linux, or WSL2 on Windows 10/11.
- **GPU:** NVIDIA GPU with 4GB+ VRAM (e.g. RTX 3050 Mobile / Desktop, GTX 1660, RTX 3060, RTX 4060).
  - *Note:* CPU-only mode is supported by Ollama, but an NVIDIA GPU with CUDA provides vastly faster inference.
- **RAM:** Minimum 8 GB (16 GB recommended).
- **Storage:** 25 GB free disk space for containers, Python packages, and Ollama model weights.

---

## 🌐 Stack Overview & Download Directory

| Component | Purpose | Version Used | Official Website / Download Link |
| :--- | :--- | :--- | :--- |
| **Docker Engine** | Container runtime for databases & search engines | 24+ / 27+ | [docs.docker.com/engine/install](https://docs.docker.com/engine/install/) |
| **Ollama** | Local LLM inference & Vision model execution | Latest | [ollama.com/download](https://ollama.com/download) |
| **PostgreSQL** | Relational DB for chats, messages, and memories | 16-alpine | [hub.docker.com/_/postgres](https://hub.docker.com/_/postgres) |
| **Qdrant** | High-performance vector database for RAG & memories | Latest | [hub.docker.com/r/qdrant/qdrant](https://hub.docker.com/r/qdrant/qdrant) |
| **OpenSERP** | Lightweight search scraper API | Latest | [github.com/karust/openserp](https://github.com/karust/openserp) / [Docker](https://hub.docker.com/r/karust/openserp) |
| **SearXNG** | Privacy-respecting metasearch engine | Latest | [docs.searxng.org](https://docs.searxng.org/) / [Docker](https://hub.docker.com/r/searxng/searxng) |
| **Python** | Backend runtime for FastAPI, RAG, & Embeddings | 3.12+ | [python.org/downloads](https://www.python.org/downloads/) |
| **Node.js & npm** | Frontend build environment | Node 18+ / 20+ | [nodejs.org/en/download](https://nodejs.org/en/download) |
| **FastEmbed** | ONNX runtime embeddings (`bge-small-en-v1.5`) | 0.9.1 | [github.com/qdrant/fastembed](https://github.com/qdrant/fastembed) |
| **Vite** | Frontend tooling & development server | 5.x | [vite.dev](https://vite.dev/) |

---

## 🚀 Component Setup & Installation

### 1. Docker Engine & Docker Compose
Docker runs PostgreSQL, Qdrant, OpenSERP, and SearXNG containers with persistence.

- **Ubuntu / Debian Installation:**
  ```bash
  sudo apt-get update
  sudo apt-get install -y ca-certificates curl gnupg
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

  sudo apt-get update
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

  # Allow current user to run Docker without sudo
  sudo usermod -aG docker $USER
  newgrp docker
  ```
- **Official Documentation:** [Docker Installation Guide](https://docs.docker.com/engine/install/ubuntu/)

---

### 2. Ollama (Local LLM & Vision Runtime)
Ollama serves the local LLMs (DeepSeek-R1, Gemma 3, Qwen 2.5-VL) over HTTP at `http://127.0.0.1:11434`.

- **Installation (Linux / WSL2):**
  ```bash
  curl -fsSL https://ollama.com/install.sh | sh
  ```
- **Ensure NVIDIA GPU Support:**
  Verify NVIDIA drivers are configured:
  ```bash
  nvidia-smi
  ```
- **Start / Enable Ollama Service:**
  ```bash
  sudo systemctl enable --now ollama
  # Or start manually:
  ollama serve
  ```
- **Official Download:** [Ollama Official Website](https://ollama.com/download)

---

### 3. PostgreSQL 16 (Relational Database)
Stores user sessions, conversation metadata, chat messages, and long-term memory records.

- **Docker Run Command:**
  ```bash
  mkdir -p storage/postgres_data
  docker run -d --name local-chat-postgres \
    --restart unless-stopped \
    -e POSTGRES_USER=postgres \
    -e POSTGRES_PASSWORD=postgres \
    -e POSTGRES_DB=chatapp \
    -p 5433:5432 \
    -v $(pwd)/storage/postgres_data:/var/lib/postgresql/data \
    postgres:16-alpine
  ```
  *(Note: Port `5433` is mapped to avoid colliding with any default PostgreSQL instance running on port `5432`)*.

---

### 4. Qdrant (Vector Database)
Stores document embeddings (PDFs, DOCX, TXT) and semantic memories with payload filters for zero-leakage conversation isolation.

- **Docker Run Command:**
  ```bash
  mkdir -p storage/qdrant_storage
  docker run -d --name local-qdrant \
    --restart unless-stopped \
    -p 6333:6333 -p 6334:6334 \
    -v $(pwd)/storage/qdrant_storage:/qdrant/storage:z \
    qdrant/qdrant
  ```
- **Web Dashboard:** Access Qdrant Web UI at `http://localhost:6333/dashboard`.

---

### 5. OpenSERP & SearXNG (Private Meta-Search)
Used by the autonomous web research agent when prompts include `research <query>` or when querying live web data.

- **OpenSERP (Port 7000):**
  ```bash
  docker run -d --name local-openserp \
    --restart unless-stopped \
    -p 7000:7000 \
    karust/openserp serve -a 0.0.0.0 -p 7000
  ```

- **SearXNG (Port 8888):**
  ```bash
  mkdir -p storage/searxng
  docker run -d --name local-searxng \
    --restart unless-stopped \
    -p 8888:8080 \
    -v $(pwd)/storage/searxng:/etc/searxng:rw \
    -e BASE_URL=http://localhost:8888/ \
    searxng/searxng:latest
  ```

---

### 6. Python 3.12 & Backend Virtual Environment
The backend is built on **FastAPI**, **SQLAlchemy** (async), **FastEmbed**, and **Trafilatura**.

- **Prerequisites (Ubuntu):**
  ```bash
  sudo apt-get update
  sudo apt-get install -y python3.12 python3.12-venv python3-pip build-essential libpq-dev
  ```

- **Setup Virtual Environment & Install Dependencies:**
  ```bash
  cd /home/lone-warrior/chat
  python3.12 -m venv venv312
  source venv312/bin/activate
  pip install --upgrade pip setuptools wheel
  pip install -r backend_requirements.txt
  ```

---

### 7. Node.js & Vite Frontend
The user interface is built with **React 18**, **Lucide Icons**, **Remark GFM**, and **Vite**.

- **Install Node.js (via NodeSource LTS):**
  ```bash
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
  ```

- **Install Dependencies & Build:**
  ```bash
  cd /home/lone-warrior/chat/frontend
  npm install
  npm run build
  ```

---

### 8. Recommended Ollama Models
Download the models tuned for text, coding, reasoning, and vision:

```bash
# General Conversation & Speed (3.3 GB)
ollama pull gemma3:latest

# Deep Reasoning with visible <think> trace (4.7 GB)
ollama pull deepseek-r1:7b

# Multimodal Vision Analysis (6.0 GB)
ollama pull qwen2.5vl:7b

# Compact Conversational & Companion Voice Model (3.4 GB)
ollama pull SparkLLM/Spark-X2.5-1.7B:latest
```

---

## ⚡ One-Click Startup Script

A unified startup script [`start.sh`](start.sh) is provided in the repository root. It inspects Docker, starts missing containers, spins up Ollama if not active, and launches both FastAPI and Vite:

```bash
cd /home/lone-warrior/chat
chmod +x start.sh
./start.sh
```

---

## 🔌 Ports & Endpoints Reference

| Service | Port | Endpoint URL | Description |
| :--- | :--- | :--- | :--- |
| **Frontend UI** | `3000` | `http://localhost:3000` | React + Vite UI with Astra Companion & PWA |
| **Backend API** | `8000` | `http://localhost:8000` | FastAPI server (`/docs` for Swagger UI) |
| **SearXNG** | `8888` | `http://localhost:8888` | Local privacy-focused metasearch engine |
| **OpenSERP** | `7000` | `http://localhost:7000` | Lightweight Google / DuckDuckGo scraping proxy |
| **Qdrant DB** | `6333` | `http://localhost:6333` | Vector database API & Web Dashboard (`/dashboard`) |
| **PostgreSQL** | `5433` | `localhost:5433` | Persistent relational store (`chatapp` database) |
| **Ollama** | `11434` | `http://127.0.0.1:11434` | Ollama model inference and vision API |

---

## 🔍 Troubleshooting & Verification

- **Check Container Health:**
  ```bash
  docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
  ```
- **Check Backend Logs:**
  ```bash
  curl -s http://localhost:8000/docs
  ```
- **Verify Vector Storage Connection:**
  ```bash
  curl -s http://localhost:6333/collections
  ```
- **Speech API Support:**
  - Microphones and Speech Back (TTS) use the browser-native **Web Speech API** (`SpeechRecognition` / `speechSynthesis`).
  - Works out of the box in Google Chrome, Chromium, Brave, Microsoft Edge, and Opera.
