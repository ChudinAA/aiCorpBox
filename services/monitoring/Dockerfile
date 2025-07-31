
FROM prom/prometheus:latest

# Switch to root for configuration
USER root

# Copy Prometheus configuration
COPY prometheus.yml /etc/prometheus/prometheus.yml

# Set proper permissions
RUN chown -R nobody:nogroup /etc/prometheus && \
    chown -R nobody:nogroup /prometheus

# Switch back to nobody user
USER nobody

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:9090/-/healthy || exit 1

# Expose port
EXPOSE 9090

# Use default Prometheus entrypoint with optimized config
CMD ["--config.file=/etc/prometheus/prometheus.yml", \
     "--storage.tsdb.path=/prometheus", \
     "--web.console.libraries=/etc/prometheus/console_libraries", \
     "--web.console.templates=/etc/prometheus/consoles", \
     "--web.enable-lifecycle", \
     "--storage.tsdb.retention.time=30d"]
