from typing import List, Dict, Any, Optional
from qdrant_client import QdrantClient
from qdrant_client.http.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue
from fastembed import TextEmbedding
from fastembed.rerank.cross_encoder import TextCrossEncoder
from backend.app.core.config import settings

class VectorStore:
    def __init__(self):
        self.client = QdrantClient(url=settings.QDRANT_HOST)
        # FastEmbed BGE small has 384 dimensions - ultra lightweight, fast, CPU/GPU efficient
        self.vector_size = 384
        self.embedding_model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")
        
        # State-of-the-Art BAAI BGE-Reranker Cross-Encoder via FastEmbed ONNX
        try:
            self.reranker = TextCrossEncoder(model_name="BAAI/bge-reranker-base")
            print("✓ BAAI/bge-reranker-base Cross-Encoder loaded successfully.")
        except Exception as e:
            print(f"Notice: Failed to initialize BGE reranker ({e}), continuing with standard vector similarity.")
            self.reranker = None
            
        self._ensure_collections()

    def _ensure_collections(self):
        try:
            collections = [c.name for c in self.client.get_collections().collections]
            
            # Recreate collections if vector size changed
            for coll_name in [settings.QDRANT_COLLECTION_DOCS, settings.QDRANT_COLLECTION_MEMORY]:
                if coll_name in collections:
                    info = self.client.get_collection(coll_name)
                    current_size = info.config.params.vectors.size
                    if current_size != self.vector_size:
                        self.client.delete_collection(coll_name)
                        collections.remove(coll_name)

            if settings.QDRANT_COLLECTION_DOCS not in collections:
                self.client.create_collection(
                    collection_name=settings.QDRANT_COLLECTION_DOCS,
                    vectors_config=VectorParams(size=self.vector_size, distance=Distance.COSINE)
                )

            if settings.QDRANT_COLLECTION_MEMORY not in collections:
                self.client.create_collection(
                    collection_name=settings.QDRANT_COLLECTION_MEMORY,
                    vectors_config=VectorParams(size=self.vector_size, distance=Distance.COSINE)
                )
        except Exception as e:
            print(f"Qdrant collection init notice: {e}")

    async def get_embedding(self, text: str) -> List[float]:
        # Fast local ONNX inference via FastEmbed
        embeddings = list(self.embedding_model.embed([text]))
        return [float(x) for x in embeddings[0]]

    async def insert_document_chunk(self, doc_id: str, conversation_id: str, chunk_index: int, text: str, metadata: Dict[str, Any]):
        embedding = await self.get_embedding(text)
        point_id = int(f"{abs(hash(doc_id)) % 1000000}{chunk_index:04d}")
        
        self.client.upsert(
            collection_name=settings.QDRANT_COLLECTION_DOCS,
            points=[
                PointStruct(
                    id=point_id,
                    vector=embedding,
                    payload={
                        "doc_id": doc_id,
                        "conversation_id": conversation_id,
                        "chunk_index": chunk_index,
                        "text": text,
                        **metadata
                    }
                )
            ]
        )

    async def search_documents(self, query: str, conversation_id: Optional[str] = None, limit: int = 4) -> List[Dict[str, Any]]:
        if not conversation_id:
            return []

        embedding = await self.get_embedding(query)
        qdrant_filter = Filter(
            must=[
                FieldCondition(
                    key="conversation_id",
                    match=MatchValue(value=conversation_id)
                )
            ]
        )

        try:
            # Over-fetch candidate chunks from Qdrant vector search to feed the reranker
            candidate_limit = max(limit * 3, 12) if self.reranker else limit

            if hasattr(self.client, "query_points"):
                results = self.client.query_points(
                    collection_name=settings.QDRANT_COLLECTION_DOCS,
                    query=embedding,
                    query_filter=qdrant_filter,
                    limit=candidate_limit
                ).points
            else:
                results = self.client.search(
                    collection_name=settings.QDRANT_COLLECTION_DOCS,
                    query_vector=embedding,
                    query_filter=qdrant_filter,
                    limit=candidate_limit
                )

            candidates = [{"vector_score": r.score, **r.payload} for r in results]
            if not candidates:
                return []

            # ── 2-Stage RAG: Precision Cross-Encoder Re-Ranking via BAAI/bge-reranker-base ──
            if self.reranker and len(candidates) > 1:
                texts = [c.get("text", "") for c in candidates]
                try:
                    rerank_scores = list(self.reranker.rerank(query, texts))
                    for idx, c in enumerate(candidates):
                        c["rerank_score"] = float(rerank_scores[idx])
                        c["score"] = c["rerank_score"]
                    candidates.sort(key=lambda x: x.get("rerank_score", -999.0), reverse=True)
                except Exception as rank_err:
                    print(f"BGE rerank error, falling back to vector score: {rank_err}")
                    for c in candidates:
                        c["score"] = c.get("vector_score", 0.0)
            else:
                for c in candidates:
                    c["score"] = c.get("vector_score", 0.0)

            return candidates[:limit]
        except Exception as e:
            print(f"Error querying isolated documents: {e}")
            return []

    async def delete_document_vectors(self, doc_id: str):
        try:
            self.client.delete(
                collection_name=settings.QDRANT_COLLECTION_DOCS,
                points_selector=Filter(
                    must=[
                        FieldCondition(
                            key="doc_id",
                            match=MatchValue(value=doc_id)
                        )
                    ]
                )
            )
        except Exception as e:
            print(f"Error deleting doc vectors: {e}")

    async def insert_memory(self, memory_id: str, content: str, metadata: Dict[str, Any], conversation_id: Optional[str] = None):
        embedding = await self.get_embedding(content)
        point_id = abs(hash(memory_id)) % 2147483647
        payload = {"memory_id": memory_id, "content": content, **metadata}
        if conversation_id:
            payload["conversation_id"] = conversation_id

        self.client.upsert(
            collection_name=settings.QDRANT_COLLECTION_MEMORY,
            points=[
                PointStruct(
                    id=point_id,
                    vector=embedding,
                    payload=payload
                )
            ]
        )

    async def delete_memory(self, memory_id: str):
        try:
            point_id = abs(hash(memory_id)) % 2147483647
            self.client.delete(
                collection_name=settings.QDRANT_COLLECTION_MEMORY,
                points_selector=[point_id]
            )
        except Exception as e:
            print(f"Error deleting memory vector: {e}")

    async def delete_conversation_memories(self, conversation_id: str):
        """Clean up all isolated memories tied to a specific conversation."""
        try:
            self.client.delete(
                collection_name=settings.QDRANT_COLLECTION_MEMORY,
                points_selector=Filter(
                    must=[
                        FieldCondition(
                            key="conversation_id",
                            match=MatchValue(value=conversation_id)
                        )
                    ]
                )
            )
        except Exception as e:
            print(f"Error deleting conversation memories: {e}")

    async def search_memories(self, query: str, conversation_id: Optional[str] = None, limit: int = 3) -> List[Dict[str, Any]]:
        embedding = await self.get_embedding(query)
        qdrant_filter = None
        if conversation_id:
            # Strictly isolate memories to this specific chat session
            qdrant_filter = Filter(
                must=[
                    FieldCondition(
                        key="conversation_id",
                        match=MatchValue(value=conversation_id)
                    )
                ]
            )

        try:
            if hasattr(self.client, "query_points"):
                results = self.client.query_points(
                    collection_name=settings.QDRANT_COLLECTION_MEMORY,
                    query=embedding,
                    query_filter=qdrant_filter,
                    limit=limit
                ).points
            else:
                results = self.client.search(
                    collection_name=settings.QDRANT_COLLECTION_MEMORY,
                    query_vector=embedding,
                    query_filter=qdrant_filter,
                    limit=limit
                )
            return [{"score": r.score, **r.payload} for r in results if getattr(r, 'score', 0) > 0.4]
        except Exception as e:
            print(f"Error querying memories: {e}")
            return []

vector_store = VectorStore()
