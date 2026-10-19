# syntax=docker/dockerfile:1.7

# — build stage —
FROM golang:1.27-alpine AS build
WORKDIR /src

COPY go.mod go.sum ./
RUN --mount=type=cache,id=gomod,target=/go/pkg/mod \
    go mod download

COPY . .
RUN --mount=type=cache,id=gomod,target=/go/pkg/mod \
    --mount=type=cache,id=gobuild,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" \
        -o /out/intothefray ./cmd/intothefray

# — runtime stage —
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/intothefray /intothefray
USER nonroot:nonroot
EXPOSE 9000
# Distroless has no shell or curl: the binary probes itself
HEALTHCHECK CMD ["/intothefray", "healthcheck"]
ENTRYPOINT ["/intothefray"]
