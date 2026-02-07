#!/usr/bin/env bash
# Trigger a deployment for a Railway service
# Usage: railway-deploy.sh --project <id> --service <name-or-id> [--env <id>]
# Requires: RAILWAY_TOKEN env var

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/railway-gql.sh"

PROJECT_ID=""
SERVICE_NAME=""
ENV_ID=""

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
        --env|-e)
            ENV_ID="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 --project <id> --service <name-or-id> [--env <id>]"
            echo ""
            echo "Required:"
            echo "  --project, -p  Railway project ID"
            echo "  --service, -s  Service name or ID"
            echo ""
            echo "Optional:"
            echo "  --env, -e      Environment ID (defaults to production)"
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

echo "Preparing deployment..."

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

# Find environment
if [[ -z "$ENV_ID" ]]; then
    ENV_ID=$(echo "$project_result" | jq -r '.project.environments.edges[] | select(.node.name == "production") | .node.id')
    if [[ -z "$ENV_ID" || "$ENV_ID" == "null" ]]; then
        ENV_ID=$(echo "$project_result" | jq -r '.project.environments.edges[0].node.id')
    fi
fi
echo "  Environment: $ENV_ID"

# Find service (by name or ID)
SERVICE_ID=$(echo "$project_result" | jq -r --arg name "$SERVICE_NAME" '.project.services.edges[] | select(.node.name == $name or .node.id == $name) | .node.id')
if [[ -z "$SERVICE_ID" || "$SERVICE_ID" == "null" ]]; then
    echo "Error: Service '$SERVICE_NAME' not found"
    echo "Available services:"
    echo "$project_result" | jq -r '.project.services.edges[].node.name'
    exit 1
fi
echo "  Service: $SERVICE_ID"

# Trigger deployment
echo ""
echo "Triggering deployment..."
deploy_result=$(railway_gql "
    mutation {
        serviceInstanceDeployV2(
            serviceId: \"$SERVICE_ID\"
            environmentId: \"$ENV_ID\"
        )
    }
")

DEPLOY_ID=$(echo "$deploy_result" | jq -r '.serviceInstanceDeployV2')

echo ""
echo "Deployment triggered!"
echo "  Deployment ID: $DEPLOY_ID"
echo ""
echo "View at: https://railway.app/project/$PROJECT_ID"
