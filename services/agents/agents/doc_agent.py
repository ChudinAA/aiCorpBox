"""
Document Agent - LangChain agent for document-related tasks
"""

import logging
import os
from typing import List, Dict, Any, Optional
from datetime import datetime

from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain.schema import BaseMessage, HumanMessage, AIMessage
from langchain.tools import BaseTool, tool
from langchain.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.memory import ConversationBufferWindowMemory
from langchain.callbacks.base import BaseCallbackHandler
from langchain_community.llms import Ollama
from langchain_community.chat_models import ChatOllama
from pydantic import BaseModel, Field
import requests
import json

logger = logging.getLogger(__name__)

class DocumentAgentCallbackHandler(BaseCallbackHandler):
    """Custom callback handler for document agent"""
    
    def on_tool_start(self, serialized: Dict[str, Any], input_str: str, **kwargs) -> None:
        logger.info(f"Tool {serialized.get('name', 'unknown')} started with input: {input_str}")
    
    def on_tool_end(self, output: str, **kwargs) -> None:
        logger.info(f"Tool completed with output length: {len(output) if output else 0}")
    
    def on_tool_error(self, error: Exception, **kwargs) -> None:
        logger.error(f"Tool error: {error}")

class DocumentSearchInput(BaseModel):
    """Input schema for document search tool"""
    query: str = Field(description="The search query for documents")
    top_k: int = Field(default=5, description="Number of top results to return")

class DocumentUploadInput(BaseModel):
    """Input schema for document upload tool"""
    file_path: str = Field(description="Path to the file to upload")
    filename: str = Field(description="Name of the file")

@tool("search_documents", args_schema=DocumentSearchInput)
def search_documents(query: str, top_k: int = 5) -> str:
    """
    Search through uploaded documents using RAG service.
    
    Args:
        query: The search query
        top_k: Number of results to return
        
    Returns:
        JSON string with search results
    """
    try:
        rag_api_base = os.getenv("RAG_API_BASE", "http://rag:8001")
        response = requests.post(
            f"{rag_api_base}/query",
            json={
                "query": query,
                "top_k": top_k,
                "similarity_threshold": 0.7
            },
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            return json.dumps({
                "answer": result.get("answer", ""),
                "sources": result.get("sources", []),
                "metadata": result.get("metadata", {})
            }, indent=2)
        else:
            return f"Error searching documents: {response.status_code} - {response.text}"
            
    except Exception as e:
        logger.error(f"Error in search_documents: {e}")
        return f"Error searching documents: {str(e)}"

@tool("list_documents")
def list_documents() -> str:
    """
    List all uploaded documents.
    
    Returns:
        JSON string with list of documents
    """
    try:
        rag_api_base = os.getenv("RAG_API_BASE", "http://rag:8001")
        response = requests.get(f"{rag_api_base}/documents", timeout=30)
        
        if response.status_code == 200:
            documents = response.json()
            return json.dumps(documents, indent=2)
        else:
            return f"Error listing documents: {response.status_code} - {response.text}"
            
    except Exception as e:
        logger.error(f"Error in list_documents: {e}")
        return f"Error listing documents: {str(e)}"

@tool("get_document_summary")
def get_document_summary(filename: str) -> str:
    """
    Get a summary of a specific document.
    
    Args:
        filename: Name of the document to summarize
        
    Returns:
        Summary of the document
    """
    try:
        # First search for content related to the filename
        query = f"document:{filename} OR filename:{filename}"
        result = search_documents(query, top_k=3)
        
        if result and "Error" not in result:
            data = json.loads(result)
            sources = data.get("sources", [])
            
            if sources:
                # Combine content from sources
                content = "\n\n".join([source.get("content", "") for source in sources])
                
                # Request summary from LLM
                summary_query = f"Please provide a concise summary of this document content:\n\n{content[:2000]}"
                summary_result = search_documents(summary_query, top_k=1)
                
                return summary_result
            else:
                return f"No content found for document: {filename}"
        else:
            return f"Error retrieving document content: {result}"
            
    except Exception as e:
        logger.error(f"Error in get_document_summary: {e}")
        return f"Error getting document summary: {str(e)}"

@tool("analyze_document_content")
def analyze_document_content(query: str, analysis_type: str = "general") -> str:
    """
    Perform specific analysis on document content.
    
    Args:
        query: The query or document reference
        analysis_type: Type of analysis (general, technical, summary, keywords)
        
    Returns:
        Analysis results
    """
    try:
        # Map analysis types to specific prompts
        analysis_prompts = {
            "general": "Provide a general analysis of this content:",
            "technical": "Provide a technical analysis focusing on implementation details:",
            "summary": "Provide a concise summary of the main points:",
            "keywords": "Extract the key terms and concepts from this content:",
            "entities": "Identify important entities, names, and organizations:"
        }
        
        prompt = analysis_prompts.get(analysis_type, analysis_prompts["general"])
        full_query = f"{prompt} {query}"
        
        result = search_documents(full_query, top_k=5)
        return result
        
    except Exception as e:
        logger.error(f"Error in analyze_document_content: {e}")
        return f"Error analyzing document content: {str(e)}"

class DocumentAgent:
    """LangChain agent specialized for document operations"""
    
    def __init__(self):
        self.llm = ChatOllama(
            model=os.getenv("OLLAMA_MODEL", "llama3.2:3b"),
            base_url=os.getenv("OLLAMA_API_BASE", "http://ollama:11434"),
            temperature=0.1
        )
        
        self.tools = [
            search_documents,
            list_documents,
            get_document_summary,
            analyze_document_content
        ]
        
        self.memory = ConversationBufferWindowMemory(
            memory_key="chat_history",
            return_messages=True,
            k=10
        )
        
        self.callback_handler = DocumentAgentCallbackHandler()
        
        # Create prompt template
        self.prompt = ChatPromptTemplate.from_messages([
            ("system", self._get_system_prompt()),
            MessagesPlaceholder(variable_name="chat_history"),
            ("human", "{input}"),
            MessagesPlaceholder(variable_name="agent_scratchpad")
        ])
        
        # Create agent
        self.agent = create_openai_functions_agent(
            llm=self.llm,
            tools=self.tools,
            prompt=self.prompt
        )
        
        # Create agent executor
        self.agent_executor = AgentExecutor(
            agent=self.agent,
            tools=self.tools,
            memory=self.memory,
            callbacks=[self.callback_handler],
            verbose=True,
            max_iterations=5,
            early_stopping_method="generate"
        )
    
    def _get_system_prompt(self) -> str:
        """Get the system prompt for the document agent"""
        return """You are a specialized document analysis assistant with access to a document search and retrieval system.

Your capabilities include:
1. Searching through uploaded documents using semantic search
2. Listing available documents
3. Providing summaries of specific documents
4. Performing various types of content analysis

When handling document-related requests:
- Use search_documents for finding relevant information across all documents
- Use list_documents to see what documents are available
- Use get_document_summary for document overviews
- Use analyze_document_content for specific analysis tasks

Always provide clear, concise, and helpful responses. If you cannot find relevant information, explain what you searched for and suggest alternative approaches.

For complex queries, break them down into smaller searches and combine the results thoughtfully."""
    
    async def process_message(self, message: str, session_id: str = None) -> Dict[str, Any]:
        """
        Process a message through the document agent
        
        Args:
            message: User message
            session_id: Optional session identifier
            
        Returns:
            Response dictionary with answer and metadata
        """
        try:
            start_time = datetime.now()
            
            # Execute agent
            result = await self.agent_executor.ainvoke({
                "input": message
            })
            
            end_time = datetime.now()
            processing_time = (end_time - start_time).total_seconds()
            
            return {
                "answer": result.get("output", ""),
                "agent_type": "document",
                "session_id": session_id,
                "processing_time": processing_time,
                "metadata": {
                    "tools_used": self._extract_tools_used(result),
                    "timestamp": end_time.isoformat(),
                    "message_length": len(message)
                }
            }
            
        except Exception as e:
            logger.error(f"Error processing message in document agent: {e}")
            return {
                "answer": f"I encountered an error while processing your request: {str(e)}",
                "agent_type": "document",
                "session_id": session_id,
                "error": str(e),
                "metadata": {
                    "timestamp": datetime.now().isoformat(),
                    "error": True
                }
            }
    
    def _extract_tools_used(self, result: Dict[str, Any]) -> List[str]:
        """Extract the names of tools used during execution"""
        tools_used = []
        
        # This would need to be implemented based on the actual result structure
        # For now, return empty list
        return tools_used
    
    def reset_memory(self, session_id: str = None):
        """Reset the agent's conversation memory"""
        self.memory.clear()
        logger.info(f"Memory reset for document agent (session: {session_id})")
    
    def get_conversation_history(self, session_id: str = None) -> List[Dict[str, Any]]:
        """Get the conversation history"""
        try:
            messages = self.memory.chat_memory.messages
            history = []
            
            for msg in messages:
                if isinstance(msg, HumanMessage):
                    history.append({
                        "type": "human",
                        "content": msg.content,
                        "timestamp": getattr(msg, 'timestamp', None)
                    })
                elif isinstance(msg, AIMessage):
                    history.append({
                        "type": "ai",
                        "content": msg.content,
                        "timestamp": getattr(msg, 'timestamp', None)
                    })
            
            return history
            
        except Exception as e:
            logger.error(f"Error getting conversation history: {e}")
            return []

# Global instance
document_agent = None

def get_document_agent() -> DocumentAgent:
    """Get or create the global document agent instance"""
    global document_agent
    if document_agent is None:
        document_agent = DocumentAgent()
    return document_agent

async def process_document_query(message: str, session_id: str = None) -> Dict[str, Any]:
    """
    Process a document-related query
    
    Args:
        message: User message
        session_id: Optional session identifier
        
    Returns:
        Response dictionary
    """
    agent = get_document_agent()
    return await agent.process_message(message, session_id)
