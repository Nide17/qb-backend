#!/bin/bash

# Define the base directory for the services
BASE_DIR="$(dirname "$0")/.."

# Define the services and the api-gateway
SERVICES=(
  "api-gateway"
  "comments-service"
  "contacts-service"
  "courses-service"
  "downloads-service"
  "feedbacks-service"
  "posts-service"
  "quizzing-service"
  "schools-service"
  "scores-service"
  "statistics-service"
  "users-service"
)

# Function to install dependencies for a service
setup_service_deps() {
  SERVICE=$1
  SERVICE_DIR="$BASE_DIR/$SERVICE"

  if [ -d "$SERVICE_DIR" ]; then
    echo "Installing dependencies for $SERVICE..."
    cd "$SERVICE_DIR"
    if [ -f "package.json" ]; then
      npm install
    else
      echo "No package.json found in $SERVICE_DIR. Skipping..."
    fi
    cd - > /dev/null
  else
    echo "Directory $SERVICE_DIR does not exist. Skipping..."
  fi
}

# Loop through each service and install dependencies
for SERVICE in "${SERVICES[@]}"; do
  setup_service_deps "$SERVICE"
done

echo "Development setup completed."