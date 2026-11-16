#!/usr/bin/env bash
# Value-free inbound API key rotation for dys-api-fsc.
#
# The helper only accepts Secret Manager *references*
# (projects/<project>/secrets/<secret>/versions/<n>) and forwards them to
# `gcloud run services update --update-secrets`. Key material never appears in
# argv, logs, build artifacts, or this repository; invalid references fail
# closed and are never echoed back.
#
# Phases:
#   rotate    API_KEY=<old ref> + API_KEY_SECONDARY=<new ref>
#             Both keys accepted. The dual-key capable revision must already be
#             serving before this phase runs.
#   promote   API_KEY=<new ref> + API_KEY_SECONDARY=<old ref>
#             Atomic single update after every known consumer migrated: the new
#             key becomes primary and the outgoing old key stays accepted.
#   retire    API_KEY=<new ref>, API_KEY_SECONDARY removed by name only.
#             This is the only phase that drops a slot, and it retires the
#             outgoing old key because promotion already moved the new key into
#             API_KEY.
#   rollback  API_KEY=<old ref> + API_KEY_SECONDARY=<new ref>
#             Both slots stay populated; rollback never removes a slot while
#             consumer usage of either key can still be non-zero.
set -euo pipefail

SCRIPT_NAME="rotate-inbound-key.sh"
# Secret Manager resource name. The project identifier may not end with a hyphen
# (whatever its length), and the version must be a positive integer: `0` and
# zero-padded versions are rejected.
REF_PATTERN='^projects/[a-z]([a-z0-9-]*[a-z0-9])?/secrets/[A-Za-z0-9_-]+/versions/[1-9][0-9]*$'

usage() {
  cat >&2 <<'EOF'
Usage:
  rotate-inbound-key.sh <phase> --service <name> --region <region> \
    (--primary-ref <ref> [--secondary-ref <ref>])

Phases:
  rotate    API_KEY=old, API_KEY_SECONDARY=new (start of the dual-key window)
  promote   API_KEY=new, API_KEY_SECONDARY=old (after consumers migrated)
  retire    API_KEY=new, remove API_KEY_SECONDARY by name (outgoing key retired)
  rollback  API_KEY=old, API_KEY_SECONDARY=new (both slots stay populated)

References must be Secret Manager resource names, for example:
  projects/<project>/secrets/<secret>/versions/<n>

The project identifier must not end with a hyphen and the version must be a
positive integer (`1`, `2`, ...; `0` is rejected).

Key values are rejected, never echoed, and never passed through argv.
GCLOUD_BIN overrides the gcloud binary (used by tests).
EOF
}

fail() {
  echo "error: $1" >&2
  exit 2
}

require_secret_reference() {
  local flag="$1"
  local value="$2"
  if [ -z "$value" ]; then
    fail "$flag is required for phase '$phase' (expected a Secret Manager reference, never a key value)"
  fi
  if ! printf '%s' "$value" | grep -Eq "$REF_PATTERN"; then
    # The rejected text is deliberately not echoed: it could be a key value.
    fail "$flag is not a Secret Manager reference (expected projects/<project>/secrets/<secret>/versions/<n>; project id must not end in '-' and version must be >= 1)"
  fi
}

phase="${1:-}"
if [ -z "$phase" ]; then
  usage
  exit 2
fi
shift

case "$phase" in
  rotate | promote | retire | rollback) ;;
  -h | --help | help)
    usage
    exit 0
    ;;
  *)
    usage
    fail "unknown phase (expected rotate, promote, retire, or rollback)"
    ;;
esac

service=""
region=""
primary_ref=""
secondary_ref=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --service)
      service="${2:-}"
      shift 2 || fail "--service requires a value"
      ;;
    --region)
      region="${2:-}"
      shift 2 || fail "--region requires a value"
      ;;
    --primary-ref)
      primary_ref="${2:-}"
      shift 2 || fail "--primary-ref requires a value"
      ;;
    --secondary-ref)
      secondary_ref="${2:-}"
      shift 2 || fail "--secondary-ref requires a value"
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      usage
      fail "unknown argument"
      ;;
  esac
done

[ -n "$service" ] || fail "--service is required"
[ -n "$region" ] || fail "--region is required"

require_secret_reference "--primary-ref" "$primary_ref"

update_secrets=""
remove_secrets=""

case "$phase" in
  rotate | rollback)
    require_secret_reference "--secondary-ref" "$secondary_ref"
    update_secrets="API_KEY=$primary_ref,API_KEY_SECONDARY=$secondary_ref"
    ;;
  promote)
    require_secret_reference "--secondary-ref" "$secondary_ref"
    update_secrets="API_KEY=$primary_ref,API_KEY_SECONDARY=$secondary_ref"
    ;;
  retire)
    if [ -n "$secondary_ref" ]; then
      fail "phase 'retire' removes API_KEY_SECONDARY by name; --secondary-ref is not accepted"
    fi
    update_secrets="API_KEY=$primary_ref"
    remove_secrets="API_KEY_SECONDARY"
    ;;
esac

gcloud_bin="${GCLOUD_BIN:-gcloud}"

# Slot names only: references and values stay out of the log line.
if [ -n "$remove_secrets" ]; then
  echo "$SCRIPT_NAME: phase=$phase service=$service region=$region slots=API_KEY update=yes remove=$remove_secrets"
else
  echo "$SCRIPT_NAME: phase=$phase service=$service region=$region slots=API_KEY,API_KEY_SECONDARY"
fi

command=(
  "$gcloud_bin" run services update "$service"
  --region "$region"
  --update-secrets "$update_secrets"
)

if [ -n "$remove_secrets" ]; then
  # Name-only removal: no reference, no value, no '=' payload.
  command+=(--remove-secrets "$remove_secrets")
fi

exec "${command[@]}"
