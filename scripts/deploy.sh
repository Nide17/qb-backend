#!/usr/bin/env bash

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

# For each service, git add -A && git commit -m "deploy" && git push heroku master
for service in "${services[@]}"
do
    cd "$cwd/$service" || { echo "Failed to cd into $cwd/$service"; exit 1; }
    echo "Deploying $service..."

    # # Ensure user is logged in to Heroku; if not, prompt to login
    # if ! heroku auth:whoami &> /dev/null; then
    #     echo "Not logged in to Heroku. Attempting to login..."
    #     heroku login || { echo "Heroku login failed"; exit 1; }
    #     # re-check
    #     if ! heroku auth:whoami &> /dev/null; then
    #         echo "Heroku authentication still not available. Aborting."
    #         exit 1
    #     fi
    # fi

    # Deploy service to heroku via git
    # Only commit if there are staged/unstaged changes to avoid commit failures
    if [ -n "$(git status --porcelain)" ]; then
        git add -A
        git commit -m "deploy" || echo "No commit performed (no changes)"
    else
        echo "No changes to commit for $service"
    fi

    git push heroku master -f
    push_exit_code=$?
    if [ $push_exit_code -ne 0 ]; then
        echo "Failed to deploy $service (git push exited $push_exit_code). Skipping env sync for this service."
    cd "$cwd" || exit 1
        exit 1
    fi

    echo "Deployed $service successfully!"

    # After successful deploy, load environment variables from .env.prod (fallbacks: .env.production)
    env_files=(".env.prod" ".env.production")
    env_file_found=""
    for f in "${env_files[@]}"; do
        if [ -f "$f" ]; then
            env_file_found="$f"
            break
        fi
    done

    if [ -n "$env_file_found" ]; then
        echo "Found env file: $env_file_found. Syncing variables to Heroku..."

        # Try to resolve the Heroku app name from the 'heroku' git remote
        heroku_remote_url=$(git remote get-url heroku 2>/dev/null || true)
        app_name=""
        if [ -n "$heroku_remote_url" ]; then
            # Supports formats: git@heroku.com:APP.git and https://git.heroku.com/APP.git
            app_name=$(echo "$heroku_remote_url" | sed -E 's#.*[:/]([-_a-zA-Z0-9]+)\.git$#\1#')
        fi

        if [ -z "$app_name" ]; then
            echo "Could not determine Heroku app name from git remote. Attempting to continue without --app (requires git remote to be set)"
        else
            echo "Resolved Heroku app name: $app_name"
        fi

        # Build array of KEY=VALUE pairs to pass to heroku config:set
        pairs=()
        while IFS= read -r line || [ -n "$line" ]; do
            # Trim leading/trailing whitespace
            line="$(echo "$line" | sed -E 's/^\s+//; s/\s+$//')"
            # Skip empty lines and comments
            if [ -z "$line" ] || [[ "$line" == \#* ]]; then
                continue
            fi
            # Remove optional 'export ' prefix
            line_no_export=$(echo "$line" | sed -E 's/^export\s+//')
            # Skip lines without an '=' separator (malformed)
            if [[ "$line_no_export" != *=* ]]; then
                echo "Skipping malformed line in $env_file_found: $line"
                continue
            fi
            # Split on the first '=' into key and value
            key=${line_no_export%%=*}
            value=${line_no_export#*=}
            # Preserve empty values as empty string
            # If value contains spaces or special chars, keep as-is; we'll pass it safely
            # Remove surrounding single or double quotes if present
            if [[ ( ${value:0:1} == '"' && ${value: -1} == '"' ) || ( ${value:0:1} == "'" && ${value: -1} == "'" ) ]]; then
                value=${value:1:-1}
            fi
            pairs+=("$key=$value")
        done < "$env_file_found"

        if [ ${#pairs[@]} -eq 0 ]; then
            echo "No variables found in $env_file_found to sync."
        else
            # Call heroku config:set with all pairs. If app_name is known, use --app to be explicit.
            if [ -n "$app_name" ]; then
                echo "Setting ${#pairs[@]} config vars on Heroku app '$app_name'..."
                heroku config:set "${pairs[@]}" --app "$app_name"
                config_exit=$?
            else
                echo "Setting ${#pairs[@]} config vars on Heroku using current git remote..."
                heroku config:set "${pairs[@]}"
                config_exit=$?
            fi

            if [ $config_exit -ne 0 ]; then
                echo "heroku config:set failed with exit code $config_exit for service $service"
            else
                echo "Environment variables synced for $service."
            fi
        fi
    else
        echo "No env file (.env.prod/.env.production/.env) found for $service. Skipping env sync."
    fi
done

# Return to cwd
cd "$cwd" || exit 1

# Done
echo "All services deployed successfully!"

# End of script
exit 0
