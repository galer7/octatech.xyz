#!/usr/bin/env bash
# List all services in a Railway project
# Usage: railway-list-services.sh --project <id>
# Requires: RAILWAY_TOKEN env var

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/railway-gql.sh"

PROJECT_ID="${1:-}"

if [[ -z "$PROJECT_ID" ]]; then
    echo "Usage: $0 <project-id>"
    exit 1
fi

result=$(railway_gql "
    query {
        project(id: \"$PROJECT_ID\") {
            name
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

echo "$result" | jq '{
    project: .project.name,
    environments: [.project.environments.edges[].node],
    services: [.project.services.edges[].node]
}'
