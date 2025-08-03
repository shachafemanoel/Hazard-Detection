#!/bin/bash
# Verify the web frontend and its API_URL configuration.

prompt_if_unset() {
    local var_name="$1"
    local prompt_msg="$2"
    eval current_value="\${$var_name}"
    if [ -z "$current_value" ]; then
        read -r -p "$prompt_msg" current_value
    fi
    eval "$var_name=\"$current_value\""
}

prompt_if_unset FRONTEND_URL "Enter FRONTEND_URL: "
prompt_if_unset API_URL "Enter API_URL: "

status=$(curl -s -o /dev/null -w "%{http_code}" "$FRONTEND_URL/health" 2>/dev/null || true)
if [ "$status" != "200" ]; then
    echo "❌ Unexpected status code from frontend: $status"
    exit 1
else
    echo "✅ frontend up"
fi

  container_api_url=$(railway run --service hazard-detection -- bash -c 'node -e "if (process.env.DEBUG_ENV === \"true\") { console.log(process.env.API_URL); }"' 2>/dev/null)
if [ $? -ne 0 ]; then
    echo "❌ Failed to read API_URL from container"
    exit 1
fi

container_api_url=$(echo "$container_api_url" | tr -d '\r')
if [ "$container_api_url" = "$API_URL" ]; then
    echo "✅ API_URL correct"
    exit 0
else
    echo "❌ API_URL mismatch: expected '$API_URL' but got '$container_api_url'"
    exit 1
fi
