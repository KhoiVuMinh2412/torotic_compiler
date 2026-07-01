# Server Configuration — Torotic Compiler

> Deployed on **GCP e2-micro Free Tier**
> IP: `136.65.235.24` | Hostname: `compiler-gcp`

---

## 1. System Specs

| Component | Detail |
|-----------|--------|
| OS | Ubuntu 24.04 LTS |
| Kernel | 6.17.0-1020-gcp |
| RAM | 955 MB (+ 4 GB swap) |
| Disk | 29 GB (21 GB available) |
| Architecture | x86_64 |

---

## 2. Software Stack

### Runtime
| Software | Version |
|----------|---------|
| Node.js | 22.23.1 |
| npm | 10.9.8 |
| arduino-cli | 1.5.1 |

### Arduino Platform
| Platform | Version |
|----------|---------|
| arduino:avr | 1.8.8 |

### Arduino Libraries
| Library | Version |
|---------|---------|
| Adafruit BusIO | 1.17.4 |
| OttoDIYLib | 13.0.0 |
| RTClib | 2.1.4 |
| Servo | 1.3.0 |

### System Packages
- `curl`, `wget`, `git`
- `nginx` 1.24.0
- `ufw` 0.36.2

---

## 3. Services

### torotic-compiler (systemd)
- **File:** `/etc/systemd/system/torotic-compiler.service`
- **User:** ubuntu
- **Working dir:** `/home/ubuntu/app/torotic_compiler`
- **Entry:** `server.js` via `/usr/bin/node`
- **Restart:** always, 5s delay
- **Memory limit:** 512 MB max / 400 MB high
- **OOM score:** 500
- **Status:** `active (running)`

### nginx
- **Status:** `active`
- **Config:** `/etc/nginx/sites-available/torotic-compiler`
- **Proxy:** port 80 → 127.0.0.1:3000
- **Compression:** gzip on (text/plain, application/json, application/octet-stream)
- **Max body size:** 10 MB
- **Timeouts:** 120s read/send

---

## 4. Network & Firewall

| Port | Service | Source |
|------|---------|--------|
| 22/tcp | SSH | Anywhere |
| 80/tcp | HTTP (Nginx) | Anywhere |
| 443/tcp | HTTPS (reserved) | Anywhere |

### GCP Firewall
- Requires a VPC firewall rule `allow-http-https` for ports 80 and 443.
- Source IP ranges: `0.0.0.0/0`

---

## 5. API Endpoints

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| GET | `/` | Health check | HTML page |
| GET | `/ports` | List USB/serial ports | `{ success, ports[] }` |
| POST | `/compile` | Compile Arduino code | `{ success, hex }` or `{ success, error, details }` |

### POST /compile
- **Body:** `{ "code": "..." }` (Arduino C++ sketch)
- **FQBN:** `arduino:avr:nano`
- **Temp dir:** `~/app/torotic_compiler/temp/torotic_<timestamp>/`
- **Timeout:** Nginx 120s, frontend 60s
- **Cleanup:** Temp files deleted after compile (success or fail); cron fallback hourly

---

## 6. Cron Jobs

```cron
# Every hour, purge temp compile dirs older than 60 minutes
7 * * * * /usr/bin/find /home/ubuntu/app/torotic_compiler/temp -mindepth 1 -type d -mmin +60 -exec rm -rf {} + 2>/dev/null
```

---

## 7. Project Structure (on VPS)

```
/home/ubuntu/app/torotic_compiler/
├── server.js           # Express server entry
├── temp/               # Compile artifacts (auto-cleaned)
├── node_modules/       # npm dependencies
├── package.json
└── docs/               # Documentation
```

---

## 8. Useful Commands

```bash
# View server logs
sudo journalctl -u torotic-compiler.service -f

# Restart server
sudo systemctl restart torotic-compiler.service

# Check memory
free -h
ps aux --sort=-%mem | head -10

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Update code
cd ~/app/torotic_compiler
git pull
npm install --production
sudo systemctl restart torotic-compiler.service
```

---

## 9. Frontend Integration

The frontend (deployed on Vercel at `happyrobotics.vercel.app`) proxies API calls through Vercel rewrites:

```
/api/*        → http://136.65.235.24/*
```

Frontend calls:
- `POST /api/compile` — compile Arduino code
- `GET /api/ports` — list ports (deprecated; replaced by Web Serial API in frontend)

---

## 10. Known Limitations

- **No HTTPS yet** — needs a domain + Let's Encrypt certbot.
- **1 GB/month egress** — GCP Free Tier cap. `.hex` responses are ~15-30 KB each (~35k compiles/month budget).
- **Single-board compile** — FQBN is hardcoded to `arduino:avr:nano`.
- **Memory constrained** — compile large sketches may hit the 512 MB limit if the full toolchain runs concurrently.
