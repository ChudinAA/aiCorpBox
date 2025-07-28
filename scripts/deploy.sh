#!/bin/bash

# AI Box Deployment Script
# This script provides one-click deployment for AI Box on different environments

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default configuration
DEPLOYMENT_TYPE="docker-compose"
ENVIRONMENT="development"
DOMAIN="localhost"
ENABLE_TLS="false"
SKIP_MODELS="false"
PRODUCTION_MODE="false"

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
AI Box Deployment Script

Usage: $0 [OPTIONS]

Options:
    -t, --type TYPE           Deployment type: docker-compose, kubernetes, ansible (default: docker-compose)
    -e, --environment ENV     Environment: development, staging, production (default: development)
    -d, --domain DOMAIN       Domain for the deployment (default: localhost)
    --enable-tls             Enable TLS/SSL certificates
    --production             Enable production mode with optimizations
    --skip-models            Skip downloading AI models
    -h, --help               Show this help message

Examples:
    $0                                          # Deploy with default settings
    $0 -t kubernetes -e production             # Deploy to Kubernetes in production
    $0 -t docker-compose --production          # Deploy with Docker Compose in production mode
    $0 -t ansible -d ai-box.company.com       # Deploy with Ansible to custom domain

EOF
}

# Function to check prerequisites
check_prerequisites() {
    print_info "Checking prerequisites..."
    
    case $DEPLOYMENT_TYPE in
        "docker-compose")
            if ! command -v docker &> /dev/null; then
                print_error "Docker is not installed or not in PATH"
                exit 1
            fi
            
            if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
                print_error "Docker Compose is not installed or not in PATH"
                exit 1
            fi
            ;;
            
        "kubernetes")
            if ! command -v kubectl &> /dev/null; then
                print_error "kubectl is not installed or not in PATH"
                exit 1
            fi
            
            if ! command -v helm &> /dev/null; then
                print_error "Helm is not installed or not in PATH"
                exit 1
            fi
            
            # Check if kubectl can connect to cluster
            if ! kubectl cluster-info &> /dev/null; then
                print_error "Cannot connect to Kubernetes cluster"
                exit 1
            fi
            ;;
            
        "ansible")
            if ! command -v ansible &> /dev/null; then
                print_error "Ansible is not installed or not in PATH"
                exit 1
            fi
            
            if ! command -v terraform &> /dev/null; then
                print_warning "Terraform not found. Infrastructure provisioning will be skipped."
            fi
            ;;
    esac
    
    print_success "Prerequisites check completed"
}

# Function to prepare environment files
prepare_environment() {
    print_info "Preparing environment configuration..."
    
    # Copy example env file if .env doesn't exist
    if [[ ! -f ".env" ]]; then
        if [[ -f ".env.example" ]]; then
            cp .env.example .env
            print_info "Created .env file from .env.example"
        else
            print_error ".env.example file not found"
            exit 1
        fi
    fi
    
    # Update environment variables based on parameters
    if [[ "$ENVIRONMENT" == "production" ]]; then
        sed -i.bak "s/ENVIRONMENT=development/ENVIRONMENT=production/" .env
        sed -i.bak "s/DEBUG=true/DEBUG=false/" .env
    fi
    
    if [[ "$DOMAIN" != "localhost" ]]; then
        sed -i.bak "s/EXTERNAL_DOMAIN=localhost/EXTERNAL_DOMAIN=$DOMAIN/" .env
    fi
    
    if [[ "$ENABLE_TLS" == "true" ]]; then
        sed -i.bak "s/TLS_ENABLED=false/TLS_ENABLED=true/" .env
    fi
    
    # Generate random secrets if they're using defaults
    if grep -q "your-secret-key-here" .env; then
        SECRET_KEY=$(openssl rand -hex 32)
        sed -i.bak "s/your-secret-key-here/$SECRET_KEY/" .env
    fi
    
    if grep -q "your-api-token-here" .env; then
        API_TOKEN=$(openssl rand -hex 16)
        sed -i.bak "s/your-api-token-here/$API_TOKEN/" .env
    fi
    
    if grep -q "your-jwt-secret-here" .env; then
        JWT_SECRET=$(openssl rand -hex 32)
        sed -i.bak "s/your-jwt-secret-here/$JWT_SECRET/" .env
    fi
    
    print_success "Environment configuration prepared"
}

# Function to deploy with Docker Compose
deploy_docker_compose() {
    print_info "Deploying AI Box with Docker Compose..."
    
    # Pull latest images
    print_info "Pulling Docker images..."
    docker-compose pull
    
    # Build custom images
    print_info "Building custom images..."
    docker-compose build
    
    # Start services
    if [[ "$PRODUCTION_MODE" == "true" ]]; then
        print_info "Starting services in production mode..."
        docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
    else
        print_info "Starting services in development mode..."
        docker-compose up -d
    fi
    
    # Wait for services to be ready
    print_info "Waiting for services to be ready..."
    sleep 30
    
    # Check service health
    check_service_health_docker
    
    print_success "Docker Compose deployment completed"
    display_access_info_docker
}

# Function to deploy with Kubernetes
deploy_kubernetes() {
    print_info "Deploying AI Box with Kubernetes..."
    
    # Create namespace if it doesn't exist
    kubectl create namespace ai-box --dry-run=client -o yaml | kubectl apply -f -
    
    # Add required Helm repositories
    print_info "Adding Helm repositories..."
    helm repo add bitnami https://charts.bitnami.com/bitnami
    helm repo add qdrant https://qdrant.github.io/qdrant-helm
    helm repo update
    
    # Install dependencies
    print_info "Installing dependencies..."
    
    # Install PostgreSQL
    helm upgrade --install postgresql bitnami/postgresql \
        --namespace ai-box \
        --set auth.postgresPassword="$(grep POSTGRES_PASSWORD .env | cut -d '=' -f2)" \
        --set auth.username="$(grep POSTGRES_USER .env | cut -d '=' -f2)" \
        --set auth.password="$(grep POSTGRES_PASSWORD .env | cut -d '=' -f2)" \
        --set auth.database="$(grep POSTGRES_DB .env | cut -d '=' -f2)"
    
    # Install AI Box
    print_info "Installing AI Box..."
    helm upgrade --install ai-box ./helm/ai-box \
        --namespace ai-box \
        --set global.environment="$ENVIRONMENT" \
        --set ingress.hosts[0].host="$DOMAIN" \
        --set ingress.tls[0].hosts[0]="$DOMAIN" \
        --values ./helm/ai-box/values.yaml
    
    # Wait for deployment
    print_info "Waiting for deployment to be ready..."
    kubectl wait --for=condition=available --timeout=600s deployment --all -n ai-box
    
    print_success "Kubernetes deployment completed"
    display_access_info_k8s
}

# Function to deploy with Ansible
deploy_ansible() {
    print_info "Deploying AI Box with Ansible..."
    
    # Check if inventory file exists
    if [[ ! -f "infra/ansible/inventory.ini" ]]; then
        print_error "Ansible inventory file not found at infra/ansible/inventory.ini"
        print_info "Please configure your inventory file first"
        exit 1
    fi
    
    # Provision infrastructure with Terraform if available
    if command -v terraform &> /dev/null && [[ -d "infra/terraform" ]]; then
        print_info "Provisioning infrastructure with Terraform..."
        cd infra/terraform
        terraform init
        terraform plan -out=tfplan
        terraform apply tfplan
        cd ../..
    fi
    
    # Run Ansible playbook
    print_info "Running Ansible playbook..."
    ansible-playbook -i infra/ansible/inventory.ini infra/ansible/playbook.yml
    
    print_success "Ansible deployment completed"
    display_access_info_ansible
}

# Function to check service health (Docker)
check_service_health_docker() {
    print_info "Checking service health..."
    
    services=("gateway:5000" "rag:8001" "agents:8002" "ollama:11434")
    
    for service in "${services[@]}"; do
        service_name=$(echo $service | cut -d ':' -f1)
        port=$(echo $service | cut -d ':' -f2)
        
        print_info "Checking $service_name..."
        
        max_attempts=30
        attempt=0
        
        while [ $attempt -lt $max_attempts ]; do
            if curl -s -f "http://localhost:$port/health" > /dev/null 2>&1 || \
               curl -s -f "http://localhost:$port/api/tags" > /dev/null 2>&1; then
                print_success "$service_name is healthy"
                break
            fi
            
            attempt=$((attempt + 1))
            sleep 10
        done
        
        if [ $attempt -eq $max_attempts ]; then
            print_warning "$service_name health check timeout"
        fi
    done
}

# Function to load AI models
load_models() {
    if [[ "$SKIP_MODELS" == "true" ]]; then
        print_info "Skipping model loading as requested"
        return
    fi
    
    print_info "Loading AI models..."
    
    case $DEPLOYMENT_TYPE in
        "docker-compose")
            # Run model loading script in Ollama container
            docker-compose exec -T ollama bash /usr/local/bin/load-models.sh || \
            bash scripts/load-models.sh docker-compose
            ;;
            
        "kubernetes")
            # Run model loading job in Kubernetes
            kubectl create job --from=cronjob/model-loader load-models-$(date +%s) -n ai-box || \
            bash scripts/load-models.sh kubernetes
            ;;
            
        "ansible")
            # Run model loading via Ansible
            bash scripts/load-models.sh ansible
            ;;
    esac
    
    print_success "Model loading completed"
}

# Function to display access information (Docker)
display_access_info_docker() {
    print_success "AI Box deployment completed successfully!"
    echo
    echo "================================================================"
    echo "                    ACCESS INFORMATION"
    echo "================================================================"
    echo
    print_info "Main Gateway: http://$DOMAIN:5000"
    print_info "API Documentation: http://$DOMAIN:5000/docs"
    print_info "Health Check: http://$DOMAIN:5000/health"
    echo
    print_info "Individual Services:"
    print_info "  - RAG Service: http://$DOMAIN:8001"
    print_info "  - Agents Service: http://$DOMAIN:8002"
    print_info "  - Ollama LLM: http://$DOMAIN:11434"
    echo
    print_info "Monitoring:"
    print_info "  - Prometheus: http://$DOMAIN:9090"
    print_info "  - Grafana: http://$DOMAIN:3000 (admin/admin123)"
    echo
    print_info "Database:"
    print_info "  - PostgreSQL: $DOMAIN:5432"
    print_info "  - Qdrant: http://$DOMAIN:6333"
    echo
    if [[ "$ENVIRONMENT" == "production" ]]; then
        print_warning "Production deployment completed. Please:"
        print_warning "1. Change default passwords"
        print_warning "2. Configure proper SSL certificates"
        print_warning "3. Set up backup procedures"
        print_warning "4. Review security settings"
    fi
    echo "================================================================"
}

# Function to display access information (Kubernetes)
display_access_info_k8s() {
    print_success "AI Box Kubernetes deployment completed successfully!"
    echo
    echo "================================================================"
    echo "                    ACCESS INFORMATION"
    echo "================================================================"
    echo
    
    # Get ingress IP/hostname
    INGRESS_IP=$(kubectl get ingress ai-box -n ai-box -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "pending")
    if [[ "$INGRESS_IP" == "pending" ]]; then
        INGRESS_IP=$(kubectl get ingress ai-box -n ai-box -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || echo "$DOMAIN")
    fi
    
    print_info "Main Gateway: https://$INGRESS_IP"
    print_info "Domain: https://$DOMAIN"
    print_info "API Documentation: https://$DOMAIN/docs"
    print_info "Health Check: https://$DOMAIN/health"
    echo
    print_info "Kubernetes Resources:"
    print_info "  - Namespace: ai-box"
    print_info "  - Services: $(kubectl get svc -n ai-box --no-headers | wc -l)"
    print_info "  - Pods: $(kubectl get pods -n ai-box --no-headers | wc -l)"
    echo
    print_info "Access with kubectl:"
    print_info "  kubectl get all -n ai-box"
    print_info "  kubectl logs -f deployment/ai-box-gateway -n ai-box"
    echo "================================================================"
}

# Function to display access information (Ansible)
display_access_info_ansible() {
    print_success "AI Box Ansible deployment completed successfully!"
    echo
    echo "================================================================"
    echo "                    ACCESS INFORMATION"
    echo "================================================================"
    echo
    print_info "Main Gateway: https://$DOMAIN"
    print_info "SSH Access: Check your inventory file for server details"
    echo
    print_info "Next steps:"
    print_info "1. Configure DNS records for $DOMAIN"
    print_info "2. Set up SSL certificates"
    print_info "3. Configure monitoring and alerting"
    print_info "4. Set up backup procedures"
    echo "================================================================"
}

# Function to cleanup on failure
cleanup_on_failure() {
    print_error "Deployment failed. Cleaning up..."
    
    case $DEPLOYMENT_TYPE in
        "docker-compose")
            docker-compose down
            ;;
        "kubernetes")
            helm uninstall ai-box -n ai-box || true
            kubectl delete namespace ai-box || true
            ;;
        "ansible")
            print_info "Please manually clean up Ansible-deployed resources"
            ;;
    esac
    
    exit 1
}

# Trap errors and cleanup
trap cleanup_on_failure ERR

# Main function
main() {
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -t|--type)
                DEPLOYMENT_TYPE="$2"
                shift 2
                ;;
            -e|--environment)
                ENVIRONMENT="$2"
                shift 2
                ;;
            -d|--domain)
                DOMAIN="$2"
                shift 2
                ;;
            --enable-tls)
                ENABLE_TLS="true"
                shift
                ;;
            --production)
                PRODUCTION_MODE="true"
                ENVIRONMENT="production"
                shift
                ;;
            --skip-models)
                SKIP_MODELS="true"
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
    
    # Validate deployment type
    if [[ ! "$DEPLOYMENT_TYPE" =~ ^(docker-compose|kubernetes|ansible)$ ]]; then
        print_error "Invalid deployment type: $DEPLOYMENT_TYPE"
        usage
        exit 1
    fi
    
    # Validate environment
    if [[ ! "$ENVIRONMENT" =~ ^(development|staging|production)$ ]]; then
        print_error "Invalid environment: $ENVIRONMENT"
        usage
        exit 1
    fi
    
    print_info "Starting AI Box deployment..."
    print_info "Deployment Type: $DEPLOYMENT_TYPE"
    print_info "Environment: $ENVIRONMENT"
    print_info "Domain: $DOMAIN"
    print_info "TLS Enabled: $ENABLE_TLS"
    print_info "Production Mode: $PRODUCTION_MODE"
    echo
    
    # Check prerequisites
    check_prerequisites
    
    # Prepare environment
    prepare_environment
    
    # Deploy based on type
    case $DEPLOYMENT_TYPE in
        "docker-compose")
            deploy_docker_compose
            ;;
        "kubernetes")
            deploy_kubernetes
            ;;
        "ansible")
            deploy_ansible
            ;;
    esac
    
    # Load models
    load_models
    
    print_success "AI Box deployment completed successfully!"
}

# Run main function
main "$@"
