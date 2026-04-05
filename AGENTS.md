# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

This is the **Yunnan Kangjie** (云南康洁) unified WeChat Mini Program + PC admin platform for equipment maintenance management. It has three main services:

| Service | Path | Port | Description |
|---|---|---|---|
| PC Admin (Vue 3 SPA) | `pc-admin/` | 3000 | Web admin dashboard (Vite 6 + Element Plus) |
| PC Gateway (Express) | `pc-server/` | 3001 | Lightweight proxy for WeChat cloud function calls |
| WeChat Mini Program | `miniprogram/` | N/A | Cannot run locally — requires WeChat DevTools GUI |

Cloud functions in `cloudfunctions/` are deployed remotely to Tencent CloudBase and do not run locally.

### Running services

**PC Admin in mock mode** (no cloud/gateway dependency):
```bash
cd pc-admin && npm run dev -- --mode mock
```
- Uses local mock data, no backend needed. Login with `admin` / `admin123`.

**PC Admin with real cloud data** (requires `pc-server` + WeChat AppSecret):
```bash
# Terminal 1
cd pc-server && npm start
# Terminal 2
cd pc-admin && npm run dev
```
- Requires `pc-server/.env` configured with `APPID` and `SECRET` (from WeChat).

**PC Gateway only**:
```bash
cd pc-server && npm start
```
- Health check: `curl http://localhost:3001/health`

### Lint and build

- **Lint** (root): `npm run lint` — ESLint for `miniprogram/` and `cloudfunctions/`. Note: there are 2 pre-existing `no-undef` errors in `pcGateway/index.js` and ~59 warnings. These are in the existing codebase and not regressions.
- **Build pc-admin**: `cd pc-admin && npm run build`
- The Vite dev server shows pre-existing esbuild errors in `src/views/inspection/index.vue` (constant reassignment). These do not block the server or other pages.

### Key gotchas

- `pc-admin` has 4 API modes: `http`, `cloud`, `real`, `mock`. For local dev without cloud credentials, always use `--mode mock`.
- `pc-server` reads `.env` with a simple custom parser (no `dotenv` library). Copy `.env.example` to `.env` and fill in `APPID`/`SECRET` for real data mode.
- The mini program (`miniprogram/`) cannot be tested in this VM — it requires the WeChat Developer Tools desktop app.
- All npm packages use `package-lock.json` (npm, not pnpm/yarn).
