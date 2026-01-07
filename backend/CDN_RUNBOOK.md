# CDN Configuration Runbook

**Purpose:** Production deployment guide for CDN (Cloudflare) configuration.  
**Status:** Ready for Production  
**Last Updated:** January 2026

---

## Overview

This document provides step-by-step instructions for configuring a CDN (Cloudflare) in front of Zenith to:
- Reduce latency for global users (200ms → 20ms TTFB)
- Offload static asset delivery from origin servers
- Add edge-level rate limiting and DDoS protection

---

## Prerequisites

- Domain registered and DNS managed by Cloudflare (or proxied through Cloudflare)
- Zenith backend running on origin server
- SSL certificate configured on origin

---

## Step 1: Cloudflare Setup

### Add Site to Cloudflare

1. Log in to Cloudflare Dashboard
2. Click "Add a Site"
3. Enter your domain (e.g., `zenith.example.com`)
4. Select plan (Free tier is sufficient for start)
5. Update nameservers at your registrar

### DNS Configuration

| Type | Name | Content | Proxy Status |
|------|------|---------|--------------|
| A | @ | `<origin-ip>` | Proxied (orange cloud) |
| CNAME | www | @ | Proxied |
| CNAME | api | @ | Proxied |

---

## Step 2: SSL/TLS Configuration

Navigate to **SSL/TLS** in Cloudflare:

| Setting | Value | Reason |
|---------|-------|--------|
| SSL Mode | Full (Strict) | Origin has valid SSL certificate |
| Always Use HTTPS | On | Force HTTPS |
| Minimum TLS Version | TLS 1.2 | Security compliance |
| Automatic HTTPS Rewrites | On | Fix mixed content |

---

## Step 3: Caching Configuration

Navigate to **Caching** > **Cache Rules**:

### Rule 1: Bypass Cache for API

| Field | Value |
|-------|-------|
| Name | `api-bypass` |
| URI Path | `/api/*` |
| Cache | Bypass |

### Rule 2: Bypass Cache for WebSocket

| Field | Value |
|-------|-------|
| Name | `websocket-bypass` |
| URI Path | `/socket.io/*` |
| Cache | Bypass |

### Rule 3: Cache Static Assets

| Field | Value |
|-------|-------|
| Name | `static-cache` |
| URI Path | `/uploads/*` |
| Cache | Standard |
| Edge TTL | 1 month |
| Browser TTL | 1 year |

### Rule 4: Cache Frontend Assets

| Field | Value |
|-------|-------|
| Name | `frontend-cache` |
| URI Path | `/_next/static/*` |
| Cache | Standard |
| Edge TTL | 1 year |
| Browser TTL | 1 year |

---

## Step 4: Security Configuration

Navigate to **Security** > **WAF**:

### Enable Cloudflare Managed Ruleset
- Toggle "Cloudflare Managed Ruleset" to ON
- Select "High sensitivity" for production

### Rate Limiting

| Name | Expression | Rate | Action |
|------|------------|------|--------|
| `api-rate-limit` | `http.request.uri.path contains "/api/"` | 100 req/10s | Block |
| `login-rate-limit` | `http.request.uri.path eq "/api/auth/login"` | 5 req/min | Challenge |

---

## Step 5: Performance Configuration

Navigate to **Speed** > **Optimization**:

| Setting | Value |
|---------|-------|
| Auto Minify | JS, CSS, HTML |
| Brotli | On |
| Early Hints | On |
| HTTP/2 | On |
| HTTP/3 (QUIC) | On |

---

## Verification

After configuration, verify:

```bash
# API requests bypass cache
curl -I https://yourdomain.com/api/health
# Should show: CF-Cache-Status: BYPASS

# Static assets are cached
curl -I https://yourdomain.com/uploads/avatar.jpg
# Should show: CF-Cache-Status: HIT (on second request)

# Brotli compression is working
curl -H "Accept-Encoding: br" -I https://yourdomain.com/api/health
# Should show: content-encoding: br
```

---

## Rollback

If CDN causes issues:
1. **Quick:** Set DNS records to "DNS Only" (grey cloud)
2. **Full:** Update nameservers back to origin DNS provider
