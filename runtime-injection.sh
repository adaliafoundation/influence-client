#!/bin/sh

echo "Generating runtime configuration..."

MODE="${1:-dev}"

if [ "$MODE" = "prod" ]; then
    CONFIG_FILE="/app/build/config.js"
else
    CONFIG_FILE="/app/public/config.js"
fi

echo "window.APP_CONFIG = {" > "$CONFIG_FILE"

# Export all REACT_APP_* variables automatically
env | grep '^REACT_APP_' | while IFS='=' read -r key value
do
  # escape quotes (minimal safe handling)
  value=$(printf '%s' "$value" | sed 's/"/\\"/g')

  echo "  $key: \"$value\"," >> "$CONFIG_FILE"
  
  echo "  $key: \"$value\","
done

echo "};" >> "$CONFIG_FILE"

echo "Runtime configuration generated."
