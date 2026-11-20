## Builder
FROM node:24.22.2-alpine AS builder

WORKDIR /src

COPY .npmrc package.json package-lock.json /src/
COPY patches /src/patches/
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . /src/
ARG APP_COMMIT=unknown
ENV APP_COMMIT=$APP_COMMIT
ENV NODE_OPTIONS=--max_old_space_size=4096
RUN npm run build


## App
# Unprivileged nginx: runs as uid 101 on port 8080, with its pid and temp files in /tmp.
FROM nginxinc/nginx-unprivileged:1.31.7-alpine

USER root
COPY --from=builder /src/dist /app
COPY --from=builder /src/docker-nginx.conf /etc/nginx/conf.d/default.conf

RUN rm -rf /usr/share/nginx/html \
  && ln -s /app /usr/share/nginx/html
USER 101
