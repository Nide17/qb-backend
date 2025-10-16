#!/bin/bash

# Define the base directory for the services
BASE_DIR="$(dirname "$0")/.."

# Define the services and their corresponding ports and MongoDB URIs based on the users-service .env file
SERVICES_PORTS_MONGODB=(
  "comments-service:5010:comments-service"
  "contacts-service:5008:contacts-service"
  "courses-service:5005:courses-service"
  "downloads-service:5007:downloads-service"
  "feedbacks-service:5009:feedbacks-service"
  "posts-service:5003:posts-service"
  "quizzing-service:5002:quizzing-service"
  "schools-service:5004:schools-service"
  "scores-service:5006:scores-service"
  "statistics-service:5011:statistics-service"
)

# Define the source files from users-service
ENV_SOURCE="$BASE_DIR/users-service/.env"
ENV_DOCKER_SOURCE="$BASE_DIR/users-service/.env.docker"

# Loop through each service and create the .env and .env.docker files
for SERVICE_PORT_MONGODB in "${SERVICES_PORTS_MONGODB[@]}"; do
  SERVICE="$(echo $SERVICE_PORT_MONGODB | cut -d: -f1)"
  PORT="$(echo $SERVICE_PORT_MONGODB | cut -d: -f2)"
  MONGODB_DB="$(echo $SERVICE_PORT_MONGODB | cut -d: -f3)"
  SERVICE_DIR="$BASE_DIR/$SERVICE"

  # Check if the service directory exists
  if [ -d "$SERVICE_DIR" ]; then
    # Create .env file
    sed -e "s/^PORT=.*/PORT=$PORT/" -e "s|^MONGODB_URI=.*|MONGODB_URI=mongodb://localhost:27018/$MONGODB_DB|" "$ENV_SOURCE" > "$SERVICE_DIR/.env"

    # Create .env.docker file
    sed -e "s/^PORT=.*/PORT=$PORT/" -e "s|^MONGODB_URI=.*|MONGODB_URI=mongodb://mongodb:27017/$MONGODB_DB|" "$ENV_DOCKER_SOURCE" > "$SERVICE_DIR/.env.docker"

    echo "Created .env and .env.docker for $SERVICE with PORT=$PORT and MONGODB_URI=$MONGODB_DB"
  else
    echo "Directory $SERVICE_DIR does not exist. Skipping..."
  fi
done

echo "Environment setup completed."