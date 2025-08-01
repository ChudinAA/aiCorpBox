
#!/usr/bin/env python3
"""
Mock Agents Service for development testing
"""

import uvicorn
from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional, Dict, Any

app = FastAPI(title="Mock Agents Service", version="1.0.0")

class AgentRequest(BaseModel):
    task: str
    agent_type: str = "general"
    context: Optional[Dict[str, Any]] = None

@app.get("/health")
async def health():
    return {"status": "healthy", "service": "agents", "mode": "mock"}

@app.post("/execute")
async def execute_task(request: AgentRequest):
    return {
        "result": f"Mock agent executed: {request.task}",
        "agent_type": request.agent_type,
        "steps": [
            "1. Analyzed task",
            "2. Selected tools",
            "3. Executed workflow",
            "4. Generated response"
        ],
        "success": True,
        "service": "agents_mock"
    }

@app.get("/agents")
async def list_agents():
    return {
        "agents": [
            {"name": "database_agent", "status": "ready", "capabilities": ["sql", "query"]},
            {"name": "document_agent", "status": "ready", "capabilities": ["parse", "analyze"]},
            {"name": "general_agent", "status": "ready", "capabilities": ["reasoning", "planning"]}
        ]
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8002)
