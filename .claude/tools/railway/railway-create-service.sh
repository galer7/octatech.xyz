#!/usr/bin/env bash
# Create a new service in a Railway project
# Usage: railway-create-service.sh --project <id> --name <service-name> [options]
# Requires: RAILWAY_TOKEN env var

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/railway-gql.sh"

# Defaults
PROJECT_ID=""
SERVICE_NAME=""
ROOT_DIR=""
GITHUB_REPO=""
GITHUB_BRANCH="main"
VOLUME_PATH=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --project|-p)
            PROJECT_ID="$2"
            shift 2
            ;;
        --name|-n)
            SERVICE_NAME="$2"
            shift 2
            ;;
        --root-dir|-r)
            ROOT_DIR="$2"
            shift 2
            ;;
        --github|-g)
            GITHUB_REPO="$2"
            shift 2
            ;;
        --branch|-b)
            GITHUB_BRANCH="$2"
            shift 2
            ;;
        --volume|-v)
            VOLUME_PATH="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 --project <id> --name <service-name> [options]"
            echo ""
            echo "Required:"
            echo "  --project, -p  Railway project ID"
            echo "  --name, -n     Service name"
            echo ""
            echo "Optional:"
            echo "  --root-dir, -r   Root directory for build (e.g., apps/backend)"
            echo "  --github, -g     GitHub repo to connect (e.g., user/repo)"
            echo "  --branch, -b     GitHub branch (default: main)"
            echo "  --volume, -v     Mount path for persistent volume (e.g., /data)"
            echo ""
            echo "Example:"
            echo "  $0 --project abc123 --name api --root-dir apps/backend --github user/repo"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

if [[ -z "$PROJECT_ID" ]] || [[ -z "$SERVICE_NAME" ]]; then
    echo "Error: --project and --name are required"
    echo "Run with --help for usage"
    exit 1
fi

echo "Creating service '$SERVICE_NAME' in project $PROJECT_ID"

# Step 1: Get environment ID
echo "1. Finding production environment..."
env_result=$(railway_gql "
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
        }
    }
")

ENV_ID=$(echo "$env_result" | jq -r '.project.environments.edges[] | select(.node.name == "production") | .node.id')
if [[ -z "$ENV_ID" || "$ENV_ID" == "null" ]]; then
    # Fall back to first environment
    ENV_ID=$(echo "$env_result" | jq -r '.project.environments.edges[0].node.id')
fi
echo "   Environment: $ENV_ID"

# Step 2: Create service
echo "2. Creating service..."
service_result=$(railway_gql "
    mutation {
        serviceCreate(input: {
            projectId: \"$PROJECT_ID\"
            name: \"$SERVICE_NAME\"
        }) {
            id
        }
    }
")

SERVICE_ID=$(echo "$service_result" | jq -r '.serviceCreate.id')
echo "   Service ID: $SERVICE_ID"

# Step 3: Create volume if requested
if [[ -n "$VOLUME_PATH" ]]; then
    echo "3. Creating volume at $VOLUME_PATH..."
    volume_result=$(railway_gql "
        mutation {
            volumeCreate(input: {
                projectId: \"$PROJECT_ID\"
                environmentId: \"$ENV_ID\"
                serviceId: \"$SERVICE_ID\"
                mountPath: \"$VOLUME_PATH\"
            }) {
                id
            }
        }
    ")
    VOLUME_ID=$(echo "$volume_result" | jq -r '.volumeCreate.id')
    echo "   Volume ID: $VOLUME_ID"
fi

# Step 4: Configure build settings if root dir specified
if [[ -n "$ROOT_DIR" ]]; then
    echo "4. Setting root directory to $ROOT_DIR..."
    railway_gql "
        mutation {
            serviceInstanceUpdate(
                serviceId: \"$SERVICE_ID\"
                environmentId: \"$ENV_ID\"
                input: {
                    rootDirectory: \"$ROOT_DIR\"
                    restartPolicyType: ON_FAILURE
                    restartPolicyMaxRetries: 10
                }
            )
        }
    " > /dev/null
    echo "   Done"
fi

# Step 5: Connect GitHub if specified
if [[ -n "$GITHUB_REPO" ]]; then
    echo "5. Connecting GitHub repo $GITHUB_REPO..."
    railway_gql "
        mutation {
            serviceConnect(id: \"$SERVICE_ID\", input: {
                repo: \"$GITHUB_REPO\"
                branch: \"$GITHUB_BRANCH\"
            }) {
                id
            }
        }
    " > /dev/null
    echo "   Connected to $GITHUB_REPO ($GITHUB_BRANCH)"
fi

echo ""
echo "Service created successfully!"
echo "  Service ID: $SERVICE_ID"
echo ""
echo "Dashboard: https://railway.app/project/$PROJECT_ID"
echo ""
echo "Next steps:"
echo "  1. Set environment variables using railway-set-vars.sh"
echo "  2. Connect GitHub repo (if not done): Settings -> Source"
echo "  3. Deploy will auto-trigger on push, or use railway-deploy.sh"
