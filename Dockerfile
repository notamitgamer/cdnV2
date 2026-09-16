FROM node:24-bookworm-slim

WORKDIR /app

# Install Python and build dependencies required by Cobalt
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3 \
        python3-pip \
        python3-dev \
        git \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

# Enable pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

# Clone Cobalt 11.5
RUN git clone --depth 1 https://github.com/imputnet/cobalt.git /opt/cobalt \
    && cd /opt/cobalt \
    && git checkout 11.5

WORKDIR /opt/cobalt

# Install Cobalt production dependencies
RUN pnpm install --prod --frozen-lockfile

# Deploy only the Cobalt API package
RUN pnpm deploy --filter=@imput/cobalt-api --prod /opt/cobalt-api

# Install Python dependencies
WORKDIR /app

COPY requirements.txt .

RUN pip3 install \
    --no-cache-dir \
    --break-system-packages \
    -r requirements.txt

# Copy the FastAPI application
COPY app/ ./app/

# Copy startup script
COPY start.sh /start.sh

RUN chmod +x /start.sh

# Render exposes the FastAPI process.
# Cobalt itself remains internal on port 9000.
EXPOSE 8000

CMD ["/start.sh"]
