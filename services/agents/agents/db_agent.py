"""
Database Agent - LangChain agent for database operations and SQL queries
"""

import logging
import os
import json
from typing import List, Dict, Any, Optional
from datetime import datetime

from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain.schema import BaseMessage, HumanMessage, AIMessage
from langchain.tools import BaseTool, tool
from langchain.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.memory import ConversationBufferWindowMemory
from langchain.callbacks.base import BaseCallbackHandler
from langchain_community.chat_models import ChatOllama
from pydantic import BaseModel, Field
import sqlalchemy as sa
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text, inspect

logger = logging.getLogger(__name__)

class DatabaseAgentCallbackHandler(BaseCallbackHandler):
    """Custom callback handler for database agent"""
    
    def on_tool_start(self, serialized: Dict[str, Any], input_str: str, **kwargs) -> None:
        logger.info(f"Database tool {serialized.get('name', 'unknown')} started")
    
    def on_tool_end(self, output: str, **kwargs) -> None:
        logger.info(f"Database tool completed")
    
    def on_tool_error(self, error: Exception, **kwargs) -> None:
        logger.error(f"Database tool error: {error}")

class SQLQueryInput(BaseModel):
    """Input schema for SQL query tool"""
    query: str = Field(description="SQL query to execute")
    limit: int = Field(default=100, description="Maximum number of rows to return")

class TableInfoInput(BaseModel):
    """Input schema for table info tool"""
    table_name: str = Field(description="Name of the table to inspect")

# Database connection
def get_database_url():
    """Get database connection URL from environment"""
    return f"postgresql://{os.getenv('POSTGRES_USER', 'aibox')}:{os.getenv('POSTGRES_PASSWORD', 'secure_password')}@{os.getenv('POSTGRES_HOST', 'postgres')}:{os.getenv('POSTGRES_PORT', '5432')}/{os.getenv('POSTGRES_DB', 'aibox')}"

def get_db_engine():
    """Get database engine"""
    return sa.create_engine(get_database_url())

@tool("execute_sql_query", args_schema=SQLQueryInput)
def execute_sql_query(query: str, limit: int = 100) -> str:
    """
    Execute a SQL query against the database.
    
    Args:
        query: SQL query to execute
        limit: Maximum number of rows to return
        
    Returns:
        JSON string with query results
    """
    try:
        engine = get_db_engine()
        
        # Validate query (basic security check)
        query_lower = query.lower().strip()
        
        # Allow only SELECT queries for safety
        if not query_lower.startswith('select'):
            return "Error: Only SELECT queries are allowed for security reasons."
        
        # Prevent dangerous operations
        dangerous_keywords = ['drop', 'delete', 'update', 'insert', 'alter', 'create', 'truncate']
        if any(keyword in query_lower for keyword in dangerous_keywords):
            return "Error: Query contains potentially dangerous operations."
        
        # Add LIMIT clause if not present
        if 'limit' not in query_lower:
            query = f"{query.rstrip(';')} LIMIT {limit};"
        
        with engine.connect() as conn:
            result = conn.execute(text(query))
            
            # Convert result to list of dictionaries
            columns = result.keys()
            rows = []
            
            for row in result:
                row_dict = {}
                for i, col in enumerate(columns):
                    value = row[i]
                    # Handle datetime and other non-serializable types
                    if hasattr(value, 'isoformat'):
                        value = value.isoformat()
                    row_dict[col] = value
                rows.append(row_dict)
            
            return json.dumps({
                "success": True,
                "columns": list(columns),
                "rows": rows,
                "row_count": len(rows),
                "query": query
            }, indent=2)
            
    except Exception as e:
        logger.error(f"Error executing SQL query: {e}")
        return json.dumps({
            "success": False,
            "error": str(e),
            "query": query
        }, indent=2)

@tool("list_tables")
def list_tables() -> str:
    """
    List all tables in the database.
    
    Returns:
        JSON string with table information
    """
    try:
        engine = get_db_engine()
        inspector = inspect(engine)
        
        tables = []
        for table_name in inspector.get_table_names():
            table_info = {
                "name": table_name,
                "columns": []
            }
            
            # Get column information
            for column in inspector.get_columns(table_name):
                table_info["columns"].append({
                    "name": column["name"],
                    "type": str(column["type"]),
                    "nullable": column.get("nullable", True),
                    "primary_key": column.get("primary_key", False)
                })
            
            tables.append(table_info)
        
        return json.dumps({
            "success": True,
            "tables": tables,
            "table_count": len(tables)
        }, indent=2)
        
    except Exception as e:
        logger.error(f"Error listing tables: {e}")
        return json.dumps({
            "success": False,
            "error": str(e)
        }, indent=2)

@tool("describe_table", args_schema=TableInfoInput)
def describe_table(table_name: str) -> str:
    """
    Get detailed information about a specific table.
    
    Args:
        table_name: Name of the table to describe
        
    Returns:
        JSON string with detailed table information
    """
    try:
        engine = get_db_engine()
        inspector = inspect(engine)
        
        if table_name not in inspector.get_table_names():
            return json.dumps({
                "success": False,
                "error": f"Table '{table_name}' does not exist"
            }, indent=2)
        
        # Get table information
        columns = inspector.get_columns(table_name)
        indexes = inspector.get_indexes(table_name)
        foreign_keys = inspector.get_foreign_keys(table_name)
        primary_key = inspector.get_pk_constraint(table_name)
        
        # Get row count
        with engine.connect() as conn:
            result = conn.execute(text(f"SELECT COUNT(*) FROM {table_name}"))
            row_count = result.scalar()
        
        table_info = {
            "name": table_name,
            "row_count": row_count,
            "columns": [
                {
                    "name": col["name"],
                    "type": str(col["type"]),
                    "nullable": col.get("nullable", True),
                    "default": str(col.get("default")) if col.get("default") is not None else None,
                    "primary_key": col.get("primary_key", False)
                }
                for col in columns
            ],
            "primary_key": primary_key,
            "indexes": [
                {
                    "name": idx["name"],
                    "columns": idx["column_names"],
                    "unique": idx.get("unique", False)
                }
                for idx in indexes
            ],
            "foreign_keys": [
                {
                    "name": fk.get("name"),
                    "columns": fk["constrained_columns"],
                    "referenced_table": fk["referred_table"],
                    "referenced_columns": fk["referred_columns"]
                }
                for fk in foreign_keys
            ]
        }
        
        return json.dumps({
            "success": True,
            "table_info": table_info
        }, indent=2)
        
    except Exception as e:
        logger.error(f"Error describing table {table_name}: {e}")
        return json.dumps({
            "success": False,
            "error": str(e),
            "table_name": table_name
        }, indent=2)

@tool("analyze_data_patterns")
def analyze_data_patterns(table_name: str, column_name: str = None) -> str:
    """
    Analyze data patterns in a table or specific column.
    
    Args:
        table_name: Name of the table to analyze
        column_name: Optional specific column to analyze
        
    Returns:
        JSON string with analysis results
    """
    try:
        engine = get_db_engine()
        
        if column_name:
            # Analyze specific column
            query = f"""
            SELECT 
                '{column_name}' as column_name,
                COUNT(*) as total_rows,
                COUNT(DISTINCT {column_name}) as unique_values,
                COUNT(*) - COUNT({column_name}) as null_count,
                MIN({column_name}) as min_value,
                MAX({column_name}) as max_value
            FROM {table_name}
            """
        else:
            # Get general table statistics
            inspector = inspect(engine)
            columns = [col["name"] for col in inspector.get_columns(table_name)]
            
            # Create query for all columns
            column_stats = []
            for col in columns[:10]:  # Limit to first 10 columns
                column_stats.append(f"""
                SELECT 
                    '{col}' as column_name,
                    COUNT(*) as total_rows,
                    COUNT(DISTINCT {col}) as unique_values,
                    COUNT(*) - COUNT({col}) as null_count
                FROM {table_name}
                """)
            
            query = " UNION ALL ".join(column_stats)
        
        with engine.connect() as conn:
            result = conn.execute(text(query))
            
            analysis_results = []
            for row in result:
                analysis_results.append({
                    "column_name": row[0],
                    "total_rows": row[1],
                    "unique_values": row[2],
                    "null_count": row[3],
                    "null_percentage": round((row[3] / row[1] * 100), 2) if row[1] > 0 else 0,
                    "uniqueness_ratio": round((row[2] / row[1]), 3) if row[1] > 0 else 0
                })
        
        return json.dumps({
            "success": True,
            "table_name": table_name,
            "column_name": column_name,
            "analysis": analysis_results
        }, indent=2)
        
    except Exception as e:
        logger.error(f"Error analyzing data patterns: {e}")
        return json.dumps({
            "success": False,
            "error": str(e),
            "table_name": table_name,
            "column_name": column_name
        }, indent=2)

@tool("generate_sql_suggestion")
def generate_sql_suggestion(natural_language_query: str) -> str:
    """
    Generate SQL query suggestions based on natural language input.
    
    Args:
        natural_language_query: Natural language description of desired query
        
    Returns:
        SQL query suggestions
    """
    try:
        # Get table information for context
        tables_info = list_tables()
        tables_data = json.loads(tables_info)
        
        if not tables_data.get("success"):
            return "Error: Could not retrieve table information"
        
        # Simple rule-based SQL generation (could be enhanced with LLM)
        query_lower = natural_language_query.lower()
        suggestions = []
        
        # Detect common patterns
        if "count" in query_lower or "how many" in query_lower:
            for table in tables_data["tables"]:
                suggestions.append(f"SELECT COUNT(*) FROM {table['name']};")
        
        if "all" in query_lower and "from" in query_lower:
            # Extract table name
            words = query_lower.split()
            if "from" in words:
                from_index = words.index("from")
                if from_index + 1 < len(words):
                    table_name = words[from_index + 1]
                    suggestions.append(f"SELECT * FROM {table_name} LIMIT 10;")
        
        if "recent" in query_lower or "latest" in query_lower:
            for table in tables_data["tables"]:
                # Look for date/time columns
                for column in table["columns"]:
                    if any(keyword in column["type"].lower() for keyword in ["timestamp", "date", "time"]):
                        suggestions.append(f"SELECT * FROM {table['name']} ORDER BY {column['name']} DESC LIMIT 10;")
        
        if not suggestions:
            suggestions.append("-- Could not generate specific suggestions. Please provide more details about what you want to query.")
        
        return json.dumps({
            "success": True,
            "natural_query": natural_language_query,
            "sql_suggestions": suggestions,
            "note": "These are basic suggestions. Please review and modify as needed."
        }, indent=2)
        
    except Exception as e:
        logger.error(f"Error generating SQL suggestion: {e}")
        return json.dumps({
            "success": False,
            "error": str(e),
            "natural_query": natural_language_query
        }, indent=2)

class DatabaseAgent:
    """LangChain agent specialized for database operations"""
    
    def __init__(self):
        self.llm = ChatOllama(
            model=os.getenv("OLLAMA_MODEL", "llama3.2:3b"),
            base_url=os.getenv("OLLAMA_API_BASE", "http://ollama:11434"),
            temperature=0.1
        )
        
        self.tools = [
            execute_sql_query,
            list_tables,
            describe_table,
            analyze_data_patterns,
            generate_sql_suggestion
        ]
        
        self.memory = ConversationBufferWindowMemory(
            memory_key="chat_history",
            return_messages=True,
            k=10
        )
        
        self.callback_handler = DatabaseAgentCallbackHandler()
        
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
        """Get the system prompt for the database agent"""
        return """You are a specialized database assistant with access to SQL query execution and database analysis tools.

Your capabilities include:
1. Executing safe SELECT queries against the database
2. Listing and describing database tables and their structure
3. Analyzing data patterns and statistics
4. Generating SQL query suggestions from natural language

Security guidelines:
- Only SELECT queries are allowed for safety
- All queries are automatically limited to prevent performance issues
- Never execute DDL or DML operations (CREATE, DROP, INSERT, UPDATE, DELETE)

When handling database requests:
- Use list_tables to see available tables
- Use describe_table to understand table structure
- Use execute_sql_query for data retrieval
- Use analyze_data_patterns for data insights
- Use generate_sql_suggestion to help users write queries

Always provide clear explanations of query results and suggest optimizations when appropriate."""
    
    async def process_message(self, message: str, session_id: str = None) -> Dict[str, Any]:
        """
        Process a message through the database agent
        
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
                "agent_type": "database",
                "session_id": session_id,
                "processing_time": processing_time,
                "metadata": {
                    "tools_used": self._extract_tools_used(result),
                    "timestamp": end_time.isoformat(),
                    "message_length": len(message)
                }
            }
            
        except Exception as e:
            logger.error(f"Error processing message in database agent: {e}")
            return {
                "answer": f"I encountered an error while processing your database request: {str(e)}",
                "agent_type": "database",
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
        # Implementation would depend on the actual result structure
        return tools_used
    
    def reset_memory(self, session_id: str = None):
        """Reset the agent's conversation memory"""
        self.memory.clear()
        logger.info(f"Memory reset for database agent (session: {session_id})")
    
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
database_agent = None

def get_database_agent() -> DatabaseAgent:
    """Get or create the global database agent instance"""
    global database_agent
    if database_agent is None:
        database_agent = DatabaseAgent()
    return database_agent

async def process_database_query(message: str, session_id: str = None) -> Dict[str, Any]:
    """
    Process a database-related query
    
    Args:
        message: User message
        session_id: Optional session identifier
        
    Returns:
        Response dictionary
    """
    agent = get_database_agent()
    return await agent.process_message(message, session_id)
