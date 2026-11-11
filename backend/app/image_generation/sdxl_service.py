import os
import json
import base64
import io
import asyncio
from typing import Dict, Any, Optional

class SDXLService:
    def __init__(self):
        self.sdxl_dir = "/home/lone-warrior/sdxl"
        self.python_bin = os.path.join(self.sdxl_dir, "venv/bin/python")
        self.server_port = 7860
        self.server_url = f"http://127.0.0.1:{self.server_port}"

    async def is_server_running(self) -> bool:
        import httpx
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                res = await client.get(self.server_url)
                return res.status_code == 200
        except Exception:
            return False

    async def generate_image(
        self,
        prompt: str,
        negative_prompt: str = "cgi, 3d render, plastic skin, smooth face, doll, anime, illustration, painting, drawing, cartoon, deformed, bad anatomy",
        mode: str = "txt2img",
        image_b64: Optional[str] = None,
        width: int = 768,
        height: int = 1024,
        steps: int = 20,
        guidance_scale: float = 6.0,
        strength: float = 0.75
    ) -> Dict[str, Any]:
        """
        Executes text-to-image or image-to-image generation using the local SDXL pipeline.
        Optimized specifically for 4GB RTX 3050 VRAM using sequential CPU offloading and attention slicing.
        """
        import httpx
        
        # If the SDXL standalone server is running, use its fast persistent endpoint
        if await self.is_server_running():
            try:
                async with httpx.AsyncClient(timeout=180.0) as client:
                    payload = {
                        "mode": mode,
                        "prompt": prompt,
                        "negative_prompt": negative_prompt,
                        "boost_photoreal": True,
                        "steps": steps,
                        "width": width,
                        "height": height,
                        "strength": strength,
                        "guidance_scale": guidance_scale,
                        "image_data": image_b64
                    }
                    res = await client.post(f"{self.server_url}/api/generate", json=payload)
                    if res.status_code == 200:
                        return res.json()
            except Exception as e:
                print(f"SDXL persistent server query failed, falling back to direct runner: {e}")

        # Direct on-demand generation script run inside sdxl virtualenv
        runner_script = f"""
import os
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
import torch
import json
import base64
import io
from PIL import Image
from diffusers import (
    StableDiffusionXLPipeline,
    StableDiffusionXLImg2ImgPipeline,
    DPMSolverMultistepScheduler,
)

MODEL_ID = "stabilityai/stable-diffusion-xl-base-1.0"
pipe_txt = StableDiffusionXLPipeline.from_pretrained(
    MODEL_ID,
    dtype=torch.float16,
    use_safetensors=True,
    local_files_only=True,
)
pipe_txt.scheduler = DPMSolverMultistepScheduler.from_config(
    pipe_txt.scheduler.config,
    use_karras_sigmas=True,
    algorithm_type="sde-dpmsolver++",
)
pipe_txt.enable_sequential_cpu_offload()
pipe_txt.enable_attention_slicing("max")
pipe_txt.vae.enable_slicing()
pipe_txt.vae.enable_tiling()

full_prompt = "{prompt}" + ", RAW photo, 35mm photograph, DSLR, realistic skin texture, natural lighting"
negative_prompt = "{negative_prompt}"

with torch.inference_mode():
    image = pipe_txt(
        prompt=full_prompt,
        negative_prompt=negative_prompt,
        width={width},
        height={height},
        num_inference_steps={steps},
        guidance_scale={guidance_scale},
    ).images[0]

buffered = io.BytesIO()
image.save(buffered, format="PNG")
img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
print(json.dumps({{"status": "success", "image": "data:image/png;base64," + img_str}}))
"""
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
            return {"status": "error", "message": "Failed to parse generation output"}
        else:
            return {"status": "error", "message": stderr.decode()}

sdxl_service = SDXLService()

