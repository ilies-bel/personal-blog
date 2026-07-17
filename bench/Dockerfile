# Device-matrix bench in a container with a SOFTWARE GPU (SwiftShader).
# This is the true low-GPU proxy: the host run uses the real GPU, so CPU
# throttling alone never captures fill-rate-bound devices. SwiftShader does.
#
# Build (from repo root):
#   docker build -f bench/Dockerfile -t blog-bench .
# Run:
#   docker run --rm -v "$PWD/evidence:/app/evidence" blog-bench
#
# Playwright image tag is pinned to match the repo's playwright@1.61.x.
FROM mcr.microsoft.com/playwright:v1.61.1-noble

WORKDIR /app

RUN npm install -g pnpm@10.28.2

# Install deps first for layer caching.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Build the production bundle inside the image so the bench always measures
# the current source, then run the same harness with SwiftShader forced.
RUN pnpm build

ENV BENCH_SKIP_BUILD=1
ENV BENCH_HEADLESS=1
ENV BENCH_CHROMIUM_FLAGS="--use-gl=angle --use-angle=swiftshader --no-sandbox"

CMD ["node", "bench/run-bench.mjs"]
