#!/usr/bin/env bash
set -euo pipefail

# Open all *-service directories in a single terminal (tmux preferred, gnome-terminal fallback)
# Usage:
#   From repository root: ./scripts/open_services.sh
#   Make executable if needed: chmod +x scripts/open_services.sh
#
# Behavior:
# - Finds folders matching "*-service" in the repo root (one level deep)
# - For each folder, decides a start command heuristic (customized below):
#   - `api-gateway` => run `npm run dev`
#   - other *-service folders => run `npm run <name>` where `<name>` is the folder name without the "-service" suffix
# - Additionally:
#   - Navigates to ../quiz-blog-client and runs `npm run dev` in its own terminal window/tab
#   - From the backend repo root runs `docker compose up -d mongodb redis` (started in a dedicated window/tab)
# - Preferred: create a new tmux session with one window per service + client + infra and attach to it
# - Fallback: open gnome-terminal tabs (one per service + client + infra). Other terminal emulators may be adapted.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SESSION_BASE="qb-services"

# CLI flags
DRY_RUN=0
USE_ATTACH=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --attach)
      USE_ATTACH=1
      shift
      ;;
    --help|-h)
      echo "Usage: $0 [--dry-run] [--attach]"
      echo "  --attach   force use of tmux and attach to the session in the current terminal (requires tmux)"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--dry-run] [--attach]"
      exit 2
      ;;
  esac
done

# Find services (one level deep)
mapfile -t ALL_SERVICES < <(find "$REPO_ROOT" -maxdepth 1 -type d -name "*-service" -printf "%f\n" | sort)

# Include api-gateway explicitly if present (it doesn't match *-service)
if [ -d "$REPO_ROOT/api-gateway" ]; then
  found=0
  for s in "${ALL_SERVICES[@]}"; do
    if [ "$s" = "api-gateway" ]; then
      found=1
      break
    fi
  done
  if [ $found -eq 0 ]; then
    # Prepend so api-gateway appears among backend services
    ALL_SERVICES=("api-gateway" "${ALL_SERVICES[@]}")
  fi
fi

if [ ${#ALL_SERVICES[@]} -eq 0 ]; then
  echo "No *-service directories found under $REPO_ROOT"
  exit 1
fi

echo "Found ${#ALL_SERVICES[@]} services: ${ALL_SERVICES[*]}"

# Determine command for a service directory
detect_cmd() {
  local svc_dir="$1"
  local full="$REPO_ROOT/$svc_dir"
  if [ "$svc_dir" = "api-gateway" ]; then
    echo "npm run dev"
    return
  fi
  # Remove -service suffix for command name
  local cmd_name="${svc_dir%-service}"
  if [ -f "$full/package.json" ]; then
    echo "npm run $cmd_name"
    return
  fi
  if [ -f "$full/index.js" ]; then
    echo "node index.js"
    return
  fi
  # fallback
  echo "npm run $cmd_name"
}

# If dry-run requested, print planned steps and exit
if [ "$DRY_RUN" -eq 1 ]; then
  echo "DRY RUN: planned steps (in order)"
  echo "1) infra: cd \"$REPO_ROOT\" && docker compose up -d mongodb redis"
  echo "2) backend services:"
  for svc in "${ALL_SERVICES[@]}"; do
    cmd=$(detect_cmd "$svc")
    echo "   - $svc: cd \"$REPO_ROOT/$svc\" && $cmd"
  done
  CLIENT_DIR="$REPO_ROOT/../quiz-blog-client"
  if [ -d "$CLIENT_DIR" ]; then
    echo "3) client: cd \"$CLIENT_DIR\" && npm run dev"
  fi
  exit 0
fi

# Prefer gnome-terminal (if available), otherwise fall back to tmux
if command -v tmux >/dev/null 2>&1; then
  TIMESTAMP=$(date +%s)
  SESSION_NAME="$SESSION_BASE-$TIMESTAMP"
  echo "Using tmux. Creating session: $SESSION_NAME"

  # Ensure logs directory exists
  mkdir -p "$REPO_ROOT/logs"

  # Start infra first (initial tmux window)
  tmux new-session -d -s "$SESSION_NAME" -n "infra" bash -lc "source \"$HOME/.bashrc\" >/dev/null 2>&1 || true; source \"$HOME/.profile\" >/dev/null 2>&1 || true; cd \"$REPO_ROOT\" && echo \"Running: docker compose up -d mongodb redis\" && docker compose up -d mongodb redis; exec bash"

  # Add backend service windows
  for svc in "${ALL_SERVICES[@]}"; do
    svc_path="$REPO_ROOT/$svc"
    cmd=$(detect_cmd "$svc")
    win_name="$svc"
  # write logs to repo logs/<svc>.log and tail the file so the tmux window remains interactive
  tmux new-window -t "$SESSION_NAME:" -n "$win_name" bash -lc "source \"$HOME/.bashrc\" >/dev/null 2>&1 || true; source \"$HOME/.profile\" >/dev/null 2>&1 || true; cd \"$svc_path\" && echo \"Running: $cmd\" | tee -a \"$REPO_ROOT/logs/$svc.log\" && ($cmd >> \"$REPO_ROOT/logs/$svc.log\" 2>&1 &) && tail -n +1 -f \"$REPO_ROOT/logs/$svc.log\""
    sleep 0.05
  done

  # Add frontend client (../quiz-blog-client) if present
  CLIENT_DIR="$REPO_ROOT/../quiz-blog-client"
  if [ -d "$CLIENT_DIR" ]; then
  tmux new-window -t "$SESSION_NAME:" -n "client" bash -lc "source \"$HOME/.bashrc\" >/dev/null 2>&1 || true; source \"$HOME/.profile\" >/dev/null 2>&1 || true; cd \"$CLIENT_DIR\" && echo \"Running: npm run dev\" | tee -a \"$REPO_ROOT/logs/client.log\" && (npm run dev >> \"$REPO_ROOT/logs/client.log\" 2>&1 &) && tail -n +1 -f \"$REPO_ROOT/logs/client.log\""
  fi

  echo "Created tmux session with infra + ${#ALL_SERVICES[@]} service windows. Attaching..."
  tmux attach-session -t "$SESSION_NAME"
  exit 0
fi

# Fallback: gnome-terminal (one tab per service)
if command -v gnome-terminal >/dev/null 2>&1; then
  echo "Using gnome-terminal. Launching one window per service (safer on some systems)..."
  # Ensure logs dir exists for GUI path too
  mkdir -p "$REPO_ROOT/logs"

  # infra window
  gnome-terminal --title="infra" -- bash -lc "source \"$HOME/.bashrc\" >/dev/null 2>&1 || true; source \"$HOME/.profile\" >/dev/null 2>&1 || true; cd \"$REPO_ROOT\" && echo \"Running: docker compose up -d mongodb redis\" | tee -a \"$REPO_ROOT/logs/infra.log\" && (docker compose up -d mongodb redis >> \"$REPO_ROOT/logs/infra.log\" 2>&1 &) && tail -n +1 -f \"$REPO_ROOT/logs/infra.log\"" &

  # backend service windows
  for svc in "${ALL_SERVICES[@]}"; do
    svc_path="$REPO_ROOT/$svc"
    cmd=$(detect_cmd "$svc")
    gnome-terminal --title="$svc" -- bash -lc "source \"$HOME/.bashrc\" >/dev/null 2>&1 || true; source \"$HOME/.profile\" >/dev/null 2>&1 || true; cd \"$svc_path\" && echo \"Running: $cmd\" | tee -a \"$REPO_ROOT/logs/$svc.log\" && ($cmd >> \"$REPO_ROOT/logs/$svc.log\" 2>&1 &) && tail -n +1 -f \"$REPO_ROOT/logs/$svc.log\"" &
    sleep 0.03
  done

  # client window
  CLIENT_DIR="$REPO_ROOT/../quiz-blog-client"
  if [ -d "$CLIENT_DIR" ]; then
    gnome-terminal --title="client" -- bash -lc "source \"$HOME/.bashrc\" >/dev/null 2>&1 || true; source \"$HOME/.profile\" >/dev/null 2>&1 || true; cd \"$CLIENT_DIR\" && echo \"Running: npm run dev\" | tee -a \"$REPO_ROOT/logs/client.log\" && (npm run dev >> \"$REPO_ROOT/logs/client.log\" 2>&1 &) && tail -n +1 -f \"$REPO_ROOT/logs/client.log\"" &
  fi

  echo "Launched gnome-terminal windows for infra + ${#ALL_SERVICES[@]} services."
  exit 0
fi

# Last resort: print instructions
echo "Neither tmux nor gnome-terminal found."
echo "You can run the commands manually in separate terminals. Example commands:"
for svc in "${ALL_SERVICES[@]}"; do
  svc_path="$REPO_ROOT/$svc"
  cmd=$(detect_cmd "$svc")
  echo "$svc: (cd \"$svc_path\" && $cmd)"
done

exit 0
