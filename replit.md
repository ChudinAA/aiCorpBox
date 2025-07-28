# AI Box - Enterprise AI Platform

## Overview

AI Box is a comprehensive, containerized AI platform designed for enterprise deployment. It provides a complete solution for deploying and managing AI services including local LLMs (via Ollama), RAG (Retrieval-Augmented Generation), and AI agents. The system is built with a microservices architecture using Docker containers and can be deployed either via Docker Compose for single-server deployments or Kubernetes/Helm for production environments.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

The platform follows a microservices architecture with the following core components:

### Gateway Layer
- **API Gateway** (Port 5000): Unified entry point handling both WebSocket and REST API requests
- **Load Balancer**: Nginx/Ingress for traffic distribution and SSL termination

### AI Services Layer
- **Ollama Service** (Port 11434): Local Large Language Model hosting and inference
- **RAG Service** (Port 8001): Document processing and retrieval using LlamaIndex + Qdrant
- **AI Agents Service** (Port 8002): Intelligent agents using LangChain with custom tools

### Data Layer
- **PostgreSQL**: Primary application database for conversations, metadata, and structured data
- **Qdrant**: Vector database for document embeddings and semantic search

### Monitoring Layer
- **Prometheus**: Metrics collection and monitoring
- **Grafana**: Visualization dashboards and alerting

## Key Components

### Gateway Service (`services/gateway/main.py`)
The central API gateway that:
- Routes requests to appropriate backend services
- Handles authentication and authorization
- Manages WebSocket connections for real-time communication
- Implements rate limiting and request validation
- Collects Prometheus metrics for monitoring

### RAG Service (`services/rag/app.py`)
Document processing and retrieval service that:
- Processes various document formats (PDF, DOCX, CSV, HTML)
- Creates vector embeddings using HuggingFace models
- Stores embeddings in Qdrant vector database
- Provides semantic search capabilities
- Integrates with Ollama for LLM-powered responses

### AI Agents Service (`services/agents/main.py`)
Intelligent agent orchestration that:
- **Document Agent**: Handles document-related queries and operations
- **Database Agent**: Executes SQL queries and database operations
- **Custom Tools**: Extensible tool system for various operations (API calls, file operations, calculations)
- Uses LangChain framework for agent coordination
- Maintains conversation history and context

### Ollama Integration
Local LLM hosting that:
- Runs language models locally for privacy and control
- Supports multiple model formats and sizes
- Provides OpenAI-compatible API endpoints
- Handles model loading and unloading based on demand

## Data Flow

1. **Request Flow**: Users/applications → Load Balancer → Gateway → Specific AI Service
2. **Document Processing**: Upload → RAG Service → Document parsing → Vector embedding → Qdrant storage
3. **Query Processing**: User query → Gateway → RAG Service → Vector search + LLM generation → Response
4. **Agent Workflow**: User request → Agents Service → Tool selection → External service calls → Response synthesis
5. **Monitoring**: All services → Prometheus metrics → Grafana dashboards

## External Dependencies

### Required Services
- **PostgreSQL**: Application database (configurable connection parameters)
- **Qdrant**: Vector database for embeddings
- **Ollama**: Local LLM inference engine

### Optional Integrations
- **HuggingFace**: For embedding models
- **Prometheus/Grafana**: For monitoring and observability
- **External APIs**: Via custom tools in agents

### Development Dependencies
- FastAPI for all service APIs
- LangChain for agent orchestration
- LlamaIndex for RAG implementation
- SQLAlchemy for database ORM
- Pydantic for data validation

## Deployment Strategy

### Single Server Deployment
- Uses Docker Compose (`docker-compose.yml`)
- All services run on single host
- Suitable for development and small deployments
- Production variant (`docker-compose.prod.yml`) includes TLS and monitoring

### Kubernetes Deployment
- Helm charts in `helm/` directory for orchestration
- Separate charts for application and external dependencies
- Infrastructure as Code using Terraform for cluster provisioning
- Ansible playbooks for server configuration and Docker/k3s installation

### Configuration Management
- Environment variables for service configuration
- YAML configuration files for complex settings
- Kubernetes secrets for sensitive data
- Centralized configuration through gateway service

### Scalability Considerations
- Stateless service design for horizontal scaling
- Database connection pooling
- Vector database clustering (Qdrant)
- Load balancing across service instances
- Monitoring and auto-scaling capabilities

The architecture prioritizes modularity, scalability, and enterprise-grade features while maintaining simplicity in deployment and management.