#!/bin/bash
# =============================================================================
# Generate self-signed SSL certificate for development/staging
# For production, use Let's Encrypt (certbot)
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SSL_DIR="$SCRIPT_DIR/ssl"

echo "Creating SSL directory..."
mkdir -p "$SSL_DIR"

echo "Generating self-signed certificate..."
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "$SSL_DIR/server.key" \
    -out "$SSL_DIR/server.crt" \
    -subj "/C=US/ST=State/L=City/O=Zenith/OU=Engineering/CN=localhost"

chmod 600 "$SSL_DIR/server.key"
chmod 644 "$SSL_DIR/server.crt"

echo ""
echo "✅ SSL certificate generated successfully!"
echo "   Certificate: $SSL_DIR/server.crt"
echo "   Private Key: $SSL_DIR/server.key"
echo ""
echo "⚠️  For production, replace with Let's Encrypt certificates."
