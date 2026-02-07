#!/usr/bin/env bash
# Trigger a redeploy for a service (uses latest commit)
# Usage: railway-redeploy.sh --project <id> --service <name>
# Requires: RAILWAY_TOKEN env var

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/railway-gql.sh"

PROJECT_ID=""
SERVICE_NAME=""

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
        --help|-h)
            echo "Usage: $0 --project <id> --service <name>"
            echo ""
            echo "Triggers a redeploy using the latest commit."
            echo ""
            echo "Required:"
            echo "  --project, -p  Railway project ID"
            echo "  --service, -s  Service name"
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
    exit 1
fi

echo "Triggering redeploy for '$SERVICE_NAME'..."

result=$(railway_gql "
    mutation {
        serviceInstanceRedeploy(
            serviceId: \"$SERVICE_ID\"
            environmentId: \"$ENV_ID\"
        )
    }
")

DEPLOY_ID=$(echo "$result" | jq -r '.serviceInstanceRedeploy // "triggered"')

echo "Redeploy triggered!"
echo "  Deployment: $DEPLOY_ID"
echo ""
echo "View at: https://railway.app/project/$PROJECT_ID"
echo ""
echo "To tail logs:"
echo "  railway-tail-deploy.sh -p $PROJECT_ID -s $SERVICE_NAME -t build"
