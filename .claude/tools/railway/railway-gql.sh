#!/usr/bin/env bash
# Railway GraphQL helper - sourced by other scripts
# Requires: RAILWAY_TOKEN environment variable

RAILWAY_API="https://backboard.railway.app/graphql/v2"

railway_gql() {
    local query="$1"
    local variables="${2:-{}}"

    if [[ -z "$RAILWAY_TOKEN" ]]; then
        echo '{"error": "RAILWAY_TOKEN not set. Get one from https://railway.app/account/tokens"}' >&2
        return 1
    fi

    local response
    response=$(curl -s -X POST "$RAILWAY_API" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $RAILWAY_TOKEN" \
        -d "{\"query\": $(echo "$query" | jq -Rs .), \"variables\": $variables}")

    if echo "$response" | jq -e '.errors' > /dev/null 2>&1; then
        echo "$response" | jq '.errors' >&2
        return 1
    fi

    echo "$response" | jq '.data'
}
