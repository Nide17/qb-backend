#!/bin/bash

# QB Microservices Script Launcher
# Easy access to all project scripts

echo "🚀 QB Microservices - Script Launcher"
echo "====================================="
echo ""

if [ $# -eq 0 ]; then
    echo "Available scripts:"
    echo ""
    echo "🚀 Startup & Environment:"
    echo "  ./run.sh start-all         # Interactive menu to start services"
    echo "  ./run.sh switch-env local  # Switch to local development"
    echo "  ./run.sh switch-env docker # Switch to Docker environment"
    echo "  ./run.sh start-service API_GATEWAY # Start individual service"
    echo ""
    echo "🔧 Setup & Configuration:"
    echo "  ./run.sh setup-env         # Setup environment files"
    echo "  ./run.sh docker-setup      # Configure Docker environment"
    echo "  ./run.sh dev-setup         # Development environment setup"
    echo ""
    echo "📊 Monitoring & Maintenance:"
    echo "  ./run.sh status            # Check service health status"
    echo "  ./run.sh cleanup           # Clean up project files"
    echo ""
    echo "🐳 Docker Commands:"
    echo "  ./run.sh deploy            # Deploy to production"
    echo ""
    echo "Usage: ./run.sh [script-name] [args...]"
    exit 0
fi

SCRIPT_NAME=$1
shift # Remove script name from arguments

# Map script names to actual files
case $SCRIPT_NAME in
    "start-all")
        exec ./scripts/start-all.sh "$@"
        ;;
    "switch-env")
        exec ./scripts/switch-env.sh "$@"
        ;;
    "start-service")
        exec ./scripts/start-service.sh "$@"
        ;;
    "setup-env")
        exec ./scripts/setup-environments.sh "$@"
        ;;
    "docker-setup")
        exec ./scripts/docker-setup.sh "$@"
        ;;
    "dev-setup")
        exec ./scripts/dev-setup.sh "$@"
        ;;
    "status")
        exec ./scripts/status-check.sh "$@"
        ;;
    "cleanup")
        exec ./scripts/cleanup-project.sh "$@"
        ;;
    "deploy")
        exec ./scripts/deploy.sh "$@"
        ;;
    *)
        echo "❌ Unknown script: $SCRIPT_NAME"
        echo ""
        echo "Run './run.sh' without arguments to see available scripts."
        exit 1
        ;;
esac
