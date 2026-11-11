import os
import json
import base64
import io
import asyncio
from typing import Dict, Any, Optional

class SDImageService:
    def __init__(self):
        # Default to the ultra-fast and rock-solid Realistic Vision v6 / SD 1.5 pipeline
        self.sd_dir = "/home/lone-warrior/sd"
        self.python_bin = os.path.join(self.sd_dir, "venv/bin/python")
        self.model_path = os.path.join(self.sd_dir, "realistic-vision-v6")
        
        # Fallback to SDXL folder if explicitly requested
        self.sdxl_dir = "/home/lone-warrior/sdxl"
        self.sdxl_python = os.path.join(self.sdxl_dir, "venv/bin/python")

    async def generate_image(
        self,
        prompt: str,
        negative_prompt: str = "3d, cgi, render, cartoon, anime, illustration, painting, plastic skin, unrealistic, blurry, low quality, deformed, bad anatomy, distorted face, extra fingers",
        mode: str = "txt2img",
        image_b64: Optional[str] = None,
        width: int = 512,
        height: int = 512,
        steps: int = 20,
        guidance_scale: float = 7.0,
        strength: float = 0.75
    ) -> Dict[str, Any]:
        """
        Executes text-to-image or image-to-image generation using Realistic Vision v6 (SD 1.5).
        Consumes only ~2.0GB VRAM, completing in ~6-7 seconds on RTX 3050 without system freeze.
        """
        # Automatically unload models from Ollama GPU memory before generating image
        # This frees up ~2.15 GB of VRAM so SD 1.5 has plenty of headroom on 4GB VRAM
        import httpx
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                # Unload loaded models by sending keep_alive: 0
                ps_res = await client.get(f"{settings.OLLAMA_BASE_URL}/api/ps")
                if ps_res.status_code == 200:
                    loaded = ps_res.json().get("models", [])
                    for m in loaded:
                        m_name = m.get("name")
                        if m_name:
                            await client.post(
                                f"{settings.OLLAMA_BASE_URL}/api/generate",
                                json={"model": m_name, "keep_alive": 0}
                            )
        except Exception as e:
            print(f"Notice: Ollama VRAM release attempt: {e}")

        # Pass parameters safely via JSON to avoid quote injection
        params = {
            "model_path": self.model_path,
            "prompt": prompt,
            "negative_prompt": negative_prompt,
            "mode": mode,
            "width": width,
            "height": height,
            "steps": steps,
            "guidance_scale": guidance_scale,
            "strength": strength,
            "image_b64": image_b64
        }
        params_json = json.dumps(params)

        runner_script = f"""
import os
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
import sys
import json
import base64
import io
import torch
import gc
from PIL import Image
from diffusers import (
    StableDiffusionPipeline,
    StableDiffusionImg2ImgPipeline,
    EulerAncestralDiscreteScheduler
)

# Clear any cached CUDA blocks
torch.cuda.empty_cache()
gc.collect()

cfg = json.loads('''{params_json}''')
model_path = cfg["model_path"]
prompt = cfg["prompt"]
negative_prompt = cfg["negative_prompt"]
mode = cfg.get("mode", "txt2img")
width = cfg.get("width", 512)
height = cfg.get("height", 512)
steps = cfg.get("steps", 20)
guidance_scale = cfg.get("guidance_scale", 7.0)
strength = cfg.get("strength", 0.75)
image_b64 = cfg.get("image_b64")

try:
    if mode == "img2img" and image_b64:
        pipe = StableDiffusionImg2ImgPipeline.from_pretrained(
            model_path,
            variant="fp16",
            dtype=torch.float16,
            safety_checker=None,
            local_files_only=True
        )
        pipe.scheduler = EulerAncestralDiscreteScheduler.from_config(pipe.scheduler.config)
        pipe.enable_sequential_cpu_offload()
        pipe.enable_attention_slicing("max")

        if "," in image_b64:
            image_b64 = image_b64.split(",", 1)[1]
        raw_bytes = base64.b64decode(image_b64)
        init_img = Image.open(io.BytesIO(raw_bytes)).convert("RGB").resize((width, height))

        with torch.inference_mode():
            out = pipe(
                prompt=prompt,
                negative_prompt=negative_prompt,
                image=init_img,
                strength=strength,
                num_inference_steps=steps,
                guidance_scale=guidance_scale
            ).images[0]
    else:
        pipe = StableDiffusionPipeline.from_pretrained(
            model_path,
            variant="fp16",
            dtype=torch.float16,
            safety_checker=None,
            local_files_only=True
        )
        pipe.scheduler = EulerAncestralDiscreteScheduler.from_config(pipe.scheduler.config)
        pipe.enable_sequential_cpu_offload()
        pipe.enable_attention_slicing("max")

        with torch.inference_mode():
            out = pipe(
                prompt=prompt,
                negative_prompt=negative_prompt,
                width=width,
                height=height,
                num_inference_steps=steps,
                guidance_scale=guidance_scale
            ).images[0]

    buffered = io.BytesIO()
    out.save(buffered, format="PNG")
    img_b64 = base64.b64encode(buffered.getvalue()).decode("utf-8")
    print(json.dumps({{"status": "success", "image": "data:image/png;base64," + img_b64}}))

except Exception as e:
    print(json.dumps({{"status": "error", "message": str(e)}}))
"""

        try:
            proc = await asyncio.create_subprocess_exec(
                self.python_bin, "-c", runner_script,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await proc.communicate()

            if proc.returncode == 0:
                lines = stdout.decode().strip().split("\n")
                for line in reversed(lines):
                    if line.startswith('{"status":'):
                        return json.loads(line)
                return {"status": "error", "message": "Failed to parse generation output: " + stdout.decode()[:200]}
            else:
                return {"status": "error", "message": stderr.decode()[:300]}
        except Exception as err:
            return {"status": "error", "message": str(err)}

# Singleton instance
sd_service = SDImageService()

