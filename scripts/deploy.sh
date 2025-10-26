# Script to deploy all services on heroku via git

# cwd variable
cwd=$(pwd)
echo "Current working directory: $cwd"

# Array of services
services=("api-gateway" "comments-service" "contacts-service" "courses-service" "downloads-service" "feedbacks-service" "posts-service" "quizzing-service" "schools-service" "scores-service" "statistics-service" "users-service")

# Check if services array is empty
if [ ${#services[@]} -eq 0 ]; then
    echo "No services found!"
    exit 1
fi

# Check if heroku is installed
if ! command -v heroku &> /dev/null
then
    echo "Heroku CLI not found!"
    exit 1
fi

# For each service, git add -A && git commit -m "deploy" && git push heroku main
for service in "${services[@]}"
do
    cd $cwd/$service
    echo "Deploying $service..."

    # Check if user is logged in to heroku
    if ! heroku auth:whoami &> /dev/null
    then
        echo "Not logged in to heroku!"
        exit 1
    fi

    # If not logged in, login to heroku
    if [ $? -ne 0 ]; then
        echo "Logging in to heroku..."
        heroku login
    fi

    # Deploy service to heroku via git
    git add -A
    git commit -m "deploy"
    git push heroku main -f
    echo "Deployed $service successfully!"
done

# Return to cwd
cd $cwd

# Done
echo "All services deployed successfully!"

# End of script
exit 0