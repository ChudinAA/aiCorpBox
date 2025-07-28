FROM python:3.11-slim

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

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download embedding models
COPY download_models.py .
RUN python download_models.py || echo "Model download failed, will retry at runtime"

# Copy application files
COPY app.py config.yaml ./

# Create necessary directories and set permissions
RUN mkdir -p data logs uploads embeddings_cache && \
    chown -R raguser:raguser /app

# Switch to non-root user
USER raguser

# Environment variables
ENV PYTHONPATH=/app

# Expose port
EXPOSE 8001

# Start command
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "4"]