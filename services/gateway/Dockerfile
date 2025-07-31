FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    curl \
    nginx \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip install --no-cache-dir \
    fastapi==0.104.1 \
    uvicorn[standard]==0.24.0 \
    websockets==12.0 \
    aiohttp==3.9.1 \
    requests==2.31.0 \
    python-jose[cryptography]==3.3.0 \
    passlib[bcrypt]==1.7.4 \
    python-multipart==0.0.6 \
    pydantic==2.5.0 \
    pydantic-settings==2.0.3 \
    redis==5.0.1 \
    sqlalchemy==2.0.23 \
    psycopg2-binary==2.9.8 \
    prometheus-client==0.19.0 \
    structlog==23.2.0

# Create non-root user
RUN groupadd -r gatewayuser && useradd -r -g gatewayuser -d /home/gatewayuser -s /bin/bash gatewayuser
RUN mkdir -p /home/gatewayuser && chown -R gatewayuser:gatewayuser /home/gatewayuser

# Copy application files
COPY main.py /app/
COPY nginx.conf /etc/nginx/nginx.conf
COPY requirements.txt /app/ 2>/dev/null || true

# Create directories
RUN mkdir -p /app/logs /app/static && \
    chown -R gatewayuser:gatewayuser /app

# Health check script
RUN echo '#!/bin/bash\ncurl -f http://localhost:5000/health || exit 1' > /usr/local/bin/health-check.sh && \
    chmod +x /usr/local/bin/health-check.sh

# Switch to non-root user
USER gatewayuser

# Environment variables
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1
ENV GATEWAY_HOST=0.0.0.0
ENV GATEWAY_PORT=5000
ENV SECRET_KEY=your-secret-key-here
ENV API_TOKEN=your-api-token-here

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD /usr/local/bin/health-check.sh

# Start command
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5000", "--workers", "1"]
