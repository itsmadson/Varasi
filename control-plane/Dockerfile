# Build
FROM golang:1.26 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/server ./cmd/server

# Run (minimal, static binary)
FROM alpine:3.20
RUN apk add --no-cache ca-certificates && adduser -D -u 10001 varasi
COPY --from=build /out/server /server
EXPOSE 8080
USER varasi
ENTRYPOINT ["/server"]
