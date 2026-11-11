#!/usr/bin/env bash
set -e

echo "=========================================================="
echo " Starting Local ChatGPT AI Assistant Stack"
echo " (PostgreSQL 16 + Qdrant + SearXNG + Ollama + FastAPI + React)"
echo "=========================================================="

# 1. PostgreSQL container (Port 5433)
if [ ! "$(docker ps -q -f name=local-chat-postgres)" ]; then
    if [ "$(docker ps -aq -f status=exited -f name=local-chat-postgres)" ]; then
        echo "Starting existing PostgreSQL container..."
        docker start local-chat-postgres
    else
        echo "Launching PostgreSQL container on port 5433..."
        mkdir -p /home/lone-warrior/chat/storage/postgres_data
        docker run -d --name local-chat-postgres \
          --restart unless-stopped \
          -e POSTGRES_USER=postgres \
          -e POSTGRES_PASSWORD=postgres \
          -e POSTGRES_DB=chatapp \
          -p 5433:5432 \
          -v /home/lone-warrior/chat/storage/postgres_data:/var/lib/postgresql/data \
          postgres:16-alpine
    fi
fi

# 2. Qdrant vector database (Port 6333)
if [ ! "$(docker ps -q -f name=vibrant_greider)" ] && [ ! "$(docker ps -q -f ancestor=qdrant/qdrant)" ]; then
    echo "Starting Qdrant vector database on port 6333..."
    docker run -d --name local-qdrant -p 6333:6333 -p 6334:6334 \
      -v /home/lone-warrior/chat/storage/qdrant_storage:/qdrant/storage:z \
      qdrant/qdrant
fi

# 3. SearXNG metasearch instance (Port 8888)
if [ ! "$(docker ps -q -f name=local-searxng)" ]; then
    if [ "$(docker ps -aq -f status=exited -f name=local-searxng)" ]; then
        echo "Starting existing SearXNG container..."
        docker start local-searxng
    else
        echo "Launching SearXNG container on port 8888..."
        mkdir -p /home/lone-warrior/chat/storage/searxng
        docker run -d --name local-searxng \
          --restart unless-stopped \
          -p 8888:8080 \
          -v /home/lone-warrior/chat/storage/searxng:/etc/searxng:rw \
          -e BASE_URL=http://localhost:8888/ \
          searxng/searxng:latest
    fi
fi

# 4. Ollama check
if ! curl -s http://127.0.0.1:11434/api/tags > /dev/null; then
    echo "Starting ollama serve in background..."
    nohup ollama serve > /dev/null 2>&1 &
    sleep 3
fi

# 5. Start Backend
cd /home/lone-warrior/chat
echo "Starting FastAPI backend on port 8000..."
PYTHONPATH=/home/lone-warrior/chat ./venv312/bin/uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# 6. Start Frontend
cd /home/lone-warrior/chat/frontend
echo "Starting Vite frontend on port 3000..."
npm run dev &
FRONTEND_PID=$!

echo "=========================================================="
echo " System Online!"
echo " Frontend UI:   http://localhost:3000"
echo " Backend API:   http://localhost:8000 (Docs: /docs)"
echo " SearXNG:       http://localhost:8888"
echo " Qdrant DB:     http://localhost:6333"
echo " Postgres DB:   localhost:5433"
echo "=========================================================="

wait $BACKEND_PID $FRONTEND_PID
