# GoldTrap AI

Read-only telemetry and analytics control plane for GoldTrap vNext on MT5/Exness.

## Safety boundary
GoldTrap AI does not expose trade execution, position close, order placement, or live parameter mutation endpoints. MT5 EA remains the execution engine.

## HTTP
- `GET /health`
- `POST /v1/telemetry` with `Authorization: Bearer <INGEST_TOKEN>`
- `GET /v1/status`
- `GET /v1/events?limit=50`
- `GET /v1/analysis/summary?hours=24`

## Railway variables
- `DATABASE_URL`
- `INGEST_TOKEN`
- `NODE_ENV=production`

Phase 1 records requested TP, market state, spread, basket P/L, weighted breakeven, grid fills and strategy versions. Phase 2 adds MCP read-only tools over the same datastore after telemetry ingestion is verified.
