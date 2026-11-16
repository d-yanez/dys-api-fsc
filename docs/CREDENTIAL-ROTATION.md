# Inbound API key rotation (`dys-api-fsc`)

Value-free rotation procedure for the `x-api-key` credential the BFF accepts.
The service supports two slots, `API_KEY` (primary) and `API_KEY_SECONDARY`
(temporary), so producers and consumers never have to change in lockstep.

No step in this document requires, prints, or stores key material. Rotation is
driven only by Secret Manager references
(`projects/<project>/secrets/<secret>/versions/<n>`).

## Slots

| Environment variable   | Meaning                                                        |
| ---------------------- | -------------------------------------------------------------- |
| `API_KEY`              | Required primary key. Never empty.                              |
| `API_KEY_SECONDARY`    | Optional temporary second key. Empty or unset means retired.    |

The middleware accepts a request when the header matches either slot. When
`API_KEY` is missing, both slots fail closed with
`500 {"error":"Server misconfiguration"}`; the secondary key can never
authorize on its own.

## Phases

Rotation has three ordered phases plus a rollback. The order is mandatory: the
slot names do not describe which key is "new" until you read the phase.

### 1. `rotate` — open the dual-key window

```text
API_KEY           = <old key reference>
API_KEY_SECONDARY = <new key reference>
```

Both the outgoing and the incoming key are accepted. The dual-key capable
revision must already be serving before this phase runs, otherwise the incoming
key still returns `401`. New consumers can now adopt the new key.

### 2. `promote` — swap the slots atomically

```text
API_KEY           = <new key reference>
API_KEY_SECONDARY = <old key reference>
```

Applied as a single `--update-secrets` call, so there is no intermediate state
in which only one key is accepted. Run it only after every known consumer of
the old key has migrated. The outgoing key is still accepted, now through the
secondary slot.

### 3. `retire` — drop the outgoing key

```text
API_KEY           = <new key reference>
API_KEY_SECONDARY = removed (name only)
```

`retire` is the only phase that removes a slot, and it removes the *old* key
because `promote` already moved the new key into `API_KEY`. Removing the
secondary before promotion would instead drop the incoming key and keep the
outgoing one, leaving the rotation incomplete. Retire only when consumer usage
of the old key is zero.

### Rollback

```text
API_KEY           = <old key reference>
API_KEY_SECONDARY = <new key reference>
```

Rollback restores the phase-1 layout and never removes a slot. Both keys stay
populated until consumer usage of either key is zero, so a rollback never
creates an authentication gap.

## Delivery

`/cloudbuild.yaml` keeps its default behaviour: image build, push, and
`gcloud run deploy` with no environment or secret flags, so every existing
Cloud Run mapping is preserved. The optional rotation step at the end of the
pipeline is a no-op unless `_ROTATE_PHASE` is set explicitly.

Trigger it from an authorized Cloud Build invocation, for example:

```bash
gcloud builds submit \
  --substitutions=_ROTATE_PHASE=rotate,_API_KEY_REF=projects/PROJECT/secrets/SECRET_OLD/versions/7,_API_KEY_SECONDARY_REF=projects/PROJECT/secrets/SECRET_NEW/versions/1
```

The step forwards the phase to `scripts/gcp/rotate-inbound-key.sh`, which:

- accepts only Secret Manager references; anything that does not match
  `projects/<project>/secrets/<secret>/versions/<n>` — project identifiers may
  not end with a hyphen and the version must be a positive integer (`1`, `2`,
  ...; `0` is rejected) — fails closed with a non-zero exit and the rejected
  text is never echoed;
- never puts key material in argv, logs, or build artifacts, and writes nothing
  to the repository;
- uses `--update-secrets` with references and `--remove-secrets` with a bare
  slot name, so removals carry no value;
- refuses `--secondary-ref` for `retire`, keeping the drop name-only.

The same helper can be run directly:

```bash
scripts/gcp/rotate-inbound-key.sh promote \
  --service dys-api-fsc \
  --region us-central1 \
  --primary-ref projects/PROJECT/secrets/SECRET_NEW/versions/1 \
  --secondary-ref projects/PROJECT/secrets/SECRET_OLD/versions/7
```

`GCLOUD_BIN` overrides the `gcloud` binary; the automated tests use it to
capture argv without contacting Google Cloud.

## Safety checklist

- Rotate only after the dual-key capable revision serves traffic.
- Promote only after the last consumer of the old key moved.
- Retire only after old-key usage is zero; keep both slots populated otherwise.
- Never pass key values as arguments, substitutions, or files.
- Verify with `gcloud run services describe dys-api-fsc --region <region>`
  that the `--update-secrets` mapping references only names and versions.
