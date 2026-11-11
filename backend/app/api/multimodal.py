import os
import base64
import uuid
import shutil
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.app.database.session import get_db
from backend.app.models.entities import Conversation, Message
from backend.app.core.config import settings
from backend.app.audio.service import audio_service
from backend.app.image_generation.sd_service import sd_service

router = APIRouter()

# ── 1. Voice Input (Speech-To-Text via Local Faster-Whisper) ──
@router.post("/audio/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    os.makedirs(settings.AUDIO_DIR, exist_ok=True)
    temp_path = os.path.join(settings.AUDIO_DIR, f"{uuid.uuid4()}_{file.filename}")
    
    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    try:
        text = audio_service.transcribe(temp_path)
        return {"text": text, "status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription error: {str(e)}")
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

# ── 2. Image Understanding (Local Vision with Gemma 3 / Qwen2.5-VL) ──
@router.post("/vision/analyze")
async def analyze_image(
    prompt: str = Form("Describe what is in this image in detail."),
    conversation_id: Optional[str] = Form(None),
    model: str = Form("gemma3:latest"),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    os.makedirs(settings.IMAGES_DIR, exist_ok=True)
    img_id = str(uuid.uuid4())
    img_path = os.path.join(settings.IMAGES_DIR, f"{img_id}_{file.filename}")

    with open(img_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    with open(img_path, "rb") as f:
        img_b64 = base64.b64encode(f.read()).decode("utf-8")

    import httpx
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            res = await client.post(
                f"{settings.OLLAMA_BASE_URL}/api/chat",
                json={
                    "model": model,
                    "messages": [{
                        "role": "user",
                        "content": prompt,
                        "images": [img_b64]
                    }],
                    "stream": False
                }
            )
            if res.status_code == 200:
                answer = res.json().get("message", {}).get("content", "")
                
                if conversation_id:
                    conv_res = await db.execute(select(Conversation).filter(Conversation.id == conversation_id))
                    conv = conv_res.scalar_one_or_none()
                    if conv:
                        db.add(Message(id=str(uuid.uuid4()), conversation_id=conv.id, role="user", content=f"[Image Upload: {file.filename}] {prompt}"))
                        db.add(Message(id=str(uuid.uuid4()), conversation_id=conv.id, role="assistant", content=answer))
                        await db.commit()

                return {"analysis": answer, "model": model, "status": "success"}
            else:
                raise HTTPException(status_code=500, detail=f"Ollama vision error: HTTP {res.status_code}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Vision inference failed: {str(e)}")

# ── 3. Image Generation (Realistic Vision v6 / SD from /home/lone-warrior/sd) ──
@router.post("/images/generate")
async def generate_image(data: dict = Body(...), db: AsyncSession = Depends(get_db)):
    prompt = data.get("prompt", "").strip()
    conversation_id = data.get("conversation_id")
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt is required")

    res = await sd_service.generate_image(
        prompt=prompt,
        negative_prompt=data.get("negative_prompt", "3d, cgi, render, cartoon, anime, illustration, painting, plastic skin, unrealistic, blurry, low quality, deformed, bad anatomy"),
        mode=data.get("mode", "txt2img"),
        image_b64=data.get("image_b64"),
        width=int(data.get("width", 512)),
        height=int(data.get("height", 512)),
        steps=int(data.get("steps", 20)),
        guidance_scale=float(data.get("guidance_scale", 7.0))
    )

    if res.get("status") == "success":
        # Save image to storage/images
        img_data_url = res.get("image", "")
        img_filename = f"sd_{uuid.uuid4()}.png"
        img_save_path = os.path.join(settings.IMAGES_DIR, img_filename)
        os.makedirs(settings.IMAGES_DIR, exist_ok=True)
        
        if "," in img_data_url:
            raw_b64 = img_data_url.split(",", 1)[1]
            with open(img_save_path, "wb") as f:
                f.write(base64.b64decode(raw_b64))

        # If conversation_id provided, record into chat
        if conversation_id:
            conv_res = await db.execute(select(Conversation).filter(Conversation.id == conversation_id))
            conv = conv_res.scalar_one_or_none()
            if conv:
                db.add(Message(id=str(uuid.uuid4()), conversation_id=conv.id, role="user", content=f"Generate image: {prompt}"))
                markdown_img = f"![{prompt}]({img_data_url})\n\n*Generated locally via Realistic Vision v6 (Safe VRAM Mode: 2.0GB, ~6s)*"
                db.add(Message(id=str(uuid.uuid4()), conversation_id=conv.id, role="assistant", content=markdown_img))
                await db.commit()

        return {
            "status": "success",
            "image": img_data_url,
            "filename": img_filename,
            "prompt": prompt
        }
    else:
        raise HTTPException(status_code=500, detail=res.get("message", "Generation failed"))
