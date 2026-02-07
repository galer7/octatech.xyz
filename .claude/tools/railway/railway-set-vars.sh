#!/usr/bin/env bash
# Set environment variables for a Railway service
# Usage: railway-set-vars.sh --project <id> --service <id> --env <id> VAR1=value1 VAR2=value2
# Or:    railway-set-vars.sh --project <id> --service <id> --env <id> --file .env
# Requires: RAILWAY_TOKEN env var

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/railway-gql.sh"

PROJECT_ID=""
SERVICE_ID=""
ENV_ID=""
ENV_FILE=""
declare -a VARS=()

while [[ $# -gt 0 ]]; do
    case $1 in
        --project|-p)
            PROJECT_ID="$2"
            shift 2
            ;;
        --service|-s)
            SERVICE_ID="$2"
            shift 2
            ;;
        --env|-e)
            ENV_ID="$2"
            shift 2
            ;;
        --file|-f)
            ENV_FILE="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 --project <id> --service <id> --env <id> [VAR=value...] [--file .env]"
            echo ""
            echo "Required:"
            echo "  --project, -p  Railway project ID"
            echo "  --service, -s  Service ID"
            echo "  --env, -e      Environment ID"
            echo ""
            echo "Variables:"
            echo "  VAR=value      Set individual variables"
            echo "  --file, -f     Load variables from .env file"
            echo ""
            echo "Example:"
            echo "  $0 -p abc -s def -e ghi DATABASE_URL=postgres://... NODE_ENV=production"
            echo "  $0 -p abc -s def -e ghi --file .env.production"
            exit 0
            ;;
        *=*)
            VARS+=("$1")
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

if [[ -z "$PROJECT_ID" ]] || [[ -z "$SERVICE_ID" ]] || [[ -z "$ENV_ID" ]]; then
    echo "Error: --project, --service, and --env are required"
    echo "Run with --help for usage"
    exit 1
fi

# Load from file if specified
if [[ -n "$ENV_FILE" ]]; then
    if [[ ! -f "$ENV_FILE" ]]; then
        echo "Error: File not found: $ENV_FILE"
        exit 1
    fi
    while IFS= read -r line || [[ -n "$line" ]]; do
        # Skip empty lines and comments
        [[ -z "$line" || "$line" =~ ^# ]] && continue
        VARS+=("$line")
    done < "$ENV_FILE"
fi

if [[ ${#VARS[@]} -eq 0 ]]; then
    echo "Error: No variables specified"
    exit 1
fi

echo "Setting ${#VARS[@]} environment variable(s)..."

for var in "${VARS[@]}"; do
    name="${var%%=*}"
    value="${var#*=}"

    # Escape quotes in value
    value="${value//\"/\\\"}"

    railway_gql "
        mutation {
            variableUpsert(input: {
                projectId: \"$PROJECT_ID\"
                environmentId: \"$ENV_ID\"
                serviceId: \"$SERVICE_ID\"
                name: \"$name\"
                value: \"$value\"
            })
        }
    " > /dev/null

    echo "  Set: $name"
done

echo ""
echo "Done! Variables will be available on next deploy."
