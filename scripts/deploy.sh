# Script to deploy all services on heroku via git
set -e  # Exit on error

# cwd variable
cwd=$(pwd)
echo "📂 Current working directory: $cwd"

# Array of services
services=("api-gateway" "comments-service" "contacts-service" "courses-service" "downloads-service" "feedbacks-service" "posts-service" "quizzing-service" "schools-service" "scores-service" "statistics-service" "users-service")

# Check if services array is empty
if [ ${#services[@]} -eq 0 ]; then
    echo "❌ No services found!"
    exit 1
fi

# Check if heroku is installed
if ! command -v heroku &> /dev/null; then
    echo "❌ Heroku CLI not found! Please install it first."
    exit 1
fi

# Check if user is logged in to heroku
if ! heroku auth:whoami &> /dev/null; then
    echo "🔑 Please login to Heroku first..."
    heroku login
fi

# Function to check if changes exist
has_changes() {
    git status --porcelain | grep -q "."
}

# Deploy all services
for service in "${services[@]}"; do
    if [ ! -d "$cwd/$service" ]; then
        echo "⚠️ Warning: $service directory not found, skipping..."
        continue
    fi

    cd "$cwd/$service"
    echo "🚀 Deploying $service..."
    
    # Only commit if there are changes
    if has_changes; then
        echo "📦 Changes detected, committing..."
        git add -A
        git commit -m "deploy: update $service"
    else
        echo "✨ No changes to commit"
    fi

    echo "⬆️ Pushing to Heroku..."
    git push heroku main -f

    echo "✅ Deployed $service successfully!"
    echo "-------------------------------------------"
done

# Return to original directory
cd "$cwd"
echo "✨ All services deployed successfully!"

# Return to cwd
cd $cwd

# Done
echo "All services deployed successfully!"

# End of script
exit 0