#!/bin/bash

# AI Box Migration Script - Docker Compose to Kubernetes
# This script migrates an existing Docker Compose deployment to Kubernetes

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE="ai-box"
BACKUP_DIR="./backups/$(date +%Y%m%d_%H%M%S)"
DOCKER_COMPOSE_FILE="docker-compose.yml"
HELM_CHART_PATH="./helm/ai-box"

# Function to print colored output
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to display usage
usage() {
    cat << EOF
AI Box Migration Script - Docker Compose to Kubernetes

Usage: $0 [OPTIONS]

Options:
    --backup-only           Only create backups without migration
    --skip-backup          Skip data backup (not recommended)
    --namespace NAMESPACE   Kubernetes namespace (default: ai-box)
    --keep-compose         Keep Docker Compose running during migration
    --dry-run              Show what would be done without executing
    -h, --help             Show this help message

Examples:
    $0                              # Full migration with backup
    $0 --backup-only               # Only create backups
    $0 --namespace my-ai-box       # Use custom namespace
    $0 --dry-run                   # Preview migration steps

EOF
}

# Function to check prerequisites
check_prerequisites() {
    print_info "Checking prerequisites for migration..."
    
    # Check if Docker Compose is running
    if ! docker-compose ps | grep -q "Up"; then
        print_error "Docker Compose services are not running"
        print_info "Please start your Docker Compose deployment first"
        exit 1
    fi
    
    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        print_error "kubectl is not installed or not in PATH"
        exit 1
    fi
    
    # Check Helm
    if ! command -v helm &> /dev/null; then
        print_error "Helm is not installed or not in PATH"
        exit 1
    fi
    
    # Check Kubernetes connection
    if ! kubectl cluster-info &> /dev/null; then
        print_error "Cannot connect to Kubernetes cluster"
        exit 1
    fi
    
    # Check if Helm chart exists
    if [[ ! -d "$HELM_CHART_PATH" ]]; then
        print_error "Helm chart not found at $HELM_CHART_PATH"
        exit 1
    fi
    
    print_success "Prerequisites check completed"
}

# Function to create data backups
create_backups() {
    print_info "Creating data backups..."
    
    mkdir -p "$BACKUP_DIR"
    
    # Backup PostgreSQL database
    print_info "Backing up PostgreSQL database..."
    docker-compose exec -T postgres pg_dumpall -U $(grep POSTGRES_USER .env | cut -d '=' -f2) > "$BACKUP_DIR/postgres_backup.sql"
    
    # Backup Qdrant data
    print_info "Backing up Qdrant vector database..."
    docker-compose exec -T qdrant tar -czf - /qdrant/storage > "$BACKUP_DIR/qdrant_backup.tar.gz"
    
    # Backup Ollama models
    print_info "Backing up Ollama models..."
    docker-compose exec -T ollama tar -czf - /root/.ollama > "$BACKUP_DIR/ollama_backup.tar.gz"
    
    # Backup environment configuration
    print_info "Backing up configuration..."
    cp .env "$BACKUP_DIR/env_backup"
    cp "$DOCKER_COMPOSE_FILE" "$BACKUP_DIR/"
    if [[ -f "docker-compose.override.yml" ]]; then
        cp docker-compose.override.yml "$BACKUP_DIR/"
    fi
    
    # Create backup manifest
    cat > "$BACKUP_DIR/backup_manifest.txt" << EOF
AI Box Data Backup - $(date)
================================

Backup Contents:
- postgres_backup.sql: Complete PostgreSQL database dump
- qdrant_backup.tar.gz: Qdrant vector database data
- ollama_backup.tar.gz: Ollama models and configuration
- env_backup: Environment configuration
- docker-compose.yml: Docker Compose configuration

Restore Instructions:
1. Deploy AI Box on Kubernetes
2. Use the restore scripts to import data
3. Verify all services are working

Docker Compose Services Status at Backup Time:
$(docker-compose ps)
EOF
    
    print_success "Backups created in $BACKUP_DIR"
}

# Function to extract configuration from Docker Compose
extract_compose_config() {
    print_info "Extracting configuration from Docker Compose..."
    
    # Read environment variables
    source .env
    
    # Create Kubernetes values file
    cat > "$BACKUP_DIR/migration_values.yaml" << EOF
# Generated migration values from Docker Compose deployment

global:
  environment: production

# PostgreSQL configuration
postgresql:
  auth:
    postgresPassword: "$POSTGRES_PASSWORD"
    username: "$POSTGRES_USER"
    password: "$POSTGRES_PASSWORD"
    database: "$POSTGRES_DB"

# Gateway configuration
gateway:
  secretKey: "$GATEWAY_SECRET_KEY"
  apiToken: "$API_TOKEN"

# Ollama configuration
ollama:
  models:
    - "$OLLAMA_MODEL"

# Resource limits (estimated from Docker Compose)
resources:
  gateway:
    requests:
      memory: "512Mi"
      cpu: "250m"
    limits:
      memory: "1Gi"
      cpu: "500m"
  
  rag:
    requests:
      memory: "1Gi"
      cpu: "500m"
    limits:
      memory: "2Gi"
      cpu: "1000m"
  
  agents:
    requests:
      memory: "1Gi"
      cpu: "500m"
    limits:
      memory: "2Gi"
      cpu: "1000m"
  
  ollama:
    requests:
      memory: "2Gi"
      cpu: "1000m"
    limits:
      memory: "4Gi"
      cpu: "2000m"

# Ingress configuration
ingress:
  enabled: true
  hosts:
    - host: $EXTERNAL_DOMAIN
      paths:
        - path: /
          pathType: Prefix
          service:
            name: gateway
            port: 5000
EOF
    
    print_success "Configuration extracted to $BACKUP_DIR/migration_values.yaml"
}

# Function to deploy to Kubernetes
deploy_to_kubernetes() {
    print_info "Deploying AI Box to Kubernetes..."
    
    # Create namespace
    kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -
    
    # Add Helm repositories
    print_info "Adding Helm repositories..."
    helm repo add bitnami https://charts.bitnami.com/bitnami
    helm repo add qdrant https://qdrant.github.io/qdrant-helm
    helm repo update
    
    # Install AI Box with migration values
    print_info "Installing AI Box Helm chart..."
    helm upgrade --install ai-box "$HELM_CHART_PATH" \
        --namespace "$NAMESPACE" \
        --values "$HELM_CHART_PATH/values.yaml" \
        --values "$BACKUP_DIR/migration_values.yaml" \
        --timeout 20m \
        --wait
    
    # Wait for all pods to be ready
    print_info "Waiting for all pods to be ready..."
    kubectl wait --for=condition=ready pod --all -n "$NAMESPACE" --timeout=600s
    
    print_success "Kubernetes deployment completed"
}

# Function to restore data to Kubernetes
restore_data_to_kubernetes() {
    print_info "Restoring data to Kubernetes deployment..."
    
    # Restore PostgreSQL data
    print_info "Restoring PostgreSQL database..."
    kubectl exec -i deployment/ai-box-postgresql -n "$NAMESPACE" -- psql -U postgres < "$BACKUP_DIR/postgres_backup.sql"
    
    # Restore Qdrant data
    print_info "Restoring Qdrant vector database..."
    kubectl exec -i deployment/ai-box-qdrant -n "$NAMESPACE" -- tar -xzf - -C / < "$BACKUP_DIR/qdrant_backup.tar.gz"
    
    # Restore Ollama models
    print_info "Restoring Ollama models..."
    kubectl exec -i deployment/ai-box-ollama -n "$NAMESPACE" -- tar -xzf - -C / < "$BACKUP_DIR/ollama_backup.tar.gz"
    
    # Restart pods to pick up restored data
    print_info "Restarting pods to pick up restored data..."
    kubectl rollout restart deployment -n "$NAMESPACE"
    kubectl rollout status deployment --all -n "$NAMESPACE"
    
    print_success "Data restoration completed"
}

# Function to verify migration
verify_migration() {
    print_info "Verifying migration..."
    
    # Check pod status
    print_info "Checking pod status..."
    kubectl get pods -n "$NAMESPACE"
    
    # Check service endpoints
    print_info "Checking service endpoints..."
    
    # Get service IPs
    GATEWAY_IP=$(kubectl get svc ai-box-gateway -n "$NAMESPACE" -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "pending")
    
    if [[ "$GATEWAY_IP" == "pending" ]]; then
        # Use port-forward for testing
        print_info "Using port-forward for testing..."
        kubectl port-forward svc/ai-box-gateway 8080:5000 -n "$NAMESPACE" &
        PORT_FORWARD_PID=$!
        sleep 5
        
        # Test health endpoint
        if curl -s -f "http://localhost:8080/health" > /dev/null; then
            print_success "Gateway health check passed"
        else
            print_warning "Gateway health check failed"
        fi
        
        # Kill port-forward
        kill $PORT_FORWARD_PID 2>/dev/null || true
    else
        # Test with external IP
        if curl -s -f "http://$GATEWAY_IP/health" > /dev/null; then
            print_success "Gateway health check passed"
        else
            print_warning "Gateway health check failed"
        fi
    fi
    
    # Check data integrity
    print_info "Checking data integrity..."
    
    # Count documents in database
    DOC_COUNT=$(kubectl exec deployment/ai-box-postgresql -n "$NAMESPACE" -- psql -U postgres -d aibox -t -c "SELECT COUNT(*) FROM documents;" 2>/dev/null || echo "0")
    print_info "Documents in database: $DOC_COUNT"
    
    # Check Qdrant collections
    COLLECTIONS=$(kubectl exec deployment/ai-box-qdrant -n "$NAMESPACE" -- curl -s http://localhost:6333/collections | jq -r '.result.collections | length' 2>/dev/null || echo "0")
    print_info "Qdrant collections: $COLLECTIONS"
    
    print_success "Migration verification completed"
}

# Function to create migration report
create_migration_report() {
    print_info "Creating migration report..."
    
    cat > "$BACKUP_DIR/migration_report.txt" << EOF
AI Box Migration Report - $(date)
=====================================

Migration Details:
- Source: Docker Compose
- Target: Kubernetes (namespace: $NAMESPACE)
- Backup Location: $BACKUP_DIR
- Migration Status: SUCCESS

Kubernetes Resources Created:
$(kubectl get all -n "$NAMESPACE")

Service Endpoints:
$(kubectl get svc -n "$NAMESPACE")

Pod Status:
$(kubectl get pods -n "$NAMESPACE")

Access Information:
- Gateway Service: kubectl port-forward svc/ai-box-gateway 8080:5000 -n $NAMESPACE
- Health Check: http://localhost:8080/health
- API Docs: http://localhost:8080/docs

Next Steps:
1. Configure ingress/load balancer for external access
2. Set up monitoring and alerting
3. Configure SSL certificates
4. Set up backup procedures for Kubernetes
5. Update DNS records if needed
6. Test all functionality thoroughly

Rollback Instructions:
If you need to rollback to Docker Compose:
1. Stop Kubernetes deployment: helm uninstall ai-box -n $NAMESPACE
2. Restore Docker Compose: docker-compose up -d
3. Restore data from backups if needed

EOF
    
    print_success "Migration report created: $BACKUP_DIR/migration_report.txt"
}

# Function to cleanup Docker Compose (optional)
cleanup_docker_compose() {
    print_warning "Stopping Docker Compose deployment..."
    print_warning "This will stop all Docker Compose services!"
    
    read -p "Are you sure you want to stop Docker Compose? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker-compose down
        print_info "Docker Compose stopped. Volumes are preserved."
        print_info "To completely remove volumes, run: docker-compose down -v"
    else
        print_info "Docker Compose left running"
    fi
}

# Main function
main() {
    local BACKUP_ONLY=false
    local SKIP_BACKUP=false
    local KEEP_COMPOSE=false
    local DRY_RUN=false
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --backup-only)
                BACKUP_ONLY=true
                shift
                ;;
            --skip-backup)
                SKIP_BACKUP=true
                shift
                ;;
            --namespace)
                NAMESPACE="$2"
                shift 2
                ;;
            --keep-compose)
                KEEP_COMPOSE=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done
    
    if [[ "$DRY_RUN" == "true" ]]; then
        print_info "DRY RUN MODE - No changes will be made"
        print_info "Migration steps that would be executed:"
        print_info "1. Check prerequisites"
        print_info "2. Create data backups (unless --skip-backup)"
        print_info "3. Extract Docker Compose configuration"
        print_info "4. Deploy to Kubernetes"
        print_info "5. Restore data to Kubernetes"
        print_info "6. Verify migration"
        print_info "7. Create migration report"
        if [[ "$KEEP_COMPOSE" != "true" ]]; then
            print_info "8. Optionally stop Docker Compose"
        fi
        exit 0
    fi
    
    print_info "Starting AI Box migration from Docker Compose to Kubernetes..."
    print_info "Target namespace: $NAMESPACE"
    print_info "Backup directory: $BACKUP_DIR"
    echo
    
    # Check prerequisites
    check_prerequisites
    
    # Create backups unless skipped
    if [[ "$SKIP_BACKUP" != "true" ]]; then
        create_backups
    else
        print_warning "Skipping backup as requested"
        mkdir -p "$BACKUP_DIR"
    fi
    
    # If backup-only mode, exit here
    if [[ "$BACKUP_ONLY" == "true" ]]; then
        print_success "Backup completed. Exiting as requested."
        exit 0
    fi
    
    # Extract configuration
    extract_compose_config
    
    # Deploy to Kubernetes
    deploy_to_kubernetes
    
    # Restore data (unless skipped)
    if [[ "$SKIP_BACKUP" != "true" ]]; then
        restore_data_to_kubernetes
    fi
    
    # Verify migration
    verify_migration
    
    # Create migration report
    create_migration_report
    
    # Cleanup Docker Compose (optional)
    if [[ "$KEEP_COMPOSE" != "true" ]]; then
        cleanup_docker_compose
    fi
    
    print_success "Migration completed successfully!"
    print_info "Check the migration report at: $BACKUP_DIR/migration_report.txt"
    print_info "Access your migrated AI Box at: kubectl port-forward svc/ai-box-gateway 8080:5000 -n $NAMESPACE"
}

# Run main function
main "$@"
