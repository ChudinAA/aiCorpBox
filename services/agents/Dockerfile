FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip install --no-cache-dir \
    fastapi==0.104.1 \
    uvicorn[standard]==0.24.0 \
    langchain==0.0.339 \
    langchain-community==0.0.1 \
    langchain-core==0.1.0 \
    langchain-experimental==0.0.46 \
    langgraph==0.0.20 \
    langsmith==0.0.69 \
    psycopg2-binary==2.9.8 \
    sqlalchemy==2.0.23 \
    alembic==1.12.1 \
    pydantic==2.5.0 \
    pydantic-settings==2.0.3 \
    requests==2.31.0 \
    aiohttp==3.9.1 \
    websockets==12.0 \
    redis==5.0.1 \
    celery==5.3.4 \
    python-multipart==0.0.6 \
    python-jose[cryptography]==3.3.0 \
    passlib[bcrypt]==1.7.4 \
    pandas==2.1.3 \
    numpy==1.24.3

# Create non-root user
RUN groupadd -r agentuser && useradd -r -g agentuser -d /home/agentuser -s /bin/bash agentuser
RUN mkdir -p /home/agentuser && chown -R agentuser:agentuser /home/agentuser

# Copy application files
COPY agents/ /app/agents/
COPY tools/ /app/tools/
COPY main.py /app/
COPY requirements.txt /app/ 2>/dev/null || true

# Create directories
RUN mkdir -p /app/logs /app/data /app/cache && \
    chown -R agentuser:agentuser /app

# Health check script
RUN echo '#!/bin/bash\ncurl -f http://localhost:8002/health || exit 1' > /usr/local/bin/health-check.sh && \
    chmod +x /usr/local/bin/health-check.sh

# Switch to non-root user
USER agentuser

# Environment variables
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1
ENV OLLAMA_API_BASE=http://ollama:11434
ENV RAG_API_BASE=http://rag:8001
ENV POSTGRES_HOST=postgres
ENV POSTGRES_PORT=5432

# Expose port
EXPOSE 8002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD /usr/local/bin/health-check.sh

# Start command
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8002", "--workers", "4"]
