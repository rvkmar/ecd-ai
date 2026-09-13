# r-backend

Private Plumber service for IRT / diagnostic calibration. Node talks to it
only through the `calibrationJobs` queue (`R_BACKEND_URL`), never from a
session path.

## Default: published image

`docker-compose.yml` pulls **`rvkmar/r-backend:latest`** (R packages already
installed) and bind-mounts `./r-backend/app` onto `/home/app` so this repo's
plumber routes win over whatever is baked in the image.

```bash
docker compose pull r-backend
docker compose up -d
```

Do **not** run `docker compose build r-backend` as the default path. That
rebuilds nothing useful unless you uncomment `build:` in compose, and it is
slow.

A local `docker-compose.override.yml` may publish `4000:4000` and set
`container_name: r-backend`. Main compose omits `container_name` so that
override wins. The compose **service** name stays `r-backend`
(`http://r-backend:4000`).

## Optional: overlay Dockerfile

`Dockerfile` is `FROM rvkmar/r-backend:latest` plus `COPY app /home/app`.
Use it only when you want a derived image that bakes current app sources:

```bash
# after uncommenting build: in docker-compose.yml
docker compose build r-backend
# or
docker build -t ecd-r-backend:local ./r-backend
```

`install-packages.R` is leftover from the D61 Posit/rocker from-scratch
install. It is not required for compose up.
