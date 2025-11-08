#!/bin/bash

# QB Microservices Status Monitor
# Comprehensive status checking for all services and databases

set -e

echo "🏥 QB Microservices Health Monitor"
echo "=================================="
echo ""

# Function to check service health
check_service_health() {
    local port=$1
    local name=$2
    
    if curl -s --max-time 3 "http://localhost:$port/health" > /dev/null 2>&1; then
        echo "✅ $name Service (port $port): Healthy"
    elif curl -s --max-time 3 "http://localhost:$port" > /dev/null 2>&1; then
        echo "⚠️  $name Service (port $port): Running but no /health endpoint"
    else
        echo "❌ $name Service (port $port): Not responding"
    fi
}

# Check API Gateway first (it provides comprehensive health data)
echo "🚪 API Gateway Health Report:"
echo "----------------------------"
if curl -s --max-time 5 "http://localhost:5000/api/health" > /tmp/health_report.json 2>&1; then
    echo "✅ API Gateway is running and providing health data"
    
    # Extract overall status
    overall_status=$(cat /tmp/health_report.json | grep -o '"status":"[^"]*' | cut -d'"' -f4)
    echo "📊 Overall System Status: $overall_status"
    
    echo ""
    echo "🔗 Individual Service Status from API Gateway:"
    
    # Check if jq is available for better JSON parsing
    if command -v jq >/dev/null 2>&1; then
        cat /tmp/health_report.json | jq -r '.services[] | "• \(.service): \(.status) (\(.responseTime)ms)"'
    else
        echo "  (Install 'jq' for detailed service breakdown)"
        echo "  Raw health data available at: http://localhost:5000/api/health"
    fi
    
    echo ""
    echo "🗄️  Database Status:"
    if command -v jq >/dev/null 2>&1; then
        redis_connected=$(cat /tmp/health_report.json | jq -r '.cache.redis.connected')
        echo "• Redis: $([ "$redis_connected" = "true" ] && echo "✅ Connected" || echo "❌ Disconnected")"
    fi
    
    rm -f /tmp/health_report.json
else
    echo "❌ API Gateway not responding"
fi

echo ""
echo "🐳 Docker Container Status:"
echo "----------------------------"
docker compose ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null | grep -E "(NAME|qb-)" || echo "No containers running"

echo ""
echo "🔌 Direct Port Checks:"
echo "----------------------"

# Check databases
echo "📊 Databases:"
echo "• MongoDB (27018): $(nc -z localhost 27018 && echo "✅ Active" || echo "❌ Inactive")"
echo "• Redis (6379): $(nc -z localhost 6379 && echo "✅ Active" || echo "❌ Inactive")"

echo ""
echo "🎯 Microservices:"

# Check all services
check_service_health 5000 "API Gateway"
check_service_health 5001 "Users"
check_service_health 5002 "Quizzing"
check_service_health 5003 "Posts"
check_service_health 5004 "Schools"
check_service_health 5005 "Courses"
check_service_health 5006 "Scores"
check_service_health 5007 "Downloads"
check_service_health 5008 "Contacts"
check_service_health 5009 "Feedbacks"
check_service_health 5010 "Comments"
check_service_health 5011 "Statistics"

echo ""
echo "📋 Quick Commands:"
echo "==================="
echo "• Full health report: curl http://localhost:5000/api/health | jq"
echo "• View service logs: docker compose logs -f [service-name]"
echo "• Restart service: docker compose restart [service-name]"
echo "• Stop all: docker compose down"
echo "• Start all: docker compose up -d"
echo ""
echo "🔗 Service URLs:"
echo "• API Gateway: http://localhost:5000"
echo "• Health Dashboard: http://localhost:5000/api/health"
echo "• Individual services: http://localhost:500[1-11]"
echo ""
echo "📊 For real-time monitoring, run: watch -n 5 '$0'"
