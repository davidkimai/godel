#!/bin/bash

# Production deployment script for dash application
# Usage: ./deploy.sh [environment] [--rollback]

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_NAME="${IMAGE_NAME:-ghcr.io/org/dash}"
K8S_DIR="${SCRIPT_DIR}/kubernetes"
NAMESPACE="${NAMESPACE:-default}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Help function
show_help() {
    echo "Usage: $0 [environment] [--rollback]"
    echo ""
    echo "Environments:"
    echo "  staging    Deploy to staging environment"
    echo "  production Deploy to production environment (default)"
    echo ""
    echo "Options:"
    echo "  --rollback  Rollback to previous deployment"
    echo "  --help      Show this help message"
}

# Parse arguments
ENVIRONMENT="production"
ROLLBACK=false

while [[ $# -gt 0 ]]; do
    case $1 in
        staging|production)
            ENVIRONMENT="$1"
            shift
            ;;
        --rollback)
            ROLLBACK=true
            shift
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(staging|production)$ ]]; then
    log_error "Invalid environment: $ENVIRONMENT"
    show_help
    exit 1
fi

# Set context based on environment
case $ENVIRONMENT in
    staging)
        KUBE_CONTEXT="staging"
        log_info "Deploying to STAGING environment..."
        ;;
    production)
        KUBE_CONTEXT="production"
        log_warn "Deploying to PRODUCTION environment!"
        ;;
esac

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    log_error "kubectl is not installed or not in PATH"
    exit 1
fi

# Check if image exists
log_info "Checking Docker image..."
if ! docker pull "$IMAGE_NAME:latest" &> /dev/null; then
    log_error "Failed to pull image: $IMAGE_NAME:latest"
    exit 1
fi

# Tag image for environment
IMAGE_TAG="${IMAGE_NAME}:${ENVIRONMENT}-$(date +%Y%m%d-%H%M%S)"
docker tag "$IMAGE_NAME:latest" "$IMAGE_TAG" || true

if [ "$ROLLBACK" = true ]; then
    log_info "Rolling back deployment..."
    kubectl rollout undo deployment/dash -n "$NAMESPACE"
    kubectl rollout status deployment/dash -n "$NAMESPACE" --timeout=5m
    log_info "Rollback completed successfully"
    exit 0
fi

# Deploy to Kubernetes
log_info "Applying Kubernetes manifests..."
kubectl apply -f "$K8S_DIR/k8s.yaml" -n "$NAMESPACE"

# Update image version
log_info "Updating deployment image..."
kubectl set image deployment/dash dash="$IMAGE_NAME:latest" -n "$NAMESPACE"

# Wait for rollout
log_info "Waiting for deployment rollout..."
kubectl rollout status deployment/dash -n "$NAMESPACE" --timeout=10m

# Verify deployment
log_info "Verifying deployment..."
kubectl get pods -n "$NAMESPACE" -l app=dash
kubectl get svc dash -n "$NAMESPACE"

log_info "Deployment to $ENVIRONMENT completed successfully!"
log_info "Application URL: https://dash.example.com"
