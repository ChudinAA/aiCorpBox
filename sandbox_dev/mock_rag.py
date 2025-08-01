#!/usr/bin/env python3
"""
Mock RAG Service for development testing
"""

import uvicorn
from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional, List

app = FastAPI(title="Mock RAG Service", version="1.0.0")

# Mock configuration
config = {
    "vector_store": {"collection_name": "documents"},
    "embeddings": {"model": "all-MiniLM-L6-v2", "dimension": 384},
    "llm": {"model": "llama3.1", "temperature": 0.7},
    "text_processing": {"chunk_size": 512, "chunk_overlap": 50},
    "retrieval": {"top_k": 5}
}

class QueryRequest(BaseModel):
    query: str
    session_id: Optional[str] = None

class DocumentUpload(BaseModel):
    filename: str
    content: str
    content_type: str

@app.get("/health")
async def health():
    return {"status": "healthy", "service": "rag", "mode": "mock"}

@app.post("/query")
async def query_documents(request: QueryRequest):
    return {
        "response": f"Mock RAG response for: {request.query}",
        "sources": ["mock_document.pdf"],
        "confidence": 0.85,
        "service": "rag_mock"
    }

@app.post("/documents/upload")
async def upload_document(doc: DocumentUpload):
    return {
        "message": f"Mock uploaded: {doc.filename}",
        "document_id": "mock_doc_123",
        "status": "processed"
    }

@app.get("/documents")
async def list_documents():
    return {
        "documents": [
            {"id": "mock_doc_123", "filename": "test.pdf", "status": "processed"},
            {"id": "mock_doc_456", "filename": "manual.docx", "status": "processed"}
        ]
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)