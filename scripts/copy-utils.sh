#!/bin/bash

# Define the base directory for the services
BASE_DIR="$(dirname "$0")/.."

# Define the services to copy the files to
SERVICES=(
  "comments-service"
  "contacts-service"
  "courses-service"
  "downloads-service"
  "feedbacks-service" # Skip copying to itself
  "posts-service"
  "quizzing-service"
  "schools-service"
  "scores-service"
  "statistics-service"
  "users-service"
)

# Define the source files
SOURCE_DIR="$BASE_DIR/feedbacks-service/utils"
FILES=("error.js" "helpers.js")

# Loop through each service and copy the files
for SERVICE in "${SERVICES[@]}"; do
  SERVICE_DIR="$BASE_DIR/$SERVICE/utils"

  # Skip copying to feedbacks-service itself
  if [ "$SERVICE" == "feedbacks-service" ]; then
    continue
  fi

  # Check if the service directory exists
  if [ -d "$SERVICE_DIR" ]; then
    for FILE in "${FILES[@]}"; do
      if [ -f "$SOURCE_DIR/$FILE" ]; then
        echo "Copying $FILE to $SERVICE_DIR..."
        cp "$SOURCE_DIR/$FILE" "$SERVICE_DIR/"
      else
        echo "Source file $SOURCE_DIR/$FILE does not exist. Skipping..."
      fi
    done
  else
    echo "Directory $SERVICE_DIR does not exist. Skipping..."
  fi
done

echo "File replacement completed."