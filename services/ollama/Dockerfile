FROM ollama/ollama:latest

# Install additional tools and dependencies
USER root

# Install curl and other utilities
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    jq \
    htop \
    && rm -rf /var/lib/apt/lists/*

# Create ollama user and directories
RUN groupadd -r ollama && useradd -r -g ollama -d /home/ollama -s /bin/bash ollama
RUN mkdir -p /home/ollama/.ollama && chown -R ollama:ollama /home/ollama

# Copy configuration files
COPY models/ /tmp/models/ 2>/dev/null || true

# Create model initialization script
COPY <<EOF /usr/local/bin/init-models.sh
#!/bin/bash
set -e

echo "Starting Ollama service..."
ollama serve &
OLLAMA_PID=\$!

# Wait for Ollama to be ready
echo "Waiting for Ollama API to be available..."
timeout 300 bash -c 'until curl -f http://localhost:11434/api/tags >/dev/null 2>&1; do sleep 2; done'

echo "Ollama API is ready. Checking for models to pull..."

# Default models to pull
MODELS=\${OLLAMA_MODELS:-"llama3.2:3b"}

for model in \$(echo \$MODELS | tr ',' ' '); do
    if [ -n "\$model" ]; then
        echo "Pulling model: \$model"
        ollama pull "\$model" || echo "Failed to pull \$model, continuing..."
    fi
done

echo "Model initialization complete."

# Keep Ollama running
wait \$OLLAMA_PID
EOF

RUN chmod +x /usr/local/bin/init-models.sh

# Health check script
COPY <<EOF /usr/local/bin/health-check.sh
#!/bin/bash
curl -f http://localhost:11434/api/tags >/dev/null 2>&1 || exit 1
EOF

RUN chmod +x /usr/local/bin/health-check.sh

# Switch to ollama user
USER ollama
WORKDIR /home/ollama

# Set environment variables
ENV OLLAMA_HOST=0.0.0.0
ENV OLLAMA_PORT=11434
ENV OLLAMA_MODELS_DIR=/home/ollama/.ollama/models
ENV OLLAMA_KEEP_ALIVE=24h

# Expose port
EXPOSE 11434

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD /usr/local/bin/health-check.sh

# Start with model initialization
CMD ["/usr/local/bin/init-models.sh"]
