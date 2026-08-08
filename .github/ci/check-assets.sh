#!/usr/bin/env bash
#
# Lightweight broken-asset detector.
# Scans HTML, CSS, and JavaScript for local file references and
# verifies they exist on disk.  External URLs are skipped.
#
set -euo pipefail

REPO_ROOT="${1:-.}"
ERRORS=0

check_file() {
    local ref="$1"
    local source="$2"

    # Skip empty refs
    [[ -z "$ref" ]] && return

    # Skip external URLs
    [[ "$ref" == http://* || "$ref" == https://* || "$ref" == //* ]] && return

    # Skip data URIs and Vercel internal paths
    [[ "$ref" == data:* || "$ref" == /_* ]] && return

    # Strip query string and fragment
    ref="${ref%%\?*}"
    ref="${ref%%#*}"

    # Skip empty after stripping
    [[ -z "$ref" ]] && return

    # Skip if contains spaces (likely not a valid file path)
    [[ "$ref" == *" "* ]] && return

    local full_path="${REPO_ROOT}/${ref}"
    if [[ ! -f "$full_path" ]]; then
        echo "BROKEN REF: '$ref' in $source"
        ERRORS=$((ERRORS + 1))
    fi
}

echo "=== Checking local asset references ==="

# --- HTML: src, href, poster attributes ---
while IFS= read -r line; do
    file="${line%%:*}"
    value="${line#*:}"
    check_file "$value" "$file"
done < <(
    grep -rOhE '(src|href|poster)="[^"]*"' "$REPO_ROOT"/*.html \
        2>/dev/null \
    | grep -v 'http://' \
    | grep -v 'https://' \
    | grep -v '//' \
    | sed -E 's/^[^"]*"//; s/"[^"]*$//' \
    | while IFS= read -r val; do
        # Find which file(s) contain this exact string
        grep -rl --include='*.html' "$val" "$REPO_ROOT" 2>/dev/null \
            | while IFS= read -r f; do
                echo "$f:$val"
            done
    done
)

# --- HTML: local <link rel="stylesheet"> and <script> (already covered above) ---

# --- CSS: url() references (only local) ---
while IFS= read -r line; do
    file="${line%%:*}"
    value="${line#*:}"
    check_file "$value" "$file"
done < <(
    grep -rOhE "url\(['\"]?[^)'\"]*['\"]?\)" "$REPO_ROOT"/css/*.css \
        2>/dev/null \
    | grep -v 'http://' \
    | grep -v 'https://' \
    | grep -v 'data:' \
    | sed -E "s/url\(['\"]?//; s/['\"]?\)//" \
    | while IFS= read -r val; do
        grep -rl --include='*.css' "$val" "$REPO_ROOT"/css/ 2>/dev/null \
            | while IFS= read -r f; do
                echo "$f:$val"
            done
    done
)

# --- JavaScript: local image paths in string literals ---
while IFS= read -r line; do
    file="${line%%:*}"
    value="${line#*:}"
    check_file "$value" "$file"
done < <(
    grep -rEo "'images/[^']*'" "$REPO_ROOT"/js/*.js "$REPO_ROOT"/js/**/*.js \
        2>/dev/null \
    | sed -E "s/.*'([^']*)'.*/\1/" \
    | while IFS= read -r val; do
        grep -rl --include='*.js' "'$val'" "$REPO_ROOT"/js/ 2>/dev/null \
            | while IFS= read -r f; do
                echo "$f:$val"
            done
    done
)

# --- data/menu.json: local image paths ---
while IFS= read -r line; do
    file="${line%%:*}"
    value="${line#*:}"
    check_file "$value" "$file"
done < <(
    grep -oE '"image":\s*"images/[^"]*"' "$REPO_ROOT"/data/menu.json \
        2>/dev/null \
    | sed -E 's/.*"image":\s*"//; s/"//' \
    | while IFS= read -r val; do
        echo "$REPO_ROOT/data/menu.json:$val"
    done
)

if [[ $ERRORS -gt 0 ]]; then
    echo ""
    echo "Found $ERRORS broken local reference(s)."
    exit 1
else
    echo "All local references OK."
fi
