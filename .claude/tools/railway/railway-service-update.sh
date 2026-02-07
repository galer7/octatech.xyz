#!/usr/bin/env bash
# Update service configuration
# Usage: railway-service-update.sh --project <id> --service <name> [options]
# Requires: RAILWAY_TOKEN env var

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/railway-gql.sh"

PROJECT_ID=""
SERVICE_NAME=""
ROOT_DIR=""
RESTART_POLICY=""
MAX_RETRIES=""
HEALTHCHECK_PATH=""
HEALTHCHECK_TIMEOUT=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --project|-p)
            PROJECT_ID="$2"
            shift 2
            ;;
        --service|-s)
            SERVICE_NAME="$2"
            shift 2
            ;;
        --root-dir|-r)
            ROOT_DIR="$2"
            shift 2
            ;;
        --restart-policy)
            RESTART_POLICY="$2"
            shift 2
            ;;
        --max-retries)
            MAX_RETRIES="$2"
            shift 2
            ;;
        --healthcheck-path)
            HEALTHCHECK_PATH="$2"
            shift 2
            ;;
        --healthcheck-timeout)
            HEALTHCHECK_TIMEOUT="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 --project <id> --service <name> [options]"
            echo ""
            echo "Required:"
            echo "  --project, -p         Railway project ID"
            echo "  --service, -s         Service name"
            echo ""
            echo "Optional (at least one required):"
            echo "  --root-dir, -r        Build root directory"
            echo "  --restart-policy      NEVER, ALWAYS, ON_FAILURE"
            echo "  --max-retries         Max restart retries (for ON_FAILURE)"
            echo "  --healthcheck-path    Health check endpoint path"
            echo "  --healthcheck-timeout Health check timeout in seconds"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

if [[ -z "$PROJECT_ID" ]] || [[ -z "$SERVICE_NAME" ]]; then
    echo "Error: --project and --service are required"
    exit 1
fi

# Get service and environment IDs
project_result=$(railway_gql "
    query {
        project(id: \"$PROJECT_ID\") {
            environments {
                edges {
                    node {
                        id
                        name
                    }
                }
            }
            services {
                edges {
                    node {
                        id
                        name
                    }
                }
            }
        }
    }
")

ENV_ID=$(echo "$project_result" | jq -r '.project.environments.edges[] | select(.node.name == "production") | .node.id')
if [[ -z "$ENV_ID" || "$ENV_ID" == "null" ]]; then
    ENV_ID=$(echo "$project_result" | jq -r '.project.environments.edges[0].node.id')
fi

SERVICE_ID=$(echo "$project_result" | jq -r --arg name "$SERVICE_NAME" '.project.services.edges[] | select(.node.name == $name) | .node.id')
if [[ -z "$SERVICE_ID" || "$SERVICE_ID" == "null" ]]; then
    echo "Error: Service '$SERVICE_NAME' not found"
    echo "Available services:"
    echo "$project_result" | jq -r '.project.services.edges[].node.name'
    exit 1
fi

# Build input object
INPUT_PARTS=()
[[ -n "$ROOT_DIR" ]] && INPUT_PARTS+=("rootDirectory: \"$ROOT_DIR\"")
[[ -n "$RESTART_POLICY" ]] && INPUT_PARTS+=("restartPolicyType: $RESTART_POLICY")
[[ -n "$MAX_RETRIES" ]] && INPUT_PARTS+=("restartPolicyMaxRetries: $MAX_RETRIES")
[[ -n "$HEALTHCHECK_PATH" ]] && INPUT_PARTS+=("healthcheckPath: \"$HEALTHCHECK_PATH\"")
[[ -n "$HEALTHCHECK_TIMEOUT" ]] && INPUT_PARTS+=("healthcheckTimeout: $HEALTHCHECK_TIMEOUT")

if [[ ${#INPUT_PARTS[@]} -eq 0 ]]; then
    echo "Error: At least one configuration option is required"
    exit 1
fi

INPUT=$(IFS=', '; echo "${INPUT_PARTS[*]}")

echo "Updating service '$SERVICE_NAME'..."

railway_gql "
    mutation {
        serviceInstanceUpdate(
            serviceId: \"$SERVICE_ID\"
            environmentId: \"$ENV_ID\"
            input: { $INPUT }
        )
    }
" > /dev/null

echo "Service updated successfully!"
[[ -n "$ROOT_DIR" ]] && echo "  Root directory: $ROOT_DIR"
[[ -n "$RESTART_POLICY" ]] && echo "  Restart policy: $RESTART_POLICY"
[[ -n "$MAX_RETRIES" ]] && echo "  Max retries: $MAX_RETRIES"
[[ -n "$HEALTHCHECK_PATH" ]] && echo "  Healthcheck path: $HEALTHCHECK_PATH"
[[ -n "$HEALTHCHECK_TIMEOUT" ]] && echo "  Healthcheck timeout: ${HEALTHCHECK_TIMEOUT}s"
