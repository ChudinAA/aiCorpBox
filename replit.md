# AI Box - Enterprise AI Platform

## Overview

AI Box is a simplified, one-click deployable AI platform for closed corporate environments. The project has been restructured for maximum simplicity and ease of deployment with progressive complexity: local machine → single server → cluster. Uses unified configuration and Ansible automation for all deployment types.

## User Preferences

Preferred communication style: Simple, everyday language.
Deployment priority: One-click deployment ("развертывание по кнопке") in any infrastructure
Architecture preference: Simple-to-complex progression (local → server → cluster deployment)
Technology focus: Ansible as primary automation tool for all deployment types
Design philosophy: Maximum simplicity in project structure and logic

## Simplified System Architecture

Restructured for progressive deployment complexity with unified automation:

### Progressive Deployment Levels
1. **Local Machine**: Single command deployment with Docker Compose
2. **Single Server**: Ansible automation with Docker on remote server
3. **Cluster**: Kubernetes + Helm + Ansible for enterprise scale

### Core Components (same across all deployment types)
- **API Gateway** (Port 5000): Main entry point with demo interface
- **Ollama Service** (Port 11434): Local LLM hosting
- **PostgreSQL**: Application database
- **Qdrant**: Vector database (for full deployment)
- **Monitoring**: Prometheus + Grafana stack

### Deployment Automation
- **Unified Config**: Single `config/aibox-config.yaml` for all deployments
- **One-Click Scripts**: `./quick-deploy.sh [local|server|cluster]`
- **Ansible Automation**: All infrastructure setup automated
- **Progressive Complexity**: Each level builds on the previous

## Key Components

### Gateway Service (`demo_gateway.py`)
The central AI Box gateway that:
- Provides unified API access to all AI services
- Handles database connections with PostgreSQL
- Implements health checks and monitoring endpoints
- Supports WebSocket connections for real-time communication
- Integrates with Ollama for LLM capabilities
- Collects Prometheus metrics for observability

### Deployment Automation
Completely automated deployment system:
- **Quick Deploy Script** (`quick-deploy.sh`): One-click deployment for all infrastructure types
- **Ansible Automation**: Full server and cluster provisioning with playbooks
- **Docker Compose**: Local and production-ready container orchestration
- **Backup/Restore**: Automated data protection with `scripts/backup.sh` and `scripts/restore.sh`

### Infrastructure Components
- **PostgreSQL**: Primary application database with optimized production settings
- **Qdrant**: Vector database for AI embeddings and semantic search
- **Ollama**: Local LLM hosting with multiple model support
- **Prometheus**: Metrics collection and monitoring
- **Grafana**: Dashboard and visualization platform
- **Nginx**: Optional reverse proxy for production deployments

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

### Progressive Deployment Complexity
- **Local (`./quick-deploy.sh local`)**: Single command Docker Compose deployment for development
- **Server (`./quick-deploy.sh server`)**: Automated Ansible deployment on remote servers with production configuration
- **Cluster (`./quick-deploy.sh cluster`)**: Full Kubernetes deployment with Helm charts and high availability

### Automation & Management
- **One-Click Deployment**: Complete infrastructure provisioning with single command
- **Ansible Automation**: Server preparation, Docker installation, service configuration
- **Backup & Recovery**: Automated daily backups with `scripts/backup.sh` and point-in-time recovery
- **Production-Ready**: Optimized Docker configurations with resource limits, health checks, and logging

### Recent Changes (July 30, 2025)
- ✅ Simplified project structure eliminating duplicate deployment logic
- ✅ Created comprehensive Ansible automation (inventory, playbooks, templates)
- ✅ Added production-ready docker-compose.prod.yml with resource optimization
- ✅ Implemented automated backup/restore scripts with integrity checking
- ✅ Consolidated quick-deploy.sh as single entry point for all deployment types
- ✅ Removed unused files and streamlined configuration management
- ✅ Updated deploy.py to support utilities only, avoiding duplication
- ✅ **RESTORED** services folder with all service Dockerfiles and source code
- ✅ **ADDED** missing ansible/tasks/check-requirements.yml for system validation
- ✅ **COMPLETED** helm charts for Kubernetes deployment (templates, helpers, secrets)
- ✅ **UNIFIED** docker-compose files: removed duplicate docker-compose.yml, kept local and prod versions

### Configuration Management
- **Unified Config**: Single `config/aibox-config.yaml` for all deployment types
- **Environment Variables**: Production secrets through Ansible templates
- **Progressive Complexity**: Each deployment level builds on the previous one
- **Automated Setup**: No manual configuration required for any deployment type

The architecture now achieves maximum simplicity while maintaining enterprise-grade capabilities through complete automation.