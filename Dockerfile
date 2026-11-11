# --- Anubis (proof-of-work bot filter), only used when ANUBIS_ENABLED=1 ------
FROM python:3.15-slim-bookworm AS anubis
ENV ANUBIS_VERSION=1.28.1
ENV ANUBIS_SHA256=adcb3c2fdfd0fb91cbf7e8376dbcc479f654c85dd3795db3e9a06004786bbdc9
COPY anubis/fetch_anubis.py /fetch_anubis.py
RUN python3 /fetch_anubis.py

FROM python:3.15-slim-bookworm

WORKDIR /app

# Install FastAPI dependencies
COPY requirements.txt .

RUN pip3 install \
    --no-cache-dir \
    -r requirements.txt

# Anubis binary and its bot policy
COPY --from=anubis /out/anubis /usr/local/bin/anubis
COPY anubis/ ./anubis/

# Copy FastAPI application
COPY app/ ./app/

# Copy startup script
COPY start.sh /start.sh

RUN chmod +x /start.sh

EXPOSE 8000

CMD ["/start.sh"]
