import os
import wave
import uuid
from typing import Optional
from faster_whisper import WhisperModel
from piper import PiperVoice

class AudioService:
    def __init__(self):
        self._whisper: Optional[WhisperModel] = None
        self._piper: Optional[PiperVoice] = None
        self.whisper_model_size = "base.en"
        self.piper_model_path = "/home/lone-warrior/chat/storage/piper/en_US-lessac-medium.onnx"

    @property
    def whisper(self) -> WhisperModel:
        if self._whisper is None:
            try:
                self._whisper = WhisperModel(self.whisper_model_size, device="cuda", compute_type="float16")
            except Exception:
                self._whisper = WhisperModel(self.whisper_model_size, device="cpu", compute_type="int8")
        return self._whisper

    @property
    def piper(self) -> PiperVoice:
        if self._piper is None:
            if os.path.exists(self.piper_model_path):
                self._piper = PiperVoice.load(self.piper_model_path)
            else:
                raise RuntimeError(f"Piper model not found at {self.piper_model_path}")
        return self._piper

    def transcribe(self, audio_file_path: str) -> str:
        segments, _ = self.whisper.transcribe(audio_file_path, beam_size=5)
        text = " ".join([segment.text for segment in segments]).strip()
        return text

    def synthesize_speech(self, text: str, output_path: str):
        with wave.open(output_path, "wb") as wav_file:
            self.piper.synthesize_wav(text, wav_file)

audio_service = AudioService()
