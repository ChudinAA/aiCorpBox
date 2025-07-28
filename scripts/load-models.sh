#!/bin/bash

# AI Box Model Loading Script
# This script downloads and configures AI models for the AI Box platform

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DEPLOYMENT_TYPE="docker-compose"
MODELS_CONFIG_FILE="./services/ollama/models.txt"
DEFAULT_MODELS=(
    "llama3.2:3b"
    "llama3.2:1b"
    "codellama:7b"
    "mistral:7b"
    "phi3:mini"
)

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
AI Box Model Loading Script

Usage: $0 [DEPLOYMENT_TYPE] [OPTIONS]

Arguments:
    DEPLOYMENT_TYPE    Deployment type: docker-compose, kubernetes, ansible (default: docker-compose)

Options:
    --models MODEL1,MODEL2,...  Specify models to load (comma-separated)
    --config-file FILE          Use custom models configuration file
    --force                     Force re-download even if model exists
    --parallel                  Download models in parallel (faster but uses more resources)
    --dry-run                   Show what models would be downloaded
    -h, --help                  Show this help message

Examples:
    $0                                              # Load default models with Docker Compose
    $0 kubernetes                                   # Load models in Kubernetes
    $0 --models "llama3.2:3b,mistral:7b"          # Load specific models
    $0 docker-compose --parallel                   # Load models in parallel
    $0 --dry-run                                   # Preview what would be downloaded

Available Models:
    - llama3.2:3b      # Llama 3.2 3B (recommended for development)
    - llama3.2:1b      # Llama 3.2 1B (lightweight)
    - llama3.2:7b      # Llama 3.2 7B (higher quality)
    - codellama:7b     # Code Llama 7B (for code tasks)
    - mistral:7b       # Mistral 7B (alternative model)
    - phi3:mini        # Phi-3 Mini (Microsoft, lightweight)
    - phi3:medium      # Phi-3 Medium (Microsoft, balanced)

EOF
}

# Function to check prerequisites
check_prerequisites() {
    case $DEPLOYMENT_TYPE in
        "docker-compose")
            if ! command -v docker &> /dev/null; then
                print_error "Docker is not installed or not in PATH"
                exit 1
            fi
            
            if ! docker-compose ps | grep ollama | grep -q Up; then
                print_error "Ollama service is not running in Docker Compose"
                print_info "Please start your AI Box deployment first: docker-compose up -d"
                exit 1
            fi
            ;;
            
        "kubernetes")
            if ! command -v kubectl &> /dev/null; then
                print_error "kubectl is not installed or not in PATH"
                exit 1
            fi
            
            if ! kubectl get deployment ai-box-ollama -n ai-box &> /dev/null; then
                print_error "Ollama deployment not found in Kubernetes"
                print_info "Please deploy AI Box to Kubernetes first"
                exit 1
            fi
            ;;
            
        "ansible")
            if ! command -v ansible &> /dev/null; then
                print_error "Ansible is not installed or not in PATH"
                exit 1
            fi
            ;;
    esac
}

# Function to get models list
get_models_list() {
    local models_list=()
    
    if [[ -n "$CUSTOM_MODELS" ]]; then
        # Use custom models from command line
        IFS=',' read -ra models_list <<< "$CUSTOM_MODELS"
    elif [[ -f "$MODELS_CONFIG_FILE" ]]; then
        # Use models from configuration file
        while IFS= read -r line; do
            # Skip comments and empty lines
            if [[ ! "$line" =~ ^[[:space:]]*# ]] && [[ -n "$line" ]]; then
                models_list+=("$(echo "$line" | xargs)")
            fi
        done < "$MODELS_CONFIG_FILE"
    else
        # Use default models
        models_list=("${DEFAULT_MODELS[@]}")
    fi
    
    echo "${models_list[@]}"
}

# Function to check if model exists
check_model_exists() {
    local model=$1
    
    case $DEPLOYMENT_TYPE in
        "docker-compose")
            if docker-compose exec -T ollama ollama list | grep -q "$model"; then
                return 0
            fi
            ;;
            
        "kubernetes")
            if kubectl exec deployment/ai-box-ollama -n ai-box -- ollama list | grep -q "$model"; then
                return 0
            fi
            ;;
            
        "ansible")
            # For Ansible, we'll assume the model doesn't exist and let Ollama handle it
            return 1
            ;;
    esac
    
    return 1
}

# Function to pull a single model
pull_model() {
    local model=$1
    local force=${2:-false}
    
    print_info "Processing model: $model"
    
    # Check if model already exists
    if [[ "$force" != "true" ]] && check_model_exists "$model"; then
        print_success "Model $model already exists, skipping"
        return 0
    fi
    
    print_info "Downloading model: $model"
    
    case $DEPLOYMENT_TYPE in
        "docker-compose")
            if docker-compose exec -T ollama ollama pull "$model"; then
                print_success "Successfully downloaded: $model"
            else
                print_error "Failed to download: $model"
                return 1
            fi
            ;;
            
        "kubernetes")
            if kubectl exec deployment/ai-box-ollama -n ai-box -- ollama pull "$model"; then
                print_success "Successfully downloaded: $model"
            else
                print_error "Failed to download: $model"
                return 1
            fi
            ;;
            
        "ansible")
            # For Ansible deployment, we'll use a different approach
            pull_model_ansible "$model"
            ;;
    esac
}

# Function to pull model via Ansible
pull_model_ansible() {
    local model=$1
    
    # Create a temporary playbook for model downloading
    cat > /tmp/pull_model.yml << EOF
---
- hosts: all
  become: yes
  tasks:
    - name: Pull Ollama model $model
      shell: |
        ollama pull $model
      register: result
      
    - name: Display result
      debug:
        var: result.stdout
EOF
    
    if ansible-playbook -i infra/ansible/inventory.ini /tmp/pull_model.yml; then
        print_success "Successfully downloaded via Ansible: $model"
        rm -f /tmp/pull_model.yml
    else
        print_error "Failed to download via Ansible: $model"
        rm -f /tmp/pull_model.yml
        return 1
    fi
}

# Function to pull models in parallel
pull_models_parallel() {
    local models=("$@")
    local pids=()
    local failed_models=()
    
    print_info "Downloading ${#models[@]} models in parallel..."
    
    # Start background processes for each model
    for model in "${models[@]}"; do
        (pull_model "$model" "$FORCE_DOWNLOAD") &
        pids+=($!)
    done
    
    # Wait for all processes to complete
    for i in "${!pids[@]}"; do
        if ! wait "${pids[$i]}"; then
            failed_models+=("${models[$i]}")
        fi
    done
    
    # Report results
    if [[ ${#failed_models[@]} -eq 0 ]]; then
        print_success "All models downloaded successfully in parallel"
    else
        print_warning "Some models failed to download: ${failed_models[*]}"
        return 1
    fi
}

# Function to pull models sequentially
pull_models_sequential() {
    local models=("$@")
    local failed_models=()
    
    print_info "Downloading ${#models[@]} models sequentially..."
    
    for model in "${models[@]}"; do
        if ! pull_model "$model" "$FORCE_DOWNLOAD"; then
            failed_models+=("$model")
        fi
    done
    
    # Report results
    if [[ ${#failed_models[@]} -eq 0 ]]; then
        print_success "All models downloaded successfully"
    else
        print_warning "Some models failed to download: ${failed_models[*]}"
        return 1
    fi
}

# Function to verify models
verify_models() {
    local models=("$@")
    
    print_info "Verifying downloaded models..."
    
    case $DEPLOYMENT_TYPE in
        "docker-compose")
            print_info "Available models in Ollama:"
            docker-compose exec -T ollama ollama list
            ;;
            
        "kubernetes")
            print_info "Available models in Ollama:"
            kubectl exec deployment/ai-box-ollama -n ai-box -- ollama list
            ;;
            
        "ansible")
            print_info "Models verification via Ansible:"
            ansible all -i infra/ansible/inventory.ini -m shell -a "ollama list"
            ;;
    esac
    
    # Test each model with a simple prompt
    print_info "Testing models with simple prompts..."
    
    for model in "${models[@]}"; do
        print_info "Testing model: $model"
        
        case $DEPLOYMENT_TYPE in
            "docker-compose")
                if timeout 60 docker-compose exec -T ollama ollama run "$model" "Hello, respond with just 'OK'"; then
                    print_success "Model $model is working"
                else
                    print_warning "Model $model test failed or timed out"
                fi
                ;;
                
            "kubernetes")
                if timeout 60 kubectl exec deployment/ai-box-ollama -n ai-box -- ollama run "$model" "Hello, respond with just 'OK'"; then
                    print_success "Model $model is working"
                else
                    print_warning "Model $model test failed or timed out"
                fi
                ;;
                
            "ansible")
                print_info "Skipping individual model testing for Ansible deployment"
                ;;
        esac
    done
}

# Function to get disk usage info
get_storage_info() {
    print_info "Storage usage information:"
    
    case $DEPLOYMENT_TYPE in
        "docker-compose")
            print_info "Ollama container storage usage:"
            docker-compose exec -T ollama df -h /root/.ollama || true
            
            print_info "Docker volume usage:"
            docker system df || true
            ;;
            
        "kubernetes")
            print_info "Ollama pod storage usage:"
            kubectl exec deployment/ai-box-ollama -n ai-box -- df -h /root/.ollama || true
            
            print_info "Persistent volume usage:"
            kubectl get pv || true
            ;;
            
        "ansible")
            print_info "Storage usage on target hosts:"
            ansible all -i infra/ansible/inventory.ini -m shell -a "df -h /var/lib/ollama" || true
            ;;
    esac
}

# Function to create models manifest
create_models_manifest() {
    local models=("$@")
    local manifest_file="./models_manifest_$(date +%Y%m%d_%H%M%S).txt"
    
    print_info "Creating models manifest..."
    
    cat > "$manifest_file" << EOF
AI Box Models Manifest - $(date)
================================

Deployment Type: $DEPLOYMENT_TYPE
Total Models: ${#models[@]}

Models List:
EOF
    
    for model in "${models[@]}"; do
        echo "- $model" >> "$manifest_file"
    done
    
    cat >> "$manifest_file" << EOF

Download Command Used:
$0 $DEPLOYMENT_TYPE ${ORIGINAL_ARGS[@]}

Storage Information:
EOF
    
    case $DEPLOYMENT_TYPE in
        "docker-compose")
            echo "Docker volume: ollama_data" >> "$manifest_file"
            ;;
        "kubernetes")
            echo "PVC: ai-box-ollama-pvc" >> "$manifest_file"
            ;;
        "ansible")
            echo "Path: /var/lib/ollama" >> "$manifest_file"
            ;;
    esac
    
    print_success "Models manifest created: $manifest_file"
}

# Main function
main() {
    local CUSTOM_MODELS=""
    local FORCE_DOWNLOAD=false
    local PARALLEL_DOWNLOAD=false
    local DRY_RUN=false
    local ORIGINAL_ARGS=("$@")
    
    # Parse deployment type if provided as first argument
    if [[ $# -gt 0 ]] && [[ ! "$1" =~ ^-- ]] && [[ "$1" != "-h" ]]; then
        DEPLOYMENT_TYPE="$1"
        shift
    fi
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --models)
                CUSTOM_MODELS="$2"
                shift 2
                ;;
            --config-file)
                MODELS_CONFIG_FILE="$2"
                shift 2
                ;;
            --force)
                FORCE_DOWNLOAD=true
                shift
                ;;
            --parallel)
                PARALLEL_DOWNLOAD=true
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
    
    # Validate deployment type
    if [[ ! "$DEPLOYMENT_TYPE" =~ ^(docker-compose|kubernetes|ansible)$ ]]; then
        print_error "Invalid deployment type: $DEPLOYMENT_TYPE"
        usage
        exit 1
    fi
    
    print_info "AI Box Model Loading Script"
    print_info "Deployment Type: $DEPLOYMENT_TYPE"
    print_info "Force Download: $FORCE_DOWNLOAD"
    print_info "Parallel Download: $PARALLEL_DOWNLOAD"
    echo
    
    # Get models list
    models=($(get_models_list))
    
    if [[ ${#models[@]} -eq 0 ]]; then
        print_error "No models specified"
        exit 1
    fi
    
    print_info "Models to process: ${models[*]}"
    echo
    
    # Dry run mode
    if [[ "$DRY_RUN" == "true" ]]; then
        print_info "DRY RUN MODE - No models will be downloaded"
        print_info "Would download the following models:"
        for model in "${models[@]}"; do
            print_info "  - $model"
        done
        
        get_storage_info
        exit 0
    fi
    
    # Check prerequisites
    check_prerequisites
    
    # Show storage info before download
    get_storage_info
    
    # Download models
    if [[ "$PARALLEL_DOWNLOAD" == "true" ]]; then
        pull_models_parallel "${models[@]}"
    else
        pull_models_sequential "${models[@]}"
    fi
    
    # Verify models
    verify_models "${models[@]}"
    
    # Show storage info after download
    get_storage_info
    
    # Create manifest
    create_models_manifest "${models[@]}"
    
    print_success "Model loading completed successfully!"
    print_info "You can now use these models with the AI Box services"
}

# Store original arguments for manifest
ORIGINAL_ARGS=("$@")

# Run main function
main "$@"
