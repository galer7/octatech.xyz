#!/usr/bin/env bash
# Create a new Railway project
# Usage: railway-create-project.sh <project-name> [--workspace <id>]
# Requires: RAILWAY_TOKEN env var

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/railway-gql.sh"

PROJECT_NAME=""
WORKSPACE_ID=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --workspace|-w)
            WORKSPACE_ID="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 <project-name> [--workspace <id>]"
            echo ""
            echo "Arguments:"
            echo "  project-name       Name for the new project"
            echo ""
            echo "Options:"
            echo "  --workspace, -w    Workspace ID (auto-detected if not provided)"
            echo ""
            echo "Example:"
            echo "  $0 my-awesome-app"
            exit 0
            ;;
        -*)
            echo "Unknown option: $1"
            exit 1
            ;;
        *)
            PROJECT_NAME="$1"
            shift
            ;;
    esac
done

if [[ -z "$PROJECT_NAME" ]]; then
    echo "Usage: $0 <project-name> [--workspace <id>]"
    echo "Example: $0 my-awesome-app"
    exit 1
fi

# Auto-detect workspace if not provided
if [[ -z "$WORKSPACE_ID" ]]; then
    echo "Detecting workspace..."
    workspace_result=$(railway_gql "query { me { id workspaces { id name } } }")

    # Get first workspace
    WORKSPACE_ID=$(echo "$workspace_result" | jq -r '.me.workspaces[0].id // .me.id')
    WORKSPACE_NAME=$(echo "$workspace_result" | jq -r '.me.workspaces[0].name // "Personal"')

    if [[ -z "$WORKSPACE_ID" || "$WORKSPACE_ID" == "null" ]]; then
        echo "Error: Could not detect workspace"
        exit 1
    fi
    echo "  Using workspace: $WORKSPACE_NAME ($WORKSPACE_ID)"
fi

echo "Creating Railway project: $PROJECT_NAME"

result=$(railway_gql "
    mutation {
        projectCreate(input: {
            name: \"$PROJECT_NAME\"
            workspaceId: \"$WORKSPACE_ID\"
        }) {
            id
            name
            environments {
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

if [[ $? -ne 0 ]]; then
    echo "Failed to create project"
    exit 1
fi

PROJECT_ID=$(echo "$result" | jq -r '.projectCreate.id')
ENV_ID=$(echo "$result" | jq -r '.projectCreate.environments.edges[0].node.id')
ENV_NAME=$(echo "$result" | jq -r '.projectCreate.environments.edges[0].node.name')

echo ""
echo "Project created successfully!"
echo "  Project ID:     $PROJECT_ID"
echo "  Environment ID: $ENV_ID"
echo "  Environment:    $ENV_NAME"
echo ""
echo "Dashboard: https://railway.app/project/$PROJECT_ID"
echo ""
echo "Save these for later use:"
echo "  export RAILWAY_PROJECT_ID=$PROJECT_ID"
echo "  export RAILWAY_ENVIRONMENT_ID=$ENV_ID"
