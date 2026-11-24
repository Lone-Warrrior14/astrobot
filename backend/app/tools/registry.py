import math
import datetime
import subprocess
import os
import json
import psutil
import httpx
import re
from typing import Dict, Any, List
from backend.app.core.config import settings

class ToolRegistry:
    def __init__(self):
        self.tools = {
            "calculator": {
                "name": "calculator",
                "description": "Perform basic arithmetic calculations. Example: '25 * 4 + 10'",
                "parameters": {"expression": "string"}
            },
            "get_current_time": {
                "name": "get_current_time",
                "description": "Returns current date, time, and timezone.",
                "parameters": {}
            },
            "system_info": {
                "name": "system_info",
                "description": "Returns local hardware resources (RAM, GPU status, OS info).",
                "parameters": {}
            },
            "searxng_search": {
                "name": "searxng_search",
                "description": "Search web text privately using SearXNG.",
                "parameters": {"query": "string"}
            },
            "searxng_image_search": {
                "name": "searxng_image_search",
                "description": "Search web images privately using SearXNG.",
                "parameters": {"query": "string"}
            },
            "generate_sdxl_image": {
                "name": "generate_sdxl_image",
                "description": "Generate high-resolution realistic images locally using SDXL (Stable Diffusion XL) from /home/lone-warrior/sdxl.",
                "parameters": {"prompt": "string"}
            },
            "python_interpreter": {
                "name": "python_interpreter",
                "description": "Executes sandboxed Python code for calculations and data transforms.",
                "parameters": {"code": "string"}
            },
            "extract_url_content": {
                "name": "extract_url_content",
                "description": "Extracts the full readable markdown text content of a given web URL using OpenSERP browser rendering.",
                "parameters": {"url": "string"}
            }
        }

    def list_tools(self) -> List[Dict[str, Any]]:
        return list(self.tools.values())

    async def execute_tool(self, name: str, args: Dict[str, Any], offline_mode: bool = False) -> Dict[str, Any]:
        if name == "calculator":
            expr = args.get("expression", "")
            try:
                allowed_names = {"__builtins__": None, "math": math, "abs": abs, "round": round}
                result = eval(expr, allowed_names)
                return {"result": result, "status": "success"}
            except Exception as e:
                return {"error": str(e), "status": "error"}

        elif name == "get_current_time":
            now = datetime.datetime.now()
            return {
                "datetime": now.strftime("%Y-%m-%d %H:%M:%S"),
                "iso": now.isoformat(),
                "day": now.strftime("%A"),
                "status": "success"
            }

        elif name == "system_info":
            try:
                mem = psutil.virtual_memory()
                ram_info = f"{mem.used / (1024**3):.1f}GB / {mem.total / (1024**3):.1f}GB ({mem.percent}%)"
            except Exception:
                ram_info = "Available"

            gpu_info = "NVIDIA RTX 3050 Mobile (4GB VRAM)"
            try:
                res = subprocess.run(["nvidia-smi", "--query-gpu=memory.used,memory.total", "--format=csv,noheader,nounits"], capture_output=True, text=True)
                if res.returncode == 0:
                    gpu_info += f" - VRAM: {res.stdout.strip()} MiB"
            except Exception:
                pass

            return {
                "os": "Ubuntu 24.04 LTS (Linux)",
                "gpu": gpu_info,
                "ram": ram_info,
                "status": "success"
            }

        elif name == "generate_sdxl_image":
            prompt = args.get("prompt", "").strip()
            if not prompt:
                return {"error": "Prompt cannot be empty", "status": "error"}
            from backend.app.image_generation.sdxl_service import sdxl_service
            res = await sdxl_service.generate_image(prompt=prompt)
            return res

        elif name in ["searxng_search", "web_search", "openserp_search"]:
            if offline_mode:
                return {"error": "Web search is disabled in Offline Mode.", "status": "error"}
            query = args.get("query", "").strip()
            if not query:
                return {"error": "Empty query", "status": "error"}

            def _clean_and_filter_results(items: list, limit: int = 5) -> list:
                """Clean, deduplicate, and filter low-quality/spoofed/clickbait search items."""
                cleaned = []
                seen_urls = set()
                noise_patterns = [
                    r'this content isn\'t available',
                    r'skip video',
                    r'sign in to continue',
                    r'enable javascript',
                    r'captcha',
                    r'are you a robot'
                ]
                for item in items:
                    title = item.get("title", "").strip()
                    url = item.get("url", "").strip()
                    content = item.get("content", item.get("snippet", item.get("description", ""))).strip()
                    
                    if not title or not url or url in seen_urls:
                        continue
                    
                    # Skip empty or error content
                    if any(re.search(pat, content, re.IGNORECASE) for pat in noise_patterns):
                        continue

                    # Demote or skip broken redirect URLs if real ones exist
                    if "google.com/goto?" in url and "url=" in url:
                        # Extract real target URL from Google redirect if possible
                        m = re.search(r'[?&]url=([^&]+)', url)
                        if m:
                            import urllib.parse
                            url = urllib.parse.unquote(m.group(1))

                    seen_urls.add(url)
                    cleaned.append({
                        "title": title,
                        "url": url,
                        "content": content
                    })
                    if len(cleaned) >= limit:
                        break
                return cleaned

            # ── 1. PRIMARY: OpenSERP with Real Browser Rendering (localhost:7000) ──
            try:
                async with httpx.AsyncClient(timeout=8.0) as client:
                    open_res = await client.get(f"http://localhost:7000/google/search", params={"text": query})
                    if open_res.status_code == 200:
                        open_data = open_res.json()
                        raw_items = open_data.get("results", [])
                        
                        # Also harvest direct ai_summary or featured snippets from serp_features if present
                        features = open_data.get("serp_features", [])
                        for feat in features:
                            if feat.get("text") and feat.get("type") in ["ai_summary", "featured_snippet"]:
                                raw_items.insert(0, {
                                    "title": f"Google Featured Answer: {feat.get('title', 'Direct Fact')}",
                                    "url": "https://google.com/search",
                                    "description": feat.get("text", "")[:450]
                                })

                        results = _clean_and_filter_results(raw_items, limit=5)
                        if results:
                            return {"results": results, "status": "success", "engine": "OpenSERP"}
            except Exception as e:
                # OpenSERP fallback
                pass

            # ── 2. SECONDARY: SearXNG Local Metasearch (localhost:8888) ──
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    params = {"q": query, "format": "json"}
                    res = await client.get(f"{settings.SEARXNG_URL}/search", params=params)
                    if res.status_code == 200:
                        data = res.json()
                        raw_results = data.get("results", [])
                        results = _clean_and_filter_results(raw_results, limit=5)
                        if results:
                            return {"results": results, "status": "success", "engine": "SearXNG"}
            except Exception:
                pass

            # ── 3. TERTIARY: DuckDuckGo Direct Fallback (No Docker Required) ──
            try:
                from duckduckgo_search import DDGS
                with DDGS() as ddgs:
                    ddg_items = list(ddgs.text(query, max_results=6))
                    if ddg_items:
                        raw_results = [
                            {"title": r.get("title"), "url": r.get("href"), "content": r.get("body")}
                            for r in ddg_items
                        ]
                        results = _clean_and_filter_results(raw_results, limit=5)
                        if results:
                            return {"results": results, "status": "success", "engine": "DuckDuckGo"}
            except Exception as ddg_err:
                return {"error": f"All search providers unavailable: {str(ddg_err)}", "status": "error"}

            return {"error": "No search results found.", "status": "error"}

        elif name == "searxng_image_search":
            if offline_mode:
                return {"error": "Image search is disabled in Offline Mode.", "status": "error"}
            query = args.get("query", "").strip()
            if not query:
                return {"error": "Empty query", "status": "error"}
            
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    params = {"q": query, "categories": "images", "format": "json"}
                    res = await client.get(f"{settings.SEARXNG_URL}/search", params=params)
                    if res.status_code == 200:
                        data = res.json()
                        raw_results = data.get("results", [])[:6]
                        results = [
                            {
                                "title": r.get("title"),
                                "img_src": r.get("img_src"),
                                "url": r.get("url")
                            }
                            for r in raw_results if r.get("img_src")
                        ]
                        return {"results": results, "status": "success", "engine": "SearXNG Images"}
                    else:
                        return {"error": f"SearXNG responded with HTTP {res.status_code}", "status": "error"}
            except Exception as e:
                return {"error": f"SearXNG image search error: {str(e)}", "status": "error"}

        elif name == "python_interpreter":
            code = args.get("code", "")
            banned = ["import os", "import sys", "import subprocess", "open(", "eval(", "exec(", "__import__", "shutil"]
            if any(b in code for b in banned):
                return {"error": "Execution rejected: code contains restricted system calls.", "status": "error"}
            
            try:
                restricted_globals = {"math": math, "json": json}
                loc = {}
                exec(code, restricted_globals, loc)
                out = {k: v for k, v in loc.items() if not k.startswith("_")}
                return {"output": out, "status": "success"}
            except Exception as e:
                return {"error": str(e), "status": "error"}

        elif name == "extract_url_content":
            url = args.get("url", "").strip()
            if not url:
                return {"error": "URL cannot be empty", "status": "error"}
            if not url.startswith("http://") and not url.startswith("https://"):
                url = f"https://{url}"

            # 0. YouTube Video URL Transcript Extraction (Fast, 0 API key required, 100% lightweight)
            yt_match = re.search(r'(?:youtube\.com/(?:watch\?v=|embed/|shorts/)|youtu\.be/)([a-zA-Z0-9_-]{11})', url)
            if yt_match:
                video_id = yt_match.group(1)
                try:
                    from youtube_transcript_api import YouTubeTranscriptApi
                    api = YouTubeTranscriptApi()
                    fetched = api.fetch(video_id)
                    snippets = fetched.snippets if hasattr(fetched, "snippets") else fetched
                    
                    transcript_lines = []
                    # Group every 4-5 snippets into coherent, readable timestamped paragraphs
                    for i in range(0, len(snippets), 4):
                        batch = snippets[i:i+4]
                        first_s = batch[0]
                        start_time = getattr(first_s, "start", 0) if hasattr(first_s, "start") else first_s.get("start", 0)
                        minutes = int(start_time // 60)
                        seconds = int(start_time % 60)
                        batch_text = " ".join([getattr(b, "text", "") if hasattr(b, "text") else b.get("text", "") for b in batch]).strip()
                        if batch_text:
                            transcript_lines.append(f"[{minutes:02d}:{seconds:02d}] {batch_text}")

                    transcript_text = "\n\n".join(transcript_lines)
                    if transcript_text:
                        content_block = (
                            f"YOUTUBE VIDEO TRANSCRIPT (Video ID: `{video_id}`, Source: {url}):\n\n"
                            f"{transcript_text[:12000]}"
                        )
                        return {
                            "content": content_block,
                            "url": url,
                            "status": "success",
                            "engine": "YouTubeTranscript",
                            "video_id": video_id
                        }
                except Exception as yt_err:
                    print(f"YouTube transcript extraction notice ({video_id}): {yt_err}")
                    # If captions disabled or private, continue to standard web scraping

            # 1. MediaWiki / Fandom / Wikipedia Action API Direct Extraction
            # Fandom and Wikipedia wikis provide rich JSON endpoints with full article text that bypass Cloudflare 403 blocks completely
            fandom_match = re.search(r'https?://([^/]+)/wiki/([^/?#]+)', url)
            if fandom_match:
                domain, page_title = fandom_match.group(1), fandom_match.group(2)
                api_url = f"https://{domain}/api.php?action=parse&page={page_title}&prop=text&format=json"
                try:
                    from bs4 import BeautifulSoup
                    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
                    async with httpx.AsyncClient(timeout=15.0) as client:
                        api_res = await client.get(api_url, headers=headers)
                        if api_res.status_code == 200:
                            data = api_res.json()
                            html_text = data.get("parse", {}).get("text", {}).get("*", "")
                            if html_text:
                                soup = BeautifulSoup(html_text, "html.parser")
                                
                                # Extract Infobox key facts summary at the very top (Status, Killed By, Death, Affiliations, etc.)
                                infobox_facts = []
                                for row in soup.find_all(['div', 'tr'], class_=re.compile(r'(pi-item|infobox)')):
                                    label = row.find(class_=re.compile(r'(pi-data-label|label)'))
                                    val = row.find(class_=re.compile(r'(pi-data-value|value)'))
                                    if label and val:
                                        infobox_facts.append(f"{label.get_text(strip=True)}: {val.get_text(separator=' ', strip=True)}")
                                
                                infobox_header = ""
                                if infobox_facts:
                                    infobox_header = "KEY PROFILE FACTS / INFOBOX:\n" + "\n".join([f"- {f}" for f in infobox_facts]) + "\n\n"

                                for el in soup(["script", "style", "nav", "noscript"]):
                                    el.decompose()
                                extracted = soup.get_text(separator=" ", strip=True)
                                if len(extracted) > 100:
                                    full_content = infobox_header + extracted
                                    return {"content": full_content[:15000], "url": url, "status": "success", "engine": "MediaWikiAPI"}
                except Exception as ex:
                    print(f"MediaWiki API extraction error: {ex}")

            # 2. Browser Impersonation via curl_cffi (bypasses Cloudflare 403 / anti-bot on other news & web sites)
            try:
                from curl_cffi.requests import AsyncSession
                from bs4 import BeautifulSoup
                import trafilatura

                async with AsyncSession() as session:
                    res = await session.get(url, impersonate="chrome120", timeout=15.0)
                    if res.status_code == 200 and len(res.text.strip()) > 100:
                        soup = BeautifulSoup(res.text, "html.parser")
                        article_elem = soup.find("div", class_="mw-parser-output") or soup.find("article") or soup.find("main")
                        if article_elem:
                            for el in article_elem(["script", "style", "nav", "noscript"]):
                                el.decompose()
                            extracted_text = article_elem.get_text(separator=" ", strip=True)
                            if len(extracted_text) > 100:
                                return {"content": extracted_text[:14000], "url": url, "status": "success", "engine": "BrowserImpersonation"}

                        clean_text = trafilatura.extract(res.text, include_comments=False, include_tables=True)
                        if clean_text and len(clean_text) > 100:
                            return {"content": clean_text[:14000], "url": url, "status": "success", "engine": "Trafilatura"}

                        for element in soup(["script", "style", "nav", "footer", "header", "aside"]):
                            element.decompose()
                        text = soup.get_text(separator="\n", strip=True)
                        if len(text) > 100:
                            return {"content": text[:14000], "url": url, "status": "success", "engine": "BeautifulSoup"}
            except Exception as e:
                print(f"curl_cffi extraction notice: {e}")

            # 2. Secondary: Direct HTTP fetch fallback with standard headers
            try:
                from bs4 import BeautifulSoup
                import trafilatura
                headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"}
                async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as client:
                    res = await client.get(url, headers=headers)
                    if res.status_code == 200:
                        soup = BeautifulSoup(res.text, "html.parser")
                        for element in soup(["script", "style", "nav", "footer", "header", "aside"]):
                            element.decompose()
                        text = soup.get_text(separator="\n", strip=True)
                        if len(text) > 100:
                            return {"content": text[:12000], "url": url, "status": "success", "engine": "DirectFetch"}
            except Exception as e:
                print(f"DirectFetch extraction notice: {e}")

            # 3. Tertiary: OpenSERP real headless extraction
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    open_res = await client.get("http://localhost:7000/extract", params={"url": url, "format": "markdown"})
                    if open_res.status_code == 200 and len(open_res.text.strip()) > 50:
                        return {"content": open_res.text.strip()[:10000], "url": url, "status": "success", "engine": "OpenSERP"}
            except Exception:
                pass

            return {"error": "Page could not be parsed", "status": "error"}

        return {"error": f"Tool '{name}' not found", "status": "error"}

tool_registry = ToolRegistry()
