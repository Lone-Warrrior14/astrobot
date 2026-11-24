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
        images: Optional[List[str]] = None,
        custom_system_prompt: Optional[str] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        
        last_user_msg = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
        sources = []
        retrieved_memories = []

        now = datetime.datetime.now()
        current_time_str = now.strftime("%A, %B %d, %Y (%I:%M %p %Z)")
        if custom_system_prompt:
            system_time_prompt = (
                f"{custom_system_prompt.strip()}\n"
                f"- Context Date & Time: {current_time_str}.\n"
                f"- Markdown image rendering is fully supported using standard `![caption](image_url)` syntax."
            )
        else:
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
                        metadata={"source": conversation_id or "direct_command", "type": "explicit_remember"},
                        conversation_id=conversation_id
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

        # ── 2. Memory Retrieval - ISOLATED BY CONVERSATION ID ──
        if enable_memory and last_user_msg:
            try:
                memories = await vector_store.search_memories(last_user_msg, conversation_id=conversation_id, limit=2)
                if memories:
                    mem_context = "\n".join([f"- {m['content']}" for m in memories])
                    messages.insert(1, {
                        "role": "system",
                        "content": f"Relevant background memory for THIS conversation:\n{mem_context}"
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

        # ── 4. Web Research & URL Content Extraction ──
        if last_user_msg:
            lower_msg = last_user_msg.lower()
            url_match = re.search(r'(https?://[^\s<>"]+|www\.[^\s<>"]+)', last_user_msg)
            is_research_triggered = bool(re.search(r'\b(research|/research)\b', lower_msg))

            # Check if an earlier message in this conversation already referenced a URL
            prior_url_match = None
            if not url_match and len(messages) > 1:
                for prior_m in messages[:-1]:
                    p_match = re.search(r'(https?://[^\s<>"]+|www\.[^\s<>"]+)', prior_m.get("content", ""))
                    if p_match:
                        prior_url_match = p_match.group(1).strip()
                        break

            # A. Explicit URL Pasted (or follow-up questions referencing a URL from earlier in the chat)
            if (url_match or prior_url_match) and enable_search:
                target_url = url_match.group(1).strip() if url_match else prior_url_match
                is_yt = bool(re.search(r'(?:youtube\.com|youtu\.be)', target_url, re.IGNORECASE))
                if url_match:
                    if is_yt:
                        yield {"delta": f"📺 *Extracting YouTube transcript and analyzing video:* `{target_url}`...\n\n", "done": False}
                    else:
                        yield {"delta": f"🌐 *Fetching and analyzing live content from:* `{target_url}`...\n\n", "done": False}
                extract_res = await tool_registry.execute_tool("extract_url_content", {"url": target_url})
                if extract_res.get("status") == "success" and extract_res.get("content"):
                    page_content = extract_res.get("content")
                    if url_match:
                        if is_yt or extract_res.get("engine") == "YouTubeTranscript":
                            directive = (
                                f"EXTRACTED YOUTUBE VIDEO TRANSCRIPT ({target_url}):\n\n"
                                f"{page_content[:6500]}\n\n"
                                f"CRITICAL DIRECTIVE:\n"
                                f"1. The user provided a YouTube video link ({target_url}). Provide an immediate, thorough, well-structured breakdown of the video's content.\n"
                                f"2. Structure your response with clear sections: Video Overview, Key Topics & Timestamps (using the timestamps from the transcript), Main Takeaways, and Conclusion.\n"
                                f"3. Base every point directly on the spoken transcript provided above.\n"
                                f"4. Cite the video source URL ({target_url})."
                            )
                        else:
                            directive = (
                                f"EXTRACTED CONTENT FROM URL ({target_url}):\n\n"
                                f"{page_content[:6000]}\n\n"
                                f"CRITICAL DIRECTIVE:\n"
                                f"1. The user provided the URL ({target_url}). Provide an immediate, comprehensive, well-structured summary and deep analysis of the content.\n"
                                f"2. Structure your response with clear sections: Overview, Key Highlights / Takeaways, Detailed Breakdown, and Conclusion.\n"
                                f"3. Base every fact strictly on the extracted text above. Do NOT invent alternate game storylines.\n"
                                f"4. Cite the source URL ({target_url})."
                            )
                    else:
                        # For follow-up questions, always preserve the key infobox / summary header plus the top BGE-reranked paragraphs
                        relevant_text = page_content[:5000]
                        try:
                            # If infobox header exists, keep it as mandatory anchor
                            infobox_prefix = ""
                            body_text = page_content
                            if "KEY PROFILE FACTS / INFOBOX:" in page_content:
                                parts = page_content.split("\n\n", 1)
                                infobox_prefix = parts[0] + "\n\n"
                                body_text = parts[1] if len(parts) > 1 else page_content

                            if vector_store.reranker and len(body_text) > 500:
                                raw_paras = [p.strip() for p in body_text.split('\n\n') if len(p.strip()) > 35]
                                if not raw_paras or len(raw_paras) < 3:
                                    raw_paras = [p.strip() for p in body_text.split('\n') if len(p.strip()) > 35]

                                if len(raw_paras) > 2:
                                    scores = list(vector_store.reranker.rerank(last_user_msg, raw_paras[:80]))
                                    ranked = sorted(zip(scores, raw_paras[:80]), key=lambda x: x[0], reverse=True)
                                    top_paras = [text for _, text in ranked[:5]]
                                    relevant_text = infobox_prefix + "\n\n".join(top_paras)
                                else:
                                    relevant_text = infobox_prefix + body_text[:4000]
                            else:
                                relevant_text = infobox_prefix + body_text[:4000]
                        except Exception as rerank_ex:
                            print(f"Reranking error on page content: {rerank_ex}")

                        directive = (
                            f"EXTRACTED REFERENCE CONTENT FROM CONVERSATION URL ({target_url}):\n\n"
                            f"{relevant_text}\n\n"
                            f"CRITICAL DIRECTIVE:\n"
                            f"1. Ground your answer EXCLUSIVELY and ACCURATELY on the real facts from the extracted page content above.\n"
                            f"2. Answer the user's specific question ('{last_user_msg}') directly with precise factual accuracy. Do NOT hallucinate fabricated storylines."
                        )
                    messages.insert(1, {
                        "role": "system",
                        "content": directive
                    })
                    sources.append({"filename": f"URL: {target_url[:35]}", "score": 1.0, "url": target_url})
                elif url_match:
                    yield {"delta": f"⚠️ *Notice: Could not parse page directly ({extract_res.get('error', 'Unknown')}). Proceeding with web search...*\n\n", "done": False}

            # B. Keyword 'research' Triggered
            elif is_research_triggered and enable_search:
                # Strip 'research' keyword regardless of whether it was placed at start, end, or middle
                clean_query_candidate = re.sub(r'\b/?research\b', '', last_user_msg, flags=re.IGNORECASE).strip()
                clean_query_candidate = re.sub(r'\s+', ' ', clean_query_candidate).strip()
                query_to_search = clean_query_candidate if clean_query_candidate else last_user_msg
                
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
                                f"LIVE IMAGE SEARCH RESULTS for '{query_to_search}':\n\n"
                                f"{images_markdown}\n\n"
                                f"INSTRUCTION: Present these images to the user using the markdown image links above, accompanied by descriptions."
                            )
                        })
                        sources.extend([{"filename": f"Image: {r['title']}", "score": 1.0, "url": r['img_src']} for r in img_res["results"]])
                else:
                    current_dt = datetime.datetime.now()
                    current_year = current_dt.year
                    current_month = current_dt.strftime("%B")
                    
                    # Normalize common typos (e.g. champiom -> champion)
                    normalized_query = query_to_search
                    for typo, fix in [(r'\bchampiom\b', 'champion'), (r'\btodat\b', 'today'), (r'\breseach\b', 'research'), (r'\bchmp\b', 'champ')]:
                        normalized_query = re.sub(typo, fix, normalized_query, flags=re.IGNORECASE)

                    # Universal recency keywords detection:
                    # 'current', 'today', 'latest', 'now', 'recent', 'recently', 'champion', 'holder', 'winner', 'who is', etc.
                    is_recency_query = any(
                        re.search(r'\b' + re.escape(w) + r'\b', normalized_query, re.IGNORECASE)
                        for w in [
                            "current", "currently", "today", "todays", "latest", "now", "recent", "recently",
                            "newest", "present", "champion", "champ", "holder", "winner", "who won",
                            "who is", "who holds", "reign", "reigning", "live", "ongoing", "active"
                        ]
                    )

                    if any(w in normalized_query.lower() for w in ["news", "headline", "headlines", "todat", "today", "breaking"]):
                        search_query_expanded = f"top breaking world news headlines {current_month} {current_year}"
                    elif is_recency_query:
                        # Append the current month and year to ensure search engines retrieve the latest up-to-date state
                        clean_base = re.sub(rf'\b({current_year}|{current_month})\b', '', normalized_query, flags=re.IGNORECASE).strip()
                        search_query_expanded = f"{clean_base} {current_month} {current_year}".strip()
                    else:
                        search_query_expanded = normalized_query

                    yield {"delta": f"🔍 *Live web research via OpenSERP/SearXNG for:* `{search_query_expanded}`...\n\n", "done": False}
                    
                    # 1. Execute primary search with recency enhancement
                    search_res = await tool_registry.execute_tool("web_search", {"query": search_query_expanded})
                    results_list = search_res.get("results", []) if search_res.get("status") == "success" else []
                    
                    # 2. If it's a recency query, generate a neutral title/subject query and prioritize the freshest items
                    if is_recency_query:
                        cleaned_q = normalized_query.strip(' ?.')
                        words = cleaned_q.split()
                        neutral_q = None
                        if len(words) >= 3 and words[0].lower() in ['is', 'are', 'was', 'were']:
                            for kw in ['current', 'latest', 'present']:
                                if kw in [w.lower() for w in words]:
                                    idx = [w.lower() for w in words].index(kw)
                                    rem = words[idx+1:]
                                    if len(rem) >= 3:
                                        title = " ".join(rem[:-2])
                                    else:
                                        title = " ".join(rem)
                                    neutral_q = f"who is the current {title} {current_month} {current_year}"
                                    break
                            if not neutral_q:
                                m_title = re.search(r'(?:current|latest|present)\s+([a-zA-Z0-9\s]+)', cleaned_q, re.IGNORECASE)
                                if m_title:
                                    neutral_q = f"who is the current {m_title.group(1).strip()} {current_month} {current_year}"

                        secondary_queries = []
                        if neutral_q:
                            secondary_queries.append(neutral_q)
                        if any(w in normalized_query.lower() for w in ["champion", "champ", "title", "holder", "belt"]):
                            secondary_queries.append(f"who is the current wwe champion {current_month} {current_year}")
                            secondary_queries.append(f"current champions list {current_month} {current_year}")
                        secondary_queries.append(normalized_query)

                        seen_urls = {r.get("url") for r in results_list}
                        for sec_q in secondary_queries:
                            sec_res = await tool_registry.execute_tool("web_search", {"query": sec_q})
                            if sec_res.get("status") == "success" and sec_res.get("results"):
                                for r in sec_res.get("results"):
                                    if r.get("url") not in seen_urls:
                                        results_list.insert(0, r)
                                        seen_urls.add(r.get("url"))

                        # Sort results by chronological date score so the newest events appear first
                        def _recency_score(item: Dict[str, Any]) -> float:
                            text = (item.get("title", "") + " " + item.get("content", "")).lower()
                            score = 0.0
                            # Year matching (e.g. 2026 vs 2024 vs 2020)
                            years = [int(y) for y in re.findall(r'\b(202[0-9])\b', text)]
                            if years:
                                score += max(years) * 1000.0
                            # Month matching (later months in the year get higher priority)
                            month_map = {
                                'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
                                'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12
                            }
                            found_months = [val for m, val in month_map.items() if re.search(r'\b' + m, text)]
                            if found_months:
                                score += max(found_months) * 50.0
                            for kw in ['today', 'latest', 'current', 'still', 'new', 'after', 'undisputed', 'reigning']:
                                if re.search(r'\b' + kw + r'\b', text):
                                    score += 25.0
                            return score

                        results_list.sort(key=_recency_score, reverse=True)

                    if results_list:
                        results_text = "\n\n".join([
                            f"Source Title: {r['title']}\nSummary/Snippet: {r['content']}\nURL: {r['url']}"
                            for r in results_list[:6]
                        ])
                        engine_name = search_res.get("engine", "Search Engine")
                        messages.insert(1, {
                            "role": "system",
                            "content": (
                                f"{engine_name} LIVE SEARCH RESULTS (Retrieved on {current_time_str}, today's date: {current_month} {current_year}):\n\n"
                                f"{results_text}\n\n"
                                f"CRITICAL DIRECTIVES FOR SEARCH GROUNDING & RECENCY:\n"
                                f"1. STRICT FACTUAL GROUNDING: Your entire answer MUST be derived EXCLUSIVELY and DIRECTLY from the live search results above. Do NOT use outdated internal pre-trained memory or invent fictional events.\n"
                                f"2. OVERRIDE INTERNAL BIAS: When the search results contradict your pre-trained weights (e.g. current sports champions, political office holders, breaking news), the search results ALWAYS win.\n"
                                f"3. ACCURATE READING OF WINNERS & MATCH RESULTS: Pay close attention to match outcomes in snippets. If article mentions 'Cody Rhodes def. Logan Paul', that means Cody won and retained, NOT Logan Paul.\n"
                                f"4. DIRECT ANSWER: Address '{last_user_msg}' clearly and directly in your first sentence based only on verified facts in the snippets above.\n"
                                f"5. Clean Citations: Do NOT paste raw, long Google redirect URLs in your text. Sources are displayed cleanly in the UI."
                            )
                        })
                        sources.extend([{"filename": f"Web: {r['title']}", "score": 1.0, "url": r['url']} for r in results_list[:6]])

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
