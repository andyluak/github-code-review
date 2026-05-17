#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/scripts/build-mac-signed.env.local"

usage() {
  cat <<'EOF'
Usage: scripts/build-mac-signed.sh [--arch universal|apple-silicon|intel]

Builds the Review Desk macOS app with Developer ID signing and notarization.

Before first use:
  1. Install a Developer ID Application certificate in Keychain.
  2. Copy scripts/build-mac-signed.env.example to scripts/build-mac-signed.env.local.
  3. Fill in signing + notarization values.

EOF
}

ARCH="universal"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --)
      shift
      ;;
    --arch)
      ARCH="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

case "$ARCH" in
  universal)
    TARGET="universal-apple-darwin"
    REQUIRED_RUST_TARGETS=("aarch64-apple-darwin" "x86_64-apple-darwin")
    ;;
  apple-silicon)
    TARGET="aarch64-apple-darwin"
    REQUIRED_RUST_TARGETS=("aarch64-apple-darwin")
    ;;
  intel)
    TARGET="x86_64-apple-darwin"
    REQUIRED_RUST_TARGETS=("x86_64-apple-darwin")
    ;;
  *)
    echo "Invalid --arch value: $ARCH" >&2
    echo "Use one of: universal, apple-silicon, intel" >&2
    exit 2
    ;;
esac

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
else
  cat >&2 <<EOF
Missing local env file:
  $ENV_FILE

Create it first:
  cp scripts/build-mac-signed.env.example scripts/build-mac-signed.env.local

Then fill in your real Apple values.
EOF
  exit 1
fi

if ! command -v security >/dev/null 2>&1; then
  echo "This script must run on macOS with Keychain Access available." >&2
  exit 1
fi

if ! command -v rustup >/dev/null 2>&1; then
  echo "Missing rustup. Install Rust before building the Tauri app." >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "Missing pnpm. Install pnpm before building." >&2
  exit 1
fi

APPLE_SIGNING_IDENTITY="${APPLE_SIGNING_IDENTITY:-}"
if [[ -z "$APPLE_SIGNING_IDENTITY" ]]; then
  APPLE_SIGNING_IDENTITY="$(security find-identity -v -p codesigning | awk -F'"' '/Developer ID Application/ { print $2; found++ } END { if (found != 1) exit 1 }')" || true
fi

if [[ -z "$APPLE_SIGNING_IDENTITY" ]]; then
  cat >&2 <<'EOF'
No Developer ID Application signing identity found.

Run:
  security find-identity -v -p codesigning

You need an identity like:
  Developer ID Application: Alex Tirim (UZQ88T5NC7)

"Apple Development" is not enough for colleague installs.
EOF
  exit 1
fi

if ! security find-identity -v -p codesigning | grep -Fq "\"$APPLE_SIGNING_IDENTITY\""; then
  cat >&2 <<EOF
Configured APPLE_SIGNING_IDENTITY was not found in Keychain:
  $APPLE_SIGNING_IDENTITY

Available identities:
$(security find-identity -v -p codesigning)
EOF
  exit 1
fi

if [[ "$APPLE_SIGNING_IDENTITY" != Developer\ ID\ Application:* ]]; then
  cat >&2 <<EOF
Configured identity is not a Developer ID Application certificate:
  $APPLE_SIGNING_IDENTITY

This will not work for colleague installs outside your Mac.
EOF
  exit 1
fi

has_api_notary=false
if [[ -n "${APPLE_API_ISSUER:-}" && -n "${APPLE_API_KEY:-}" && -n "${APPLE_API_KEY_PATH:-}" ]]; then
  has_api_notary=true
fi

has_apple_id_notary=false
if [[ -n "${APPLE_ID:-}" && -n "${APPLE_PASSWORD:-}" && -n "${APPLE_TEAM_ID:-}" ]]; then
  has_apple_id_notary=true
fi

if [[ "$has_api_notary" != true && "$has_apple_id_notary" != true ]]; then
  cat >&2 <<'EOF'
Missing notarization credentials.

Fill in one option in scripts/build-mac-signed.env.local:

Option A:
  APPLE_ID
  APPLE_PASSWORD
  APPLE_TEAM_ID

Option B:
  APPLE_API_ISSUER
  APPLE_API_KEY
  APPLE_API_KEY_PATH
EOF
  exit 1
fi

if [[ -n "${APPLE_API_KEY_PATH:-}" && ! -f "${APPLE_API_KEY_PATH/#\~/$HOME}" ]]; then
  echo "APPLE_API_KEY_PATH does not point to a file: $APPLE_API_KEY_PATH" >&2
  exit 1
fi

export APPLE_SIGNING_IDENTITY

echo "Using signing identity:"
echo "  $APPLE_SIGNING_IDENTITY"
echo "Using notarization:"
if [[ "$has_api_notary" == true ]]; then
  echo "  App Store Connect API key"
else
  echo "  Apple ID app-specific password"
fi
echo "Building target:"
echo "  $TARGET"

for rust_target in "${REQUIRED_RUST_TARGETS[@]}"; do
  rustup target add "$rust_target"
done

cd "$ROOT_DIR"
pnpm tauri build --target "$TARGET"

APP_PATH="$(find "$ROOT_DIR/src-tauri/target" -maxdepth 8 -path "*/release/bundle/macos/Review Desk.app" -print | sort | tail -1)"
DMG_PATH="$(find "$ROOT_DIR/src-tauri/target" -name "Review Desk*.dmg" -print | sort | tail -1)"

if [[ -z "$APP_PATH" || -z "$DMG_PATH" ]]; then
  echo "Build finished, but expected app or DMG output was not found." >&2
  exit 1
fi

echo "Verifying app signature:"
codesign --verify --deep --strict --verbose=4 "$APP_PATH"
spctl -a -vv --type execute "$APP_PATH"

echo "Verifying notarization ticket:"
xcrun stapler validate "$APP_PATH"
xcrun stapler validate "$DMG_PATH"

echo "Verifying DMG Gatekeeper status:"
spctl -a -vv -t open --context context:primary-signature "$DMG_PATH"

echo
echo "Signed and notarized DMG:"
echo "  $DMG_PATH"
