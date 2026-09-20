FROM python:3.12-slim-bookworm

WORKDIR /app

# Install FastAPI dependencies
COPY requirements.txt .

RUN pip3 install \
    --no-cache-dir \
    -r requirements.txt

# Copy FastAPI application
COPY app/ ./app/

# Copy startup script
COPY start.sh /start.sh

RUN chmod +x /start.sh

EXPOSE 8000

CMD ["/start.sh"]
