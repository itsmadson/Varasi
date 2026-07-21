# Build
FROM golang:1.26 AS build
WORKDIR /src
# Vendored deps → hermetic, offline build (no module proxy at build time).
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -mod=vendor -ldflags="-s -w" -o /out/server ./cmd/server

# Run (minimal, static binary)
FROM alpine:3.20
RUN apk add --no-cache ca-certificates && adduser -D -u 10001 varasi
COPY --from=build /out/server /server
EXPOSE 8080
USER varasi
ENTRYPOINT ["/server"]
