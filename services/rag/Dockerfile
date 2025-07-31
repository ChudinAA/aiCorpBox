FROM python:3.11-slim as base

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install system dependencies in one layer
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r raguser && useradd -r -g raguser raguser

# Set working directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY app.py config.yaml ./

# Create necessary directories and set permissions
RUN mkdir -p data logs uploads embeddings_cache && \
    chown -R raguser:raguser /app

# Switch to non-root user
USER raguser

# Environment variables
ENV PYTHONPATH=/app \
    OLLAMA_API_BASE=http://ollama:11434 \
    QDRANT_HOST=qdrant \
    QDRANT_PORT=6333 \
    POSTGRES_HOST=postgres \
    POSTGRES_PORT=5432

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8001/health || exit 1

# Expose port
EXPOSE 8001

# Start command
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "4"]