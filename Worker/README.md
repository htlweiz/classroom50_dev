# Classroom 50 GitHub Proxy

Containerized proxy for the browser-blocked GitHub operations used by the web app:

- OAuth web-code exchange at `/web/token`
- OAuth device flow at `/device/code` and `/device/token`
- authenticated repository archives at `/repos/:owner/:repo/zipball/:ref?`

This is API-compatible with `web/src/github-core/workerProxy.ts`. It is a Docker-hosted alternative to the existing Cloudflare Worker; it is not itself a Cloudflare Worker runtime.

## Local run

```bash
cp .env.example .env
# Put the OAuth App values into .env.
docker compose up --build
```

The local endpoint is `http://localhost:8787`. For local frontend development, put this in `web/.env.local`:

```dotenv
VITE_GITHUB_PROXY_BASE=http://localhost:8787
```

The production frontend must use an HTTPS domain in `VITE_GITHUB_PROXY_BASE`, with TLS terminated by a reverse proxy or load balancer in front of this container.

## Deployment

Build and run the image on a Docker host:

```bash
docker build -t classroom50-github-proxy ./Worker
docker run --env-file Worker/.env -p 8787:8787 classroom50-github-proxy
```

Do not pass `GITHUB_CLIENT_SECRET` as a Docker build argument. It is a runtime secret and must only be provided through the host's secret mechanism or environment.

The proxy intentionally restricts browser calls to `ALLOWED_ORIGINS`. Add an origin only when it is an actual deployed Classroom 50 frontend.