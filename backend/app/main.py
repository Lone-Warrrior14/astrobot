from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from backend.app.core.config import settings
from backend.app.api.endpoints import router as api_router
from backend.app.api.multimodal import router as multimodal_router

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Local ChatGPT Alternative with Ollama, PostgreSQL, Qdrant, SearXNG, RAG, and Multimodal Support",
    version="1.0.0"
)

# Mount static images directory so images are served with clean HTTP URLs (instant, robust browser rendering)
os.makedirs(settings.IMAGES_DIR, exist_ok=True)
app.mount("/storage/images", StaticFiles(directory=settings.IMAGES_DIR), name="images")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")
app.include_router(multimodal_router, prefix="/api")

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "database": "postgresql",
        "vector_db": "qdrant",
        "inference": "ollama",
        "search": "searxng"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000, reload=True)
