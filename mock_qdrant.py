
#!/usr/bin/env python3
"""
Mock Qdrant Service for development testing
"""

import uvicorn
from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import uuid
import numpy as np

app = FastAPI(title="Mock Qdrant Service", version="1.0.0")

# Простое хранилище для мока
collections = {}
points = {}

class Collection(BaseModel):
    name: str
    vectors: Dict[str, Any]

class Point(BaseModel):
    id: str
    vector: List[float]
    payload: Optional[Dict[str, Any]] = None

@app.get("/health")
async def health():
    return {"status": "green", "version": "1.0.0-mock"}

@app.get("/collections")
async def list_collections():
    return {"result": {"collections": list(collections.keys())}}

@app.put("/collections/{collection_name}")
async def create_collection(collection_name: str, collection: Dict[str, Any]):
    collections[collection_name] = collection
    points[collection_name] = {}
    return {"result": True, "status": "ok"}

@app.post("/collections/{collection_name}/points")
async def upsert_points(collection_name: str, request: Dict[str, Any]):
    if collection_name not in points:
        points[collection_name] = {}
    
    for point in request.get("points", []):
        point_id = str(point.get("id", str(uuid.uuid4())))
        points[collection_name][point_id] = point
    
    return {"result": {"operation_id": 0, "status": "completed"}}

@app.post("/collections/{collection_name}/points/search")
async def search_points(collection_name: str, request: Dict[str, Any]):
    # Мок поиска - возвращаем случайные результаты
    return {
        "result": [
            {
                "id": "mock_point_1",
                "version": 1,
                "score": 0.95,
                "payload": {"text": "Mock search result 1", "source": "mock_doc.pdf"}
            },
            {
                "id": "mock_point_2", 
                "version": 1,
                "score": 0.87,
                "payload": {"text": "Mock search result 2", "source": "mock_doc2.pdf"}
            }
        ]
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=6333)
