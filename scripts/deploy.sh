#!/usr/bin/env bash

# Script to deploy all services on heroku via git
set -euo pipefail

# cwd variable
cwd=$(pwd)
LOGFILE="$cwd/scripts/deploy.log"
BACKUP_DIR="$cwd/scripts/deploy_backups"
APP_MAP_FILE="$cwd/scripts/deploy_app_map.env"
URL_STORE="$cwd/scripts/deploy_service_urls.env"
mkdir -p "$(dirname "$LOGFILE")" "$BACKUP_DIR"

log() {
    ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    echo "[$ts] $*" | tee -a "$LOGFILE"
}

DRY_RUN=0
AUTO_YES=0
# parse flags
for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=1 ;;
        -y|--yes) AUTO_YES=1 ;;
        *) ;;
    esac
done
if [ $DRY_RUN -eq 1 ]; then
    log "Running in DRY-RUN mode — no destructive operations will be performed"
fi
if [ $AUTO_YES -eq 1 ]; then
    log "Auto-accept defaults enabled (--yes)"
fi

services=("api-gateway" "comments-service" "contacts-service" "courses-service" "downloads-service" "feedbacks-service" "posts-service" "quizzing-service" "schools-service" "scores-service" "statistics-service" "users-service")

if [ ${#services[@]} -eq 0 ]; then
    log "❌ No services found!"
    exit 1
fi

if ! command -v heroku &> /dev/null; then
    log "❌ Heroku CLI not found! Please install it first."
    exit 1
fi

if ! heroku auth:whoami &> /dev/null; then
    log "🔑 Please login to Heroku first..."
    heroku login
fi

declare -A service_urls
declare -A app_map
declare -A port_to_service

# load optional app map file (service=heroku-app)
if [ -f "$APP_MAP_FILE" ]; then
    while IFS= read -r line || [ -n "$line" ]; do
        [[ "$line" =~ ^[[:space:]]*# ]] && continue
        [[ -z "$line" ]] && continue
        svc=$(echo "$line" | cut -d'=' -f1)
        a=$(echo "$line" | cut -d'=' -f2-)
        svc=$(echo "$svc" | xargs)
        a=$(echo "$a" | xargs)
        if [ -n "$svc" ] && [ -n "$a" ]; then
            app_map[$svc]="$a"
        fi
    done < "$APP_MAP_FILE"
    log "Loaded app map from $APP_MAP_FILE"
fi

# load persisted URLs if any, ask interactively otherwise
if [ -f "$URL_STORE" ]; then
    while IFS= read -r line || [ -n "$line" ]; do
        [[ "$line" =~ ^[[:space:]]*# ]] && continue
        [[ -z "$line" ]] && continue
        svc=$(echo "$line" | cut -d'=' -f1)
        url=$(echo "$line" | cut -d'=' -f2-)
        svc=$(echo "$svc" | xargs)
        url=$(echo "$url" | xargs)
        if [ -n "$svc" ] && [ -n "$url" ]; then
            service_urls[$svc]="$url"
        fi
    done < "$URL_STORE"
fi

echo
log "Please provide public URLs for services (press Enter to accept default). Persisted values will be reused."
for service in "${services[@]}"; do
    if [ -n "${service_urls[$service]:-}" ]; then
        log "Using saved URL for $service: ${service_urls[$service]}"
        continue
    fi
    default_url="https://qb-${service}.herokuapp.com"
    if [ $AUTO_YES -eq 1 ]; then
        input_url="$default_url"
        log "Auto-accepted default URL for $service: $input_url"
    else
        read -r -p "Public URL for $service [$default_url]: " input_url
        if [ -z "$input_url" ]; then
            input_url="$default_url"
        fi
    fi
    service_urls[$service]="$input_url"
    if [ $DRY_RUN -eq 0 ]; then
        echo "${service}=${input_url}" >> "$URL_STORE"
    else
        log "(dry-run) would save ${service}=${input_url} to $URL_STORE"
    fi
done

log "Service URLs:"
for s in "${services[@]}"; do
    log "  $s => ${service_urls[$s]}"
done

# port -> service mapping (used to replace localhost:PORT occurrences)
port_to_service=( [5000]=api-gateway [5001]=users-service [5002]=quizzing-service [5003]=posts-service [5004]=schools-service [5005]=courses-service [5006]=scores-service [5007]=downloads-service [5008]=contacts-service [5009]=feedbacks-service [5010]=comments-service [5011]=statistics-service )

# Default DB & Redis values
DEFAULT_MONGODB_URI='mongodb+srv://parmenide:jesus123@qbtest.pmgdcpw.mongodb.net/'
DEFAULT_REDIS_HOST='redis-16376.c257.us-east-1-3.ec2.redns.redis-cloud.com'
DEFAULT_REDIS_PORT='16376'

has_changes() {
    git status --porcelain | grep -q . || return 1
}

get_app_name_from_remote() {
    url=$(git remote get-url heroku 2>/dev/null || true)
    if [ -z "$url" ]; then
        echo ""
        return
    fi
    if [[ "$url" =~ git.heroku.com[:/]+([^/]+)\.git$ ]]; then
        echo "${BASH_REMATCH[1]}"
        return
    fi
    if [[ "$url" =~ :([^/]+)\.git$ ]]; then
        echo "${BASH_REMATCH[1]}"
        return
    fi
    echo ""
}

ts_global=$(date -u +%Y%m%d%H%M%S)
log "Starting deployment run: $ts_global"

for service in "${services[@]}"; do
    if [ ! -d "$cwd/$service" ]; then
        log "⚠️ Warning: $service directory not found, skipping..."
        continue
    fi

    cd "$cwd/$service"
    log "\n--- Processing $service (cwd: $(pwd)) ---"

    # Ensure git repo
    if [ ! -d .git ]; then
        if [ $DRY_RUN -eq 1 ]; then
            log "(dry-run) would initialize git repo for $service"
        else
            log "Initializing git repo for $service"
            git init
            if [ ! -f .gitignore ]; then
                cat > .gitignore <<'GITIGNORE'
node_modules/
.env
logs/
*.log
GITIGNORE
            fi
            git add .
            git commit -m "Initial commit for $service" || true
        fi
    fi

    # Determine heroku app name (app map file overrides qb- prefix)
    app_name="${app_map[$service]:-}"
    if [ -z "$app_name" ]; then
        # try to read from existing remote first
        app_name=$(get_app_name_from_remote)
    fi
    if [ -z "$app_name" ]; then
        app_name="qb-${service}"
    fi

    log "Using Heroku app: $app_name for service $service"

    # Ensure heroku remote
    if [ $DRY_RUN -eq 1 ]; then
        log "(dry-run) would ensure heroku remote for $app_name"
    else
        if ! git remote | grep -q "^heroku$"; then
            if ! heroku git:remote -a "$app_name" 2>/dev/null; then
                git remote add heroku "https://git.heroku.com/$app_name.git"
            fi
        else
            # set to expected app url just in case
            git remote set-url heroku "https://git.heroku.com/$app_name.git" || true
        fi
    fi

    # Commit changes if any
    if has_changes; then
        if [ $DRY_RUN -eq 1 ]; then
            log "(dry-run) would commit changes in $service"
        else
            log "Committing changes in $service"
            git add -A
            git commit -m "deploy: update $service" || true
        fi
    else
        log "No changes to commit in $service"
    fi

    # Create a short-lived deploy branch and tag
    deploy_branch="deploy-${service}-${ts_global}"
    deploy_tag="deploy-${service}-${ts_global}"
    current_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "HEAD")

    if [ $DRY_RUN -eq 1 ]; then
        log "(dry-run) would create branch $deploy_branch and push to heroku: $deploy_branch:main"
        log "(dry-run) would create tag $deploy_tag"
    else
        log "Creating deploy branch $deploy_branch"
        git checkout -b "$deploy_branch"
    fi

    # Push deploy branch to Heroku main (non-forced)
    if [ $DRY_RUN -eq 1 ]; then
        log "(dry-run) would run: git push heroku ${deploy_branch}:main"
        push_ok=0
    else
        log "Pushing $deploy_branch to heroku:main (non-forced)"
        if git push heroku "${deploy_branch}:main"; then
            push_ok=0
            log "Push succeeded for $service -> $app_name"
        else
            push_ok=1
            log "❌ Push rejected for $service -> $app_name (non-fast-forward). Will create tag and continue. See $LOGFILE"
        fi
    fi

    # Create tag locally to mark the deploy
    if [ $DRY_RUN -eq 1 ]; then
        log "(dry-run) would create tag: $deploy_tag"
    else
        git tag -a "$deploy_tag" -m "Deploy $service at $ts_global" || true
        # try push tag to origin if origin exists
        if git remote get-url origin >/dev/null 2>&1; then
            git push origin "$deploy_tag" || log "Failed to push tag to origin (it may not exist or be writable)"
        fi
    fi

    # restore branch
    if [ $DRY_RUN -eq 1 ]; then
        log "(dry-run) would checkout back to $current_branch and delete $deploy_branch"
    else
        git checkout "$current_branch" || true
        git branch -D "$deploy_branch" || true
    fi

    # Backup existing Heroku config
    backup_file="$BACKUP_DIR/${app_name}_config_${ts_global}.env"
    if [ $DRY_RUN -eq 1 ]; then
        log "(dry-run) would run: heroku config --app $app_name --shell > $backup_file"
    else
        log "Backing up current Heroku config for $app_name -> $backup_file"
        heroku config --app "$app_name" --shell > "$backup_file" 2>/dev/null || log "No existing config or failed to fetch (app may be empty)"
    fi

    # Set config vars from .env with replacements
    envfile="$cwd/$service/.env"
    cfg_pairs=()
    if [ -f "$envfile" ]; then
        log "Processing env file: $envfile"
        while IFS= read -r line || [ -n "$line" ]; do
            [[ "$line" =~ ^[[:space:]]*# ]] && continue
            [[ -z "$line" ]] && continue
            if ! echo "$line" | grep -q '='; then
                continue
            fi
            key=$(echo "$line" | cut -d'=' -f1 | xargs)
            value=$(echo "$line" | cut -d'=' -f2- | xargs)

            if echo "$value" | grep -Eq "localhost|127.0.0.1"; then
                if echo "$value" | grep -Eq ":[0-9]{2,5}"; then
                    port=$(echo "$value" | sed -E 's/.*:([0-9]{2,5}).*/\1/')
                    mapped_service="${port_to_service[$port]:-}"
                    if [ -n "$mapped_service" ] && [ -n "${service_urls[$mapped_service]:-}" ]; then
                        value="${service_urls[$mapped_service]}"
                        log "  Replaced localhost:$port -> $value"
                    else
                        value="${service_urls[api-gateway]:-}"
                        log "  Replaced localhost host -> $value"
                    fi
                else
                    value="${service_urls[api-gateway]:-}"
                    log "  Replaced localhost host -> $value"
                fi
            fi

            if echo "$key" | grep -iEq "mongo|mongodb|MONGODB|DB_URI"; then
                value="$DEFAULT_MONGODB_URI"
                log "  Overriding $key with default MongoDB URI"
            fi

            if echo "$key" | grep -iEq "redis|REDIS"; then
                if echo "$key" | grep -iEq "_HOST$|HOST_|HOST$"; then
                    value="$DEFAULT_REDIS_HOST"
                elif echo "$key" | grep -iEq "_PORT$|PORT$"; then
                    value="$DEFAULT_REDIS_PORT"
                elif echo "$key" | grep -iEq "REDIS_URL"; then
                    value="${DEFAULT_REDIS_HOST}:${DEFAULT_REDIS_PORT}"
                fi
                log "  Setting $key -> $value"
            fi

            cfg_pairs+=("$key=$value")
        done < "$envfile"
    else
        log "No .env file for $service, skipping config set"
    fi

    if [ ${#cfg_pairs[@]} -gt 0 ]; then
        if [ $DRY_RUN -eq 1 ]; then
            log "(dry-run) would set the following config vars on Heroku ($app_name):"
            for kv in "${cfg_pairs[@]}"; do
                log "  $kv"
            done
        else
            log "Setting ${#cfg_pairs[@]} config vars on Heroku for $app_name"
            cmd=(heroku config:set --app "$app_name")
            for kv in "${cfg_pairs[@]}"; do
                cmd+=("$kv")
            done
            # execute
            "${cmd[@]}"
        fi
    fi

    log "Finished processing $service"
done

cd "$cwd"
log "All services processed."

exit 0