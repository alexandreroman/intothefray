# syntax=docker/dockerfile:1.7

# — build stage —
FROM golang:1.27-alpine AS build
WORKDIR /src

COPY go.mod go.sum ./
RUN --mount=type=cache,id=gomod,target=/go/pkg/mod \
    go mod download

COPY . .
# The commit of the image, from CI. Without it the binary reports "dev": .git
# is not in the build context, so Go stamps no VCS revision.
ARG COMMIT
RUN --mount=type=cache,id=gomod,target=/go/pkg/mod \
    --mount=type=cache,id=gobuild,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -trimpath \
        -ldflags="-s -w -X github.com/alexandreroman/intothefray/internal/version.commit=${COMMIT}" \
        -o /out/intothefray ./cmd/intothefray

# — runtime stage —
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/intothefray /intothefray
USER nonroot:nonroot
EXPOSE 9000
# Distroless has no shell or curl: the binary probes itself
HEALTHCHECK CMD ["/intothefray", "healthcheck"]
ENTRYPOINT ["/intothefray"]
