# AI Box - Enterprise AI Platform

AI Box is a comprehensive, containerized AI platform designed for enterprise deployment. It provides a complete solution for deploying and managing AI services including local LLMs, RAG (Retrieval-Augmented Generation), AI agents, and a unified API gateway.

## 🏗️ Architecture Overview

```mermaid
graph TB
    subgraph "External Access"
        Users[Users/Applications]
        Messengers[Messengers/Portals]
    end
    
    subgraph "Load Balancer"
        LB[Nginx/Ingress]
    end
    
    subgraph "API Gateway"
        Gateway[Gateway Service<br/>Port 5000<br/>WebSocket + REST]
    end
    
    subgraph "AI Services"
        Ollama[Ollama LLM<br/>Port 11434<br/>Local Language Models]
        RAG[RAG Service<br/>Port 8001<br/>LlamaIndex + Qdrant]
        Agents[AI Agents<br/>Port 8002<br/>LangChain + Tools]
    end
    
    subgraph "Data Layer"
        Postgres[(PostgreSQL<br/>Application Data)]
        Qdrant[(Qdrant<br/>Vector Database)]
    end
    
    subgraph "Monitoring"
        Prometheus[Prometheus<br/>Metrics Collection]
        Grafana[Grafana<br/>Dashboards]
    end
    
    Users --> LB
    Messengers --> LB
    LB --> Gateway
    
    Gateway --> Ollama
    Gateway --> RAG
    Gateway --> Agents
    
    RAG --> Qdrant
    RAG --> Ollama
    Agents --> RAG
    Agents --> Postgres
    Agents --> Ollama
    
    Gateway --> Prometheus
    RAG --> Prometheus
    Agents --> Prometheus
    Prometheus --> Grafana
