# Neura

Neura is an agent artifact platform for comparing raw model answers with artifact-grounded answers backed by Sui and Walrus Storage.

## Target network

| Property | Value |
|----------|-------|
| Network  | Sui Testnet |
| Runtime  | Sui Move |
| Token    | SUI |
| RPC      | https://fullnode.testnet.sui.io:443 |
| Explorer | https://suiscan.xyz/testnet |

## Workspace layout

- `apps/agent`: benchmark agent, failure detector, artifact generator, and artifact retrieval tooling
  - now oriented around markdown artifact generation and retrieval
- `apps/api`: Fastify API entry point and route scaffolding
- `apps/web`: React + Vite frontend shell and wallet integration hooks
- `packages/contracts`: Hardhat contract workspace
- `packages/storage`: Prisma storage package
- `packages/shared`: shared platform types

## Agent artifact API routes

- `GET /v1/agent/marketplace/artifacts`: list marketplace artifacts
- `GET /v1/agent/library`: list the user's active artifact library
- `POST /v1/agent/library/artifacts`: add a marketplace artifact to the library
- `DELETE /v1/agent/library/artifacts/:artifactId`: remove an artifact from the library
- `POST /v1/agent/artifacts/upload`: upload a custom artifact
- `POST /v1/agent/compare`: compare raw model output with artifact-grounded output

## Sui Artifact Registry

The Move `artifact_registry` module creates on-chain artifact records and stores the creator,
version, metadata reference, and Walrus storage reference.

| Item | Value |
|------|-------|
| Move package | `packages/contracts/move` |
| Package ID | `NEXT_PUBLIC_SUI_PACKAGE_ID` |
| Artifact registry object | `NEXT_PUBLIC_ARTIFACT_REGISTRY_ID` |
| Storage URI format | `walrus://<blob-id>` |
| Network | Sui Testnet or Mainnet |

## Run instructions

1. Install dependencies with `npm install`.
2. Copy `.env.example` into package-level `.env` files as needed and fill in
   the Sui package/object IDs and Walrus settings needed by the selected flow.
3. Generate Prisma client with `npm run db:generate`.
4. Start the API in one terminal with `npm run dev:api`.
5. Start the web app in another terminal with `npm run dev:web`.

## Agent scaffold

The workspace introduces one focused demo agent:

- domain: builder support / wallet issue triage
- output: strict JSON classification with confidence and recommended action
- failure capture: invalid JSON, schema mismatch, low confidence, or benchmark mismatch
- correction output: markdown knowledge artifacts, corrected records, and optional JSONL training examples
- retrieval loop: baseline run, artifact generation, then artifact-augmented rerun
- integration: optional publish into the artifact API and Walrus Storage flow

### Run modes

1. Local mock mode for repeatable development:
   - `npm run agent:run`
2. OpenAI-compatible inference mode:
   - run any compatible model endpoint
   - set `AGENT_MODEL_MODE=openai-compatible`
   - set `AGENT_MODEL_BASE_URL`, `AGENT_MODEL_NAME`, and `AGENT_MODEL_API_KEY`
   - run `npm run agent:run`

Set `AGENT_MODEL_BASE_URL` to the provider's OpenAI-compatible `/v1` endpoint,
set `AGENT_MODEL_NAME` to a model supported by that provider, and keep
`AGENT_MODEL_API_KEY` server-side only.
Relative `AGENT_*` file paths resolve from the repository root.

For Walrus Storage uploads from the Agent API, set:

- `WALRUS_NETWORK=testnet`
- `SUI_RPC_URL=https://fullnode.testnet.sui.io:443`
- `SUI_AGENT_PRIVATE_KEY=<funded Sui private key>` for SDK uploads
- `WALRUS_PUBLISHER_URL=<testnet publisher URL>` for HTTP publisher uploads
- `WALRUS_AGGREGATOR_URL=<aggregator URL>` for retrieval links

Uploaded artifacts are stored through `@mysten/walrus`. If storage credentials
are missing or the wallet has no SUI for gas, the API still creates the artifact and returns a storage
status of `unavailable` with the upload error.

Artifacts are written under `apps/agent/runs`.
Each run now writes:

- `run-report.json` with baseline vs artifact-augmented metrics
- `benchmark-comparison.md` with expected, baseline, and artifact-augmented outputs per case
- `artifacts/*.artifact.md` as retrieval-ready markdown knowledge assets
- `artifact-manifest.snapshot.json` as retrieval metadata
- `artifact-storage-manifest.snapshot.json` as the prepared Walrus Storage upload bundle
- `*.failure.json` and `*.correction.json`
- `training.jsonl` as an optional future fine-tuning export

The long-lived artifact library is stored under `apps/agent/knowledge` by default. It includes:

- `manifest.json` for local retrieval
- `storage-manifest.json` for later Walrus Storage upload/registration
- `artifacts/*.artifact.md` for the versioned markdown knowledge assets
