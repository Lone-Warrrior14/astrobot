import math
import datetime
import subprocess
import os
import json
import psutil
import httpx
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

        elif name in ["searxng_search", "web_search"]:
            if offline_mode:
                return {"error": "Web search is disabled in Offline Mode.", "status": "error"}
            query = args.get("query", "").strip()
            if not query:
                return {"error": "Empty query", "status": "error"}
            
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    params = {"q": query, "format": "json"}
                    res = await client.get(f"{settings.SEARXNG_URL}/search", params=params)
                    if res.status_code == 200:
                        data = res.json()
                        raw_results = data.get("results", [])[:4]
                        results = [
                            {"title": r.get("title"), "url": r.get("url"), "content": r.get("content")}
                            for r in raw_results
                        ]
                        return {"results": results, "status": "success", "engine": "SearXNG"}
                    else:
                        return {"error": f"SearXNG responded with HTTP {res.status_code}", "status": "error"}
            except Exception as e:
                return {"error": f"SearXNG search error: {str(e)}", "status": "error"}

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

        return {"error": f"Tool '{name}' not found", "status": "error"}

tool_registry = ToolRegistry()
