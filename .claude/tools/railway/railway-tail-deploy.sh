#!/usr/bin/env bash
# Tail deployment logs in real-time (polls every few seconds)
# Usage: railway-tail-deploy.sh --project <id> --service <name> [--type deploy|build] [--interval 5]
# Requires: RAILWAY_TOKEN env var

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/railway-gql.sh"

PROJECT_ID=""
SERVICE_NAME=""
LOG_TYPE="deploy"
INTERVAL=5
LINES=50

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
        --type|-t)
            LOG_TYPE="$2"
            shift 2
            ;;
        --interval|-i)
            INTERVAL="$2"
            shift 2
            ;;
        --lines|-n)
            LINES="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 --project <id> --service <name> [options]"
            echo ""
            echo "Tails deployment logs, polling every few seconds until deployment completes."
            echo ""
            echo "Required:"
            echo "  --project, -p   Railway project ID"
            echo "  --service, -s   Service name"
            echo ""
            echo "Optional:"
            echo "  --type, -t      Log type: deploy (default) or build"
            echo "  --interval, -i  Poll interval in seconds (default: 5)"
            echo "  --lines, -n     Number of lines per poll (default: 50)"
            echo ""
            echo "Press Ctrl+C to stop tailing."
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

# Get project info once
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
    exit 1
fi

LAST_DEPLOY_ID=""
LAST_LOG_COUNT=0

echo "Tailing $LOG_TYPE logs for $SERVICE_NAME (Ctrl+C to stop)"
echo "---"

while true; do
    # Get latest deployment
    deploy_result=$(railway_gql "
        query {
            deployments(first: 1, input: {
                serviceId: \"$SERVICE_ID\"
                environmentId: \"$ENV_ID\"
            }) {
                edges {
                    node {
                        id
                        status
                        createdAt
                    }
                }
            }
        }
    ")

    DEPLOY_ID=$(echo "$deploy_result" | jq -r '.deployments.edges[0].node.id')
    DEPLOY_STATUS=$(echo "$deploy_result" | jq -r '.deployments.edges[0].node.status')

    # If new deployment, reset
    if [[ "$DEPLOY_ID" != "$LAST_DEPLOY_ID" ]]; then
        LAST_DEPLOY_ID="$DEPLOY_ID"
        LAST_LOG_COUNT=0
        echo ""
        echo "=== New deployment: $DEPLOY_ID (status: $DEPLOY_STATUS) ==="
        echo ""
    fi

    # Get logs
    if [[ "$LOG_TYPE" == "build" ]]; then
        logs_result=$(railway_gql "
            query {
                buildLogs(deploymentId: \"$DEPLOY_ID\", limit: $LINES) {
                    timestamp
                    severity
                    message
                }
            }
        ")
        logs=$(echo "$logs_result" | jq -r '.buildLogs // []')
    else
        logs_result=$(railway_gql "
            query {
                deploymentLogs(deploymentId: \"$DEPLOY_ID\", limit: $LINES) {
                    timestamp
                    severity
                    message
                }
            }
        ")
        logs=$(echo "$logs_result" | jq -r '.deploymentLogs // []')
    fi

    # Print new logs
    LOG_COUNT=$(echo "$logs" | jq 'length')
    if [[ "$LOG_COUNT" -gt "$LAST_LOG_COUNT" ]]; then
        echo "$logs" | jq -r ".[$LAST_LOG_COUNT:] | .[] | \"\(.timestamp) [\(.severity)] \(.message)\""
        LAST_LOG_COUNT=$LOG_COUNT
    fi

    # Check if deployment finished
    case "$DEPLOY_STATUS" in
        SUCCESS|CRASHED|FAILED|REMOVED|CANCELLED)
            echo ""
            echo "=== Deployment $DEPLOY_STATUS ==="
            exit 0
            ;;
    esac

    sleep "$INTERVAL"
done
