"""
Custom Tools for AI Agents - Model Context Protocol compatible tools
"""

import logging
import os
import json
import asyncio
from typing import List, Dict, Any, Optional, Union
from datetime import datetime, timedelta
from urllib.parse import urlparse
import hashlib

from langchain_core.tools import BaseTool, StructuredTool
from langchain_core.pydantic_v1 import BaseModel, Field
import requests
import aiohttp
import subprocess
import tempfile

logger = logging.getLogger(__name__)

class APICallInput(BaseModel):
    """Input schema for API call tool"""
    url: str = Field(description="URL to make the API call to")
    method: str = Field(default="GET", description="HTTP method (GET, POST, PUT, DELETE)")
    headers: Dict[str, str] = Field(default_factory=dict, description="HTTP headers")
    data: Optional[Dict[str, Any]] = Field(default=None, description="Request body data")
    timeout: int = Field(default=30, description="Request timeout in seconds")

class FileOperationInput(BaseModel):
    """Input schema for file operations"""
    operation: str = Field(description="Operation type: read, write, list, delete")
    path: str = Field(description="File or directory path")
    content: Optional[str] = Field(default=None, description="Content for write operations")
    encoding: str = Field(default="utf-8", description="File encoding")

class TextProcessingInput(BaseModel):
    """Input schema for text processing"""
    text: str = Field(description="Text to process")
    operation: str = Field(description="Operation: summarize, extract_entities, sentiment, keywords")
    options: Dict[str, Any] = Field(default_factory=dict, description="Additional options")

class CalculationInput(BaseModel):
    """Input schema for calculations"""
    expression: str = Field(description="Mathematical expression or calculation")
    variables: Dict[str, float] = Field(default_factory=dict, description="Variable definitions")

class WebScrapingInput(BaseModel):
    """Input schema for web scraping"""
    url: str = Field(description="URL to scrape")
    selector: Optional[str] = Field(default=None, description="CSS selector for specific elements")
    max_content_length: int = Field(default=10000, description="Maximum content length")

class DataTransformInput(BaseModel):
    """Input schema for data transformation"""
    data: Union[List[Dict], Dict] = Field(description="Data to transform")
    operation: str = Field(description="Operation: filter, sort, group, aggregate")
    parameters: Dict[str, Any] = Field(default_factory=dict, description="Operation parameters")

class APICallTool(BaseTool):
    """Tool for making HTTP API calls"""
    name = "api_call"
    description = "Make HTTP API calls to external services"
    args_schema = APICallInput

    def _run(self, url: str, method: str = "GET", headers: Dict[str, str] = None, 
            data: Dict[str, Any] = None, timeout: int = 30) -> str:
        """Execute API call"""
        try:
            # Validate URL
            parsed_url = urlparse(url)
            if not parsed_url.scheme or not parsed_url.netloc:
                return json.dumps({"error": "Invalid URL format"})

            # Security check - only allow certain domains
            allowed_domains = os.getenv("ALLOWED_API_DOMAINS", "").split(",")
            if allowed_domains and allowed_domains != [""]:
                if parsed_url.netloc not in allowed_domains:
                    return json.dumps({"error": f"Domain {parsed_url.netloc} not allowed"})

            headers = headers or {}
            headers.setdefault("User-Agent", "AI-Box-Agent/1.0")

            response = requests.request(
                method=method.upper(),
                url=url,
                headers=headers,
                json=data if data else None,
                timeout=timeout
            )

            result = {
                "status_code": response.status_code,
                "headers": dict(response.headers),
                "url": response.url
            }

            # Try to parse JSON, fall back to text
            try:
                result["data"] = response.json()
            except:
                result["data"] = response.text[:5000]  # Limit response size

            return json.dumps(result, indent=2)

        except Exception as e:
            logger.error(f"API call error: {e}")
            return json.dumps({"error": str(e)})

class FileOperationTool(BaseTool):
    """Tool for file system operations"""
    name = "file_operation"
    description = "Perform file system operations (read, write, list, delete)"
    args_schema = FileOperationInput

    def _run(self, operation: str, path: str, content: str = None, encoding: str = "utf-8") -> str:
        """Execute file operation"""
        try:
            # Security checks
            base_dir = os.getenv("AGENT_WORKSPACE", "/tmp/ai-box-workspace")
            os.makedirs(base_dir, exist_ok=True)

            # Ensure path is within allowed directory
            abs_path = os.path.abspath(os.path.join(base_dir, path.lstrip("/")))
            if not abs_path.startswith(os.path.abspath(base_dir)):
                return json.dumps({"error": "Path outside allowed workspace"})

            if operation == "read":
                if os.path.isfile(abs_path):
                    with open(abs_path, 'r', encoding=encoding) as f:
                        content = f.read()
                    return json.dumps({
                        "success": True,
                        "content": content,
                        "size": len(content),
                        "path": abs_path
                    })
                else:
                    return json.dumps({"error": "File not found"})

            elif operation == "write":
                if content is None:
                    return json.dumps({"error": "Content required for write operation"})

                os.makedirs(os.path.dirname(abs_path), exist_ok=True)
                with open(abs_path, 'w', encoding=encoding) as f:
                    f.write(content)

                return json.dumps({
                    "success": True,
                    "path": abs_path,
                    "size": len(content)
                })

            elif operation == "list":
                if os.path.isdir(abs_path):
                    items = []
                    for item in os.listdir(abs_path):
                        item_path = os.path.join(abs_path, item)
                        items.append({
                            "name": item,
                            "type": "directory" if os.path.isdir(item_path) else "file",
                            "size": os.path.getsize(item_path) if os.path.isfile(item_path) else None,
                            "modified": datetime.fromtimestamp(os.path.getmtime(item_path)).isoformat()
                        })

                    return json.dumps({
                        "success": True,
                        "path": abs_path,
                        "items": items,
                        "count": len(items)
                    })
                else:
                    return json.dumps({"error": "Directory not found"})

            elif operation == "delete":
                if os.path.exists(abs_path):
                    if os.path.isfile(abs_path):
                        os.remove(abs_path)
                    else:
                        os.rmdir(abs_path)

                    return json.dumps({
                        "success": True,
                        "path": abs_path,
                        "message": "File/directory deleted"
                    })
                else:
                    return json.dumps({"error": "File/directory not found"})

            else:
                return json.dumps({"error": f"Unknown operation: {operation}"})

        except Exception as e:
            logger.error(f"File operation error: {e}")
            return json.dumps({"error": str(e)})

class TextProcessingTool(BaseTool):
    """Tool for text processing operations"""
    name = "text_processing"
    description = "Process text for summarization, entity extraction, sentiment analysis"
    args_schema = TextProcessingInput

    def _run(self, text: str, operation: str, options: Dict[str, Any] = None) -> str:
        """Execute text processing"""
        try:
            options = options or {}

            if operation == "summarize":
                # Simple extractive summarization
                sentences = text.split('. ')
                max_sentences = options.get("max_sentences", 3)

                # Simple ranking by sentence length (could be improved)
                ranked_sentences = sorted(sentences, key=len, reverse=True)
                summary = '. '.join(ranked_sentences[:max_sentences])

                return json.dumps({
                    "success": True,
                    "operation": "summarize",
                    "original_length": len(text),
                    "summary_length": len(summary),
                    "summary": summary
                })

            elif operation == "extract_entities":
                # Simple entity extraction (could be enhanced with NLP libraries)
                import re

                # Extract emails
                emails = re.findall(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', text)

                # Extract URLs
                urls = re.findall(r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+', text)

                # Extract phone numbers (basic pattern)
                phones = re.findall(r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b', text)

                # Extract potential names (capitalized words)
                names = re.findall(r'\b[A-Z][a-z]+\s+[A-Z][a-z]+\b', text)

                return json.dumps({
                    "success": True,
                    "operation": "extract_entities",
                    "entities": {
                        "emails": emails,
                        "urls": urls,
                        "phones": phones,
                        "potential_names": names
                    }
                })

            elif operation == "sentiment":
                # Simple sentiment analysis based on word counting
                positive_words = ["good", "great", "excellent", "amazing", "wonderful", "fantastic", "awesome", "love", "like", "happy", "pleased"]
                negative_words = ["bad", "terrible", "awful", "horrible", "hate", "dislike", "sad", "angry", "disappointed", "frustrated"]

                text_lower = text.lower()
                positive_score = sum(1 for word inpositive_words if word in text_lower)
                negative_score = sum(1 for word in negative_words if word in text_lower)

                if positive_score > negative_score:
                    sentiment = "positive"
                    confidence = positive_score / (positive_score + negative_score + 1)
                elif negative_score > positive_score:
                    sentiment = "negative"
                    confidence = negative_score / (positive_score + negative_score + 1)
                else:
                    sentiment = "neutral"
                    confidence = 0.5

                return json.dumps({
                    "success": True,
                    "operation": "sentiment",
                    "sentiment": sentiment,
                    "confidence": round(confidence, 2),
                    "positive_signals": positive_score,
                    "negative_signals": negative_score
                })

            elif operation == "keywords":
                # Simple keyword extraction
                import re
                from collections import Counter

                # Clean and tokenize
                words = re.findall(r'\b[a-zA-Z]{3,}\b', text.lower())

                # Remove common stop words
                stop_words = {"the", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by", "is", "are", "was", "were", "been", "have", "has", "had", "will", "would", "could", "should", "this", "that", "these", "those"}
                words = [word for word in words if word not in stop_words]

                # Count and get top keywords
                word_counts = Counter(words)
                top_keywords = word_counts.most_common(options.get("max_keywords", 10))

                return json.dumps({
                    "success": True,
                    "operation": "keywords",
                    "keywords": [{"word": word, "count": count} for word, count in top_keywords],
                    "total_words": len(words),
                    "unique_words": len(word_counts)
                })

            else:
                return json.dumps({"error": f"Unknown text processing operation: {operation}"})

        except Exception as e:
            logger.error(f"Text processing error: {e}")
            return json.dumps({"error": str(e)})

class CalculationTool(BaseTool):
    """Tool for mathematical calculations"""
    name = "calculation"
    description = "Perform mathematical calculations and evaluations"
    args_schema = CalculationInput

    def _run(self, expression: str, variables: Dict[str, float] = None) -> str:
        """Execute calculation"""
        try:
            variables = variables or {}

            # Security: only allow safe mathematical operations
            import ast
            import operator

            # Allowed operations
            ops = {
                ast.Add: operator.add,
                ast.Sub: operator.sub,
                ast.Mult: operator.mul,
                ast.Div: operator.truediv,
                ast.Pow: operator.pow,
                ast.BitXor: operator.xor,
                ast.USub: operator.neg,
                ast.UAdd: operator.pos,
            }

            def eval_expr(node):
                if isinstance(node, ast.Num):  # number
                    return node.n
                elif isinstance(node, ast.Name):  # variable
                    if node.id in variables:
                        return variables[node.id]
                    else:
                        raise ValueError(f"Unknown variable: {node.id}")
                elif isinstance(node, ast.BinOp):  # binary operation
                    return ops[type(node.op)](eval_expr(node.left), eval_expr(node.right))
                elif isinstance(node, ast.UnaryOp):  # unary operation
                    return ops[type(node.op)](eval_expr(node.operand))
                else:
                    raise TypeError(f"Unsupported operation: {type(node)}")

            # Parse and evaluate
            node = ast.parse(expression, mode='eval')
            result = eval_expr(node.body)

            return json.dumps({
                "success": True,
                "expression": expression,
                "variables": variables,
                "result": result,
                "result_type": type(result).__name__
            })

        except Exception as e:
            logger.error(f"Calculation error: {e}")
            return json.dumps({
                "success": False,
                "expression": expression,
                "error": str(e)
            })

class WebScrapingTool(BaseTool):
    """Tool for web scraping"""
    name = "web_scraping"
    description = "Scrape content from web pages"
    args_schema = WebScrapingInput

    def _run(self, url: str, selector: str = None, max_content_length: int = 10000) -> str:
        """Execute web scraping"""
        try:
            from bs4 import BeautifulSoup

            # Validate URL
            parsed_url = urlparse(url)
            if not parsed_url.scheme or not parsed_url.netloc:
                return json.dumps({"error": "Invalid URL format"})

            # Make request
            headers = {
                "User-Agent": "AI-Box-Agent/1.0",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
            }

            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()

            # Parse HTML
            soup = BeautifulSoup(response.content, 'html.parser')

            # Remove script and style elements
            for script in soup(["script", "style"]):
                script.decompose()

            if selector:
                # Extract specific elements
                elements = soup.select(selector)
                content = "\n".join([elem.get_text().strip() for elem in elements])
            else:
                # Extract all text
                content = soup.get_text()

            # Clean up whitespace
            content = ' '.join(content.split())

            # Limit content length
            if len(content) > max_content_length:
                content = content[:max_content_length] + "..."

            return json.dumps({
                "success": True,
                "url": url,
                "selector": selector,
                "content_length": len(content),
                "content": content,
                "title": soup.title.string if soup.title else None
            })

        except Exception as e:
            logger.error(f"Web scraping error: {e}")
            return json.dumps({
                "success": False,
                "url": url,
                "error": str(e)
            })

class DataTransformTool(BaseTool):
    """Tool for data transformation operations"""
    name = "data_transform"
    description = "Transform and manipulate data structures"
    args_schema = DataTransformInput

    def _run(self, data: Union[List[Dict], Dict], operation: str, parameters: Dict[str, Any] = None) -> str:
        """Execute data transformation"""
        try:
            parameters = parameters or {}

            if operation == "filter":
                if not isinstance(data, list):
                    return json.dumps({"error": "Filter operation requires list of dictionaries"})

                field = parameters.get("field")
                value = parameters.get("value")
                operator_type = parameters.get("operator", "equals")

                if not field:
                    return json.dumps({"error": "Field parameter required for filter"})

                filtered_data = []
                for item in data:
                    if field in item:
                        item_value = item[field]

                        if operator_type == "equals" and item_value == value:
                            filtered_data.append(item)
                        elif operator_type == "greater_than" and item_value > value:
                            filtered_data.append(item)
                        elif operator_type == "less_than" and item_value < value:
                            filtered_data.append(item)
                        elif operator_type == "contains" and value in str(item_value):
                            filtered_data.append(item)

                return json.dumps({
                    "success": True,
                    "operation": "filter",
                    "original_count": len(data),
                    "filtered_count": len(filtered_data),
                    "data": filtered_data
                })

            elif operation == "sort":
                if not isinstance(data, list):
                    return json.dumps({"error": "Sort operation requires list of dictionaries"})

                field = parameters.get("field")
                reverse = parameters.get("reverse", False)

                if not field:
                    return json.dumps({"error": "Field parameter required for sort"})

                sorted_data = sorted(data, key=lambda x: x.get(field, ""), reverse=reverse)

                return json.dumps({
                    "success": True,
                    "operation": "sort",
                    "field": field,
                    "reverse": reverse,
                    "count": len(sorted_data),
                    "data": sorted_data
                })

            elif operation == "group":
                if not isinstance(data, list):
                    return json.dumps({"error": "Group operation requires list of dictionaries"})

                field = parameters.get("field")

                if not field:
                    return json.dumps({"error": "Field parameter required for group"})

                grouped_data = {}
                for item in data:
                    key = item.get(field, "unknown")
                    if key not in grouped_data:
                        grouped_data[key] = []
                    grouped_data[key].append(item)

                return json.dumps({
                    "success": True,
                    "operation": "group",
                    "field": field,
                    "groups": len(grouped_data),
                    "data": grouped_data
                })

            elif operation == "aggregate":
                if not isinstance(data, list):
                    return json.dumps({"error": "Aggregate operation requires list of dictionaries"})

                field = parameters.get("field")
                agg_type = parameters.get("type", "count")

                if agg_type == "count":
                    result = len(data)
                elif agg_type == "sum" and field:
                    result = sum(item.get(field, 0) for item in data if isinstance(item.get(field), (int, float)))
                elif agg_type == "avg" and field:
                    values = [item.get(field, 0) for item in data if isinstance(item.get(field), (int, float))]
                    result = sum(values) / len(values) if values else 0
                elif agg_type == "min" and field:
                    values = [item.get(field) for item in data if item.get(field) is not None]
                    result = min(values) if values else None
                elif agg_type == "max" and field:
                    values = [item.get(field) for item in data if item.get(field) is not None]
                    result = max(values) if values else None
                else:
                    return json.dumps({"error": f"Unknown aggregation type: {agg_type}"})

                return json.dumps({
                    "success": True,
                    "operation": "aggregate",
                    "type": agg_type,
                    "field": field,
                    "result": result,
                    "input_count": len(data)
                })

            else:
                return json.dumps({"error": f"Unknown data transformation operation: {operation}"})

        except Exception as e:
            logger.error(f"Data transformation error: {e}")
            return json.dumps({
                "success": False,
                "operation": operation,
                "error": str(e)
            })

# Export all tools
CUSTOM_TOOLS = [
    APICallTool(),
    FileOperationTool(),
    TextProcessingTool(),
    CalculationTool(),
    WebScrapingTool(),
    DataTransformTool()
]

def get_custom_tools() -> List[BaseTool]:
    """Get all custom tools"""
    return CUSTOM_TOOLS

def get_tool_by_name(name: str) -> Optional[BaseTool]:
    """Get a specific tool by name"""
    for tool in CUSTOM_TOOLS:
        if tool.name == name:
            return tool
    return None