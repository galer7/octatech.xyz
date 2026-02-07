#!/usr/bin/env bash
# Check deployment status for a service
# Usage: railway-deploy-status.sh --project <id> --service <name> [--wait]
# Requires: RAILWAY_TOKEN env var

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/railway-gql.sh"

PROJECT_ID=""
SERVICE_NAME=""
WAIT=false
TIMEOUT=600  # 10 minutes

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
        --wait|-w)
            WAIT=true
            shift
            ;;
        --timeout|-t)
            TIMEOUT="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 --project <id> --service <name> [--wait]"
            echo ""
            echo "Required:"
            echo "  --project, -p  Railway project ID"
            echo "  --service, -s  Service name"
            echo ""
            echo "Optional:"
            echo "  --wait, -w     Wait for deployment to complete"
            echo "  --timeout, -t  Max wait time in seconds (default: 600)"
            echo ""
            echo "Exit codes:"
            echo "  0 - Deployment successful (or DEPLOYING if --wait not used)"
            echo "  1 - Deployment failed/crashed"
            echo "  2 - Timeout waiting for deployment"
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

get_deployment_status() {
    local project_result
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

    local env_id
    env_id=$(echo "$project_result" | jq -r '.project.environments.edges[] | select(.node.name == "production") | .node.id')
    if [[ -z "$env_id" || "$env_id" == "null" ]]; then
        env_id=$(echo "$project_result" | jq -r '.project.environments.edges[0].node.id')
    fi

    local service_id
    service_id=$(echo "$project_result" | jq -r --arg name "$SERVICE_NAME" '.project.services.edges[] | select(.node.name == $name) | .node.id')
    if [[ -z "$service_id" || "$service_id" == "null" ]]; then
        echo "Error: Service '$SERVICE_NAME' not found" >&2
        return 1
    fi

    railway_gql "
        query {
            deployments(first: 1, input: {
                serviceId: \"$service_id\"
                environmentId: \"$env_id\"
            }) {
                edges {
                    node {
                        id
                        status
                        createdAt
                        staticUrl
                    }
                }
            }
        }
    "
}

START_TIME=$(date +%s)

while true; do
    result=$(get_deployment_status)

    DEPLOY_ID=$(echo "$result" | jq -r '.deployments.edges[0].node.id // "none"')
    STATUS=$(echo "$result" | jq -r '.deployments.edges[0].node.status // "UNKNOWN"')
    CREATED=$(echo "$result" | jq -r '.deployments.edges[0].node.createdAt // ""')
    URL=$(echo "$result" | jq -r '.deployments.edges[0].node.staticUrl // ""')

    if [[ "$WAIT" == false ]]; then
        echo "Service:    $SERVICE_NAME"
        echo "Deployment: $DEPLOY_ID"
        echo "Status:     $STATUS"
        echo "Created:    $CREATED"
        [[ -n "$URL" && "$URL" != "null" ]] && echo "URL:        $URL"

        case "$STATUS" in
            SUCCESS) exit 0 ;;
            CRASHED|FAILED|REMOVED|CANCELLED) exit 1 ;;
            *) exit 0 ;;  # Still in progress
        esac
    fi

    # Waiting mode
    case "$STATUS" in
        SUCCESS)
            echo "Deployment successful!"
            echo "  ID:  $DEPLOY_ID"
            [[ -n "$URL" && "$URL" != "null" ]] && echo "  URL: $URL"
            exit 0
            ;;
        CRASHED|FAILED)
            echo "Deployment failed! Status: $STATUS"
            echo "  ID: $DEPLOY_ID"
            exit 1
            ;;
        REMOVED|CANCELLED)
            echo "Deployment was $STATUS"
            exit 1
            ;;
        *)
            ELAPSED=$(($(date +%s) - START_TIME))
            if [[ $ELAPSED -ge $TIMEOUT ]]; then
                echo "Timeout waiting for deployment (${TIMEOUT}s)"
                exit 2
            fi
            echo -ne "\rWaiting for deployment... Status: $STATUS (${ELAPSED}s elapsed)"
            sleep 5
            ;;
    esac
done
