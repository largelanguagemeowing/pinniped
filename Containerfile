## Builder
# Pinned to the multi-arch index digest; change the tag and digest together (AGENTS.md, "Base images").
FROM node:24.22.2-alpine@sha256:a34ab6d7f6f4813f4d0c5469d74685604b962fbdbf5793a7bc7b4998ecb867c8 AS builder

WORKDIR /src

COPY .npmrc package.json package-lock.json /src/
COPY patches /src/patches/
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . /src/
ARG APP_COMMIT=unknown
ENV APP_COMMIT=$APP_COMMIT
ENV NODE_OPTIONS=--max_old_space_size=4096
RUN npm run build


## Server
# justserve: a static file server without a shell; uid 65532 on port 8080, reads /srv once at
# startup and writes nothing. Pinned to the release's multi-arch index digest; verify the
# signature of a new one before changing it (AGENTS.md, "Base images"). The e2e stack runs this
# stage with dist/ mounted, so it serves with these settings too.
FROM ghcr.io/belohnung/justserve:0.1.0-rc1@sha256:a517054b127342fd4960f919487b48094be0b4d550ca69499c4eae6d91b472cf AS server

# Client-side routes get index.html. Content-hashed bundles are cached for good, and a missing
# one stays a 404 rather than index.html served as script.
ENV JUSTSERVE_FALLBACK=/index.html \
    JUSTSERVE_IMMUTABLE_ASSETS=/assets/
# Links opened from a conversation do not tell the target site where they came from.
ENV JUSTSERVE_HEADER_REFERRER="Referrer-Policy: no-referrer"
# Nothing may put Pinniped in a frame, so no site can overlay it to steal clicks.
ENV JUSTSERVE_HEADER_CSP="Content-Security-Policy: frame-ancestors 'none'" \
    JUSTSERVE_HEADER_FRAME="X-Frame-Options: DENY"
# A browser that reached Pinniped over HTTPS refuses plain HTTP to it for a year. TLS ends at the
# gateway; browsers ignore the header on plain HTTP, such as the e2e stack's.
ENV JUSTSERVE_HEADER_HSTS="Strict-Transport-Security: max-age=31536000"


## App
FROM server
COPY --from=builder /src/dist /srv
