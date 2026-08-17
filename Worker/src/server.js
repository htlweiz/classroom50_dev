import http from "node:http"

const port = Number(process.env.PORT || 8787)
const clientId = process.env.GITHUB_CLIENT_ID
const clientSecret = process.env.GITHUB_CLIENT_SECRET
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || "https://classroom50.org,https://preview.classroom50.org")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
)

if (!clientId || !clientSecret) {
  throw new Error("GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are required")
}

function corsHeaders(origin) {
  if (!origin || !allowedOrigins.has(origin)) return {}
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, GET, OPTIONS",
    "access-control-allow-headers": "Accept, Authorization, Content-Type",
    "access-control-expose-headers": "Content-Disposition, Content-Length",
    vary: "Origin",
  }
}

function sendJson(response, status, body, origin) {
  const payload = JSON.stringify(body)
  response.writeHead(status, {
    ...corsHeaders(origin),
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  })
  response.end(payload)
}

async function readJson(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > 64 * 1024) throw new Error("request body too large")
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"))
}

function githubForm(body, fields) {
  const form = new URLSearchParams()
  for (const field of fields) {
    if (typeof body[field] !== "string" || !body[field]) {
      throw new Error(`missing field: ${field}`)
    }
    form.set(field, body[field])
  }
  return form
}

async function githubOAuth(path, body) {
  const fields =
    path === "/web/token"
      ? ["code", "redirect_uri", "code_verifier"]
      : path === "/device/code"
        ? ["scope"]
        : ["device_code", "grant_type"]
  const form = githubForm(body, fields)
  form.set("client_id", clientId)
  if (path === "/web/token") form.set("client_secret", clientSecret)

  const target =
    path === "/device/code"
      ? "https://github.com/login/device/code"
      : "https://github.com/login/oauth/access_token"
  return fetch(target, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form,
  })
}

function archiveParts(pathname) {
  const match = pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/zipball(?:\/(.*))?$/)
  if (!match) return null
  return match.slice(1)
}

async function proxyArchive(request, response, pathname, origin) {
  const parts = archiveParts(pathname)
  if (!parts) return false
  const [, , ref] = parts
  const target = `https://api.github.com${pathname}`
  const headers = {
    accept: "application/vnd.github+json",
    "user-agent": "classroom50-github-proxy",
  }
  const authorization = request.headers.authorization
  if (authorization?.startsWith("Bearer ") || authorization?.startsWith("token ")) {
    headers.authorization = authorization
  }

  const upstream = await fetch(target, { headers, redirect: "follow" })
  const responseHeaders = {
    ...corsHeaders(origin),
    "cache-control": "private, no-store",
    "content-type": upstream.headers.get("content-type") || "application/octet-stream",
  }
  for (const name of ["content-disposition", "content-length"]) {
    const value = upstream.headers.get(name)
    if (value) responseHeaders[name] = value
  }
  response.writeHead(upstream.status, responseHeaders)
  if (upstream.body) {
    for await (const chunk of upstream.body) response.write(chunk)
  }
  response.end()
  return true
}

const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin
  try {
    if (request.method === "OPTIONS") {
      response.writeHead(204, corsHeaders(origin))
      response.end()
      return
    }

    const url = new URL(request.url || "/", `http://${request.headers.host}`)
    if (request.method === "POST" && ["/web/token", "/device/code", "/device/token"].includes(url.pathname)) {
      const body = await readJson(request)
      const upstream = await githubOAuth(url.pathname, body)
      sendJson(response, upstream.status, await upstream.json(), origin)
      return
    }

    if (request.method === "GET" && (await proxyArchive(request, response, url.pathname, origin))) return
    sendJson(response, 404, { error: "not found" }, origin)
  } catch (error) {
    const message = error instanceof Error ? error.message : "proxy request failed"
    sendJson(response, 400, { error: message }, origin)
  }
})

server.listen(port, "0.0.0.0", () => {
  console.log(`Classroom 50 GitHub proxy listening on ${port}`)
})