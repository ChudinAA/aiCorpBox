"""
Gateway Service - Unified API Gateway for AI Box
"""

import logging
import os
import json
import asyncio
from typing import Dict, Any, List, Optional, Union
from datetime import datetime, timedelta
from contextlib import asynccontextmanager
import hashlib
import hmac

import uvicorn
from fastapi import FastAPI, HTTPException, WebSocket, Depends, Request, BackgroundTasks, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse, HTMLResponse
from pydantic import BaseModel, Field
import aiohttp
import requests
from prometheus_client import Counter, Histogram, Gauge, generate_latest
import structlog

# Configure structured logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.JSONRenderer()
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()

# Prometheus metrics
REQUEST_COUNT = Counter('gateway_requests_total', 'Total requests', ['method', 'endpoint', 'status'])
REQUEST_DURATION = Histogram('gateway_request_duration_seconds', 'Request duration')
ACTIVE_CONNECTIONS = Gauge('gateway_active_websocket_connections', 'Active WebSocket connections')
SERVICE_REQUESTS = Counter('gateway_service_requests_total', 'Requests to backend services', ['service', 'status'])

# Configuration
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-here")
API_TOKEN = os.getenv("API_TOKEN", "your-api-token-here")

# Service URLs
OLLAMA_API_BASE = os.getenv("OLLAMA_API_BASE", "http://ollama:11434")
RAG_API_BASE = os.getenv("RAG_API_BASE", "http://rag:8001")
AGENTS_API_BASE = os.getenv("AGENTS_API_BASE", "http://agents:8002")

# Pydantic models
class GatewayRequest(BaseModel):
    service: str = Field(..., description="Target service (ollama, rag, agents)")
    endpoint: str = Field(..., description="Service endpoint")
    method: str = Field(default="POST", description="HTTP method")
    data: Optional[Dict[str, Any]] = Field(default=None, description="Request data")
    headers: Optional[Dict[str, str]] = Field(default_factory=dict, description="Additional headers")

class ChatRequest(BaseModel):
    message: str = Field(..., description="User message")
    agent_type: str = Field(default="document", description="Agent type (document, database)")
    session_id: Optional[str] = Field(default=None, description="Session ID")
    user_id: Optional[str] = Field(default=None, description="User ID")
    context: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional context")

class ChatResponse(BaseModel):
    response: str
    agent_type: str
    session_id: Optional[str]
    processing_time: float
    metadata: Dict[str, Any]
    timestamp: str

class DocumentUploadRequest(BaseModel):
    filename: str
    content_type: str
    size: int

class QueryRequest(BaseModel):
    query: str
    service: str = Field(default="rag", description="Service to query (rag, agents)")
    parameters: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Query parameters")

class HealthResponse(BaseModel):
    status: str
    services: Dict[str, str]
    version: str
    timestamp: str

class ConnectorRequest(BaseModel):
    connector_type: str = Field(..., description="Type of connector (webhook, websocket, api)")
    config: Dict[str, Any] = Field(..., description="Connector configuration")
    name: str = Field(..., description="Connector name")

class ConnectorResponse(BaseModel):
    connector_id: str
    status: str
    webhook_url: Optional[str] = None
    api_key: Optional[str] = None

# Authentication
security = HTTPBearer(auto_error=False)

def verify_api_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Verify API token"""
    if not credentials:
        raise HTTPException(status_code=401, detail="API token required")
    
    if credentials.credentials != API_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid API token")
    
    return credentials.credentials

def create_webhook_signature(payload: str, secret: str) -> str:
    """Create webhook signature"""
    return hmac.new(
        secret.encode('utf-8'),
        payload.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()

def verify_webhook_signature(payload: str, signature: str, secret: str) -> bool:
    """Verify webhook signature"""
    expected_signature = create_webhook_signature(payload, secret)
    return hmac.compare_digest(signature, expected_signature)

# Service proxy class
class ServiceProxy:
    """Proxy for backend services"""
    
    def __init__(self):
        self.service_urls = {
            "ollama": OLLAMA_API_BASE,
            "rag": RAG_API_BASE,
            "agents": AGENTS_API_BASE
        }
        self.session = None
    
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    async def request(self, service: str, endpoint: str, method: str = "POST", 
                     data: Dict[str, Any] = None, headers: Dict[str, str] = None) -> Dict[str, Any]:
        """Make request to backend service"""
        if service not in self.service_urls:
            raise HTTPException(status_code=400, detail=f"Unknown service: {service}")
        
        url = f"{self.service_urls[service]}{endpoint}"
        headers = headers or {}
        headers.setdefault("Content-Type", "application/json")
        
        try:
            async with self.session.request(
                method=method.upper(),
                url=url,
                json=data if data else None,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=300)
            ) as response:
                SERVICE_REQUESTS.labels(service=service, status=response.status).inc()
                
                if response.status >= 400:
                    error_text = await response.text()
                    logger.error("Service request failed", 
                               service=service, url=url, status=response.status, error=error_text)
                    raise HTTPException(status_code=response.status, detail=error_text)
                
                result = await response.json()
                return result
                
        except aiohttp.ClientError as e:
            SERVICE_REQUESTS.labels(service=service, status="error").inc()
            logger.error("Service connection error", service=service, url=url, error=str(e))
            raise HTTPException(status_code=503, detail=f"Service {service} unavailable: {str(e)}")

# WebSocket manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.user_sessions: Dict[str, List[str]] = {}
    
    async def connect(self, websocket: WebSocket, client_id: str, user_id: str = None):
        await websocket.accept()
        self.active_connections[client_id] = websocket
        
        if user_id:
            if user_id not in self.user_sessions:
                self.user_sessions[user_id] = []
            self.user_sessions[user_id].append(client_id)
        
        ACTIVE_CONNECTIONS.inc()
        logger.info("WebSocket connected", client_id=client_id, user_id=user_id)
    
    def disconnect(self, client_id: str, user_id: str = None):
        if client_id in self.active_connections:
            del self.active_connections[client_id]
            ACTIVE_CONNECTIONS.dec()
        
        if user_id and user_id in self.user_sessions:
            if client_id in self.user_sessions[user_id]:
                self.user_sessions[user_id].remove(client_id)
            if not self.user_sessions[user_id]:
                del self.user_sessions[user_id]
        
        logger.info("WebSocket disconnected", client_id=client_id, user_id=user_id)
    
    async def send_personal_message(self, message: dict, client_id: str):
        if client_id in self.active_connections:
            try:
                await self.active_connections[client_id].send_text(json.dumps(message))
            except Exception as e:
                logger.error("Failed to send WebSocket message", client_id=client_id, error=str(e))
                self.disconnect(client_id)
    
    async def broadcast_to_user(self, message: dict, user_id: str):
        if user_id in self.user_sessions:
            for client_id in self.user_sessions[user_id]:
                await self.send_personal_message(message, client_id)

manager = ConnectionManager()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize services on startup"""
    logger.info("Starting Gateway Service")
    yield
    logger.info("Shutting down Gateway Service")

# Initialize FastAPI app
app = FastAPI(
    title="AI Box Gateway",
    description="Unified API Gateway for AI Box Enterprise Solution",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = datetime.now()
    
    with REQUEST_DURATION.time():
        response = await call_next(request)
    
    processing_time = (datetime.now() - start_time).total_seconds()
    
    REQUEST_COUNT.labels(
        method=request.method,
        endpoint=request.url.path,
        status=response.status_code
    ).inc()
    
    logger.info(
        "Request processed",
        method=request.method,
        path=request.url.path,
        status_code=response.status_code,
        processing_time=processing_time,
        client_ip=request.client.host
    )
    
    return response

# API endpoints
@app.get("/", response_class=HTMLResponse)
async def root():
    """Root endpoint with API documentation"""
    return """
    <!DOCTYPE html>
    <html>
    <head>
        <title>AI Box Gateway</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; }
            .header { background: #f5f5f5; padding: 20px; border-radius: 5px; }
            .endpoint { margin: 10px 0; padding: 10px; background: #f9f9f9; border-radius: 3px; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>AI Box Gateway API</h1>
            <p>Unified API Gateway for AI Box Enterprise Solution</p>
        </div>
        
        <h2>Available Endpoints:</h2>
        <div class="endpoint"><strong>GET /health</strong> - Health check</div>
        <div class="endpoint"><strong>POST /chat</strong> - Chat with AI agents</div>
        <div class="endpoint"><strong>POST /query</strong> - Query documents or data</div>
        <div class="endpoint"><strong>POST /proxy</strong> - Proxy requests to backend services</div>
        <div class="endpoint"><strong>GET /docs</strong> - Interactive API documentation</div>
        <div class="endpoint"><strong>WS /ws/{client_id}</strong> - WebSocket connection</div>
        
        <h2>Connectors:</h2>
        <div class="endpoint"><strong>POST /connectors</strong> - Create integration connector</div>
        <div class="endpoint"><strong>POST /webhooks/{connector_id}</strong> - Webhook endpoint</div>
        
        <p><a href="/docs">View Interactive API Documentation</a></p>
    </body>
    </html>
    """

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    services = {}
    
    # Check backend services
    for service, url in [("ollama", OLLAMA_API_BASE), ("rag", RAG_API_BASE), ("agents", AGENTS_API_BASE)]:
        try:
            response = requests.get(f"{url}/health", timeout=5)
            services[service] = "healthy" if response.status_code == 200 else "unhealthy"
        except Exception:
            services[service] = "unhealthy"
    
    overall_status = "healthy" if all(s == "healthy" for s in services.values()) else "partial"
    
    return HealthResponse(
        status=overall_status,
        services=services,
        version="1.0.0",
        timestamp=datetime.now().isoformat()
    )

@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, token: str = Depends(verify_api_token)):
    """Chat with AI agents"""
    try:
        async with ServiceProxy() as proxy:
            result = await proxy.request(
                service="agents",
                endpoint="/agents/chat",
                method="POST",
                data={
                    "message": request.message,
                    "agent_type": request.agent_type,
                    "session_id": request.session_id,
                    "user_id": request.user_id,
                    "metadata": request.context
                }
            )
            
            return ChatResponse(
                response=result.get("answer", ""),
                agent_type=result.get("agent_type", request.agent_type),
                session_id=result.get("session_id"),
                processing_time=result.get("processing_time", 0),
                metadata=result.get("metadata", {}),
                timestamp=result.get("timestamp", datetime.now().isoformat())
            )
            
    except Exception as e:
        logger.error("Chat error", error=str(e))
        raise HTTPException(status_code=500, detail=f"Chat error: {str(e)}")

@app.post("/query")
async def query(request: QueryRequest, token: str = Depends(verify_api_token)):
    """Query documents or database"""
    try:
        async with ServiceProxy() as proxy:
            if request.service == "rag":
                result = await proxy.request(
                    service="rag",
                    endpoint="/query",
                    method="POST",
                    data={
                        "query": request.query,
                        **request.parameters
                    }
                )
            elif request.service == "agents":
                result = await proxy.request(
                    service="agents",
                    endpoint="/agents/chat",
                    method="POST",
                    data={
                        "message": request.query,
                        "agent_type": "database",
                        **request.parameters
                    }
                )
            else:
                raise HTTPException(status_code=400, detail=f"Unknown query service: {request.service}")
            
            return result
            
    except Exception as e:
        logger.error("Query error", error=str(e))
        raise HTTPException(status_code=500, detail=f"Query error: {str(e)}")

@app.post("/proxy")
async def proxy_request(request: GatewayRequest, token: str = Depends(verify_api_token)):
    """Proxy requests to backend services"""
    try:
        async with ServiceProxy() as proxy:
            result = await proxy.request(
                service=request.service,
                endpoint=request.endpoint,
                method=request.method,
                data=request.data,
                headers=request.headers
            )
            return result
            
    except Exception as e:
        logger.error("Proxy error", error=str(e))
        raise HTTPException(status_code=500, detail=f"Proxy error: {str(e)}")

@app.post("/upload")
async def upload_document(request: DocumentUploadRequest, token: str = Depends(verify_api_token)):
    """Upload document to RAG service"""
    try:
        async with ServiceProxy() as proxy:
            result = await proxy.request(
                service="rag",
                endpoint="/documents/upload",
                method="POST",
                data=request.dict()
            )
            return result
            
    except Exception as e:
        logger.error("Upload error", error=str(e))
        raise HTTPException(status_code=500, detail=f"Upload error: {str(e)}")

# Connector management
connectors = {}

@app.post("/connectors", response_model=ConnectorResponse)
async def create_connector(request: ConnectorRequest, token: str = Depends(verify_api_token)):
    """Create integration connector"""
    try:
        import uuid
        connector_id = str(uuid.uuid4())
        
        connector_config = {
            "id": connector_id,
            "type": request.connector_type,
            "name": request.name,
            "config": request.config,
            "created_at": datetime.now().isoformat(),
            "status": "active"
        }
        
        # Generate API key for connector
        api_key = hashlib.sha256(f"{connector_id}{SECRET_KEY}".encode()).hexdigest()[:32]
        connector_config["api_key"] = api_key
        
        connectors[connector_id] = connector_config
        
        webhook_url = None
        if request.connector_type == "webhook":
            webhook_url = f"/webhooks/{connector_id}"
        
        return ConnectorResponse(
            connector_id=connector_id,
            status="active",
            webhook_url=webhook_url,
            api_key=api_key
        )
        
    except Exception as e:
        logger.error("Connector creation error", error=str(e))
        raise HTTPException(status_code=500, detail=f"Connector error: {str(e)}")

@app.post("/webhooks/{connector_id}")
async def webhook_handler(
    connector_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    x_signature: str = Header(None)
):
    """Handle webhook requests from external systems"""
    try:
        if connector_id not in connectors:
            raise HTTPException(status_code=404, detail="Connector not found")
        
        connector = connectors[connector_id]
        
        # Get request body
        body = await request.body()
        payload = body.decode('utf-8')
        
        # Verify signature if provided
        if x_signature and connector["config"].get("verify_signature"):
            secret = connector["config"].get("webhook_secret", SECRET_KEY)
            if not verify_webhook_signature(payload, x_signature, secret):
                raise HTTPException(status_code=401, detail="Invalid signature")
        
        # Parse webhook data
        try:
            webhook_data = json.loads(payload)
        except json.JSONDecodeError:
            webhook_data = {"raw_payload": payload}
        
        # Process webhook in background
        background_tasks.add_task(process_webhook, connector_id, webhook_data)
        
        return {"status": "accepted", "connector_id": connector_id}
        
    except Exception as e:
        logger.error("Webhook error", connector_id=connector_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"Webhook error: {str(e)}")

async def process_webhook(connector_id: str, data: Dict[str, Any]):
    """Process webhook data"""
    try:
        connector = connectors[connector_id]
        
        # Extract message from webhook data based on connector config
        message_field = connector["config"].get("message_field", "message")
        user_field = connector["config"].get("user_field", "user")
        
        message = data.get(message_field, str(data))
        user_id = data.get(user_field, "webhook_user")
        
        # Send to appropriate agent
        agent_type = connector["config"].get("agent_type", "document")
        
        async with ServiceProxy() as proxy:
            result = await proxy.request(
                service="agents",
                endpoint="/agents/chat",
                method="POST",
                data={
                    "message": message,
                    "agent_type": agent_type,
                    "user_id": user_id,
                    "metadata": {
                        "connector_id": connector_id,
                        "webhook_data": data
                    }
                }
            )
        
        # Send response back if webhook URL is configured
        response_url = connector["config"].get("response_url")
        if response_url:
            async with aiohttp.ClientSession() as session:
                await session.post(response_url, json={
                    "response": result.get("answer", ""),
                    "user_id": user_id,
                    "connector_id": connector_id
                })
        
        logger.info("Webhook processed", connector_id=connector_id, user_id=user_id)
        
    except Exception as e:
        logger.error("Webhook processing error", connector_id=connector_id, error=str(e))

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str, user_id: str = None):
    """WebSocket endpoint for real-time communication"""
    await manager.connect(websocket, client_id, user_id)
    
    try:
        while True:
            data = await websocket.receive_text()
            
            try:
                message = json.loads(data)
                
                if message.get("type") == "chat":
                    # Process chat message
                    async with ServiceProxy() as proxy:
                        result = await proxy.request(
                            service="agents",
                            endpoint="/agents/chat",
                            method="POST",
                            data={
                                "message": message.get("message", ""),
                                "agent_type": message.get("agent_type", "document"),
                                "session_id": message.get("session_id"),
                                "user_id": user_id,
                                "metadata": message.get("metadata", {})
                            }
                        )
                    
                    await manager.send_personal_message({
                        "type": "chat_response",
                        "data": result
                    }, client_id)
                
                elif message.get("type") == "ping":
                    await manager.send_personal_message({
                        "type": "pong",
                        "timestamp": datetime.now().isoformat()
                    }, client_id)
                
            except json.JSONDecodeError:
                await manager.send_personal_message({
                    "type": "error",
                    "message": "Invalid JSON format"
                }, client_id)
                
    except Exception as e:
        logger.error("WebSocket error", client_id=client_id, error=str(e))
    finally:
        manager.disconnect(client_id, user_id)

@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint"""
    from fastapi.responses import Response
    return Response(generate_latest(), media_type="text/plain")

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=5000,
        reload=False,
        workers=1,  # Single worker for WebSocket support
        log_level="info"
    )
