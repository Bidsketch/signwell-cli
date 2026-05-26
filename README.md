# signwell-cli (`sw`)

A full-featured Node.js CLI for the [SignWell](https://www.signwell.com) eSignature API. Manage documents, templates, bulk sends, webhooks, and more from the terminal.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Use Cases](#use-cases)
- [Global Options](#global-options)
- [Configuration](#configuration)
- [AI Agent Skills](#ai-agent-skills)
- [Commands](#commands)
  - [auth](#auth) - Manage authentication
  - [me](#me) - Show account info
  - [profile](#profile) - Manage profiles
  - [documents](#documents) - Create, send, track, and download documents
  - [templates](#templates) - Manage reusable document templates
  - [bulk-send](#bulk-send) - Send documents in bulk via CSV
  - [webhooks](#webhooks) - Manage and test webhook integrations
  - [schema](#schema) - Print JSON Schemas for LLM/CI integration
  - [skills](#skills) - Install AI agent skills
- [Output Modes](#output-modes)
- [JSON Envelope](#json-envelope)
- [Data Shapes](#data-shapes)
- [API Endpoints Reference](#api-endpoints-reference)
- [Error Codes & Exit Codes](#error-codes--exit-codes)
- [Environment Variables](#environment-variables)
- [File Upload](#file-upload)
- [Pagination](#pagination)
- [Development](#development)

---

## Installation

```bash
# Install globally
npm install -g signwell-cli

# Or run directly without installing
npx signwell-cli --help
npx signwell-cli documents list

# Or from source
git clone https://github.com/Bidsketch/signwell-cli.git
cd signwell-cli
npm install
npm run build
npm link
```

Requires **Node.js >= 18**.

## Quick Start

```bash
# Authenticate
sw auth login --api-key YOUR_API_KEY

# Create a draft from an uploaded document
sw documents create \
  --file contract.pdf \
  --recipient "alice@example.com:Alice Smith" \
  --name "Service Agreement"

# List documents
sw documents list

# Download a completed document
sw documents download doc_abc123 -o signed.pdf

# Create a draft from a template
sw templates use tmpl_xyz \
  --recipient "Signer:bob@example.com:Bob" \
  --field "company=Acme Inc"
```

---

## Use Cases

### Freelancer: Send a contract and get it signed

```bash
# Create a contract draft and add fields in SignWell
sw documents create \
  --file proposal.pdf \
  --recipient "client@company.com:Jane Lee" \
  --name "Web Design Proposal"

# Check if it's been signed yet
sw documents list --status pending

# Nudge the client after a few days
sw documents remind doc_abc123

# Download the signed copy once complete
sw documents download doc_abc123 -o proposal-signed.pdf
```

### HR: Onboard new hires with an offer letter template

```bash
# Set up a reusable offer letter
sw templates create \
  --file offer-letter.pdf \
  --name "Offer Letter" \
  --placeholder "New Hire:hire@example.com:New Hire" \
  --text-tags

# Create a draft for a new hire, pre-filling the start date
sw templates use tmpl_offer \
  --recipient "New Hire:maria@gmail.com:Maria Chen" \
  --field "start_date=2026-04-01" \
  --field "position=Software Engineer"
```

### Sales: Batch-send NDAs to a list of prospects

```bash
# Download the CSV template for your NDA template
sw bulk-send csv-template --template tmpl_nda -o nda-batch.csv

# Fill in the CSV with prospect info, then validate it
sw bulk-send validate --template tmpl_nda --csv nda-batch.csv

# Send the batch
sw bulk-send create \
  --template tmpl_nda \
  --csv nda-batch.csv \
  --name "Q1 Prospect NDAs"

# Monitor progress
sw bulk-send get bs_abc123
```

### Developer: Pipe document data into other tools

```bash
# Get all completed document IDs as plain text
sw documents list --status completed --all --json \
  | jq -r '.id'

# Count pending documents
sw documents list --status pending --json \
  | jq '.meta.total'

# Export all documents to a CSV with jq
sw documents list --all --json \
  | jq -r '[.id, .name, .status] | @csv'
```

### Testing: Try things out without sending real emails

```bash
# Log in with test mode enabled
sw auth login --api-key sk_test_xyz --test-mode

# Or toggle test mode per-command
sw documents create \
  --file draft.pdf \
  --recipient "test@example.com:Test User" \
  --name "Test Doc" \
  --test-mode

# Everything works the same, but no emails are delivered
sw documents list
```

### Webhook development: Inspect events locally

```bash
# Start a local listener to see webhook payloads as they arrive
sw webhooks listen --port 4000

# In another terminal, register the webhook (use ngrok or similar to expose)
sw webhooks create --url https://abc123.ngrok.io/hooks \
  --event document_completed --event document_signed

# Send a test document and watch events print in real time
```

### Multi-account: Switch between production and staging

```bash
# Set up both profiles
sw profile add production --api-key sk_live_abc123
sw profile add staging --api-key sk_test_xyz789 --test-mode

# Default to production
sw profile use production

# Run a one-off command against staging
sw documents list --profile staging

# See all profiles at a glance
sw profile list
```

---

## Global Options

Every command accepts these flags:

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--profile <name>` | `string` | active profile | Use a named profile from config |
| `--json` | `boolean` | `false` | Output machine-readable JSON envelope |
| `--quiet` | `boolean` | `false` | Suppress all output except errors |
| `--no-color` | `boolean` | `false` | Disable ANSI color codes. Bare `--no-color` and `--no-color=1` both disable color; omit it to keep color enabled. |
| `--test-mode` | `boolean` | `false` | Inject `test_mode: true` into API requests |
| `--debug` | `boolean` | `false` | Log HTTP requests/responses to stderr |
| `--help, -h` | | | Show help for any command |
| `--version` | | | Show CLI version |

---

## Configuration

### Config File

Stored at `~/.signwell/config.json`:

```json
{
  "profiles": {
    "default": {
      "api_key": "your_api_key_here",
      "test_mode": false
    },
    "staging": {
      "api_key": "staging_key_here",
      "test_mode": true
    }
  },
  "active_profile": "default"
}
```

### Environment Variable Overrides

Environment variables take precedence over config file values:

| Variable | Description |
|----------|-------------|
| `SIGNWELL_API_KEY` | Override the API key (highest priority) |
| `SIGNWELL_TEST_MODE` | Set to `"true"` to enable test mode |
| `SIGNWELL_API_BASE_URL` | Custom API base URL (default: `https://www.signwell.com/api/v1`) |
| `SIGNWELL_CONFIG_PATH` | Custom config file location |
| `SIGNWELL_AUTO_CONFIRM` | Set to `"true"` to skip all confirmation prompts |

### Priority Order

1. `--api-key` flag (auth commands only)
2. `SIGNWELL_API_KEY` environment variable
3. Config file profile (`--profile <name>` or active profile)

---

## AI Agent Skills

signwell-cli ships with [Agent Skills](https://agentskills.io) — portable skill files that teach AI coding assistants how to use the `sw` CLI effectively. Skills work with Claude Code, Cursor, GitHub Copilot, Gemini CLI, Windsurf, Codex, Roo Code, and any other agent that supports the open Agent Skills standard.

### Installation

#### Option 1: Universal installer (recommended)

Use the [`skills`](https://skills.sh) CLI to install from GitHub. This auto-detects all supported agents on your machine:

```bash
npx skills add ziptied/signwell-cli
```

#### Option 2: Built-in command

If you already have `signwell-cli` installed globally, the skill installer is built right in:

```bash
sw skills install
```

This will:
1. Copy the bundled skills to the canonical `~/.agents/skills/` directory
2. Auto-detect installed AI agents (Claude Code, Cursor, Copilot, etc.)
3. Create symlinks from each agent's skill directory into the canonical location

You can also target a specific agent:

```bash
sw skills install --agent claude-code
sw skills install --agent cursor
```

#### Option 3: Manual

Copy the `skills/signwell-cli/` directory from this repo into your agent's skills directory:

```bash
# Claude Code
cp -r skills/signwell-cli ~/.claude/skills/

# Cursor
cp -r skills/signwell-cli ~/.cursor/skills/

# Any agent using the universal directory
cp -r skills/signwell-cli ~/.agents/skills/
```

### What the skill provides

Once installed, your AI agent will know how to:

- Authenticate with `sw auth login`
- Create, send, track, and download documents
- Manage templates and bulk sends
- Configure webhooks
- Use `--json` mode for structured output parsing
- Handle pagination, error codes, and common workflows

### Repo structure

Skills follow the [Agent Skills specification](https://agentskills.io/specification):

```
skills/
  signwell-cli/
    SKILL.md          # Skill instructions + metadata
```

### Supported agents

| Agent | Global skills directory |
|-------|----------------------|
| Claude Code | `~/.claude/skills/` |
| Cursor | `~/.cursor/skills/` |
| GitHub Copilot | `~/.copilot/skills/` |
| Gemini CLI | `~/.gemini/skills/` |
| Codex | `~/.codex/skills/` |
| Windsurf | `~/.codeium/windsurf/skills/` |
| Roo Code | `~/.roo/skills/` |
| Universal | `~/.agents/skills/` |

---

## Commands

### auth

Manage authentication credentials.

#### `sw auth login`

Set up API credentials interactively or via flags.

```bash
# Interactive (prompts for key)
sw auth login

# Non-interactive
sw auth login --api-key sk_live_abc123

# Save to a named profile
sw auth login --api-key sk_live_abc123 --profile production

# Enable test mode for this profile
sw auth login --api-key sk_test_xyz --test-mode
```

**Options:**

| Option | Type | Description |
|--------|------|-------------|
| `--api-key` | `string` | API key (skips interactive prompt) |
| `--test-mode` | `boolean` | Enable test mode for this profile |

**JSON output:**
```json
{
  "success": true,
  "error": null,
  "data": {
    "name": "John Doe",
    "email": "john@example.com",
    "profile": "default"
  },
  "meta": {}
}
```

**Behavior:** Validates the API key by calling `GET /me` before saving. If validation fails, the key is not saved.

---

#### `sw auth logout`

Remove stored credentials.

```bash
sw auth logout
sw auth logout --profile staging
```

**Options:**

| Option | Type | Description |
|--------|------|-------------|
| `--profile` | `string` | Profile to remove (default: active profile) |

**JSON output:**
```json
{
  "success": true,
  "data": { "removed": "default" },
  "error": null,
  "meta": {}
}
```

---

#### `sw auth status`

Show current authentication status.

```bash
sw auth status
sw auth status --profile production
```

**JSON output:**
```json
{
  "success": true,
  "data": {
    "authenticated": true,
    "profile": "default",
    "api_key": "sk_l...c123",
    "test_mode": false
  },
  "error": null,
  "meta": {}
}
```

---

### me

#### `sw me`

Show current account information. Calls `GET /me`.

```bash
sw me
sw me --json
```

**JSON output:**
```json
{
  "success": true,
  "data": {
    "name": "John Doe",
    "email": "john@example.com",
    "plan": "Business"
  },
  "error": null,
  "meta": {}
}
```

---

### profile

Manage multiple configuration profiles.

#### `sw profile list`

```bash
sw profile list
```

**Human output:**
```
   Name        API Key           Test Mode
→  default     sk_l...c123       no
   staging     sk_t...xyz        yes
```

**JSON output:**
```json
{
  "success": true,
  "data": [
    { "name": "default", "active": true, "api_key": "sk_l...c123", "test_mode": false },
    { "name": "staging", "active": false, "api_key": "sk_t...xyz", "test_mode": true }
  ],
  "error": null,
  "meta": {}
}
```

#### `sw profile add <name>`

```bash
sw profile add production --api-key sk_live_abc123
sw profile add staging --api-key sk_test_xyz --test-mode
```

| Option | Type | Description |
|--------|------|-------------|
| `--api-key` | `string` | API key (prompts if omitted) |
| `--test-mode` | `boolean` | Enable test mode (default: `false`) |

**JSON output:** `{ "data": { "name": "production", "added": true } }`

#### `sw profile use <name>`

```bash
sw profile use production
```

**JSON output:** `{ "data": { "active_profile": "production" } }`

#### `sw profile remove <name>`

```bash
sw profile remove staging
sw profile remove staging --confirm   # skip prompt
```

| Option | Type | Description |
|--------|------|-------------|
| `--confirm` | `boolean` | Skip confirmation prompt |

**JSON output:** `{ "data": { "name": "staging", "removed": true } }`

#### `sw profile show <name>`

```bash
sw profile show production
```

**JSON output:**
```json
{
  "data": {
    "name": "production",
    "active": false,
    "api_key": "sk_l...c123",
    "test_mode": false
  }
}
```

---

### documents

Create, send, track, and download signature documents.

#### `sw documents create`

Create a new document for signing.

```bash
# Simple document with local file
sw documents create \
  --file contract.pdf \
  --recipient "alice@example.com:Alice Smith" \
  --name "Service Agreement"

# Multiple files and recipients as a draft
sw documents create \
  --file contract.pdf \
  --file appendix.pdf \
  --recipient "alice@example.com:Alice Smith" \
  --recipient "bob@example.com:Bob Jones" \
  --subject "Please sign" \
  --message "Attached for your signature."

# Send immediately when the file contains SignWell text tags
sw documents create \
  --file contract.pdf \
  --recipient "alice@example.com:Alice Smith" \
  --name "Tagged Service Agreement" \
  --text-tags \
  --send

# File from URL
sw documents create \
  --file-url "https://example.com/contract.pdf" \
  --recipient "alice@example.com:Alice"

# Embedded signing
sw documents create \
  --file contract.pdf \
  --recipient "alice@example.com:Alice:embedded" \
  --name "Embedded Doc"

# Draft with options
sw documents create \
  --file contract.pdf \
  --recipient "alice@example.com:Alice" \
  --text-tags \
  --signing-order \
  --expiration-days 30 \
  --reminder-days 3 7 14
```

**Options:**

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `--file <path>` | `string[]` | one of file/file-url/file-b64 | Local file path(s) |
| `--file-url <url>` | `string[]` | | Remote file URL(s) |
| `--file-b64 <path>` | `string` | | Path to base64-encoded file |
| `--file-b64-name <name>` | `string` | | Filename for base64 upload |
| `--name <name>` | `string` | | Document name (default: first filename) |
| `--recipient <spec>` | `string[]` | **yes** | `"email:name"` or `"email:name:embedded"` |
| `--subject` | `string` | | Email subject line |
| `--message` | `string` | | Email message body |
| `--draft` | `boolean` | | Create as draft (default behavior) |
| `--send` | `boolean` | | Send after creation; requires `--text-tags` for file uploads |
| `--text-tags` | `boolean` | | Enable text tag parsing before sending |
| `--redirect-url` | `string` | | Redirect URL after signing |
| `--signing-order` | `boolean` | | Enforce sequential signing order |
| `--expiration-days` | `number` | | Days until document expires |
| `--reminder-days` | `number[]` | | Auto-remind at these day intervals |

**Recipient format:** `email:name:embedded`
- `email` (required): Signer's email address
- `name` (optional): Display name
- `embedded` (optional): Use embedded signing (returns `embedded_signing_url`)

**API:** `POST /documents`

**JSON output:**
```json
{
  "success": true,
  "data": {
    "id": "doc_abc123",
    "name": "Service Agreement",
    "status": "pending",
    "created_at": "2024-01-15T10:30:00Z",
    "recipients": [
      {
        "id": "rec_xyz",
        "email": "alice@example.com",
        "name": "Alice Smith",
        "status": "pending",
        "signing_url": "https://app.signwell.com/sign/...",
        "embedded_signing_url": "https://app.signwell.com/embed/..."
      }
    ]
  },
  "error": null,
  "meta": {}
}
```

---

#### `sw documents get <id>`

Get full document details.

```bash
sw documents get doc_abc123
sw documents get doc_abc123 --json
```

**API:** `GET /documents/{id}`

**JSON output:** Full `Document` object (see [Data Shapes](#document)).

**Human output:** Document summary with a recipients table showing email, name, status, and signed-at date.

---

#### `sw documents list`

List documents with pagination.

```bash
sw documents list
sw documents list --page 2 --per-page 50
sw documents list --status completed
sw documents list --all              # fetch all pages
sw documents list --all --json       # NDJSON stream of all documents
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--page` | `number` | `1` | Page number |
| `--per-page` | `number` | `20` | Items per page |
| `--status` | `string` | | Filter by document status. Common API statuses include `draft`, `saved`, `sent`, `shared`, `viewed`, `pending`, `completed`, `expired`, `canceled`, `declined`, `bounced`, and `error`. |
| `--all` / `--all-pages` | `boolean` | `false` | Fetch all pages |

**API:** `GET /documents?page={page}&per_page={per_page}&status={status}`

**JSON output (single page):**
```json
{
  "success": true,
  "data": [
    { "id": "doc_1", "name": "Contract A", "status": "completed", "created_at": "..." },
    { "id": "doc_2", "name": "NDA", "status": "pending", "created_at": "..." }
  ],
  "error": null,
  "meta": {
    "count": 2,
    "total": 45,
    "page": 1,
    "per_page": 20,
    "total_pages": 3,
    "next_page": 2,
    "prev_page": null
  }
}
```

**JSON output (--all):** Newline-delimited JSON (NDJSON), one document per line.

---

#### `sw documents send <id>`

Send a draft document for signing.

```bash
sw documents send doc_abc123
```

**API:** `POST /documents/{id}/send`

**JSON output:** Updated `Document` object.

---

#### `sw documents remind <id>`

Send a reminder to all pending signers.

```bash
sw documents remind doc_abc123
```

**API:** `POST /documents/{id}/remind`

**JSON output:**
```json
{ "success": true, "data": { "id": "doc_abc123", "reminded": true }, "error": null, "meta": {} }
```

---

#### `sw documents download <id>`

Download the completed, signed PDF.

```bash
sw documents download doc_abc123
sw documents download doc_abc123 -o ~/Downloads/signed-contract.pdf
sw documents download doc_abc123 --open
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--output, -o` | `string` | `{name}-signed.pdf` | Output file path |
| `--open` | `boolean` | `false` | Open file after download |

**API:** `GET /documents/{id}/completed_pdf`

**Prerequisite:** Document status must be `completed`. Exits with error if not.

**JSON output:**
```json
{ "success": true, "data": { "id": "doc_abc123", "output": "contract-signed.pdf", "size": 102400 }, "error": null, "meta": {} }
```

---

#### `sw documents delete <id>`

Delete a document permanently.

```bash
sw documents delete doc_abc123
sw documents delete doc_abc123 --confirm   # skip prompt
```

| Option | Type | Description |
|--------|------|-------------|
| `--confirm` | `boolean` | Skip confirmation prompt |

**API:** `DELETE /documents/{id}`

**JSON output:**
```json
{ "success": true, "data": { "id": "doc_abc123", "deleted": true }, "error": null, "meta": {} }
```

---

#### `sw documents recipients update <id>`

Update recipients on an existing document.

```bash
sw documents recipients update doc_abc123 \
  --recipient "old@email.com:new@email.com:New Name"
```

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `--recipient` | `string[]` | **yes** | `"old_email:new_email:new_name"` |

**API:** `PATCH /documents/{id}/recipients`

**JSON output:** Updated `Document` object.

---

### templates

Manage reusable document templates.

#### `sw templates create`

```bash
sw templates create \
  --file nda.pdf \
  --name "Standard NDA" \
  --placeholder "Client:client@example.com:Client Rep" \
  --text-tags
```

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `--file` | `string[]` | **yes** | Template file(s) |
| `--name` | `string` | **yes** | Template name |
| `--placeholder` | `string[]` | | `"role_name:email:display_name"` |
| `--text-tags` | `boolean` | | Enable text tag parsing |
| `--fields` | `string` | | Path to fields JSON file |

**API:** `POST /document_templates`

**JSON output:** `Template` object.

---

#### `sw templates get <id>`

```bash
sw templates get tmpl_abc123
```

**API:** `GET /document_templates/{id}`

**JSON output:** Full `Template` object with `placeholder_roles` and `fields`.

---

#### `sw templates list`

```bash
sw templates list
sw templates list --page 2 --per-page 50
sw templates list --all
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--page` | `number` | `1` | Page number |
| `--per-page` | `number` | `20` | Items per page |
| `--all` / `--all-pages` | `boolean` | `false` | Fetch all pages |

**API:** `GET /document_templates?page={page}&per_page={per_page}`

**JSON output:** Paginated array of `Template` objects with meta.

---

#### `sw templates update <id>`

```bash
sw templates update tmpl_abc123 --name "Updated NDA"
sw templates update tmpl_abc123 --file new-nda.pdf
```

| Option | Type | Description |
|--------|------|-------------|
| `--name` | `string` | New template name |
| `--file` | `string[]` | Replacement file(s) |

**API:** `PUT /document_templates/{id}`

**JSON output:** Updated `Template` object.

---

#### `sw templates delete <id>`

```bash
sw templates delete tmpl_abc123 --confirm
```

| Option | Type | Description |
|--------|------|-------------|
| `--confirm` | `boolean` | Skip confirmation |

**API:** `DELETE /document_templates/{id}`

**JSON output:** `{ "data": { "id": "tmpl_abc123", "deleted": true } }`

---

#### `sw templates use <id>`

Create a draft document from a template. Use `sw documents send <id>` after reviewing the draft.

```bash
sw templates use tmpl_abc123 \
  --recipient "Signer:alice@example.com:Alice Smith" \
  --field "company=Acme Inc" \
  --field "date=2024-01-15"

# Simple recipient (no placeholder role)
sw templates use tmpl_abc123 \
  --recipient "bob@example.com:Bob"
```

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `--recipient` | `string[]` | **yes** | `"placeholder:email:name"` or `"email:name"` |
| `--field` | `string[]` | | Pre-fill field as `"key=value"` |
| `--subject` | `string` | | Override email subject |
| `--message` | `string` | | Override email message |
| `--send` | `boolean` | | Create as draft, then send explicitly |
| `--draft` | `boolean` | | Create as draft (default behavior) |

Template use defaults to drafts so the document can be reviewed before sending. The template must already contain the required fields before a send will succeed.

**Recipient formats:**
- `Signer:alice@example.com:Alice Smith` — maps to a template placeholder role
- `alice@example.com:Alice Smith` — simple recipient (no placeholder)

**API:** `POST /document_templates/documents`

**JSON output:** Created `Document` object.

---

### bulk-send

Create and manage bulk document sends from CSV files.

#### `sw bulk-send create`

```bash
sw bulk-send create \
  --template tmpl_abc123 \
  --csv recipients.csv \
  --name "Q1 NDA Batch"

# Dry run (validate only)
sw bulk-send create \
  --template tmpl_abc123 \
  --csv recipients.csv \
  --dry-run

# Limit rows
sw bulk-send create \
  --template tmpl_abc123 \
  --csv recipients.csv \
  --limit 10
```

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `--template` | `string[]` | **yes** | Template ID(s) |
| `--csv` | `string` | **yes** | Path to CSV file |
| `--name` | `string` | | Bulk send name |
| `--dry-run` | `boolean` | | Validate CSV without creating |
| `--limit` | `number` | | Process only first N rows |
| `--confirm` | `boolean` | | Skip confirmation prompt |
| `--progress` | `boolean` | | Show progress bar |

**API:** `POST /bulk_sends`

**JSON output:**
```json
{
  "success": true,
  "data": {
    "id": "bs_abc123",
    "name": "Q1 NDA Batch",
    "status": "processing",
    "total": 50,
    "sent": 0,
    "failed": 0,
    "created_at": "2024-01-15T10:30:00Z"
  },
  "error": null,
  "meta": {}
}
```

---

#### `sw bulk-send get <id>`

```bash
sw bulk-send get bs_abc123
```

**API:** `GET /bulk_sends/{id}`

**JSON output:** `BulkSend` object.

---

#### `sw bulk-send list`

```bash
sw bulk-send list
sw bulk-send list --all
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--page` | `number` | `1` | Page number |
| `--per-page` | `number` | `20` | Items per page |
| `--all` / `--all-pages` | `boolean` | `false` | Fetch all pages |

**API:** `GET /bulk_sends?page={page}&per_page={per_page}`

---

#### `sw bulk-send documents <id>`

List documents created by a bulk send.

```bash
sw bulk-send documents bs_abc123
sw bulk-send documents bs_abc123 --all
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--page` | `number` | `1` | Page number |
| `--per-page` | `number` | `20` | Items per page |
| `--all` / `--all-pages` | `boolean` | `false` | Fetch all pages |

**API:** `GET /bulk_sends/{id}/documents?page={page}&per_page={per_page}`

---

#### `sw bulk-send csv-template`

Download a blank CSV template with the correct headers for a template.

```bash
sw bulk-send csv-template --template tmpl_abc123
sw bulk-send csv-template --template tmpl_abc123 -o my-template.csv
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--template` | `string[]` | **required** | Template ID(s) |
| `--output, -o` | `string` | `bulk_template.csv` | Output file path |

**API:** `GET /bulk_sends/csv_template?template_ids[]={id}`

**JSON output:**
```json
{ "success": true, "data": { "output": "bulk_template.csv" }, "error": null, "meta": {} }
```

---

#### `sw bulk-send validate`

Validate a CSV file against a template without creating a bulk send.

```bash
sw bulk-send validate --template tmpl_abc123 --csv recipients.csv
```

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `--template` | `string[]` | **yes** | Template ID(s) |
| `--csv` | `string` | **yes** | Path to CSV file |

**API:** `POST /bulk_sends/validate_csv`

**JSON output:** Validation result with per-row errors if any.

---

### webhooks

Manage and test webhook integrations.

#### `sw webhooks list`

```bash
sw webhooks list
```

**API:** `GET /hooks`

**JSON output:**
```json
{
  "success": true,
  "data": [
    {
      "id": "hook_abc123",
      "callback_url": "https://myapp.com/webhooks/signwell",
      "event_types": ["document_completed", "document_signed"],
      "created_at": "2024-01-25T10:00:00Z"
    }
  ],
  "error": null,
  "meta": {}
}
```

---

#### `sw webhooks create`

```bash
sw webhooks create --url https://myapp.com/hooks
sw webhooks create --url https://myapp.com/hooks --event document_completed --event document_signed
```

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `--url` | `string` | **yes** | Webhook endpoint URL |
| `--event` | `string[]` | | Event type(s) to listen for |

**API:** `POST /hooks`

**JSON output:**
```json
{
  "success": true,
  "data": {
    "id": "hook_abc123",
    "callback_url": "https://myapp.com/hooks"
  },
  "error": null,
  "meta": {}
}
```

---

#### `sw webhooks delete <id>`

```bash
sw webhooks delete hook_abc123 --confirm
```

| Option | Type | Description |
|--------|------|-------------|
| `--confirm` | `boolean` | Skip confirmation |

**API:** `DELETE /hooks/{id}`

**JSON output:** `{ "data": { "id": "hook_abc123", "deleted": true } }`

---

#### `sw webhooks listen`

Start a local HTTP server to receive and inspect webhook events during development.

```bash
sw webhooks listen
sw webhooks listen --port 4000
sw webhooks listen --secret whsec_abc123
sw webhooks listen --forward http://localhost:8080/hooks
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--port` | `number` | `3000` | Port to listen on |
| `--secret` | `string` | | Local listener HMAC secret to validate incoming signatures |
| `--forward` | `string` | | Forward received events to this URL |

**Features:**
- Accepts `POST` requests on any path
- Validates HMAC-SHA256 signature via `x-signwell-signature` header when you provide `--secret`. The create-webhook API does not return or manage a secret field.
- Pretty-prints each webhook event to the console with timestamp
- Optionally forwards events to another service (preserves signature header)
- Returns `200 OK` for valid events, `401 Unauthorized` for invalid signatures, `405` for non-POST

---

### schema

Print JSON Schemas for commands. Useful for LLM integrations, code generation, and CI validation.

#### `sw schema <command>`

```bash
sw schema documents.create
sw schema templates.use
sw schema bulk-send.create
```

**Available schemas:**

| Schema Key | Description |
|------------|-------------|
| `documents.create` | Create a document for signing |
| `documents.get` | Get document details |
| `documents.list` | List documents |
| `documents.send` | Send a draft document |
| `documents.delete` | Delete a document |
| `templates.create` | Create a template |
| `templates.list` | List templates |
| `templates.use` | Create document from template |
| `bulk-send.create` | Create a bulk send |
| `webhooks.create` | Create a webhook |

**Output:**
```json
{
  "command": "documents.create",
  "description": "Create a new document for signing",
  "input_schema": {
    "type": "object",
    "properties": {
      "files": { "type": "array", "items": { "type": "object", "properties": { "name": { "type": "string" }, "file_base64": { "type": "string" }, "file_url": { "type": "string" } }, "required": ["name"] } },
      "recipients": { "type": "array", "items": { "type": "object", "properties": { "email": { "type": "string" }, "name": { "type": "string" }, "embedded_signing": { "type": "boolean" } }, "required": ["email"] } },
      "name": { "type": "string" },
      "subject": { "type": "string" },
      "message": { "type": "string" },
      "draft": { "type": "boolean" },
      "text_tags": { "type": "boolean" },
      "redirect_url": { "type": "string" },
      "signing_order": { "type": "boolean" },
      "expires_in": { "type": "number" },
      "reminders": { "type": "array", "items": { "type": "number" } }
    },
    "required": ["files", "recipients"]
  },
  "output_schema": {
    "type": "object",
    "properties": {
      "id": { "type": "string" },
      "name": { "type": "string" },
      "status": { "type": "string" },
      "created_at": { "type": "string" },
      "recipients": { "type": "array" }
    }
  }
}
```

---

### skills

Install AI agent skills bundled with signwell-cli.

#### `sw skills install`

```bash
sw skills install                        # auto-detect agents
sw skills install --agent claude-code    # specific agent
sw skills install --force                # overwrite existing
sw skills install --json                 # machine-readable output
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--agent` | `string` | auto-detect | Install for a specific agent only |
| `--force` | `boolean` | `false` | Overwrite existing skill installations |

**Available agents:** `claude-code`, `cursor`, `windsurf`, `codex`, `github-copilot`, `gemini-cli`, `roo`

**Behavior:**
1. Copies skills to canonical `~/.agents/skills/` directory
2. Detects installed AI agents on the system
3. Creates symlinks from each agent's skills directory to the canonical location
4. Falls back to copying if symlinks are not supported (e.g., Windows without developer mode)

**JSON output:**
```json
{
  "success": true,
  "data": {
    "skills": ["signwell-cli"],
    "canonical_path": "/home/user/.agents/skills",
    "agents": [
      { "agent": "Claude Code", "skill": "signwell-cli", "method": "symlink" },
      { "agent": "Cursor", "skill": "signwell-cli", "method": "symlink" }
    ]
  },
  "error": null,
  "meta": {}
}
```

---

## Output Modes

### Human Mode (default)

Rich terminal output with colors, spinners, and ASCII tables.

```bash
sw documents list
```

### JSON Mode (`--json`)

Machine-readable JSON envelope on stdout. Errors go to stderr.

```bash
sw documents list --json
sw documents list --json | jq '.data[].id'
```

### Quiet Mode (`--quiet`)

Suppress all output except errors. Useful for scripting.

```bash
sw documents send doc_abc123 --quiet
```

### NDJSON Streaming (`--all --json`)

When using `--all` with `--json`, documents are streamed as newline-delimited JSON (one object per line):

```bash
sw documents list --all --json | while IFS= read -r line; do
  echo "$line" | jq '.id'
done
```

---

## JSON Envelope

All `--json` output follows this envelope format:

### Success

```json
{
  "success": true,
  "error": null,
  "data": { ... },
  "meta": {
    "count": 20,
    "total": 145,
    "page": 1,
    "per_page": 20,
    "total_pages": 8,
    "next_page": 2,
    "prev_page": null
  }
}
```

### Error

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Request failed with status code 404",
    "hint": "Verify the ID is correct",
    "http_status": 404
  },
  "data": null,
  "meta": {}
}
```

---

## Data Shapes

### Document

```typescript
{
  id: string;
  name: string;
  status: string;              // e.g. draft, saved, sent, shared, viewed, pending, completed, expired, canceled, declined, bounced, error
  created_at: string;          // ISO 8601
  updated_at?: string;
  expires_at?: string;
  subject?: string;
  message?: string;
  test_mode?: boolean;
  recipients: Recipient[];
  files?: DocumentFile[];
}
```

### Recipient

```typescript
{
  id: string;
  email: string;
  name: string;
  status: string;                  // e.g. pending, signed, declined
  signing_url?: string;            // URL for the signer
  embedded_signing_url?: string;   // URL for iframe embedding
  embedded_signing?: boolean;
  signed_at?: string;              // ISO 8601
  last_viewed_at?: string;
}
```

### Template

```typescript
{
  id: string;
  name: string;
  created_at: string;
  updated_at?: string;
  placeholder_roles?: PlaceholderRole[];
  fields?: TemplateField[];
}
```

### PlaceholderRole

```typescript
{
  name: string;       // e.g. "Signer", "Witness"
  email?: string;
}
```

### TemplateField

```typescript
{
  name: string;
  type: string;       // e.g. "text", "date", "checkbox"
  required?: boolean;
}
```

### BulkSend

```typescript
{
  id: string;
  name?: string;
  status: "processing" | "completed" | "failed";
  total: number;
  sent?: number;
  failed?: number;
  created_at: string;
}
```

### Webhook

```typescript
{
  id: string;
  callback_url: string;
  event_types?: string[];
  created_at?: string;
}
```

### DocumentFile

```typescript
{
  name: string;
  file_base64?: string;   // Base64-encoded file content
  file_url?: string;       // Remote URL
}
```

### PaginatedResponse

```typescript
{
  data: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}
```

---

## API Endpoints Reference

All endpoints are relative to the base URL (default: `https://www.signwell.com/api/v1`).

Authentication: `X-Api-Token` header.

| Method | Endpoint | Command | Description |
|--------|----------|---------|-------------|
| `GET` | `/me` | `sw me` | Get account info |
| `POST` | `/documents` | `sw documents create` | Create document |
| `GET` | `/documents/{id}` | `sw documents get` | Get document |
| `GET` | `/documents` | `sw documents list` | List documents |
| `POST` | `/documents/{id}/send` | `sw documents send` | Send draft |
| `POST` | `/documents/{id}/remind` | `sw documents remind` | Send reminder |
| `GET` | `/documents/{id}/completed_pdf` | `sw documents download` | Download signed PDF |
| `DELETE` | `/documents/{id}` | `sw documents delete` | Delete document |
| `PATCH` | `/documents/{id}/recipients` | `sw documents recipients update` | Update recipients |
| `POST` | `/document_templates/documents` | `sw templates use` | Create from template |
| `POST` | `/document_templates` | `sw templates create` | Create template |
| `GET` | `/document_templates/{id}` | `sw templates get` | Get template |
| `GET` | `/document_templates` | `sw templates list` | List templates |
| `PUT` | `/document_templates/{id}` | `sw templates update` | Update template |
| `DELETE` | `/document_templates/{id}` | `sw templates delete` | Delete template |
| `POST` | `/bulk_sends` | `sw bulk-send create` | Create bulk send |
| `GET` | `/bulk_sends/{id}` | `sw bulk-send get` | Get bulk send |
| `GET` | `/bulk_sends` | `sw bulk-send list` | List bulk sends |
| `GET` | `/bulk_sends/{id}/documents` | `sw bulk-send documents` | List bulk send docs |
| `GET` | `/bulk_sends/csv_template` | `sw bulk-send csv-template` | Download CSV template |
| `POST` | `/bulk_sends/validate_csv` | `sw bulk-send validate` | Validate CSV |
| `GET` | `/hooks` | `sw webhooks list` | List webhooks |
| `POST` | `/hooks` | `sw webhooks create` | Create webhook |
| `DELETE` | `/hooks/{id}` | `sw webhooks delete` | Delete webhook |

---

## Error Codes & Exit Codes

### HTTP Status to Error Code Mapping

| HTTP Status | Error Code | Default Hint |
|-------------|------------|--------------|
| `401` | `UNAUTHORIZED` | Run `sw auth login` to update your credentials |
| `403` | `FORBIDDEN` | Your API key does not have permission for this action |
| `404` | `NOT_FOUND` | Verify the ID is correct |
| `422` | `VALIDATION_ERROR` | Check required fields with `sw schema <command>` |
| `429` | `RATE_LIMITED` | Retry in a few seconds or reduce request frequency |
| `500` | `SERVER_ERROR` | This is a SignWell server error. Try again later |
| `503` | `SERVICE_UNAVAILABLE` | SignWell API is temporarily unavailable. Retrying automatically... |
| network | `NETWORK_ERROR` | Check `SIGNWELL_API_BASE_URL` and your network connection |
| other | `API_ERROR` | Check API docs or contact support |

### Exit Codes

| Code | Meaning | When |
|------|---------|------|
| `0` | Success | Command completed successfully |
| `1` | General error | Unclassified CLI or API error |
| `2` | Usage error | Invalid arguments, missing required options |
| `3` | Auth error | Missing/invalid API key, `401 Unauthorized` |
| `4` | Rate limited | `429 Too Many Requests` |
| `5` | File error | File not found, unsupported type, read failure |
| `6` | CSV error | CSV parse failure, empty CSV, validation error |

### Error Classes

| Class | Exit Code | Description |
|-------|-----------|-------------|
| `CliError` | `1` | Base error class |
| `UsageError` | `2` | Invalid CLI arguments |
| `AuthError` | `3` | Authentication issues |
| `FileError` | `5` | File system errors |
| `CsvError` | `6` | CSV parsing/validation errors |

### Automatic Retry

The client automatically retries (with exponential backoff) on:
- `429 Too Many Requests`
- `503 Service Unavailable`
- Network errors (no response)

Default: 3 retries. Rate limit warnings are displayed when fewer than 5 requests remain.

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SIGNWELL_API_KEY` | API key (overrides config) | — |
| `SIGNWELL_TEST_MODE` | `"true"` to enable test mode | `false` |
| `SIGNWELL_API_BASE_URL` | Custom API endpoint | `https://www.signwell.com/api/v1` |
| `SIGNWELL_CONFIG_PATH` | Custom config file path | `~/.signwell/config.json` |
| `SIGNWELL_AUTO_CONFIRM` | `"true"` to skip all prompts | `false` |
| `NO_COLOR` | Disable colors (standard) | — |

---

## File Upload

### Supported File Types

| Extension | MIME Type |
|-----------|----------|
| `.pdf` | `application/pdf` |
| `.doc` | `application/msword` |
| `.docx` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| `.pages` | `application/vnd.apple.pages` |
| `.ppt` | `application/vnd.ms-powerpoint` |
| `.pptx` | `application/vnd.openxmlformats-officedocument.presentationml.presentation` |
| `.key` | `application/vnd.apple.keynote` |
| `.xls` | `application/vnd.ms-excel` |
| `.xlsx` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| `.numbers` | `application/vnd.apple.numbers` |
| `.jpg` / `.jpeg` | `image/jpeg` |
| `.png` | `image/png` |
| `.tiff` / `.tif` | `image/tiff` |
| `.webp` | `image/webp` |
| `.html` / `.htm` | `text/html` |

### Upload Methods

1. **Local file** (`--file`): Reads file from disk, base64-encodes, sends inline
2. **Remote URL** (`--file-url`): Passes URL to the API for server-side fetch
3. **Pre-encoded base64** (`--file-b64`): Reads raw base64 from disk with `--file-b64-name`

At least one file source is required for `documents create` and `templates create`.

---

## Pagination

List commands support pagination via `--page` and `--per-page`.

### Single Page

```bash
sw documents list --page 2 --per-page 50
```

### All Pages

```bash
sw documents list --all
```

In JSON mode, `--all` streams results as NDJSON (one JSON object per line). In human mode, all results are collected and displayed in a single table.

The paginator calls the API repeatedly, incrementing the page number until all items are fetched. A progress callback updates the spinner text as pages are fetched.

---

## Development

### Setup

```bash
git clone https://github.com/ziptied/Signwell-cli.git
cd Signwell-cli
npm install
```

### Scripts

```bash
npm run build      # Build with tsup
npm run dev        # Watch mode (rebuild on change)
npm test           # Run tests with vitest
npm run typecheck  # TypeScript type checking
npm run lint       # ESLint
npm run format     # Prettier
```

### Project Structure

```
skills/
  signwell-cli/
    SKILL.md              # Agent Skills spec — teaches AI agents to use `sw`
src/
  index.ts              # CLI entry point (yargs root)
  api/
    client.ts           # Axios client with retry, auth, interceptors
    documents.ts        # Document API functions
    templates.ts        # Template API functions
    bulk-send.ts        # Bulk send API functions
    webhooks.ts         # Webhook API functions
    me.ts               # Account API function
  commands/
    auth.ts             # auth login/logout/status
    me.ts               # me
    profile.ts          # profile list/add/use/remove/show
    documents.ts        # documents create/get/list/send/remind/download/delete/recipients
    templates.ts        # templates create/get/list/update/delete/use
    bulk-send.ts        # bulk-send create/get/list/documents/csv-template/validate
    webhooks.ts         # webhooks list/create/delete/listen
    schema.ts           # schema introspection
    skills.ts           # skills install (Agent Skills installer)
  lib/
    config.ts           # Multi-profile config management
    output.ts           # Output formatting (tables, JSON, spinners)
    errors.ts           # Error classes and HTTP mapping
    pagination.ts       # Generic async paginator
    upload.ts           # File resolution (local/URL/base64)
    csv.ts              # CSV parsing
  types/
    api.ts              # TypeScript type definitions
test/
  lib/                  # Unit tests for lib modules
  commands/             # Integration tests for API modules (nock)
  fixtures/             # JSON fixtures for test mocking
```

### Testing

Tests use [Vitest](https://vitest.dev) with [nock](https://github.com/nock/nock) for HTTP mocking.

```bash
# Run all tests
npm test

# Run with coverage
npx vitest run --coverage

# Run a specific test file
npx vitest run test/lib/config.test.ts
```

### Tech Stack

- **Runtime:** Node.js >= 18
- **Language:** TypeScript 5.x (ESM)
- **CLI Framework:** [yargs](https://yargs.js.org/)
- **HTTP:** [axios](https://axios-http.com/) + [axios-retry](https://github.com/softonic/axios-retry)
- **Output:** [chalk](https://github.com/chalk/chalk), [ora](https://github.com/sindresorhus/ora), [cli-table3](https://github.com/cli-table/cli-table3)
- **Prompts:** [inquirer](https://github.com/SBoudrias/Inquirer.js)
- **CSV:** [csv-parse](https://csv.js.org/parse/)
- **Bundler:** [tsup](https://tsup.egoist.dev/)
- **Tests:** [vitest](https://vitest.dev/) + [nock](https://github.com/nock/nock)
