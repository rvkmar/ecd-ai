# Building clean(er) base images under `rvkmar`

## What the IDE is actually flagging

Docker Scout on the pinned official images (2026-09-18):

| Image | Critical | High | Cause |
|---|---|---|---|
| `node:24-alpine` | **0** | **4** | npm nested deps: `brace-expansion`, `tar`, `ip-address` — **fixed versions exist** |
| `nginx:alpine` | **0** | **1** | Alpine `libxml2` — **no fixed version yet** |

So “4 critical” in the IDE is almost certainly those **4 High** npm findings (severity labels differ by UI).

## 1. Log in to Docker Hub as `rvkmar`

```bash
docker login
# Username: rvkmar
# Password: <Docker Hub access token — prefer a token over account password>
```

Create a token: Docker Hub → Account Settings → Security → New Access Token (Read & Write).

## 2. Build and push the Node base (clears the 4 Highs)

From the repo root:

```bash
docker build -f docker/base/Dockerfile.node -t rvkmar/ecd-node:24-alpine .

# Confirm Scout is clean of High/Critical before pushing
docker scout cves rvkmar/ecd-node:24-alpine --only-severity critical,high

docker push rvkmar/ecd-node:24-alpine

# Record the digest for pinning in app Dockerfiles
docker buildx imagetools inspect rvkmar/ecd-node:24-alpine --format "{{.Manifest.Digest}}"
```

## 3. Build and push the nginx base (libxml2 removed)

```bash
docker build -f docker/base/Dockerfile.nginx -t rvkmar/ecd-nginx:alpine .
docker scout cves rvkmar/ecd-nginx:alpine --only-severity critical,high
docker push rvkmar/ecd-nginx:alpine
docker buildx imagetools inspect rvkmar/ecd-nginx:alpine --format "{{.Manifest.Digest}}"
```

Optional XSLT/njs modules (and thus `libxml2`) are deleted in this base — ECD only needs static + proxy. Scout should report **0C / 0H**.

## 4. Point the app Dockerfiles at your images

After you have digests from step 2–3, change:

`Dockerfile.node`:
```dockerfile
FROM rvkmar/ecd-node:24-alpine@sha256:<digest-from-step-2> AS api
```

`Dockerfile.nginx`:
```dockerfile
FROM rvkmar/ecd-node:24-alpine@sha256:<digest-from-step-2> AS build
…
FROM rvkmar/ecd-nginx:alpine@sha256:<digest-from-step-3>
```

Then rebuild the stack:

```bash
docker compose build --no-cache node nginx
docker compose up -d --force-recreate node nginx
```

## 5. Keep them clean over time

When Scout/IDE lights up again:

```bash
# Refresh official pins inside docker/base/Dockerfile.* if needed, then:
docker build -f docker/base/Dockerfile.node -t rvkmar/ecd-node:24-alpine .
docker scout cves rvkmar/ecd-node:24-alpine --only-severity critical,high
docker push rvkmar/ecd-node:24-alpine
# bump @sha256 in Dockerfile.node / Dockerfile.nginx and rebuild compose
```

Optional: make the Hub repos public (`rvkmar/ecd-node`, `rvkmar/ecd-nginx`) so CI can pull without a login.
