#!/usr/bin/env bash
# List Railway workspaces for the authenticated user
# Usage: railway-workspaces.sh
# Requires: RAILWAY_TOKEN env var

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/railway-gql.sh"

result=$(railway_gql "query { me { id name workspaces { id name } } }")

echo "$result" | jq '{
    user: {
        id: .me.id,
        name: .me.name
    },
    workspaces: .me.workspaces
}'
