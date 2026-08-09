#!/usr/bin/env bash
#
# Lightweight secret/credential detector.
# Scans source files for patterns that suggest committed secrets.
# Does NOT print matched values to avoid leaking them in CI logs.
#
set -euo pipefail

REPO_ROOT="${1:-.}"
ERRORS=0

echo "=== Scanning for potential secrets ==="

hits=()

# --- Private keys ---
if grep -rl --include='*.js' --include='*.ts' --include='*.json' \
        --include='*.env' --include='*.toml' --include='*.yml' --include='*.yaml' \
        --include='*.html' --include='*.css' --include='*.sql' \
        -E 'BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY' "$REPO_ROOT" 2>/dev/null; then
    hits+=("private key block")
fi

# --- Database connection strings with embedded credentials ---
if grep -rl --include='*.js' --include='*.ts' --include='*.json' \
        --include='*.env' --include='*.toml' --include='*.yml' --include='*.yaml' \
        -iE '(mysql|postgres(ql)?|mongodb(\+srv)?|redis|mssql):\/\/[^:]+:[^@]+@' "$REPO_ROOT" 2>/dev/null; then
    hits+=("database connection string with credentials")
fi

# --- AWS keys ---
if grep -rl --include='*.js' --include='*.ts' --include='*.json' \
        --include='*.env' --include='*.toml' --include='*.yml' --include='*.yaml' \
        --include='*.html' -E 'AKIA[0-9A-Z]{16}' "$REPO_ROOT" 2>/dev/null; then
    hits+=("AWS access key")
fi

# --- Supabase service-role keys (sb_secret_ prefix) ---
if grep -rl --include='*.js' --include='*.ts' --include='*.json' \
        --include='*.env' --include='*.toml' --include='*.html' \
        -E 'sb_secret_[A-Za-z0-9_-]{20,}' "$REPO_ROOT" 2>/dev/null; then
    hits+=("Supabase service-role key (sb_secret_)")
fi

# --- Generic long hex/base64 tokens (40+ chars, likely secrets) ---
# Exclude known safe patterns (Supabase anon keys, hashes in filenames, etc.)
if grep -rl --include='*.js' --include='*.ts' --include='*.json' \
        --include='*.env' --include='*.toml' --include='*.html' \
        -E "[\"']([A-Za-z0-9+/]{40,}={0,2})[\"']" "$REPO_ROOT" 2>/dev/null \
    | while IFS= read -r f; do
        # Filter out false positives
        grep -nE "[\"']([A-Za-z0-9+/]{40,}={0,2})[\"']" "$f" 2>/dev/null \
        | grep -v 'sb_publishable_' \
        | grep -v 'anonKey' \
        | grep -v 'anon_key' \
        | grep -v 'createClient' \
        | grep -v 'sha256:' \
        | grep -v 'node_modules' \
        | grep -v 'data:image' \
        | grep -v 'base64,' \
        | grep -v 'R0lGODlh' \
        | grep -v '\.temp/' \
        | grep -v 'eyJ' \
        | head -1 > /dev/null 2>&1 && echo "$f"
    done | sort -u; then
    hits+=("high-entropy secret-like string")
fi

# --- Hardcoded password assignments ---
if grep -rl --include='*.js' --include='*.ts' --include='*.json' \
        --include='*.env' --include='*.toml' --include='*.html' \
        -iE "(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*['\"][^'\" ]{8,}['\"]" "$REPO_ROOT" 2>/dev/null \
    | grep -v 'config\.js' \
    | grep -v '\.temp/' \
    | grep -v 'node_modules' 2>/dev/null; then
    hits+=("hardcoded password/secret assignment")
fi

if [[ ${#hits[@]} -gt 0 ]]; then
    echo ""
    echo "Potential secrets detected:"
    for h in "${hits[@]}"; do
        echo "  - $h"
    done
    echo ""
    echo "Review the files above. If these are intentional (e.g. Supabase anon key),"
    echo "add an exclusion in .github/ci/check-secrets.sh."
    exit 1
else
    echo "No potential secrets found."
fi
