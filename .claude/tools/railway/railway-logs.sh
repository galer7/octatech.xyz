#!/usr/bin/env bash
# Get logs from a Railway service
# Usage: railway-logs.sh --project <id> --service <name> [--type deploy|build] [--lines 100]
# Requires: RAILWAY_TOKEN env var

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/railway-gql.sh"

PROJECT_ID=""
SERVICE_NAME=""
LOG_TYPE="deploy"
LINES=100

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
        --lines|-n)
            LINES="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 --project <id> --service <name> [options]"
            echo ""
            echo "Required:"
            echo "  --project, -p  Railway project ID"
            echo "  --service, -s  Service name"
            echo ""
            echo "Optional:"
            echo "  --type, -t     Log type: deploy (default) or build"
            echo "  --lines, -n    Number of lines (default: 100)"
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

# Get project info
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

# Find production environment
ENV_ID=$(echo "$project_result" | jq -r '.project.environments.edges[] | select(.node.name == "production") | .node.id')
if [[ -z "$ENV_ID" || "$ENV_ID" == "null" ]]; then
    ENV_ID=$(echo "$project_result" | jq -r '.project.environments.edges[0].node.id')
fi

# Find service
SERVICE_ID=$(echo "$project_result" | jq -r --arg name "$SERVICE_NAME" '.project.services.edges[] | select(.node.name == $name) | .node.id')
if [[ -z "$SERVICE_ID" || "$SERVICE_ID" == "null" ]]; then
    echo "Error: Service '$SERVICE_NAME' not found"
    echo "Available services:"
    echo "$project_result" | jq -r '.project.services.edges[].node.name'
    exit 1
fi

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
if [[ -z "$DEPLOY_ID" || "$DEPLOY_ID" == "null" ]]; then
    echo "Error: No deployments found for service '$SERVICE_NAME'"
    exit 1
fi

DEPLOY_STATUS=$(echo "$deploy_result" | jq -r '.deployments.edges[0].node.status')
DEPLOY_DATE=$(echo "$deploy_result" | jq -r '.deployments.edges[0].node.createdAt')

echo "Service: $SERVICE_NAME"
echo "Deployment: $DEPLOY_ID"
echo "Status: $DEPLOY_STATUS"
echo "Created: $DEPLOY_DATE"
echo "---"

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
    echo "$logs_result" | jq -r '.buildLogs[] | "\(.timestamp) [\(.severity)] \(.message)"'
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
    echo "$logs_result" | jq -r '.deploymentLogs[] | "\(.timestamp) [\(.severity)] \(.message)"'
fi
