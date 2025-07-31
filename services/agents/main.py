"""
AI Agents Service - Main FastAPI application
"""

import logging
import os
import asyncio
from typing import Dict, Any, List, Optional
from datetime import datetime
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, HTTPException, WebSocket, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import json

# Import agents
from agents.doc_agent import get_document_agent, process_document_query
from agents.db_agent import get_database_agent, process_database_query
from tools.custom_tools import get_custom_tools, get_tool_by_name

# Database
import sqlalchemy as sa
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Database setup
DATABASE_URL = f"postgresql://{os.getenv('POSTGRES_USER', 'aibox')}:{os.getenv('POSTGRES_PASSWORD', 'secure_password')}@{os.getenv('POSTGRES_HOST', 'postgres')}:{os.getenv('POSTGRES_PORT', '5432')}/{os.getenv('POSTGRES_DB', 'aibox')}"

engine = sa.create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Database models
class ConversationModel(Base):
    __tablename__ = "agent_conversations"
    
    id = sa.Column(sa.Integer, primary_key=True, index=True)
    session_id = sa.Column(sa.String, index=True)
    agent_type = sa.Column(sa.String, index=True)
    user_message = sa.Column(sa.Text)
    agent_response = sa.Column(sa.Text)
    metadata = sa.Column(sa.JSON)
    created_at = sa.Column(sa.DateTime, default=sa.func.now())

class AgentSessionModel(Base):
    __tablename__ = "agent_sessions"
    
    id = sa.Column(sa.Integer, primary_key=True, index=True)
    session_id = sa.Column(sa.String, unique=True, index=True)
    user_id = sa.Column(sa.String, index=True)
    agent_type = sa.Column(sa.String)
    status = sa.Column(sa.String, default="active")
    metadata = sa.Column(sa.JSON)
    created_at = sa.Column(sa.DateTime, default=sa.func.now())
    updated_at = sa.Column(sa.DateTime, default=sa.func.now(), onupdate=sa.func.now())

# Pydantic models
class AgentRequest(BaseModel):
    message: str = Field(..., description="User message")
    agent_type: str = Field(..., description="Type of agent (document, database, general)")
    session_id: Optional[str] = Field(default=None, description="Session identifier")
    user_id: Optional[str] = Field(default=None, description="User identifier")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional metadata")

class AgentResponse(BaseModel):
    answer: str
    agent_type: str
    session_id: Optional[str]
    processing_time: float
    metadata: Dict[str, Any]
    timestamp: str

class SessionRequest(BaseModel):
    agent_type: str = Field(..., description="Type of agent session to create")
    user_id: Optional[str] = Field(default=None, description="User identifier")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Session metadata")

class SessionResponse(BaseModel):
    session_id: str
    agent_type: str
    status: str
    created_at: str

class HealthResponse(BaseModel):
    status: str
    agents: Dict[str, str]
    tools: List[str]
    database: str

class ToolListResponse(BaseModel):
    tools: List[Dict[str, Any]]

class ConversationHistoryResponse(BaseModel):
    session_id: str
    conversations: List[Dict[str, Any]]
    total_count: int

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
    
    async def connect(self, websocket: WebSocket, session_id: str):
        await websocket.accept()
        self.active_connections[session_id] = websocket
        logger.info(f"WebSocket connected for session: {session_id}")
    
    def disconnect(self, session_id: str):
        if session_id in self.active_connections:
            del self.active_connections[session_id]
            logger.info(f"WebSocket disconnected for session: {session_id}")
    
    async def send_personal_message(self, message: dict, session_id: str):
        if session_id in self.active_connections:
            websocket = self.active_connections[session_id]
            try:
                await websocket.send_text(json.dumps(message))
            except Exception as e:
                logger.error(f"Error sending WebSocket message: {e}")
                self.disconnect(session_id)

manager = ConnectionManager()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize services on startup"""
    try:
        # Initialize database
        Base.metadata.create_all(bind=engine)
        logger.info("Database initialized")
        
        # Initialize agents
        doc_agent = get_document_agent()
        db_agent = get_database_agent()
        
        logger.info("AI Agents service initialized successfully")
        
    except Exception as e:
        logger.error(f"Failed to initialize agents service: {e}")
        raise
    
    yield
    
    # Cleanup
    logger.info("Shutting down AI Agents service")

# Initialize FastAPI app
app = FastAPI(
    title="AI Box Agents Service",
    description="AI Agents service for document and database operations",
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

# Dependency to get database session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

async def save_conversation(
    db: Session,
    session_id: str,
    agent_type: str,
    user_message: str,
    agent_response: str,
    metadata: Dict[str, Any]
):
    """Save conversation to database"""
    try:
        conversation = ConversationModel(
            session_id=session_id,
            agent_type=agent_type,
            user_message=user_message,
            agent_response=agent_response,
            metadata=metadata
        )
        db.add(conversation)
        db.commit()
    except Exception as e:
        logger.error(f"Error saving conversation: {e}")
        db.rollback()

# API endpoints
@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    agents_status = {}
    
    # Check document agent
    try:
        doc_agent = get_document_agent()
        agents_status["document"] = "healthy"
    except Exception:
        agents_status["document"] = "unhealthy"
    
    # Check database agent
    try:
        db_agent = get_database_agent()
        agents_status["database"] = "healthy"
    except Exception:
        agents_status["database"] = "unhealthy"
    
    # Check database connection
    try:
        with engine.connect() as conn:
            conn.execute(sa.text("SELECT 1"))
        database_status = "healthy"
    except Exception:
        database_status = "unhealthy"
    
    # Get available tools
    tools = [tool.name for tool in get_custom_tools()]
    
    return HealthResponse(
        status="healthy" if all(s == "healthy" for s in agents_status.values()) and database_status == "healthy" else "partial",
        agents=agents_status,
        tools=tools,
        database=database_status
    )

@app.post("/agents/chat", response_model=AgentResponse)
async def chat_with_agent(
    request: AgentRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Chat with a specific agent"""
    try:
        start_time = datetime.now()
        
        # Route to appropriate agent
        if request.agent_type == "document":
            result = await process_document_query(request.message, request.session_id)
        elif request.agent_type == "database":
            result = await process_database_query(request.message, request.session_id)
        else:
            raise HTTPException(status_code=400, detail=f"Unknown agent type: {request.agent_type}")
        
        # Create response
        response = AgentResponse(
            answer=result.get("answer", ""),
            agent_type=request.agent_type,
            session_id=request.session_id,
            processing_time=result.get("processing_time", 0),
            metadata=result.get("metadata", {}),
            timestamp=datetime.now().isoformat()
        )
        
        # Save conversation in background
        background_tasks.add_task(
            save_conversation,
            db,
            request.session_id or "anonymous",
            request.agent_type,
            request.message,
            response.answer,
            {
                "user_id": request.user_id,
                "processing_time": response.processing_time,
                "request_metadata": request.metadata
            }
        )
        
        # Send WebSocket notification if session is connected
        if request.session_id:
            await manager.send_personal_message({
                "type": "agent_response",
                "data": response.dict()
            }, request.session_id)
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in agent chat: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.post("/sessions", response_model=SessionResponse)
async def create_session(request: SessionRequest, db: Session = Depends(get_db)):
    """Create a new agent session"""
    try:
        import uuid
        session_id = str(uuid.uuid4())
        
        session = AgentSessionModel(
            session_id=session_id,
            user_id=request.user_id,
            agent_type=request.agent_type,
            metadata=request.metadata
        )
        
        db.add(session)
        db.commit()
        db.refresh(session)
        
        return SessionResponse(
            session_id=session_id,
            agent_type=request.agent_type,
            status="active",
            created_at=session.created_at.isoformat()
        )
        
    except Exception as e:
        logger.error(f"Error creating session: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error creating session: {str(e)}")

@app.delete("/sessions/{session_id}")
async def delete_session(session_id: str, db: Session = Depends(get_db)):
    """Delete an agent session"""
    try:
        session = db.query(AgentSessionModel).filter(AgentSessionModel.session_id == session_id).first()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Reset agent memory
        if session.agent_type == "document":
            agent = get_document_agent()
            agent.reset_memory(session_id)
        elif session.agent_type == "database":
            agent = get_database_agent()
            agent.reset_memory(session_id)
        
        # Update session status
        session.status = "closed"
        db.commit()
        
        # Disconnect WebSocket if connected
        manager.disconnect(session_id)
        
        return {"message": "Session deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting session: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error deleting session: {str(e)}")

@app.get("/sessions/{session_id}/history", response_model=ConversationHistoryResponse)
async def get_conversation_history(session_id: str, db: Session = Depends(get_db)):
    """Get conversation history for a session"""
    try:
        conversations = db.query(ConversationModel).filter(
            ConversationModel.session_id == session_id
        ).order_by(ConversationModel.created_at).all()
        
        history = []
        for conv in conversations:
            history.append({
                "id": conv.id,
                "user_message": conv.user_message,
                "agent_response": conv.agent_response,
                "agent_type": conv.agent_type,
                "metadata": conv.metadata,
                "created_at": conv.created_at.isoformat()
            })
        
        return ConversationHistoryResponse(
            session_id=session_id,
            conversations=history,
            total_count=len(history)
        )
        
    except Exception as e:
        logger.error(f"Error getting conversation history: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting history: {str(e)}")

@app.get("/tools", response_model=ToolListResponse)
async def list_tools():
    """List available tools"""
    try:
        tools = get_custom_tools()
        tool_info = []
        
        for tool in tools:
            tool_info.append({
                "name": tool.name,
                "description": tool.description,
                "args_schema": tool.args_schema.schema() if tool.args_schema else None
            })
        
        return ToolListResponse(tools=tool_info)
        
    except Exception as e:
        logger.error(f"Error listing tools: {e}")
        raise HTTPException(status_code=500, detail=f"Error listing tools: {str(e)}")

@app.post("/tools/{tool_name}/execute")
async def execute_tool(tool_name: str, args: Dict[str, Any]):
    """Execute a specific tool"""
    try:
        tool = get_tool_by_name(tool_name)
        if not tool:
            raise HTTPException(status_code=404, detail=f"Tool '{tool_name}' not found")
        
        # Execute tool
        result = tool._run(**args)
        
        return {
            "success": True,
            "tool_name": tool_name,
            "args": args,
            "result": result,
            "timestamp": datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error executing tool {tool_name}: {e}")
        raise HTTPException(status_code=500, detail=f"Error executing tool: {str(e)}")

@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for real-time communication"""
    await manager.connect(websocket, session_id)
    
    try:
        while True:
            # Wait for message from client
            data = await websocket.receive_text()
            
            try:
                message = json.loads(data)
                
                if message.get("type") == "chat":
                    # Process chat message
                    agent_type = message.get("agent_type", "document")
                    user_message = message.get("message", "")
                    
                    # Route to appropriate agent
                    if agent_type == "document":
                        result = await process_document_query(user_message, session_id)
                    elif agent_type == "database":
                        result = await process_database_query(user_message, session_id)
                    else:
                        result = {"answer": f"Unknown agent type: {agent_type}", "error": True}
                    
                    # Send response
                    await manager.send_personal_message({
                        "type": "chat_response",
                        "data": result
                    }, session_id)
                
                elif message.get("type") == "ping":
                    # Respond to ping
                    await manager.send_personal_message({
                        "type": "pong",
                        "timestamp": datetime.now().isoformat()
                    }, session_id)
                
            except json.JSONDecodeError:
                await manager.send_personal_message({
                    "type": "error",
                    "message": "Invalid JSON format"
                }, session_id)
            except Exception as e:
                await manager.send_personal_message({
                    "type": "error",
                    "message": str(e)
                }, session_id)
                
    except Exception as e:
        logger.error(f"WebSocket error for session {session_id}: {e}")
    finally:
        manager.disconnect(session_id)

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8002,
        reload=False,
        workers=1,  # Single worker for WebSocket support
        log_level="info"
    )
