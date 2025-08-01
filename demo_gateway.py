#!/usr/bin/env python3
"""
AI Box Demo Gateway Service
A simplified version of the AI Box gateway that demonstrates the platform's capabilities
without requiring Docker dependencies like Ollama, Qdrant, etc.
"""

import os
import sys
import json
import logging
import asyncio
from datetime import datetime
from typing import Dict, List, Optional, Any
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import structlog
import sqlalchemy
from sqlalchemy import create_engine, Column, Integer, String, DateTime, Text, Boolean
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from prometheus_client import Counter, Histogram, Gauge, generate_latest
import psycopg2

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = structlog.get_logger()

# Database setup
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://neondb_owner:password@localhost:5432/main")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Prometheus metrics (with registry check to avoid conflicts)
try:
    from prometheus_client import REGISTRY, CollectorRegistry

    # Check if metrics already exist
    existing_metrics = {}
    for collector in list(REGISTRY._collector_to_names.keys()):
        if hasattr(collector, '_name'):
            existing_metrics[collector._name] = collector

    if 'aibox_requests_total' in existing_metrics:
        requests_total = existing_metrics['aibox_requests_total']
    else:
        requests_total = Counter('aibox_requests_total', 'Total requests', ['method', 'endpoint'])

    if 'aibox_request_duration_seconds' in existing_metrics:
        request_duration = existing_metrics['aibox_request_duration_seconds']
    else:
        request_duration = Histogram('aibox_request_duration_seconds', 'Request duration')

    if 'aibox_active_websocket_connections' in existing_metrics:
        active_connections = existing_metrics['aibox_active_websocket_connections']
    else:
        active_connections = Gauge('aibox_active_websocket_connections', 'Active WebSocket connections')

except Exception as e:
    logger.error(f"Error initializing Prometheus metrics: {e}")
    # Fallback to None values
    requests_total = None
    request_duration = None
    active_connections = None

# Database Models
class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, index=True)
    user_message = Column(Text)
    ai_response = Column(Text)
    service_used = Column(String)
    timestamp = Column(DateTime, default=datetime.utcnow)
    request_metadata = Column(Text)  # JSON string

class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String)
    content = Column(Text)
    content_type = Column(String)
    upload_timestamp = Column(DateTime, default=datetime.utcnow)
    processed = Column(Boolean, default=False)

# Pydantic models
class ChatMessage(BaseModel):
    message: str
    session_id: Optional[str] = None
    service_type: str = "general"  # general, rag, agents, database

class DocumentUpload(BaseModel):
    filename: str
    content: str
    content_type: str

class QueryRequest(BaseModel):
    query: str
    session_id: Optional[str] = None
    context: Optional[Dict[str, Any]] = None

# Create FastAPI app
import os

app = FastAPI(
    title="AI Box Demo Gateway",
    description="A demonstration of the AI Box Enterprise AI Platform",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# WebSocket connections
websocket_connections: List[WebSocket] = []

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Create tables on startup
@app.on_event("startup")
async def startup_event():
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables created successfully")
    except Exception as e:
        logger.error(f"Failed to create database tables: {e}")

# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint for monitoring"""
    try:
        # Test database connection
        from sqlalchemy import text
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()

        return {
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
            "services": {
                "database": "connected",
                "gateway": "running"
            },
            "version": "1.0.0"
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return JSONResponse(
            status_code=503,
            content={
                "status": "unhealthy",
                "timestamp": datetime.utcnow().isoformat(),
                "error": str(e)
            }
        )

# Prometheus metrics endpoint
@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint"""
    return generate_latest()

# Main demo page
@app.get("/", response_class=HTMLResponse)
async def main_page():
    """Main demo page showing AI Box capabilities"""
    html_content = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Box - Enterprise AI Platform Demo</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: #333;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 15px;
            padding: 30px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        }
        .header {
            text-align: center;
            margin-bottom: 40px;
        }
        .header h1 {
            color: #2c3e50;
            margin-bottom: 10px;
            font-size: 2.5em;
        }
        .header p {
            color: #7f8c8d;
            font-size: 1.2em;
        }
        .services-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 40px;
        }
        .service-card {
            background: #f8f9fa;
            border-radius: 10px;
            padding: 20px;
            border-left: 4px solid #3498db;
            transition: transform 0.2s;
        }
        .service-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        }
        .service-card h3 {
            color: #2c3e50;
            margin-bottom: 10px;
        }
        .service-card p {
            color: #7f8c8d;
            line-height: 1.6;
        }
        .status-badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 0.8em;
            font-weight: bold;
        }
        .status-demo { background: #e3f2fd; color: #1976d2; }
        .status-available { background: #e8f5e8; color: #2e7d32; }
        .demo-section {
            background: #f8f9fa;
            border-radius: 10px;
            padding: 20px;
            margin-bottom: 20px;
        }
        .demo-section h3 {
            color: #2c3e50;
            margin-bottom: 15px;
        }
        .input-group {
            margin-bottom: 15px;
        }
        .input-group label {
            display: block;
            margin-bottom: 5px;
            font-weight: 600;
            color: #34495e;
        }
        .input-group input, .input-group textarea, .input-group select {
            width: 100%;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 5px;
            font-size: 14px;
        }
        .btn {
            background: #3498db;
            color: white;
            padding: 10px 20px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            transition: background 0.2s;
        }
        .btn:hover {
            background: #2980b9;
        }
        .response-area {
            background: white;
            border: 1px solid #ddd;
            border-radius: 5px;
            padding: 15px;
            margin-top: 15px;
            min-height: 100px;
            white-space: pre-wrap;
            font-family: monospace;
        }
        .architecture-diagram {
            text-align: center;
            margin: 20px 0;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 10px;
        }
        .deployment-info {
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            border-radius: 5px;
            padding: 15px;
            margin: 20px 0;
        }
        .deployment-info h4 {
            color: #856404;
            margin-bottom: 10px;
        }
        .footer {
            text-align: center;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            color: #7f8c8d;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 AI Box - Enterprise AI Platform</h1>
            <p>Complete containerized AI solution for enterprise deployment</p>
            <div style="margin-top: 20px;">
                <span class="status-badge status-demo">DEMO MODE</span>
                <span class="status-badge status-available">DATABASE CONNECTED</span>
            </div>
        </div>

        <div class="services-grid">
            <div class="service-card">
                <h3>🌐 API Gateway</h3>
                <p><span class="status-badge status-available">RUNNING</span></p>
                <p>Unified entry point for all AI services with WebSocket support, authentication, and monitoring.</p>
                <p><strong>Features:</strong> Rate limiting, Request routing, Metrics collection</p>
            </div>

            <div class="service-card">
                <h3>🤖 LLM Service (Ollama)</h3>
                <p><span class="status-badge status-demo">DEMO MODE</span></p>
                <p>Local language models for privacy-focused AI inference without external dependencies.</p>
                <p><strong>Models:</strong> Llama, CodeLlama, Mistral, Phi-3</p>
            </div>

            <div class="service-card">
                <h3>📚 RAG Service</h3>
                <p><span class="status-badge status-demo">DEMO MODE</span></p>
                <p>Document processing and retrieval using LlamaIndex with vector search capabilities.</p>
                <p><strong>Features:</strong> PDF/DOCX parsing, Semantic search, Context-aware responses</p>
            </div>

            <div class="service-card">
                <h3>🔧 AI Agents</h3>
                <p><span class="status-badge status-demo">DEMO MODE</span></p>
                <p>Intelligent agents using LangChain with custom tools for complex task automation.</p>
                <p><strong>Agents:</strong> Document Agent, Database Agent, Custom Tools</p>
            </div>

            <div class="service-card">
                <h3>💾 PostgreSQL Database</h3>
                <p><span class="status-badge status-available">CONNECTED</span></p>
                <p>Primary application database for conversations, metadata, and structured data storage.</p>
                <p><strong>Features:</strong> ACID compliance, Full-text search, JSON support</p>
            </div>

            <div class="service-card">
                <h3>📊 Monitoring Stack</h3>
                <p><span class="status-badge status-available">METRICS ENABLED</span></p>
                <p>Prometheus metrics collection with Grafana dashboards for comprehensive monitoring.</p>
                <p><strong>Metrics:</strong> Request rates, Response times, Resource usage</p>
            </div>
        </div>

        <div class="architecture-diagram">
            <h3>🏗️ System Architecture</h3>
            <div style="background: white; padding: 20px; border-radius: 10px; margin: 15px 0;">
                <pre style="margin: 0; color: #34495e;">
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Users/Apps    │───▶│  Load Balancer  │───▶│  API Gateway    │
│                 │    │   (Nginx)       │    │   (Port 5000)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                        │
                       ┌────────────────────────────────┼────────────────────────────────┐
                       │                                │                                │
                       ▼                                ▼                                ▼
            ┌─────────────────┐            ┌─────────────────┐            ┌─────────────────┐
            │  Ollama LLM     │            │   RAG Service   │            │  AI Agents      │
            │  (Port 11434)   │            │  (Port 8001)    │            │  (Port 8002)    │
            └─────────────────┘            └─────────────────┘            └─────────────────┘
                       │                                │                                │
                       │                                ▼                                ▼
                       │                    ┌─────────────────┐            ┌─────────────────┐
                       │                    │  Qdrant Vector  │            │   PostgreSQL    │
                       │                    │   Database      │            │   Database      │
                       │                    │  (Port 6333)    │            │  (Port 5432)    │
                       │                    └─────────────────┘            └─────────────────┘
                       │
                       ▼
            ┌─────────────────┐            ┌─────────────────┐
            │   Prometheus    │            │     Grafana     │
            │  (Port 9090)    │───────────▶│  (Port 3000)    │
            └─────────────────┘            └─────────────────┘
                </pre>
            </div>
        </div>

        <div class="demo-section">
            <h3>🧪 Interactive Demo</h3>
            <div class="input-group">
                <label for="service-select">Select Service:</label>
                <select id="service-select">
                    <option value="general">General Chat</option>
                    <option value="rag">Document Q&A (RAG)</option>
                    <option value="agents">AI Agents</option>
                    <option value="database">Database Query</option>
                </select>
            </div>
            <div class="input-group">
                <label for="demo-input">Your Message:</label>
                <textarea id="demo-input" rows="3" placeholder="Enter your question or request..."></textarea>
            </div>
            <button class="btn" onclick="sendDemo()">Send Request</button>
            <div id="demo-response" class="response-area">Response will appear here...</div>
        </div>

        <div class="deployment-info">
            <h4>🚀 Deployment Information</h4>
            <p><strong>Current Mode:</strong> Development Demo (no Docker containers running)</p>
            <p><strong>Database:</strong> Connected to PostgreSQL</p>
            <p><strong>Production Deployment:</strong> Use <code>./scripts/deploy.sh</code> for full Docker Compose, Kubernetes, or Ansible deployment</p>
            <p><strong>Migration:</strong> Use <code>./scripts/migrate-to-k8s.sh</code> to migrate from Docker Compose to Kubernetes</p>
        </div>

        <div class="footer">
            <p>AI Box Enterprise AI Platform - Complete solution for enterprise AI deployment</p>
            <p>API Documentation: <a href="/docs">/docs</a> | Health Check: <a href="/health">/health</a> | Metrics: <a href="/metrics">/metrics</a></p>
        </div>
    </div>

    <script>
        async function sendDemo() {
            const serviceType = document.getElementById('service-select').value;
            const message = document.getElementById('demo-input').value;
            const responseArea = document.getElementById('demo-response');

            if (!message.trim()) {
                responseArea.textContent = 'Please enter a message';
                return;
            }

            responseArea.textContent = 'Processing request...';

            try {
                const response = await fetch('/api/demo/chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        message: message,
                        service_type: serviceType,
                        session_id: 'demo-session'
                    })
                });

                const result = await response.json();
                responseArea.textContent = JSON.stringify(result, null, 2);
            } catch (error) {
                responseArea.textContent = 'Error: ' + error.message;
            }
        }

        // Auto-refresh status every 30 seconds
        setInterval(async () => {
            try {
                const response = await fetch('/health');
                const health = await response.json();
                console.log('Health check:', health);
            } catch (error) {
                console.log('Health check failed:', error);
            }
        }, 30000);
    </script>
</body>
</html>
    """
    return HTMLResponse(content=html_content)

# Demo chat endpoint
@app.post("/api/demo/chat")
async def demo_chat(message: ChatMessage):
    """Demo chat endpoint that simulates AI Box services"""
    start_time = datetime.utcnow()
    if requests_total:
        requests_total.labels(method='POST', endpoint='/api/demo/chat').inc()

    try:
        # Simulate different service responses
        response_text = ""
        service_used = message.service_type

        if message.service_type == "general":
            response_text = f"🤖 AI Box General Service Demo\n\nReceived your message: '{message.message}'\n\nIn a full deployment, this would be processed by:\n- Ollama LLM service for language understanding\n- Context management for conversation history\n- Real-time response generation\n\nDemo Response: This is a simulated response showing how the AI Box platform would handle general chat requests with local language models."

        elif message.service_type == "rag":
            response_text = f"📚 AI Box RAG Service Demo\n\nQuery: '{message.message}'\n\nIn a full deployment, this would:\n1. Process your query through semantic search\n2. Retrieve relevant documents from Qdrant vector database\n3. Generate context-aware responses using LlamaIndex\n4. Combine retrieved information with LLM generation\n\nDemo Response: This simulates document-based Q&A where your question would be answered using uploaded documents and knowledge base."

        elif message.service_type == "agents":
            response_text = f"🔧 AI Box Agents Service Demo\n\nTask: '{message.message}'\n\nIn a full deployment, AI agents would:\n1. Analyze the task and select appropriate tools\n2. Execute multi-step workflows using LangChain\n3. Access external APIs and databases\n4. Provide structured, actionable responses\n\nDemo Response: This simulates intelligent agents that can perform complex tasks like document analysis, database queries, API integrations, and workflow automation."

        elif message.service_type == "database":
            response_text = f"💾 AI Box Database Service Demo\n\nQuery: '{message.message}'\n\nIn a full deployment, this would:\n1. Parse natural language database queries\n2. Generate safe SQL from your request\n3. Execute queries against PostgreSQL\n4. Return structured results with explanations\n\nDemo Response: This simulates natural language to SQL conversion, allowing non-technical users to query databases using plain English."

        # Store conversation in database
        db = SessionLocal()
        try:
            conversation = Conversation(
                session_id=message.session_id or "demo-session",
                user_message=message.message,
                ai_response=response_text,
                service_used=service_used,
                request_metadata=json.dumps({"demo_mode": True, "timestamp": start_time.isoformat()})
            )
            db.add(conversation)
            db.commit()
        except Exception as e:
            logger.error(f"Database error: {e}")
            db.rollback()
        finally:
            db.close()

        duration = (datetime.utcnow() - start_time).total_seconds()
        if request_duration:
            request_duration.observe(duration)

        return {
            "response": response_text,
            "service_used": service_used,
            "session_id": message.session_id or "demo-session",
            "timestamp": start_time.isoformat(),
            "demo_mode": True,
            "processing_time": f"{duration:.2f}s"
        }

    except Exception as e:
        logger.error(f"Demo chat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# API endpoints for full functionality
@app.get("/api/services/status")
async def services_status():
    """Get status of all AI Box services"""
    return {
        "gateway": {"status": "running", "port": 5000},
        "ollama": {"status": "demo_mode", "port": 11434, "note": "Would run local LLMs in full deployment"},
        "rag": {"status": "demo_mode", "port": 8001, "note": "Would provide document Q&A in full deployment"},
        "agents": {"status": "demo_mode", "port": 8002, "note": "Would run AI agents in full deployment"},
        "database": {"status": "connected", "port": 5432, "type": "PostgreSQL"},
        "vector_db": {"status": "demo_mode", "port": 6333, "note": "Would run Qdrant in full deployment"},
        "monitoring": {"status": "metrics_enabled", "prometheus_port": 9090, "grafana_port": 3000}
    }

@app.get("/api/conversations")
async def get_conversations(limit: int = 10):
    """Get recent conversations"""
    db = SessionLocal()
    try:
        conversations = db.query(Conversation).order_by(Conversation.timestamp.desc()).limit(limit).all()
        return [
            {
                "id": conv.id,
                "session_id": conv.session_id,
                "user_message": conv.user_message,
                "ai_response": conv.ai_response,
                "service_used": conv.service_used,
                "timestamp": conv.timestamp.isoformat()
            }
            for conv in conversations
        ]
    finally:
        db.close()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time communication"""
    await websocket.accept()
    websocket_connections.append(websocket)
    if active_connections:
        active_connections.set(len(websocket_connections))

    try:
        await websocket.send_text(json.dumps({
            "type": "welcome",
            "message": "Connected to AI Box WebSocket",
            "demo_mode": True
        }))

        while True:
            data = await websocket.receive_text()
            message_data = json.loads(data)

            # Echo back the message with AI Box processing simulation
            response = {
                "type": "response",
                "original_message": message_data,
                "ai_response": f"AI Box processed: {message_data.get('message', '')}",
                "timestamp": datetime.utcnow().isoformat(),
                "demo_mode": True
            }

            await websocket.send_text(json.dumps(response))

    except WebSocketDisconnect:
        websocket_connections.remove(websocket)
        if active_connections:
            active_connections.set(len(websocket_connections))

# Configuration from environment variables
GATEWAY_HOST = os.getenv("GATEWAY_HOST", "0.0.0.0")
GATEWAY_PORT = int(os.getenv("GATEWAY_PORT", "5000"))
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/aibox")
OLLAMA_API_BASE = os.getenv("OLLAMA_API_BASE", "http://localhost:11434")
QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")

if __name__ == "__main__":
    print("🚀 Starting AI Box Demo Gateway...")
    print("📊 Features: Gateway, Database, WebSocket, Monitoring")
    print("🔗 Access: http://localhost:5000")
    print("📖 Docs: http://localhost:5000/docs")
    print("❤️  Health: http://localhost:5000/health")
    print("📈 Metrics: http://localhost:5000/metrics")

    uvicorn.run(
        "demo_gateway:app",
        host=GATEWAY_HOST,
        port=GATEWAY_PORT,
        reload=True,
        log_level="info"
    )