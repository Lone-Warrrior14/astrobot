import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Astra Talk"
    API_V1_STR: str = "/api/v1"
    
    # PostgreSQL Configuration
    POSTGRES_SERVER: str = os.getenv("POSTGRES_SERVER", "127.0.0.1")
    POSTGRES_PORT: int = int(os.getenv("POSTGRES_PORT", "5433"))
    POSTGRES_USER: str = os.getenv("POSTGRES_USER", "postgres")
    POSTGRES_PASSWORD: str = os.getenv("POSTGRES_PASSWORD", "postgres")
    POSTGRES_DB: str = os.getenv("POSTGRES_DB", "chatapp")
    
    @property
    def SQLALCHEMY_DATABASE_URI(self) -> str:
        return f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    @property
    def SYNC_DATABASE_URI(self) -> str:
        return f"postgresql+psycopg2://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    # Qdrant Vector Database
    QDRANT_HOST: str = os.getenv("QDRANT_HOST", "http://127.0.0.1:6333")
    QDRANT_COLLECTION_DOCS: str = "chat_documents"
    QDRANT_COLLECTION_MEMORY: str = "chat_memories"
    
    # Ollama Local Inference
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
    DEFAULT_MODEL: str = os.getenv("DEFAULT_MODEL", "gemma3:latest")
    
    # SearXNG Private Meta-Search Engine
    SEARXNG_URL: str = os.getenv("SEARXNG_URL", "http://127.0.0.1:8888")
    
    # Storage Paths
    BASE_DIR: str = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    STORAGE_DIR: str = os.path.join(BASE_DIR, "storage")
    DOCUMENTS_DIR: str = os.path.join(STORAGE_DIR, "documents")
    IMAGES_DIR: str = os.path.join(STORAGE_DIR, "images")
    AUDIO_DIR: str = os.path.join(STORAGE_DIR, "audio")
    BACKUPS_DIR: str = os.path.join(STORAGE_DIR, "backups")
    SEARXNG_DIR: str = os.path.join(STORAGE_DIR, "searxng")
    
    # Hardware & Performance Config
    MAX_VRAM_GB: float = 4.0
    FORCE_CPU: bool = False
    TEMPERATURE: float = 0.7
    MAX_TOKENS: int = 4096
    
    # Privacy & Network (defaults to private local mode)
    OFFLINE_MODE: bool = False

    class Config:
        case_sensitive = True

settings = Settings()
