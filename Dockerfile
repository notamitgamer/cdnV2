FROM ghcr.io/imputnet/cobalt:11.5-47d8ccb AS cobalt

FROM node:24-bookworm-slim

WORKDIR /app

# Install Python and required system packages
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3 \
        python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Copy the already-built Cobalt API from the official Cobalt image
COPY --from=cobalt /app /opt/cobalt-api

# Install FastAPI dependencies
COPY requirements.txt .

RUN pip3 install \
    --no-cache-dir \
    --break-system-packages \
    -r requirements.txt

# Copy FastAPI application
COPY app/ ./app/

# Copy startup script
COPY start.sh /start.sh

RUN chmod +x /start.sh

EXPOSE 8000

CMD ["/start.sh"]
