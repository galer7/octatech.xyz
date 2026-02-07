#!/bin/bash
#
# Namecheap DNS Management Tool
# Manage DNS records via the Namecheap API
#
# Usage: namecheap-dns.sh <command> [options]
#
# Commands:
#   list    - List all DNS records for a domain
#   add     - Add a new DNS record
#   update  - Update an existing DNS record
#   delete  - Delete a DNS record
#
# Required arguments for all commands:
#   --api-key <key>      Namecheap API key
#   --api-user <user>    Namecheap API username
#   --domain <domain>    Domain name (e.g., example.com)
#
# Optional:
#   --client-ip <ip>     Client IP (defaults to auto-detect)
#   --sandbox            Use sandbox API for testing
#

set -e

# API endpoints
API_URL="https://api.namecheap.com/xml.response"
SANDBOX_URL="https://api.sandbox.namecheap.com/xml.response"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
USE_SANDBOX=false
CLIENT_IP=""

# Print usage
usage() {
    cat << EOF
Namecheap DNS Management Tool

Usage: $(basename "$0") <command> [options]

Commands:
  list                      List all DNS records for a domain
  add                       Add a new DNS record
  update                    Update an existing DNS record
  delete                    Delete a DNS record

Required options:
  --api-key <key>           Namecheap API key
  --api-user <user>         Namecheap API username (usually same as account username)
  --domain <domain>         Domain name (e.g., example.com)

Options for add/update:
  --type <type>             Record type: A, AAAA, CNAME, MX, TXT, NS, URL, URL301, FRAME
  --host <host>             Host name (e.g., www, @, subdomain)
  --value <value>           Record value (IP address, hostname, or text)
  --ttl <ttl>               TTL in seconds (default: 1800)
  --mx-pref <priority>      MX priority (required for MX records)

Options for update/delete:
  --record-id <id>          Record ID to update or delete (use 'list' to find IDs)

Other options:
  --client-ip <ip>          Your whitelisted IP (auto-detected if not provided)
  --sandbox                 Use sandbox API for testing
  --help                    Show this help message

Examples:
  # List all records
  $(basename "$0") list --api-key YOUR_KEY --api-user YOUR_USER --domain example.com

  # Add an A record
  $(basename "$0") add --api-key YOUR_KEY --api-user YOUR_USER --domain example.com \\
    --type A --host www --value 192.168.1.1 --ttl 3600

  # Add a TXT record (SPF)
  $(basename "$0") add --api-key YOUR_KEY --api-user YOUR_USER --domain example.com \\
    --type TXT --host @ --value "v=spf1 include:_spf.google.com ~all"

  # Update a record
  $(basename "$0") update --api-key YOUR_KEY --api-user YOUR_USER --domain example.com \\
    --record-id 12345 --value 192.168.1.2

  # Delete a record
  $(basename "$0") delete --api-key YOUR_KEY --api-user YOUR_USER --domain example.com \\
    --record-id 12345
EOF
    exit 1
}

# Print error message
error() {
    echo -e "${RED}Error: $1${NC}" >&2
    exit 1
}

# Print success message
success() {
    echo -e "${GREEN}$1${NC}"
}

# Print warning message
warn() {
    echo -e "${YELLOW}$1${NC}"
}

# Auto-detect client IP
get_client_ip() {
    curl -s https://api.ipify.org 2>/dev/null || curl -s https://ifconfig.me 2>/dev/null || echo ""
}

# Parse domain into SLD and TLD
parse_domain() {
    local domain="$1"
    # Handle common TLDs (this is simplified - Namecheap has specific TLD handling)
    if [[ "$domain" =~ ^([^.]+)\.([^.]+\.[^.]+)$ ]]; then
        # Could be subdomain.domain.tld or domain.co.uk style
        # For simplicity, assume last two parts are SLD.TLD
        SLD=$(echo "$domain" | rev | cut -d. -f2 | rev)
        TLD=$(echo "$domain" | rev | cut -d. -f1 | rev)
    else
        SLD=$(echo "$domain" | cut -d. -f1)
        TLD=$(echo "$domain" | cut -d. -f2-)
    fi
}

# Extract XML attribute value using sed (macOS compatible)
extract_attr() {
    local input="$1"
    local attr="$2"
    echo "$input" | sed -n "s/.*${attr}=\"\([^\"]*\)\".*/\1/p" | head -1
}

# Extract error message from XML response
extract_error() {
    local response="$1"
    echo "$response" | sed -n 's/.*<Error[^>]*>\([^<]*\)<\/Error>.*/\1/p' | head -1
}

# Extract host elements from XML response
extract_hosts() {
    local response="$1"
    # Use tr to put each host on its own line, then grep
    echo "$response" | tr '>' '\n' | grep -o '<host[^/]*' | sed 's/<host//'
}

# Make API call
api_call() {
    local command="$1"
    shift
    local extra_params="$*"

    local url="$API_URL"
    [[ "$USE_SANDBOX" == "true" ]] && url="$SANDBOX_URL"

    parse_domain "$DOMAIN"

    local response
    response=$(curl -s "$url" \
        --data-urlencode "ApiUser=$API_USER" \
        --data-urlencode "ApiKey=$API_KEY" \
        --data-urlencode "UserName=$API_USER" \
        --data-urlencode "ClientIp=$CLIENT_IP" \
        --data-urlencode "Command=$command" \
        --data-urlencode "SLD=$SLD" \
        --data-urlencode "TLD=$TLD" \
        $extra_params)

    echo "$response"
}

# Check API response for errors
check_response() {
    local response="$1"

    if echo "$response" | grep -q 'Status="ERROR"'; then
        local error_msg
        error_msg=$(extract_error "$response")
        error "API Error: $error_msg"
    fi
}

# List DNS records
list_records() {
    echo "Fetching DNS records for $DOMAIN..."

    local response
    response=$(api_call "namecheap.domains.dns.getHosts")

    check_response "$response"

    # Parse and display records
    echo ""
    printf "%-8s %-6s %-20s %-40s %-8s\n" "ID" "TYPE" "HOST" "VALUE" "TTL"
    printf "%s\n" "--------------------------------------------------------------------------------"

    # Extract host records - put each attribute set on its own line
    echo "$response" | tr '<' '\n' | grep '^host ' | while read -r line; do
        local id type host address ttl mxpref
        id=$(echo " $line" | extract_attr " $line" "HostId")
        type=$(echo " $line" | extract_attr " $line" "Type")
        host=$(echo " $line" | extract_attr " $line" "Name")
        address=$(echo " $line" | extract_attr " $line" "Address")
        ttl=$(echo " $line" | extract_attr " $line" "TTL")
        mxpref=$(echo " $line" | extract_attr " $line" "MXPref")

        # Truncate long values
        if [[ ${#address} -gt 40 ]]; then
            address="${address:0:37}..."
        fi

        if [[ "$type" == "MX" ]]; then
            printf "%-8s %-6s %-20s %-40s %-8s (MX:%s)\n" "$id" "$type" "$host" "$address" "$ttl" "$mxpref"
        else
            printf "%-8s %-6s %-20s %-40s %-8s\n" "$id" "$type" "$host" "$address" "$ttl"
        fi
    done

    echo ""
}

# Add a DNS record
add_record() {
    [[ -z "$RECORD_TYPE" ]] && error "Record type (--type) is required"
    [[ -z "$RECORD_HOST" ]] && error "Host name (--host) is required"
    [[ -z "$RECORD_VALUE" ]] && error "Record value (--value) is required"
    [[ "$RECORD_TYPE" == "MX" && -z "$MX_PREF" ]] && error "MX priority (--mx-pref) is required for MX records"

    echo "Fetching existing records..."

    # Get existing records
    local response
    response=$(api_call "namecheap.domains.dns.getHosts")
    check_response "$response"

    # Build parameters for all existing records + new one
    local params=""
    local i=1

    # Add existing records
    while IFS= read -r line; do
        if [[ -n "$line" ]]; then
            local type host address ttl mxpref
            type=$(echo " $line" | extract_attr " $line" "Type")
            host=$(echo " $line" | extract_attr " $line" "Name")
            address=$(echo " $line" | extract_attr " $line" "Address")
            ttl=$(echo " $line" | extract_attr " $line" "TTL")
            mxpref=$(echo " $line" | extract_attr " $line" "MXPref")

            params="$params --data-urlencode HostName$i=$host"
            params="$params --data-urlencode RecordType$i=$type"
            params="$params --data-urlencode Address$i=$address"
            params="$params --data-urlencode TTL$i=$ttl"
            [[ -n "$mxpref" && "$mxpref" != "10" ]] && params="$params --data-urlencode MXPref$i=$mxpref"

            ((i++))
        fi
    done < <(echo "$response" | tr '<' '\n' | grep '^host ')

    # Add new record
    params="$params --data-urlencode HostName$i=$RECORD_HOST"
    params="$params --data-urlencode RecordType$i=$RECORD_TYPE"
    params="$params --data-urlencode Address$i=$RECORD_VALUE"
    params="$params --data-urlencode TTL$i=${RECORD_TTL:-1800}"
    [[ -n "$MX_PREF" ]] && params="$params --data-urlencode MXPref$i=$MX_PREF"

    echo "Adding new $RECORD_TYPE record: $RECORD_HOST -> $RECORD_VALUE"

    # Make the API call
    local url="$API_URL"
    [[ "$USE_SANDBOX" == "true" ]] && url="$SANDBOX_URL"

    parse_domain "$DOMAIN"

    response=$(eval "curl -s '$url' \
        --data-urlencode 'ApiUser=$API_USER' \
        --data-urlencode 'ApiKey=$API_KEY' \
        --data-urlencode 'UserName=$API_USER' \
        --data-urlencode 'ClientIp=$CLIENT_IP' \
        --data-urlencode 'Command=namecheap.domains.dns.setHosts' \
        --data-urlencode 'SLD=$SLD' \
        --data-urlencode 'TLD=$TLD' \
        $params")

    check_response "$response"

    if echo "$response" | grep -q 'IsSuccess="true"'; then
        success "Successfully added $RECORD_TYPE record for $RECORD_HOST.$DOMAIN"
    else
        error "Failed to add record. Response: $response"
    fi
}

# Update a DNS record
update_record() {
    [[ -z "$RECORD_ID" ]] && error "Record ID (--record-id) is required"

    echo "Fetching existing records..."

    # Get existing records
    local response
    response=$(api_call "namecheap.domains.dns.getHosts")
    check_response "$response"

    # Build parameters, updating the matching record
    local params=""
    local i=1
    local found=false

    while IFS= read -r line; do
        if [[ -n "$line" ]]; then
            local id type host address ttl mxpref
            id=$(echo " $line" | extract_attr " $line" "HostId")
            type=$(echo " $line" | extract_attr " $line" "Type")
            host=$(echo " $line" | extract_attr " $line" "Name")
            address=$(echo " $line" | extract_attr " $line" "Address")
            ttl=$(echo " $line" | extract_attr " $line" "TTL")
            mxpref=$(echo " $line" | extract_attr " $line" "MXPref")

            # If this is the record to update, use new values
            if [[ "$id" == "$RECORD_ID" ]]; then
                found=true
                [[ -n "$RECORD_TYPE" ]] && type="$RECORD_TYPE"
                [[ -n "$RECORD_HOST" ]] && host="$RECORD_HOST"
                [[ -n "$RECORD_VALUE" ]] && address="$RECORD_VALUE"
                [[ -n "$RECORD_TTL" ]] && ttl="$RECORD_TTL"
                [[ -n "$MX_PREF" ]] && mxpref="$MX_PREF"
            fi

            params="$params --data-urlencode HostName$i=$host"
            params="$params --data-urlencode RecordType$i=$type"
            params="$params --data-urlencode Address$i=$address"
            params="$params --data-urlencode TTL$i=$ttl"
            [[ -n "$mxpref" && "$mxpref" != "10" ]] && params="$params --data-urlencode MXPref$i=$mxpref"

            ((i++))
        fi
    done < <(echo "$response" | tr '<' '\n' | grep '^host ')

    [[ "$found" == "false" ]] && error "Record ID $RECORD_ID not found"

    echo "Updating record ID $RECORD_ID..."

    # Make the API call
    local url="$API_URL"
    [[ "$USE_SANDBOX" == "true" ]] && url="$SANDBOX_URL"

    parse_domain "$DOMAIN"

    response=$(eval "curl -s '$url' \
        --data-urlencode 'ApiUser=$API_USER' \
        --data-urlencode 'ApiKey=$API_KEY' \
        --data-urlencode 'UserName=$API_USER' \
        --data-urlencode 'ClientIp=$CLIENT_IP' \
        --data-urlencode 'Command=namecheap.domains.dns.setHosts' \
        --data-urlencode 'SLD=$SLD' \
        --data-urlencode 'TLD=$TLD' \
        $params")

    check_response "$response"

    if echo "$response" | grep -q 'IsSuccess="true"'; then
        success "Successfully updated record ID $RECORD_ID"
    else
        error "Failed to update record. Response: $response"
    fi
}

# Delete a DNS record
delete_record() {
    [[ -z "$RECORD_ID" ]] && error "Record ID (--record-id) is required"

    echo "Fetching existing records..."

    # Get existing records
    local response
    response=$(api_call "namecheap.domains.dns.getHosts")
    check_response "$response"

    # Build parameters, excluding the record to delete
    local params=""
    local i=1
    local found=false

    while IFS= read -r line; do
        if [[ -n "$line" ]]; then
            local id type host address ttl mxpref
            id=$(echo " $line" | extract_attr " $line" "HostId")

            # Skip the record to delete
            if [[ "$id" == "$RECORD_ID" ]]; then
                found=true
                continue
            fi

            type=$(echo " $line" | extract_attr " $line" "Type")
            host=$(echo " $line" | extract_attr " $line" "Name")
            address=$(echo " $line" | extract_attr " $line" "Address")
            ttl=$(echo " $line" | extract_attr " $line" "TTL")
            mxpref=$(echo " $line" | extract_attr " $line" "MXPref")

            params="$params --data-urlencode HostName$i=$host"
            params="$params --data-urlencode RecordType$i=$type"
            params="$params --data-urlencode Address$i=$address"
            params="$params --data-urlencode TTL$i=$ttl"
            [[ -n "$mxpref" && "$mxpref" != "10" ]] && params="$params --data-urlencode MXPref$i=$mxpref"

            ((i++))
        fi
    done < <(echo "$response" | tr '<' '\n' | grep '^host ')

    [[ "$found" == "false" ]] && error "Record ID $RECORD_ID not found"

    echo "Deleting record ID $RECORD_ID..."

    # Make the API call
    local url="$API_URL"
    [[ "$USE_SANDBOX" == "true" ]] && url="$SANDBOX_URL"

    parse_domain "$DOMAIN"

    response=$(eval "curl -s '$url' \
        --data-urlencode 'ApiUser=$API_USER' \
        --data-urlencode 'ApiKey=$API_KEY' \
        --data-urlencode 'UserName=$API_USER' \
        --data-urlencode 'ClientIp=$CLIENT_IP' \
        --data-urlencode 'Command=namecheap.domains.dns.setHosts' \
        --data-urlencode 'SLD=$SLD' \
        --data-urlencode 'TLD=$TLD' \
        $params")

    check_response "$response"

    if echo "$response" | grep -q 'IsSuccess="true"'; then
        success "Successfully deleted record ID $RECORD_ID"
    else
        error "Failed to delete record. Response: $response"
    fi
}

# Parse command line arguments
COMMAND=""
API_KEY=""
API_USER=""
DOMAIN=""
RECORD_TYPE=""
RECORD_HOST=""
RECORD_VALUE=""
RECORD_TTL=""
RECORD_ID=""
MX_PREF=""

# First argument is the command
[[ $# -eq 0 ]] && usage
COMMAND="$1"
shift

# Parse remaining arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --api-key)
            API_KEY="$2"
            shift 2
            ;;
        --api-user)
            API_USER="$2"
            shift 2
            ;;
        --domain)
            DOMAIN="$2"
            shift 2
            ;;
        --type)
            RECORD_TYPE="$2"
            shift 2
            ;;
        --host)
            RECORD_HOST="$2"
            shift 2
            ;;
        --value)
            RECORD_VALUE="$2"
            shift 2
            ;;
        --ttl)
            RECORD_TTL="$2"
            shift 2
            ;;
        --record-id)
            RECORD_ID="$2"
            shift 2
            ;;
        --mx-pref)
            MX_PREF="$2"
            shift 2
            ;;
        --client-ip)
            CLIENT_IP="$2"
            shift 2
            ;;
        --sandbox)
            USE_SANDBOX=true
            shift
            ;;
        --help|-h)
            usage
            ;;
        *)
            error "Unknown option: $1"
            ;;
    esac
done

# Validate required arguments
[[ -z "$API_KEY" ]] && error "API key (--api-key) is required"
[[ -z "$API_USER" ]] && error "API user (--api-user) is required"
[[ -z "$DOMAIN" ]] && error "Domain (--domain) is required"

# Auto-detect client IP if not provided
if [[ -z "$CLIENT_IP" ]]; then
    CLIENT_IP=$(get_client_ip)
    [[ -z "$CLIENT_IP" ]] && error "Could not auto-detect client IP. Please provide --client-ip"
    warn "Using auto-detected client IP: $CLIENT_IP"
    warn "Make sure this IP is whitelisted in your Namecheap account."
fi

# Execute command
case "$COMMAND" in
    list)
        list_records
        ;;
    add)
        add_record
        ;;
    update)
        update_record
        ;;
    delete)
        delete_record
        ;;
    help|--help|-h)
        usage
        ;;
    *)
        error "Unknown command: $COMMAND. Use 'list', 'add', 'update', or 'delete'."
        ;;
esac
