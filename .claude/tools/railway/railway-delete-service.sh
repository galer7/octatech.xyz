#!/usr/bin/env bash
# Delete a service from a Railway project
# Usage: railway-delete-service.sh --project <id> --service <name> [--force]
# Requires: RAILWAY_TOKEN env var

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/railway-gql.sh"

PROJECT_ID=""
SERVICE_NAME=""
FORCE=false

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
        --force|-f)
            FORCE=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 --project <id> --service <name> [--force]"
            echo ""
            echo "Required:"
            echo "  --project, -p  Railway project ID"
            echo "  --service, -s  Service name"
            echo ""
            echo "Optional:"
            echo "  --force, -f    Skip confirmation"
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

# Get service ID
project_result=$(railway_gql "
    query {
        project(id: \"$PROJECT_ID\") {
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

SERVICE_ID=$(echo "$project_result" | jq -r --arg name "$SERVICE_NAME" '.project.services.edges[] | select(.node.name == $name) | .node.id')
if [[ -z "$SERVICE_ID" || "$SERVICE_ID" == "null" ]]; then
    echo "Error: Service '$SERVICE_NAME' not found"
    exit 1
fi

if [[ "$FORCE" != true ]]; then
    echo "Are you sure you want to delete service '$SERVICE_NAME'? [y/N]"
    read -r confirm
    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
        echo "Cancelled"
        exit 0
    fi
fi

echo "Deleting service '$SERVICE_NAME'..."

railway_gql "
    mutation {
        serviceDelete(id: \"$SERVICE_ID\")
    }
" > /dev/null

echo "Service deleted."
