
#!/usr/bin/env python3
"""
Mock Ollama Service for development testing
"""

import uvicorn
from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

app = FastAPI(title="Mock Ollama Service", version="1.0.0")

class ChatRequest(BaseModel):
    model: str
    messages: List[Dict[str, str]]
    stream: Optional[bool] = False

@app.get("/api/tags")
async def list_models():
    return {
        "models": [
            {"name": "llama3.1", "size": 4000000000, "details": {"families": ["llama"]}},
            {"name": "codellama", "size": 3800000000, "details": {"families": ["llama"]}},
            {"name": "mistral", "size": 4100000000, "details": {"families": ["mistral"]}}
        ]
    }

@app.post("/api/chat")
async def chat(request: ChatRequest):
    last_message = request.messages[-1]["content"] if request.messages else ""
    
    return {
        "model": request.model,
        "created_at": "2025-08-01T13:00:00Z",
        "message": {
            "role": "assistant",
            "content": f"Mock LLM response using {request.model}: {last_message[:100]}..."
        },
        "done": True
    }

@app.get("/api/version")
async def version():
    return {"version": "0.1.0-mock"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=11434)
