FROM node:24-bookworm-slim

WORKDIR /opt/cobalt

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Install Python and build dependencies required by Cobalt
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3 \
        python3-pip \
        python3-dev \
        git \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

# Enable Corepack
RUN corepack enable

# Clone the exact Cobalt 11.5 release commit
RUN git clone https://github.com/imputnet/cobalt.git /opt/cobalt \
    && cd /opt/cobalt \
    && git checkout 47d8ccbc17aeeac6cb754c8b721c2148f007c103

# Install Cobalt dependencies from the complete workspace
RUN pnpm install --prod --frozen-lockfile

# Deploy the Cobalt API together with its workspace dependencies
RUN pnpm deploy --filter=@imput/cobalt-api --prod /opt/cobalt-api

# ---------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------

WORKDIR /app

COPY requirements.txt .

RUN pip3 install \
    --no-cache-dir \
    --break-system-packages \
    -r requirements.txt

COPY app/ ./app/

COPY start.sh /start.sh

RUN chmod +x /start.sh

EXPOSE 8000

CMD ["/start.sh"]
