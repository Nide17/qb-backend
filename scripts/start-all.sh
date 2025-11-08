#!/bin/bash

# QB Backend Microservices Startup Script
# Docker-only approach for all backend services

set -e

# Function to clear ports used by services
clear_service_ports() {
    echo "🧹 Clearing service ports..."
    
    # Define all ports used by services
    local ports=(5000 5001 5002 5003 5004 5005 5006 5007 5008 5009 5010 5011)
    
    for port in "${ports[@]}"; do
        # Find process using the port
        local pid
        pid=$(lsof -ti:$port 2>/dev/null || echo "")
        
        if [ ! -z "$pid" ]; then
            echo "  🔴 Killing process $pid on port $port"
            kill -9 $pid 2>/dev/null || echo "    ⚠️  Could not kill process $pid"
            sleep 0.5
        else
            echo "  ✅ Port $port is free"
        fi
    done
    
    echo "✅ Port clearing completed"
    echo ""
}

echo "🚀 QB Backend Microservices - Docker Setup"
echo "========================================="
echo ""
echo "Choose an option:"
echo ""
echo "1. 🐳 Start All Backend Services (Docker)"
echo "2. 🏠 Start All Backend Services (Local + MongoDB & Redis in Docker)"
echo "3. 🔄 Restart All Services (Clean build)"
echo "4. 🛑 Stop All Services"
echo "5. 📊 Status Check"
echo "6. 📋 View Logs"
echo ""

read -p "Enter your choice (1-6): " choice

case $choice in
    1)
        echo ""
        echo "🐳 Starting all backend services with Docker..."
        echo "This will start all 11 microservices, MongoDB, and Redis"
        echo ""
        
        # Clear ports first
        clear_service_ports
        
        # Check if .env files exist and are Docker-compatible
        echo "🔧 Checking environment configuration..."
        if [ ! -f "api-gateway/.env" ] || ! grep -q "mongodb:27017" api-gateway/.env 2>/dev/null; then
            echo "⚠️  Setting up Docker environment configuration..."
            if [ -f "./docker-setup.sh" ]; then
                ./docker-setup.sh
            else
                echo "❌ docker-setup.sh not found. Creating basic .env files..."
                # Create basic API Gateway .env if missing
                if [ ! -f "api-gateway/.env" ]; then
                    mkdir -p api-gateway
                    cat > api-gateway/.env << EOF
NODE_ENV=development
PORT=5000
REDIS_HOST=redis
REDIS_PORT=6379
USERS_SERVICE_URL=http://users-service:5001
QUIZZING_SERVICE_URL=http://quizzing-service:5002
POSTS_SERVICE_URL=http://posts-service:5003
SCHOOLS_SERVICE_URL=http://schools-service:5004
COURSES_SERVICE_URL=http://courses-service:5005
SCORES_SERVICE_URL=http://scores-service:5006
DOWNLOADS_SERVICE_URL=http://downloads-service:5007
CONTACTS_SERVICE_URL=http://contacts-service:5008
FEEDBACKS_SERVICE_URL=http://feedbacks-service:5009
COMMENTS_SERVICE_URL=http://comments-service:5010
STATISTICS_SERVICE_URL=http://statistics-service:5011
JWT_SECRET=sl_myJwtSecret
EOF
                fi
            fi
        fi
        
        # Start services
        echo "🔨 Building and starting all services..."
        docker compose up -d
        
        echo ""
        echo "⏳ Waiting for services to be ready..."
        sleep 15
        
        echo ""
        echo "🎉 All backend services started successfully!"
        echo ""
        echo "🔗 Services are available at:"
        echo "  - API Gateway: http://localhost:5000"
        echo "  - Health Check: http://localhost:5000/api/health"
        echo ""
        echo "📊 Database connections:"
        echo "  - MongoDB: localhost:27018 (mapped from 27017 in container)"
        echo "  - Redis: localhost:6379"
        echo ""
        echo "📋 Use 'docker compose logs -f [service-name]' to view logs"
        echo "📋 Use './start-all.sh' option 3 to stop all services"
        ;;
        
    2)
        echo ""
        echo "🏠 Starting backend services locally with Docker databases..."
        echo "This will start MongoDB and Redis in Docker, and backend services locally"
        echo ""
        
        # Clear ports first
        clear_service_ports
        
        # Start only MongoDB and Redis in Docker (from parent directory)
        echo "🐳 Starting MongoDB and Redis containers..."
        
        # Get the absolute path to the parent directory (where docker-compose.yml is)
        SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
        PARENT_DIR="$(dirname "$SCRIPT_DIR")"
        
        # Change to parent directory and run docker compose
        cd "$PARENT_DIR"
        if [ ! -f "docker-compose.yml" ]; then
            echo "❌ docker-compose.yml not found in $PARENT_DIR"
            exit 1
        fi
        
        docker compose up -d mongodb redis
        cd "$SCRIPT_DIR"
        
        echo ""
        echo "⏳ Waiting for databases to be ready..."
        sleep 10
        
        # Check if databases are up
        echo "🔍 Checking database connections..."
        if ! nc -z localhost 27018 2>/dev/null; then
            echo "❌ MongoDB not accessible on port 27018"
            exit 1
        fi
        
        if ! nc -z localhost 6379 2>/dev/null; then
            echo "❌ Redis not accessible on port 6379"
            exit 1
        fi
        
        echo "✅ Databases are ready"
        echo ""
        
        # Create logs directory if it doesn't exist
        mkdir -p ../logs
        
        # Clean up old logs and PID files
        rm -f ../logs/*.log ../logs/*.pid
        
        # Pre-create all log files to avoid race conditions
        echo "🔧 Pre-creating log files..."
        for service in "api-gateway" "users-service" "quizzing-service" "posts-service" "schools-service" "courses-service" "scores-service" "downloads-service" "contacts-service" "feedbacks-service" "comments-service" "statistics-service"; do
            echo "Creating log file for $service"
            touch "../logs/$service.log"
        done
        
        # Start all services concurrently
        echo "🚀 Starting backend services locally with proper sequencing..."
        echo "📋 Real-time logs will be displayed. Press Ctrl+C to stop all services."
        echo ""

        # Function to wait for API Gateway to be ready
        wait_for_api_gateway() {
            local max_attempts=30
            local attempt=1
            
            echo "⏳ Waiting for API Gateway to be ready..."
            
            while [ $attempt -le $max_attempts ]; do
                if curl -s http://localhost:5000/api/health > /dev/null 2>&1; then
                    echo "✅ API Gateway is ready!"
                    return 0
                fi
                
                echo "  ⏳ Attempt $attempt/$max_attempts - waiting for API Gateway..."
                sleep 2
                ((attempt++))
            done
            
            echo "❌ API Gateway failed to start within $((max_attempts * 2)) seconds"
            return 1
        }

        # Array of services and their directories with port info
        declare -A services=(
            ["api-gateway"]="5000"
            ["users-service"]="5001" 
            ["quizzing-service"]="5002"
            ["posts-service"]="5003"
            ["schools-service"]="5004"
            ["courses-service"]="5005"
            ["scores-service"]="5006"
            ["downloads-service"]="5007"
            ["contacts-service"]="5008"
            ["feedbacks-service"]="5009"
            ["comments-service"]="5010"
            ["statistics-service"]="5011"
        )
        
        # Function to start a service
        start_service() {
            local service=$1
            local port=$2
            local logfile="../logs/$service.log"
            local pidfile="../logs/$service.pid"
            
            echo "  📦 Starting $service on port $port..."
            
            if [ ! -d "../$service" ]; then
                echo "    ❌ Directory ../$service not found" 
                echo "    ❌ Directory ../$service not found" >> "$logfile"
                return 1
            fi
            
            cd "../$service"
            
            # Check if package.json exists
            if [ ! -f "package.json" ]; then
                echo "    ❌ package.json not found in $service"
                echo "    ❌ package.json not found in $service" >> "$logfile"
                cd - > /dev/null
                return 1
            fi
            
            # Install dependencies if needed
            if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
                echo "    📥 Installing dependencies for $service..."
                echo "    📥 Installing dependencies for $service..." >> "$logfile"
                npm install --silent >> "$logfile" 2>&1 || {
                    echo "    ⚠️  npm install failed for $service, trying with --legacy-peer-deps"
                    echo "    ⚠️  npm install failed for $service, trying with --legacy-peer-deps" >> "$logfile"
                    npm install --legacy-peer-deps --silent >> "$logfile" 2>&1 || {
                        echo "    ❌ Failed to install dependencies for $service"
                        echo "    ❌ Failed to install dependencies for $service" >> "$logfile"
                        cd - > /dev/null
                        return 1
                    }
                }
            fi
            
            # Start the service in background with service-specific PORT
            {
                echo "=== $service started at $(date) ==="
                echo "Port: $port"
                echo "Directory: $(pwd)"
                echo "Node version: $(node --version 2>/dev/null || echo 'Node not found')"
                echo "NPM version: $(npm --version 2>/dev/null || echo 'NPM not found')"
                echo "=================================="
                echo ""
            } >> "$logfile" 2>&1
            
            # Start the service in background with service-specific environment variables
            PORT="$port" \
            MONGODB_URI="mongodb://localhost:27018/$service" \
            REDIS_URL="redis://localhost:6379" \
            API_GATEWAY_URL="http://localhost:5000" \
            USERS_SERVICE_URL="http://localhost:5001" \
            QUIZZING_SERVICE_URL="http://localhost:5002" \
            POSTS_SERVICE_URL="http://localhost:5003" \
            SCHOOLS_SERVICE_URL="http://localhost:5004" \
            COURSES_SERVICE_URL="http://localhost:5005" \
            SCORES_SERVICE_URL="http://localhost:5006" \
            DOWNLOADS_SERVICE_URL="http://localhost:5007" \
            CONTACTS_SERVICE_URL="http://localhost:5008" \
            FEEDBACKS_SERVICE_URL="http://localhost:5009" \
            COMMENTS_SERVICE_URL="http://localhost:5010" \
            STATISTICS_SERVICE_URL="http://localhost:5011" \
            nohup npm start >> "$logfile" 2>&1 &
            local pid=$!
            echo $pid > "$pidfile"
            
            # Wait a moment to check if the process is still running
            sleep 2
            if kill -0 "$pid" 2>/dev/null; then
                echo "    ✅ $service started successfully (PID: $pid)"
            else
                echo "    ❌ $service failed to start (check logs: ./logs/$service.log)"
                return 1
            fi
            
            cd - > /dev/null
            return 0
        }
        
        # Start API Gateway first (critical dependency)
        echo "🌐 Starting API Gateway first..."
        start_service "api-gateway" "5000"
        
        # Wait for API Gateway to be fully ready
        if ! wait_for_api_gateway; then
            echo "💥 Cannot continue without API Gateway - stopping startup"
            exit 1
        fi
        
        # Small delay to ensure circuit breakers can reset
        echo "🔄 Allowing circuit breakers to reset..."
        sleep 3
        
        # Start other services with brief delays to prevent race conditions
        echo "🚀 Starting dependent services..."
        failed_services=()
        
        # Start services in order with small delays
        for service in "users-service" "quizzing-service" "posts-service" "schools-service" "courses-service" "scores-service" "downloads-service" "contacts-service" "feedbacks-service" "comments-service" "statistics-service"; do
            port="${services[$service]}"
            echo "  📦 Starting $service..."
            start_service "$service" "$port" 
            if [ $? -ne 0 ]; then
                failed_services+=("$service")
            else
                sleep 1  # Brief delay between services to prevent startup race conditions
            fi
        done
        
        echo ""
        echo "⏳ Waiting for services to initialize..."
        sleep 10
        
        # Check which services are actually running
        echo "🔍 Checking service health..."
        running_services=()
        failed_services=()
        
        for service in "${!services[@]}"; do
            port="${services[$service]}"
            pidfile="../logs/$service.pid"
            
            if [ -f "$pidfile" ]; then
                pid=$(cat "$pidfile")
                if kill -0 "$pid" 2>/dev/null; then
                    # Check if port is responding
                    if nc -z localhost "$port" 2>/dev/null; then
                        echo "  ✅ $service (PID: $pid, Port: $port)"
                        running_services+=("$service")
                    else
                        echo "  ⚠️  $service running but port $port not responding (PID: $pid)"
                        running_services+=("$service")
                    fi
                else
                    echo "  ❌ $service failed to start (check logs: ../logs/$service.log)"
                    failed_services+=("$service")
                fi
            else
                echo "  ❌ $service - no PID file found"
                failed_services+=("$service")
            fi
        done
        
        echo ""
        if [ ${#failed_services[@]} -eq 0 ]; then
            echo "🎉 All backend services started successfully!"
        else
            echo "⚠️  Some services failed to start:"
            for service in "${failed_services[@]}"; do
                echo "   - $service"
            done
            echo ""
            echo "🔧 Debug failed services:"
            for service in "${failed_services[@]}"; do
                if [ -f "../logs/$service.log" ]; then
                    echo ""
                    echo "📋 Last 20 lines from $service.log:"
                    echo "----------------------------------------"
                    tail -n 20 "../logs/$service.log"
                    echo "----------------------------------------"
                fi
            done
        fi
        
        echo ""
        echo "🔗 Services are available at:"
        echo "  - API Gateway: http://localhost:5000"
        echo "  - Health Check: http://localhost:5000/api/health"
        echo ""
        echo "📊 Database connections:"
        echo "  - MongoDB: localhost:27018 (Docker container)"
        echo "  - Redis: localhost:6379 (Docker container)"
        echo ""
        echo "📋 Debug Commands:"
        echo "  - View all logs: tail -f ../logs/*.log"
        echo "  - View specific service: tail -f ../logs/[service-name].log"
        echo "  - Check service status: ./scripts/start-all.sh (option 5)"
        echo "  - Stop all services: ./scripts/start-all.sh (option 4)"
        
        # Show live logs from all services
        echo ""
        read -p "🔍 Show live logs from all services? (y/N): " show_logs
        if [[ $show_logs =~ ^[Yy]$ ]]; then
            echo ""
            echo "📋 Live logs (Ctrl+C to exit):"
            echo "=============================="
            # Use multitail if available, otherwise use regular tail
            if command -v multitail >/dev/null 2>&1; then
                multitail ../logs/*.log
            else
                tail -f ../logs/*.log
            fi
        fi
        ;;
        
    3)
        echo ""
        echo "🔄 Restarting all services with clean build..."
        echo ""
        
        # Clear ports first
        clear_service_ports
        
        # Stop and remove everything
        echo "🛑 Stopping existing services..."
        docker compose down --remove-orphans
        
        # Clean up
        echo "🧹 Cleaning up Docker resources..."
        docker system prune -f
        
        # Setup environment again
        if [ -f "./docker-setup.sh" ]; then
            echo "🔧 Refreshing environment configuration..."
            ./docker-setup.sh
        fi
        
        # Rebuild and start
        echo "🔨 Rebuilding and starting services..."
        docker compose up --build -d
        
        echo ""
        echo "⏳ Waiting for services to be ready..."
        sleep 15
        
        echo ""
        echo "🎉 All services restarted successfully!"
        ;;
        
    4)
        echo ""
        echo "🛑 Stopping all backend services..."
        
        # Stop Docker containers
        echo "🐳 Stopping Docker containers..."
        docker compose down --remove-orphans
        
        # Stop local processes if they exist
        echo "🏠 Stopping local processes..."
        if [ -d "../logs" ]; then
            for pidfile in ../logs/*.pid; do
                if [ -f "$pidfile" ]; then
                    service_name=$(basename "$pidfile" .pid)
                    pid=$(cat "$pidfile" 2>/dev/null)
                    if [ ! -z "$pid" ] && kill -0 "$pid" 2>/dev/null; then
                        echo "  🛑 Stopping $service_name (PID: $pid)..."
                        kill "$pid" 2>/dev/null || true
                        # Give it a moment, then force kill if needed
                        sleep 2
                        if kill -0 "$pid" 2>/dev/null; then
                            echo "  💀 Force killing $service_name..."
                            kill -9 "$pid" 2>/dev/null || true
                        fi
                    fi
                    rm -f "$pidfile"
                fi
            done
        fi
        
        # Clean up any remaining node processes
        echo "🧹 Cleaning up any remaining node processes..."
        pkill -f "node.*index.js" 2>/dev/null || true
        
        echo ""
        echo "✅ All services stopped"
        ;;
        
    5)
        echo ""
        echo "📊 Backend Services Status"
        echo "=========================="
        echo ""
        echo "🐳 Docker containers:"
        docker compose ps || echo "No Docker services running"
        echo ""
        
        echo "🏠 Local processes:"
        if [ -d "../logs" ]; then
            local_running=false
            for pidfile in ../logs/*.pid; do
                if [ -f "$pidfile" ]; then
                    service_name=$(basename "$pidfile" .pid)
                    pid=$(cat "$pidfile" 2>/dev/null)
                    if [ ! -z "$pid" ] && kill -0 "$pid" 2>/dev/null; then
                        echo "  ✅ $service_name (PID: $pid)"
                        local_running=true
                    else
                        echo "  ❌ $service_name (stale PID file)"
                        rm -f "$pidfile"
                    fi
                fi
            done
            if [ "$local_running" = false ]; then
                echo "  No local services running"
            fi
        else
            echo "  No local services running"
        fi
        echo ""
        
        echo "🔌 Port health check:"
        services_ports=("5000" "5001" "5002" "5003" "5004" "5005" "5006" "5007" "5008" "5009" "5010" "5011" "27018" "6379")
        service_names=("API Gateway" "Users" "Quizzing" "Posts" "Schools" "Courses" "Scores" "Downloads" "Contacts" "Feedbacks" "Comments" "Statistics" "MongoDB" "Redis")
        
        for i in "${!services_ports[@]}"; do
            port="${services_ports[$i]}"
            name="${service_names[$i]}"
            status=$(nc -z localhost "$port" 2>/dev/null && echo "✅ Active" || echo "❌ Inactive")
            printf "  %-12s (%s): %s\n" "$name" "$port" "$status"
        done
        ;;
        
    6)
        echo ""
        echo "📋 Log Viewing Options:"
        echo ""
        echo "🐳 Docker services:"
        docker compose ps --services 2>/dev/null || echo "No Docker services running"
        echo ""
        echo "🏠 Local services:"
        if [ -d "../logs" ]; then
            for logfile in ../logs/*.log; do
                if [ -f "$logfile" ]; then
                    service_name=$(basename "$logfile" .log)
                    echo "  $service_name"
                fi
            done
        else
            echo "  No local service logs found"
        fi
        echo ""
        echo "Choose log source:"
        echo "1. Docker service logs"
        echo "2. Local service logs"
        echo "3. All logs (Docker + Local)"
        echo ""
        read -p "Enter choice (1-3): " log_choice
        
        case $log_choice in
            1)
                read -p "Enter Docker service name (or press Enter for all): " service_name
                if [ -z "$service_name" ]; then
                    echo ""
                    echo "📋 Showing Docker logs for all services (Ctrl+C to exit):"
                    docker compose logs -f
                else
                    echo ""
                    echo "📋 Showing Docker logs for $service_name (Ctrl+C to exit):"
                    docker compose logs -f "$service_name"
                fi
                ;;
            2)
                if [ ! -d "../logs" ] || [ -z "$(ls -A ../logs/*.log 2>/dev/null)" ]; then
                    echo "❌ No local service logs found"
                    exit 1
                fi
                
                echo "Available local logs:"
                select logfile in ../logs/*.log; do
                    if [ -n "$logfile" ]; then
                        service_name=$(basename "$logfile" .log)
                        echo ""
                        echo "📋 Showing local logs for $service_name (Ctrl+C to exit):"
                        tail -f "$logfile"
                        break
                    else
                        echo "Invalid selection"
                    fi
                done
                ;;
            3)
                echo ""
                echo "📋 Showing all logs (Docker + Local) - Ctrl+C to exit"
                echo "Note: This will show Docker logs first, then local logs"
                echo ""
                
                # Show Docker logs in background
                if docker compose ps --services 2>/dev/null | grep -q .; then
                    echo "🐳 Docker logs:"
                    timeout 10 docker compose logs --tail=50 || true
                    echo ""
                fi
                
                # Show local logs
                if [ -d "../logs" ]; then
                    echo "🏠 Local logs (last 50 lines each):"
                    for logfile in ../logs/*.log; do
                        if [ -f "$logfile" ]; then
                            service_name=$(basename "$logfile" .log)
                            echo "--- $service_name ---"
                            tail -n 50 "$logfile" 2>/dev/null || echo "Could not read $logfile"
                            echo ""
                        fi
                    done
                fi
                ;;
            *)
                echo "❌ Invalid choice"
                exit 1
                ;;
        esac
        ;;
        
    *)
        echo "❌ Invalid choice. Please run the script again and choose 1-6."
        exit 1
        ;;
esac
