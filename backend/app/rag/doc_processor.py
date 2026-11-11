import os
import re
from typing import List, Dict, Any
import pypdf
import docx
import pandas as pd
from backend.app.rag.vector_store import vector_store

class DocumentProcessor:
    @staticmethod
    def extract_text(file_path: str, file_type: str) -> str:
        text = ""
        file_type = file_type.lower()
        
        if file_type == "pdf" or file_path.endswith(".pdf"):
            reader = pypdf.PdfReader(file_path)
            for page in reader.pages:
                t = page.extract_text()
                if t:
                    text += t + "\n"
                    
        elif file_type in ["docx", "doc"] or file_path.endswith(".docx"):
            doc = docx.Document(file_path)
            for p in doc.paragraphs:
                text += p.text + "\n"
                
        elif file_type in ["xlsx", "xls", "csv"] or file_path.endswith((".xlsx", ".csv")):
            if file_path.endswith(".csv"):
                df = pd.read_csv(file_path)
            else:
                df = pd.read_excel(file_path)
            text = df.to_string()
            
        else: # txt, md, code files, etc.
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                text = f.read()
                
        return text

    @staticmethod
    def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> List[str]:
        text = re.sub(r'\s+', ' ', text).strip()
        chunks = []
        start = 0
        while start < len(text):
            end = start + chunk_size
            chunk = text[start:end]
            if chunk:
                chunks.append(chunk)
            start += (chunk_size - overlap)
        return chunks

    @classmethod
    async def process_and_index(cls, doc_id: str, conversation_id: str, file_path: str, file_type: str, metadata: Dict[str, Any]) -> int:
        text = cls.extract_text(file_path, file_type)
        if not text.strip():
            return 0
            
        chunks = cls.chunk_text(text)
        for i, chunk in enumerate(chunks):
            await vector_store.insert_document_chunk(
                doc_id=doc_id,
                conversation_id=conversation_id,
                chunk_index=i,
                text=chunk,
                metadata={**metadata, "doc_id": doc_id, "conversation_id": conversation_id}
            )
        return len(chunks)

doc_processor = DocumentProcessor()
