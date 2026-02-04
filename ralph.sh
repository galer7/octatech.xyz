#!/bin/bash

# Configuration
PROMPT_FILE="PROMPT.md"
# -p runs in non-interactive mode (exits after response)
# --dangerously-skip-permissions allows it to write files without asking you (REQUIRED for autonomy)
AI_COMMAND="claude --dangerously-skip-permissions"

echo "Starting Ralph Loop..."
echo "Press [CTRL+C] to stop."

while :; do
    # 1. Check if prompt file exists
    if [ ! -f "$PROMPT_FILE" ]; then
        echo "Error: $PROMPT_FILE not found!"
        exit 1
    fi

    echo "----------------------------------------"
    echo "Running loop iteration..."
    
    # 2. THE CORE LOOP
    # We pipe the prompt text into the command.
    # The -p flag ensures it runs once and exits.
    cat "$PROMPT_FILE" | $AI_COMMAND

    # 3. Optional: Sleep to prevent rate-limit errors if it crashes instantly
    sleep 5
    
    echo "Loop iteration finished. Restarting..."
done