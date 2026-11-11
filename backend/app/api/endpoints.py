import os
import shutil
import uuid
import json
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, desc

from backend.app.database.session import get_db
from backend.app.models.entities import Conversation, Message, DocumentRecord, MemoryRecord, UserSetting
from backend.app.llm.ollama_service import ollama_service
from backend.app.rag.doc_processor import doc_processor
from backend.app.rag.vector_store import vector_store
from backend.app.tools.registry import tool_registry
from backend.app.core.config import settings

router = APIRouter()

# ── 1. Models & Hardware Endpoints ────────────────────────────
@router.get("/models")
async def get_models():
    models = await ollama_service.list_models()
    return {"models": models}

@router.get("/hardware")
async def get_hardware():
    return await tool_registry.execute_tool("system_info", {})

# ── 2. Conversations CRUD ─────────────────────────────────────
@router.get("/conversations")
async def list_conversations(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Conversation).order_by(desc(Conversation.updated_at))
    )
    convs = result.scalars().all()
    return [
        {
            "id": c.id,
            "title": c.title,
            "model": c.model,
            "pinned": c.pinned,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None
        }
        for c in convs
    ]

@router.post("/conversations")
async def create_conversation(data: dict, db: AsyncSession = Depends(get_db)):
    conv = Conversation(
        id=str(uuid.uuid4()),
        title=data.get("title", "New Chat"),
        model=data.get("model", settings.DEFAULT_MODEL),
        system_prompt=data.get("system_prompt", ""),
        temperature=float(data.get("temperature", 0.7))
    )
    db.add(conv)
    await db.commit()
    await db.refresh(conv)
    return {"id": conv.id, "title": conv.title, "model": conv.model}

@router.get("/conversations/{conv_id}")
async def get_conversation(conv_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Conversation).filter(Conversation.id == conv_id))
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    msg_result = await db.execute(
        select(Message).filter(Message.conversation_id == conv_id).order_by(Message.created_at)
    )
    messages = msg_result.scalars().all()

    # Also fetch attached documents for this specific conversation
    doc_result = await db.execute(
        select(DocumentRecord).filter(DocumentRecord.conversation_id == conv_id).order_by(DocumentRecord.created_at)
    )
    docs = doc_result.scalars().all()

    return {
        "id": conv.id,
        "title": conv.title,
        "model": conv.model,
        "system_prompt": conv.system_prompt,
        "temperature": conv.temperature,
        "documents": [
            {"id": d.id, "filename": d.original_name, "size": d.file_size, "chunks": d.total_chunks}
            for d in docs
        ],
        "messages": [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "thinking_content": m.thinking_content,
                "sources": m.sources,
                "created_at": m.created_at.isoformat() if m.created_at else None
            }
            for m in messages
        ]
    }

@router.patch("/conversations/{conv_id}")
async def update_conversation(conv_id: str, data: dict, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Conversation).filter(Conversation.id == conv_id))
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if "title" in data:
        conv.title = data["title"]
    if "model" in data:
        conv.model = data["model"]
    if "pinned" in data:
        conv.pinned = data["pinned"]

    await db.commit()
    return {"status": "success", "id": conv.id, "title": conv.title}

@router.delete("/conversations/{conv_id}")
async def delete_conversation(conv_id: str, db: AsyncSession = Depends(get_db)):
    # Clean up any document vector embeddings associated with this conversation
    doc_result = await db.execute(select(DocumentRecord).filter(DocumentRecord.conversation_id == conv_id))
    docs = doc_result.scalars().all()
    for d in docs:
        await vector_store.delete_document_vectors(d.id)
        if os.path.exists(d.file_path):
            try:
                os.remove(d.file_path)
            except Exception:
                pass

    await db.execute(delete(Conversation).filter(Conversation.id == conv_id))
    await db.commit()
    return {"status": "deleted", "id": conv_id}

# ── 3. Streaming Chat Generation with Conversation-Level RAG ────
@router.post("/chat/stream")
async def chat_stream(data: dict, db: AsyncSession = Depends(get_db)):
    conv_id = data.get("conversation_id")
    content = data.get("content", "").strip()
    model = data.get("model", settings.DEFAULT_MODEL)
    temperature = float(data.get("temperature", 0.7))
    enable_rag = data.get("enable_rag", True)
    enable_memory = data.get("enable_memory", True)
    enable_tools = data.get("enable_tools", True)
    enable_search = data.get("enable_search", True)
    incognito = data.get("incognito", False)
    rag_only = data.get("rag_only", False)

    if not content:
        raise HTTPException(status_code=400, detail="Content cannot be empty")

    conv = None
    if not incognito:
        if conv_id:
            result = await db.execute(select(Conversation).filter(Conversation.id == conv_id))
            conv = result.scalar_one_or_none()
            
        if not conv:
            conv = Conversation(
                id=conv_id or str(uuid.uuid4()),
                title=content[:40],
                model=model,
                temperature=temperature
            )
            db.add(conv)
            await db.commit()
            await db.refresh(conv)

        # Persist user message
        user_msg = Message(
            id=str(uuid.uuid4()),
            conversation_id=conv.id,
            role="user",
            content=content
        )
        db.add(user_msg)
        await db.commit()

        # Load recent conversation history
        res = await db.execute(
            select(Message).filter(Message.conversation_id == conv.id).order_by(Message.created_at)
        )
        all_msgs = res.scalars().all()
        api_messages = [{"role": m.role, "content": m.content} for m in all_msgs]
    else:
        # Incognito mode: Transient in-memory conversation, never written to disk or DB
        history = data.get("history", [])
        api_messages = []
        for h in history:
            api_messages.append({"role": h.get("role", "user"), "content": h.get("content", "")})
        api_messages.append({"role": "user", "content": content})
        # In incognito mode, memory storage & recall are disabled by default for zero data footprint
        enable_memory = False

    async def sse_generator():
        collected_response = ""
        collected_sources = []
        try:
            async for chunk in ollama_service.stream_chat(
                messages=api_messages,
                model=model,
                conversation_id=conv.id if conv else None, # Guarantees document isolation per conversation
                temperature=0.2 if rag_only else temperature, # Low temp for factual grounding in RAG-only
                enable_rag=enable_rag and not incognito,
                enable_memory=enable_memory and not incognito and not rag_only,
                enable_tools=enable_tools and not rag_only,
                enable_search=enable_search and not rag_only,
                rag_only=rag_only
            ):
                if "delta" in chunk:
                    collected_response += chunk["delta"]
                if chunk.get("sources"):
                    collected_sources = chunk["sources"]
                yield f"data: {json.dumps(chunk)}\n\n"

            # Parse thinking tags if present
            thinking = None
            clean_text = collected_response
            if "<think>" in collected_response and "</think>" in collected_response:
                import re
                match = re.search(r'<think>([\s\S]*?)</think>', collected_response)
                if match:
                    thinking = match.group(1).strip()
                    clean_text = re.sub(r'<think>[\s\S]*?</think>', '', collected_response).strip()

            # If not in incognito mode, persist assistant message and extract memory
            if not incognito and conv:
                assistant_msg = Message(
                    id=str(uuid.uuid4()),
                    conversation_id=conv.id,
                    role="assistant",
                    content=clean_text or collected_response,
                    thinking_content=thinking,
                    sources=collected_sources
                )
                db.add(assistant_msg)
                await db.commit()

                # Automatic memory extraction
                lower_msg = content.lower()
                if any(phrase in lower_msg for phrase in ["my name is", "i like", "i prefer", "i work as", "remember that", "my favorite"]):
                    mem_id = str(uuid.uuid4())
                    mem = MemoryRecord(
                        id=mem_id,
                        category="semantic",
                        content=content,
                        source_conversation_id=conv.id
                    )
                    db.add(mem)
                    await db.commit()
                    await vector_store.insert_memory(mem_id, content, {"source": conv.id})

        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(sse_generator(), media_type="text/event-stream")

# ── 4. RAG & Document Intelligence (Strictly Isolated by Conversation) ──
@router.post("/documents/upload")
async def upload_document(
    conversation_id: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    # Verify conversation exists
    conv_res = await db.execute(select(Conversation).filter(Conversation.id == conversation_id))
    conv = conv_res.scalar_one_or_none()
    if not conv:
        # Create conversation if not exists
        conv = Conversation(id=conversation_id, title=f"Doc: {file.filename[:30]}", model=settings.DEFAULT_MODEL)
        db.add(conv)
        await db.commit()

    os.makedirs(settings.DOCUMENTS_DIR, exist_ok=True)
    doc_id = str(uuid.uuid4())
    filename = f"{conversation_id}_{doc_id}_{file.filename}"
    file_path = os.path.join(settings.DOCUMENTS_DIR, filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    file_size = os.path.getsize(file_path)
    file_ext = file.filename.split(".")[-1].lower() if "." in file.filename else "txt"

    # Save to Postgres with conversation_id foreign key
    doc = DocumentRecord(
        id=doc_id,
        conversation_id=conversation_id,
        filename=filename,
        original_name=file.filename,
        file_type=file_ext,
        file_size=file_size,
        file_path=file_path,
        indexed=False
    )
    db.add(doc)
    await db.commit()

    # Process and index in Qdrant attached explicitly to conversation_id
    try:
        chunks_count = await doc_processor.process_and_index(
            doc_id=doc_id,
            conversation_id=conversation_id,
            file_path=file_path,
            file_type=file_ext,
            metadata={"filename": file.filename, "file_type": file_ext}
        )
        doc.total_chunks = chunks_count
        doc.indexed = True
        await db.commit()
        return {
            "status": "success",
            "id": doc_id,
            "conversation_id": conversation_id,
            "chunks": chunks_count,
            "filename": file.filename
        }
    except Exception as e:
        return {"status": "partial", "id": doc_id, "error": str(e)}

@router.get("/documents")
async def list_documents(conversation_id: Optional[str] = Query(None), db: AsyncSession = Depends(get_db)):
    query = select(DocumentRecord).order_by(desc(DocumentRecord.created_at))
    if conversation_id:
        query = query.filter(DocumentRecord.conversation_id == conversation_id)
    result = await db.execute(query)
    docs = result.scalars().all()
    return [
        {
            "id": d.id,
            "conversation_id": d.conversation_id,
            "filename": d.original_name,
            "file_type": d.file_type,
            "file_size": d.file_size,
            "total_chunks": d.total_chunks,
            "indexed": d.indexed,
            "created_at": d.created_at.isoformat() if d.created_at else None
        }
        for d in docs
    ]

@router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DocumentRecord).filter(DocumentRecord.id == doc_id))
    doc = result.scalar_one_or_none()
    if doc:
        await vector_store.delete_document_vectors(doc_id)
        if os.path.exists(doc.file_path):
            try:
                os.remove(doc.file_path)
            except Exception:
                pass
        await db.execute(delete(DocumentRecord).filter(DocumentRecord.id == doc_id))
        await db.commit()
    return {"status": "deleted", "id": doc_id}

# ── 5. Advanced Memory System ─────────────────────────────────
@router.get("/memories")
async def list_memories(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MemoryRecord).filter(MemoryRecord.is_active == True).order_by(desc(MemoryRecord.created_at)))
    memories = result.scalars().all()
    return [
        {
            "id": m.id,
            "category": m.category,
            "content": m.content,
            "importance": m.importance,
            "created_at": m.created_at.isoformat() if m.created_at else None
        }
        for m in memories
    ]

@router.post("/memories")
async def create_memory(data: dict, db: AsyncSession = Depends(get_db)):
    content = data.get("content", "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Content cannot be empty")
        
    mem_id = str(uuid.uuid4())
    mem = MemoryRecord(
        id=mem_id,
        category=data.get("category", "semantic"),
        content=content,
        importance=float(data.get("importance", 1.0))
    )
    db.add(mem)
    await db.commit()
    await vector_store.insert_memory(mem_id, content, {"category": mem.category})
    return {"id": mem_id, "content": content}

@router.delete("/memories/{mem_id}")
async def delete_memory(mem_id: str, db: AsyncSession = Depends(get_db)):
    await vector_store.delete_memory(mem_id)
    await db.execute(delete(MemoryRecord).filter(MemoryRecord.id == mem_id))
    await db.commit()
    return {"status": "deleted", "id": mem_id}
