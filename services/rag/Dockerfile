FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip install --no-cache-dir \
    fastapi==0.104.1 \
    uvicorn[standard]==0.24.0 \
    llama-index==0.9.13 \
    llama-index-vector-stores-qdrant==0.1.3 \
    llama-index-embeddings-huggingface==0.1.4 \
    llama-index-llms-ollama==0.1.2 \
    qdrant-client==1.6.9 \
    sentence-transformers==2.2.2 \
    transformers==4.35.2 \
    torch==2.1.1 \
    psycopg2-binary==2.9.8 \
    sqlalchemy==2.0.23 \
    alembic==1.12.1 \
    pydantic==2.5.0 \
    pydantic-settings==2.0.3 \
    python-multipart==0.0.6 \
    aiofiles==0.24.0 \
    pypdf==3.17.1 \
    python-docx==1.1.0 \
    openpyxl==3.1.2 \
    beautifulsoup4==4.12.2 \
    requests==2.31.0 \
    numpy==1.24.3 \
    pandas==2.1.3 \
    scikit-learn==1.3.2

# Create non-root user
RUN groupadd -r raguser && useradd -r -g raguser -d /home/raguser -s /bin/bash raguser
RUN mkdir -p /home/raguser && chown -R raguser:raguser /home/raguser

# Copy application files
COPY app.py /app/
COPY config.yaml /app/
COPY requirements.txt /app/ 2>/dev/null || true

# Create directories for data and logs
RUN mkdir -p /app/data /app/logs /app/uploads && \
    chown -R raguser:raguser /app

# Health check script
RUN echo '#!/bin/bash\ncurl -f http://localhost:8001/health || exit 1' > /usr/local/bin/health-check.sh && \
    chmod +x /usr/local/bin/health-check.sh

# Switch to non-root user
USER raguser

# Environment variables
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1
ENV OLLAMA_API_BASE=http://ollama:11434
ENV QDRANT_HOST=qdrant
ENV QDRANT_PORT=6333
ENV POSTGRES_HOST=postgres
ENV POSTGRES_PORT=5432

# Expose port
EXPOSE 8001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD /usr/local/bin/health-check.sh

# Start command
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "4"]
