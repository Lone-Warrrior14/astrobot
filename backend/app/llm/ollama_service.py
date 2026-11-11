import httpx
import json
import re
import os
import base64
import uuid
import datetime
from typing import AsyncGenerator, Dict, Any, List, Optional
from backend.app.core.config import settings
from backend.app.rag.vector_store import vector_store
from backend.app.tools.registry import tool_registry

class OllamaService:
    @staticmethod
    async def list_models() -> List[Dict[str, Any]]:
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                res = await client.get(f"{settings.OLLAMA_BASE_URL}/api/tags")
                if res.status_code == 200:
                    data = res.json()
                    return data.get("models", [])
            except Exception as e:
                print(f"Error fetching Ollama models: {e}")
        return []

    @staticmethod
    async def stream_chat(
        messages: List[Dict[str, Any]],
        model: str,
        conversation_id: Optional[str] = None,
        temperature: float = 0.7,
        enable_rag: bool = True,
        enable_memory: bool = True,
        enable_tools: bool = True,
        enable_search: bool = True,
        rag_only: bool = False,
        images: Optional[List[str]] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        
        last_user_msg = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
        sources = []
        retrieved_memories = []

        now = datetime.datetime.now()
        current_time_str = now.strftime("%A, %B %d, %Y (%I:%M %p %Z)")
        system_time_prompt = (
            f"You are Astra, an intelligent, charming, and helpful local AI assistant.\n"
            f"- Current Date & Time: {current_time_str}.\n"
            f"- BEHAVIOR & TONE:\n"
            f"  1. When greeted with simple phrases like 'hello', 'hi', or 'hey astra', respond warmly, concisely, and naturally as a companion. DO NOT recite or announce the full calendar date, day of week, or exact timestamp unless the user explicitly asks for the time or date.\n"
            f"  2. Be direct, lively, and engaging without robotic preamble.\n"
            f"  3. When reporting live news or events, anchor context accurately to today's date ({now.strftime('%B %Y')}).\n"
            f"- Markdown image rendering is fully supported using standard `![caption](image_url)` syntax."
        )
        messages.insert(0, {"role": "system", "content": system_time_prompt})

        # ── 1. IN-CHAT EXPLICIT 'list remember' / 'forget' / 'remember' COMMANDS ──
        if last_user_msg:
            lower_msg = last_user_msg.lower().strip()

            # A. LIST MEMORIES: "list remember", "/list remember", "list memories", "show memories"
            if lower_msg in ["list remember", "/list remember", "list memories", "/list memories", "show memories", "what do you remember"]:
                from backend.app.database.session import AsyncSessionLocal
                from backend.app.models.entities import MemoryRecord
                from sqlalchemy import select, desc
                async with AsyncSessionLocal() as session:
                    res = await session.execute(
                        select(MemoryRecord).filter(MemoryRecord.is_active == True).order_by(desc(MemoryRecord.created_at))
                    )
                    all_mems = res.scalars().all()

                if not all_mems:
                    yield {
                        "delta": "🧠 **No Memories Stored:** You haven't taught me any facts yet.\n\nUse `remember <fact>` to store something in my long-term memory!",
                        "done": True,
                        "memories": []
                    }
                    return

                mem_list_md = "🧠 **Everything I Remember About You:**\n\n"
                for idx, m in enumerate(all_mems, start=1):
                    mem_list_md += f"{idx}. **{m.content}** *(ID: `{m.id[:8]}`)*\n"
                mem_list_md += "\n*To delete any fact, type `forget <keyword or ID>` or `forget all`.*"

                yield {
                    "delta": mem_list_md,
                    "done": True,
                    "memories": [{"id": m.id, "content": m.content} for m in all_mems]
                }
                return

            # B. FORGET MEMORIES: "forget <keyword or ID>", "/forget <...>", "forget all"
            forget_match = re.match(r'^(?:/forget|forget)(?:\s+(?:about|that))?\s+(.+)$', lower_msg, flags=re.IGNORECASE)
            if forget_match:
                target = forget_match.group(1).strip()
                from backend.app.database.session import AsyncSessionLocal
                from backend.app.models.entities import MemoryRecord
                from sqlalchemy import select, delete

                async with AsyncSessionLocal() as session:
                    if target.lower() in ["all", "everything", "*"]:
                        # Forget everything
                        all_res = await session.execute(select(MemoryRecord))
                        mems_to_del = all_res.scalars().all()
                        for m in mems_to_del:
                            await vector_store.delete_memory(m.id)
                        await session.execute(delete(MemoryRecord))
                        await session.commit()
                        yield {
                            "delta": "🗑️ **All memories forgotten:** Cleared entire long-term memory store from database and vector index.",
                            "done": True,
                            "memories": []
                        }
                        return
                    else:
                        # Find matching memory by ID prefix or substring in content
                        all_res = await session.execute(select(MemoryRecord).filter(MemoryRecord.is_active == True))
                        mems = all_res.scalars().all()
                        matched = [
                            m for m in mems 
                            if m.id.startswith(target) or target.lower() in m.content.lower()
                        ]

                        if not matched:
                            yield {
                                "delta": f"⚠️ **Not Found:** Could not find any memory matching `\"{target}\"`.\n\nType `list remember` to see all current memories.",
                                "done": True,
                                "memories": []
                            }
                            return

                        deleted_items = []
                        for m in matched:
                            await vector_store.delete_memory(m.id)
                            await session.execute(delete(MemoryRecord).filter(MemoryRecord.id == m.id))
                            deleted_items.append(m.content)
                        await session.commit()

                        deleted_md = "\n".join([f"- *\"{item}\"*" for item in deleted_items])
                        yield {
                            "delta": f"🗑️ **Memory Forgotten:** Removed the following memory from both database and vector index:\n\n{deleted_md}\n\nI will no longer recall this in future chats.",
                            "done": True,
                            "memories": []
                        }
                        return

            # C. REMEMBER COMMAND: "remember: ...", "remember that ...", "/remember ..."
            remember_match = re.match(r'^(?:/remember|remember(?:\s+that|:)?)\s+(.+)$', lower_msg, flags=re.IGNORECASE)
            if remember_match:
                memory_fact = remember_match.group(1).strip()
                # Also extract original casing from last_user_msg
                orig_fact = re.sub(r'^(?:/remember|remember(?:\s+that|:)?)\s+', '', last_user_msg, flags=re.IGNORECASE).strip()
                mem_id = str(uuid.uuid4())
                try:
                    await vector_store.insert_memory(
                        memory_id=mem_id,
                        content=orig_fact,
                        metadata={"source": conversation_id or "direct_command", "type": "explicit_remember"}
                    )
                    from backend.app.database.session import AsyncSessionLocal
                    from backend.app.models.entities import MemoryRecord
                    async with AsyncSessionLocal() as session:
                        mem_rec = MemoryRecord(
                            id=mem_id,
                            category="semantic",
                            content=orig_fact,
                            source_conversation_id=conversation_id
                        )
                        session.add(mem_rec)
                        await session.commit()
                except Exception as ex:
                    print(f"Error saving remember command: {ex}")

                yield {
                    "delta": f"🧠 **Memory Saved:** I've remembered that:\n\n> *\"{orig_fact}\"*\n\nThis will now persist across all your conversations and be recalled whenever relevant.\n\n*(Type `list remember` to view all memories or `forget <keyword>` to delete)*",
                    "done": True,
                    "memories": [{"id": mem_id, "content": orig_fact, "score": 1.0}]
                }
                return

        # ── 2. IN-CHAT IMAGE GENERATION ACTIVATION (Realistic Vision v6) ──────────
        if last_user_msg:
            lower_msg = last_user_msg.lower()
            is_image_gen_trigger = bool(re.search(r'\b(create|generate|make|render|draw|paint)\s+(an?\s+)?image\b|\bimage\s+of\b', lower_msg))

            if is_image_gen_trigger:
                yield {"delta": "🎨 *Activating local Realistic Vision v6 (FP16, RTX 3050)...*\n\n", "done": False}
                
                # Context-aware prompt extraction:
                prompt_candidate = re.sub(
                    r'^(please\s+)?(can\s+you\s+)?(create|generate|make|render|draw|paint)\s+(an?\s+)?(image|picture|photo)\s+(of\s+)?',
                    '',
                    last_user_msg,
                    flags=re.IGNORECASE
                ).strip()

                if len(prompt_candidate) < 5 or any(ref in prompt_candidate.lower() for ref in [" of it", " of that", " of this", "about that", "like that"]):
                    prev_user_or_asst = [m["content"] for m in messages if m["role"] in ["user", "assistant"] and m["content"] != last_user_msg]
                    context_snippet = prev_user_or_asst[-1][:140] if prev_user_or_asst else "a scenic futuristic landscape"
                    resolved_prompt = f"{context_snippet}, {prompt_candidate}"
                else:
                    resolved_prompt = prompt_candidate or last_user_msg

                yield {"delta": f"**Prompt:** `{resolved_prompt}`\n\n*Synthesizing latents (20 steps, Euler Ancestral, ~6s)...*\n\n", "done": False}

                from backend.app.image_generation.sd_service import sd_service
                res = await sd_service.generate_image(prompt=resolved_prompt)

                if res.get("status") == "success" and res.get("image"):
                    img_data_url = res.get("image")
                    
                    # Save a permanent file to storage/images and serve via HTTP static URL
                    img_filename = f"sd_{uuid.uuid4().hex[:12]}.png"
                    img_filepath = os.path.join(settings.IMAGES_DIR, img_filename)
                    os.makedirs(settings.IMAGES_DIR, exist_ok=True)
                    
                    if "," in img_data_url:
                        raw_bytes = base64.b64decode(img_data_url.split(",", 1)[1])
                        with open(img_filepath, "wb") as f:
                            f.write(raw_bytes)
                    
                    static_img_url = f"/storage/images/{img_filename}"
                    markdown_output = (
                        f"![{resolved_prompt}]({static_img_url})\n\n"
                        f"✨ **Generated locally via Realistic Vision v6 (Safe VRAM Mode: 2.0GB)**\n\n"
                        f"*Resolution: 512×512 | Sampler: Euler Ancestral | Generation time: ~6s*"
                    )
                    yield {
                        "delta": markdown_output,
                        "done": True,
                        "sources": [{"filename": f"SD: {resolved_prompt[:30]}", "score": 1.0, "url": static_img_url}]
                    }
                    return
                else:
                    yield {
                        "delta": f"\n\n⚠️ *Local generation notice: {res.get('message', 'Failed to generate')}*",
                        "done": True,
                        "sources": None
                    }
                    return

        # ── 2. Memory Retrieval ──────────────────────────────────
        if enable_memory and last_user_msg:
            try:
                memories = await vector_store.search_memories(last_user_msg, limit=2)
                if memories:
                    mem_context = "\n".join([f"- {m['content']}" for m in memories])
                    messages.insert(1, {
                        "role": "system",
                        "content": f"Relevant background memory about the user:\n{mem_context}"
                    })
                    retrieved_memories = memories
            except Exception as e:
                print(f"Memory retrieval notice: {e}")

        # ── 3. RAG Document Retrieval - ISOLATED BY CONVERSATION ID ──
        if enable_rag and last_user_msg and conversation_id:
            try:
                # In RAG-only mode, retrieve more chunks for comprehensive grounded context
                retrieval_limit = 5 if rag_only else 3
                docs = await vector_store.search_documents(last_user_msg, conversation_id=conversation_id, limit=retrieval_limit)
                if docs:
                    doc_context = "\n\n".join([f"[Source: {d.get('filename', 'doc')}]:\n{d.get('text', '')}" for d in docs])
                    if rag_only:
                        system_rag_prompt = (
                            f"STRICT RAG-ONLY GROUNDING MODE ACTIVATED:\n"
                            f"You must base your answer ENTIRELY and EXCLUSIVELY on the retrieved documents below from this conversation.\n"
                            f"Do NOT invent, extrapolate, or use general pre-trained knowledge beyond what is explicitly stated in the context.\n"
                            f"If the answer cannot be found in the provided context, state clearly: 'I cannot find that information in the uploaded documents.'\n\n"
                            f"RETRIEVED CONTEXT:\n{doc_context}"
                        )
                    else:
                        system_rag_prompt = f"Use the following retrieved reference documents from THIS conversation to answer accurately:\n{doc_context}"

                    messages.insert(1, {
                        "role": "system",
                        "content": system_rag_prompt
                    })
                    sources = [{"filename": d.get("filename"), "score": d.get("score")} for d in docs]
                elif rag_only:
                    # In RAG-only mode with zero docs retrieved or no documents uploaded
                    messages.insert(1, {
                        "role": "system",
                        "content": (
                            "STRICT RAG-ONLY GROUNDING MODE ACTIVATED:\n"
                            "No relevant document chunks were found for this query in the current conversation. "
                            "Inform the user that no relevant content was found in their uploaded documents."
                        )
                    })
            except Exception as e:
                print(f"RAG retrieval notice: {e}")

        # ── 4. SearXNG Web & Image Search Triggered on 'research' ──
        if last_user_msg:
            lower_msg = last_user_msg.lower()
            is_research_triggered = bool(re.search(r'\b(research|/research)\b', lower_msg))

            if is_research_triggered and enable_search:
                match = re.search(r'(?:/research|research)\s*[:\-\s]?\s*(.*)', last_user_msg, re.IGNORECASE)
                query_to_search = match.group(1).strip() if match and match.group(1).strip() else last_user_msg
                
                is_image_search = any(w in lower_msg for w in ["image", "images", "picture", "pictures", "photo", "photos", "wallpaper"])

                if is_image_search:
                    clean_img_query = re.sub(r'\b(images?|pictures?|photos?|wallpapers?)\b', '', query_to_search, flags=re.IGNORECASE).strip()
                    img_res = await tool_registry.execute_tool("searxng_image_search", {"query": clean_img_query or query_to_search})
                    if img_res.get("status") == "success" and img_res.get("results"):
                        images_markdown = "\n".join([
                            f"![{r['title']}]({r['img_src']})\n*[Source]({r['url']})*"
                            for r in img_res["results"]
                        ])
                        messages.insert(1, {
                            "role": "system",
                            "content": (
                                f"SearXNG LIVE IMAGE SEARCH RESULTS for '{query_to_search}':\n\n"
                                f"{images_markdown}\n\n"
                                f"INSTRUCTION: Present these images to the user using the markdown image links above, accompanied by descriptions."
                            )
                        })
                        sources.extend([{"filename": f"Image: {r['title']}", "score": 1.0, "url": r['img_src']} for r in img_res["results"]])
                else:
                    # Clean the query
                    clean_query = re.sub(r'^(what\s+are\s+the|what\s+is\s+the|tell\s+me\s+the|give\s+me\s+the|show\s+me\s+the|latest|current)\s+', '', query_to_search, flags=re.IGNORECASE).strip()
                    
                    if any(w in query_to_search.lower() for w in ["news", "headline", "headlines", "todat", "today", "breaking"]):
                        search_query_expanded = "top breaking world news headlines today"
                    else:
                        search_query_expanded = clean_query or query_to_search

                    search_res = await tool_registry.execute_tool("searxng_search", {"query": search_query_expanded})
                    if search_res.get("status") == "success" and search_res.get("results"):
                        results_text = "\n\n".join([
                            f"Source Title: {r['title']}\nSummary/Snippet: {r['content']}\nURL: {r['url']}"
                            for r in search_res["results"][:6]
                        ])
                        messages.insert(1, {
                            "role": "system",
                            "content": (
                                f"SearXNG LIVE SEARCH RESULTS (Retrieved on {current_time_str}):\n\n"
                                f"{results_text}\n\n"
                                f"CRITICAL DIRECTIVE:\n"
                                f"1. The user explicitly asked for the news. You MUST provide a thorough, structured, bulleted summary of the top headlines and stories found in the search results above.\n"
                                f"2. DO NOT reply with a passive offer or question like 'I can look up the news for you, let me know if you want me to search'. The search has ALREADY been performed.\n"
                                f"3. Immediately deliver the news breakdown categorized by topic (e.g. World Affairs, Politics, Technology/Economy) with short summaries for each."
                            )
                        })
                        sources.extend([{"filename": f"Web: {r['title']}", "score": 1.0, "url": r['url']} for r in search_res["results"][:6]])

            elif enable_tools:
                if "time" in lower_msg or "date" in lower_msg:
                    t_res = await tool_registry.execute_tool("get_current_time", {})
                    messages.insert(1, {"role": "system", "content": f"Tool execution result: Current time is {t_res.get('datetime')} ({t_res.get('day')})."})
                elif "system info" in lower_msg or "ram" in lower_msg or "vram" in lower_msg or "gpu" in lower_msg:
                    s_res = await tool_registry.execute_tool("system_info", {})
                    messages.insert(1, {"role": "system", "content": f"Tool execution result: Local hardware status: {json.dumps(s_res)}."})

        # Attach image base64 if user uploaded an image
        if images and len(messages) > 0:
            for m in reversed(messages):
                if m.get("role") == "user":
                    m["images"] = images
                    break

        # ── 5. Stream from Ollama ─────────────────────────────────
        payload = {
            "model": model or settings.DEFAULT_MODEL,
            "messages": messages,
            "stream": True,
            "options": {
                "temperature": temperature
            }
        }

        async with httpx.AsyncClient(timeout=120.0) as client:
            try:
                async with client.stream(
                    "POST",
                    f"{settings.OLLAMA_BASE_URL}/api/chat",
                    json=payload
                ) as response:
                    if response.status_code != 200:
                        yield {"error": f"Ollama error: HTTP {response.status_code}"}
                        return

                    async for line in response.aiter_lines():
                        if line:
                            try:
                                chunk = json.loads(line)
                                msg = chunk.get("message", {})
                                delta = msg.get("content", "")
                                done = chunk.get("done", False)

                                yield {
                                    "delta": delta,
                                    "done": done,
                                    "sources": sources if done else None,
                                    "memories": [m.get("content") for m in retrieved_memories] if done else None
                                }
                            except Exception:
                                continue
            except Exception as e:
                yield {"error": f"Failed to communicate with Ollama: {str(e)}"}

ollama_service = OllamaService()
