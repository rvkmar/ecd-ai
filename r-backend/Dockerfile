# r-backend/Dockerfile
# Thin overlay on the published psychometric image.
#
# rvkmar/r-backend:latest owns the R package set (local rebuild 2026-09-14
# adds equate and plink; /health reports mirt, GDINA, TAM, difR, equate,
# plink, plumber, jsonlite). This file only copies repo app sources when someone
# explicitly runs `docker compose build r-backend` (uncomment `build:` in
# docker-compose.yml first) or `docker build -t ecd-r-backend:local ./r-backend`.
#
# The default compose path is `image: rvkmar/r-backend:latest` plus a bind
# mount of ./r-backend/app:/home/app -- no build, and install-packages.R is
# not required for `compose up`.

FROM rvkmar/r-backend:latest

WORKDIR /home/app

COPY app /home/app

# Private compose-network service. Main compose uses expose, not host ports.
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:4000/health || exit 1

CMD ["Rscript", "/home/app/start.R"]
