---
name: signwell-cli
description: Use the SignWell CLI (`sw`) to manage eSignature documents, templates, bulk sends, and webhooks from the terminal. Trigger when the user wants to send documents for signing, manage templates, check document status, or interact with the SignWell API.
metadata:
  author: ziptied
  version: "1.0.0"
---

# SignWell CLI (`sw`)

You have access to the `sw` command-line tool for the SignWell eSignature API. Use it to manage documents, templates, bulk sends, webhooks, and account settings.

## Important: Always use `--json` flag

When running `sw` commands, **always** append `--json` to get machine-readable output. Parse the JSON response to extract data for the user. The JSON envelope is:

```json
{ "success": true, "data": { ... }, "error": null, "meta": { ... } }
```

For errors:
```json
{ "success": false, "error": { "code": "NOT_FOUND", "message": "...", "hint": "..." }, "data": null }
```

## Authentication

Before using any command, ensure the user is authenticated:

```bash
# Check auth status
sw auth status --json

# If not authenticated, prompt user for their API key
sw auth login --api-key <KEY> --json

# For test mode (no real emails sent)
sw auth login --api-key <KEY> --test-mode --json
```

## Core Commands

### Documents

```bash
# Create and send a document (sent on creation by default)
sw documents create \
  --file <path-to-file> \
  --recipient "email@example.com:Recipient Name" \
  --name "Document Name" \
  --json

# Multiple files and recipients
sw documents create \
  --file contract.pdf --file appendix.pdf \
  --recipient "alice@co.com:Alice" --recipient "bob@co.com:Bob" \
  --subject "Please sign" --message "Attached for signature." \
  --json

# File from URL
sw documents create --file-url "https://example.com/doc.pdf" \
  --recipient "alice@co.com:Alice" --json

# Embedded signing (returns embedded_signing_url)
sw documents create --file doc.pdf \
  --recipient "alice@co.com:Alice:embedded" --json

# Create as draft (don't send yet)
sw documents create --file doc.pdf \
  --recipient "alice@co.com:Alice" --draft --json

# With options
sw documents create --file doc.pdf \
  --recipient "alice@co.com:Alice" \
  --text-tags --signing-order \
  --expiration-days 30 --reminder-days 3 7 14 --json

# Get document details
sw documents get <document-id> --json

# List documents (paginated)
sw documents list --json
sw documents list --status pending --json
sw documents list --status completed --json
sw documents list --page 2 --per-page 50 --json
sw documents list --all --json   # streams NDJSON

# Send a draft document
sw documents send <document-id> --json

# Send a reminder to pending signers
sw documents remind <document-id> --json

# Download signed PDF
sw documents download <document-id> -o output.pdf --json

# Delete a document
sw documents delete <document-id> --confirm --json

# Update recipients
sw documents recipients update <document-id> \
  --recipient "old@email.com:new@email.com:New Name" --json
```

**Recipient format:** `email:name` or `email:name:embedded`

### Templates

```bash
# Create a template (at least one placeholder required)
sw templates create \
  --file nda.pdf \
  --name "Standard NDA" \
  --placeholder "Client:client@example.com" \
  --text-tags --json

# Create a template from a URL
sw templates create \
  --file-url "https://example.com/nda.pdf" \
  --name "Standard NDA" \
  --placeholder "Client" --json

# Get template details
sw templates get <template-id> --json

# List templates
sw templates list --json
sw templates list --all --json

# Update a template
sw templates update <template-id> --name "Updated NDA" --json

# Delete a template
sw templates delete <template-id> --confirm --json

# Create document from template (sent on creation by default)
sw templates use <template-id> \
  --recipient "Signer:alice@co.com:Alice Smith" \
  --field "company=Acme Inc" --field "date=2024-01-15" \
  --json

# Simple recipient (no placeholder role)
sw templates use <template-id> \
  --recipient "bob@co.com:Bob" --draft --json
```

**Template recipient format:** `PlaceholderRole:email:name` or `email:name`

### Bulk Send

```bash
# Download CSV template for a template
sw bulk-send csv-template --template <template-id> -o batch.csv --json

# Validate CSV before sending
sw bulk-send validate --template <template-id> --csv batch.csv --json

# Create bulk send
sw bulk-send create \
  --template <template-id> \
  --csv batch.csv \
  --name "Q1 NDA Batch" --confirm --json

# Dry run (validate only)
sw bulk-send create --template <template-id> --csv batch.csv --dry-run --json

# Get bulk send status
sw bulk-send get <bulk-send-id> --json

# List bulk sends
sw bulk-send list --json

# List documents from a bulk send
sw bulk-send documents <bulk-send-id> --json
```

### Webhooks

```bash
# List webhooks
sw webhooks list --json

# Create a webhook
sw webhooks create --url https://myapp.com/hooks \
  --event document_completed --event document_signed --json

# Delete a webhook
sw webhooks delete <webhook-id> --confirm --json

# Listen for webhooks locally (dev tool — runs a local server)
sw webhooks listen --port 4000
sw webhooks listen --secret whsec_abc123 --forward http://localhost:8080/hooks
```

### Account & Profiles

```bash
# Show account info
sw me --json

# List profiles
sw profile list --json

# Add a profile
sw profile add production --api-key <KEY> --json
sw profile add staging --api-key <KEY> --test-mode --json

# Switch active profile
sw profile use production --json

# Use a profile for one command
sw documents list --profile staging --json

# Remove a profile
sw profile remove staging --confirm --json
```

### Schema Introspection

```bash
# Get JSON schema for a command (useful for validation)
sw schema documents.create
sw schema templates.use
sw schema bulk-send.create
```

## Global Flags

| Flag | Description |
|------|-------------|
| `--json` | Machine-readable JSON output (always use this) |
| `--quiet` | Suppress all output except errors |
| `--profile <name>` | Use a named profile |
| `--test-mode` | Set test_mode on API requests (no real emails) |
| `--debug` | Log HTTP requests/responses to stderr |
| `--no-color` | Disable ANSI colors |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SIGNWELL_API_KEY` | Override API key (highest priority) |
| `SIGNWELL_TEST_MODE` | `"true"` to enable test mode |
| `SIGNWELL_API_BASE_URL` | Custom API base URL |
| `SIGNWELL_AUTO_CONFIRM` | `"true"` to skip all confirmation prompts |

## Tips for AI Usage

1. **Always use `--json`** to get structured output you can parse.
2. **Use `--confirm`** on destructive operations (delete, remove) to skip interactive prompts.
3. **Set `SIGNWELL_AUTO_CONFIRM=true`** for fully non-interactive scripting.
4. **Use `--test-mode`** when the user wants to test without sending real emails.
5. **Check auth first** with `sw auth status --json` before running commands.
6. **For bulk operations**, always validate CSV first with `sw bulk-send validate` before creating.
7. **Pagination**: Use `--all --json` to get all results as NDJSON stream, or `--page N --per-page N` for specific pages.
8. **Exit codes**: 0=success, 1=general error, 2=usage error, 3=auth error, 4=rate limited, 5=file error, 6=CSV error.

## Common Workflows

### Send a document for signing
1. `sw auth status --json` — verify authenticated
2. `sw documents create --file doc.pdf --recipient "email:Name" --name "Doc Name" --json` — documents are sent on creation by default

### Use a template
1. `sw templates list --json` — find template ID
2. `sw templates get <id> --json` — check placeholder roles and fields
3. `sw templates use <id> --recipient "Role:email:Name" --field "key=value" --json` — sent on creation by default

### Bulk send
1. `sw bulk-send csv-template --template <id> -o batch.csv --json` — get CSV template
2. Help user fill in the CSV
3. `sw bulk-send validate --template <id> --csv batch.csv --json` — validate
4. `sw bulk-send create --template <id> --csv batch.csv --name "Batch" --confirm --json`
