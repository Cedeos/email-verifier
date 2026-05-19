# CedeOS Email Verifier — Internal Tool

Internal email deliverability verification platform for the CedeOS team. Validates whether an email address has a real, active mailbox before adding it to outreach campaigns.

Live at: https://verify.cedeos.co.ke

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  AWS Lightsail (eu-west-1)  •  $5/month                 │
│  Instance: verify-cedeos  •  IP: 63.32.49.191           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  nginx (port 443/80)                                    │
│    ├── SSL via Let's Encrypt (auto-renews)              │
│    └── reverse proxy → localhost:8080                   │
│                                                         │
│  Go backend (port 8080)                                 │
│    ├── /api/health            Health check              │
│    ├── /api/auth/log          Login logging             │
│    ├── /api/verify/single     Single email verify       │
│    ├── /api/verify/bulk       Bulk CSV upload           │
│    ├── /api/verify/bulk/status/:id  Job progress        │
│    ├── /api/verify/bulk/download/:id  CSV download      │
│    ├── /api/admin/users       List team members         │
│    ├── /api/admin/invite      Create new user           │
│    ├── /api/admin/logs        Activity logs             │
│    └── /*                     Serves frontend SPA       │
│                                                         │
│  Frontend (static files in /opt/verifier/frontend/dist) │
│    └── React + Vite + Tailwind CSS                      │
│                                                         │
└─────────────────────────────────────────────────────────┘
         │                           │
         ▼                           ▼
┌─────────────────┐      ┌─────────────────────────┐
│  Supabase       │      │  External SMTP Servers   │
│  (Auth + DB)    │      │  (port 25 verification)  │
│  - Auth/JWT     │      │  HELO → MAIL FROM →      │
│  - verifications│      │  RCPT TO → close          │
│  - prospects    │      │  (no emails sent)         │
└─────────────────┘      └─────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite 5, Tailwind CSS 3 |
| Backend | Go 1.22, net/http, AfterShip/email-verifier library |
| Auth | Supabase Auth (email/password + TOTP 2FA) |
| Database | Supabase Postgres (verifications, prospects tables) |
| Hosting | AWS Lightsail (Ubuntu 24.04, eu-west-1) |
| SSL | Let's Encrypt via Certbot (auto-renewal) |
| DNS | Google Cloud DNS (cedeos-ke zone) |
| CI/CD | GitHub Actions (auto-deploy on push to main) |
| Secrets | Systemd environment variables on the instance |

---

## Features

### Authentication
- Email/password sign-in only (no OAuth, no sign-up form)
- Domain restriction: only `cedeos.*` email domains can access
- Mandatory TOTP 2FA enrollment on first login
- 2FA verification required on every subsequent login
- Session managed by Supabase JWT tokens

### Email Verification
- Syntax validation
- MX record lookup
- SMTP mailbox existence check (RCPT TO probe, no emails sent)
- Catch-all domain detection
- Disposable email detection (auto-updated daily)
- Free email provider detection
- Role account detection (info@, admin@, etc.)
- Domain typo suggestions
- Gravatar check
- SMTP provider identification (Google, Microsoft, Yahoo, etc.)

### Verification Statuses
| Status | Meaning |
|--------|---------|
| `valid` | SMTP server confirmed the mailbox exists. Safe to send. |
| `invalid` | Mailbox doesn't exist, disposable, no MX, or bad syntax. Will bounce. |
| `risky` | Catch-all domain or full inbox. Cannot confirm specific mailbox. |
| `unknown` | SMTP check couldn't be performed (port 25 blocked, timeout). |

### Prospect Enrichment
After a valid email is confirmed, a form appears to save the contact:
- First name, last name (auto-guessed from email username)
- Company (auto-extracted from domain)
- Role/title
- Saved to `prospects` table in Supabase

### Bulk Verification
- Upload CSV file with emails in the first column
- Processes up to 5 emails concurrently
- Real-time progress polling
- Summary stats (valid, invalid, risky, unknown, disposable, role, free)
- Download results as CSV

### Admin Panel (alvin@cedeos.co.ke only)
- **Team Members**: view all users, their MFA status, last sign-in
- **Create User**: enter email + password, account created immediately (no invite link)
- **Activity Logs**: who verified what, when, results — all in EAT timezone
- Filter logs by action type (verify, bulk, login, invite)

### Activity Logging
Every action is logged with:
- User email
- Action type (single_verify, bulk_verify, bulk_complete, login, invite_user)
- Details (email verified, number of emails uploaded, etc.)
- Result (valid, invalid, processing, success, etc.)
- Timestamp in EAT (UTC+3)

---

## Infrastructure

### AWS Lightsail Instance
- **Name**: verify-cedeos
- **Region**: eu-west-1 (Ireland)
- **Plan**: $5/month (1 vCPU, 512 MB RAM, 20 GB SSD, 1 TB transfer)
- **OS**: Ubuntu 24.04 LTS
- **Static IP**: 63.32.49.191
- **Ports open**: 22 (SSH), 80 (HTTP → redirects to HTTPS), 443 (HTTPS)
- **Port 25**: Pending AWS approval for outbound SMTP verification

### DNS
- Zone: `cedeos-ke` in Google Cloud DNS
- Record: `verify.cedeos.co.ke` → A → `63.32.49.191` (TTL 300s)

### SSL
- Provider: Let's Encrypt
- Auto-renewal: Certbot timer (systemd)
- Certificate path: `/etc/letsencrypt/live/verify.cedeos.co.ke/`

### Systemd Service
- Unit: `/etc/systemd/system/verifier.service`
- Binary: `/opt/verifier/server`
- Frontend: `/opt/verifier/frontend/dist/`
- Auto-restarts on crash (RestartSec=5)
- Logs: `sudo journalctl -u verifier -f`

---

## Environment Variables

Set in `/etc/systemd/system/verifier.service`:

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (8080) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase publishable/anon key (for token verification) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (for admin API) |
| `ADMIN_EMAIL` | Email with admin panel access |
| `SMTP_ENABLED` | Enable SMTP mailbox checks (true/false) |
| `GRAVATAR_ENABLED` | Enable Gravatar lookup (true/false) |
| `SOCKS5_PROXY` | Optional SOCKS5 proxy for SMTP (not currently used) |

---

## CI/CD Pipeline

GitHub Actions workflow at `.github/workflows/deploy.yml`.

### Trigger
Push to `main` branch when changes are in:
- `web/**` (frontend or backend)
- `*.go` (library code)
- `go.mod` / `go.sum`
- `.github/workflows/deploy.yml`

### Steps
1. Checkout code
2. Build Go backend (cross-compiled for linux/amd64)
3. Build frontend (npm ci + vite build)
4. SCP binary and dist to Lightsail instance
5. SSH in, swap files, restart service
6. Health check — if `/api/health` doesn't respond, deploy fails

### Required GitHub Secret
| Secret | Value |
|--------|-------|
| `LIGHTSAIL_SSH_KEY` | Contents of the Lightsail default SSH private key |

### How to know if deploy succeeded
- **GitHub Actions tab**: green checkmark = success, red X = failure
- **Workflow logs**: prints `"DEPLOY SUCCESS - Service is healthy"` or `"DEPLOY FAILED"` with service logs
- **Commit status**: green/red dot next to commit hash

---

## Local Development

### Prerequisites
- Go 1.22+
- Node.js 20+
- npm

### Run backend locally
```bash
cd web/backend
go run .
```
Server starts on http://localhost:8080

### Run frontend locally (with hot reload)
```bash
cd web/frontend
npm install
npm run dev
```
Frontend starts on http://localhost:5173, proxies `/api` to localhost:8080

### Frontend .env (for local dev)
```
VITE_SUPABASE_URL=https://mqdlwzwlzreampufqxzg.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_API_URL=http://localhost:8080
```

---

## Manual Deployment (without CI/CD)

SSH into the instance and pull + rebuild:

```bash
ssh -i lightsail-key.pem ubuntu@63.32.49.191

cd /opt/verifier/email-verifier
git pull

# Rebuild backend
cd web/backend
export PATH=$PATH:/usr/local/go/bin
go build -o /opt/verifier/server .

# Rebuild frontend
cd ../frontend
npm ci && npm run build
cp -r dist /opt/verifier/frontend/dist

# Restart
sudo systemctl restart verifier
sudo systemctl status verifier
```

---

## Supabase Database Schema

### verifications table
Stores every email verification result for history.

```sql
CREATE TABLE verifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  email text NOT NULL,
  status text,
  sub_status text,
  free_email boolean DEFAULT false,
  disposable boolean DEFAULT false,
  role_account boolean DEFAULT false,
  domain text,
  username text,
  mx_found boolean DEFAULT false,
  mx_record text,
  smtp_provider text,
  suggestion text,
  has_gravatar boolean DEFAULT false,
  reachable text,
  catch_all boolean DEFAULT false,
  deliverable boolean DEFAULT false,
  full_inbox boolean DEFAULT false,
  host_exists boolean DEFAULT false,
  disabled boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own verifications"
  ON verifications FOR ALL TO authenticated
  USING (auth.uid() = user_id);
```

### prospects table
Stores enriched contact data for the prospecting database.

```sql
CREATE TABLE prospects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  email text NOT NULL,
  first_name text,
  last_name text,
  company text,
  role text,
  domain text,
  status text,
  smtp_provider text,
  mx_record text,
  catch_all boolean DEFAULT false,
  deliverable boolean DEFAULT false,
  free_email boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own prospects"
  ON prospects FOR ALL TO authenticated
  USING (auth.uid() = user_id);
```

---

## Troubleshooting

### Service won't start
```bash
sudo journalctl -u verifier -n 50 --no-pager
```

### Nginx issues
```bash
sudo nginx -t
sudo journalctl -u nginx -n 20 --no-pager
```

### SSL certificate renewal
```bash
sudo certbot renew --dry-run
```

### Check if port 25 is open (after AWS approval)
```bash
telnet gmail-smtp-in.l.google.com 25
```

### Restart everything
```bash
sudo systemctl restart verifier
sudo systemctl restart nginx
```

---

## Security

- All traffic over HTTPS (HTTP redirects to HTTPS)
- Authentication required for all API endpoints except `/api/health`
- Domain restriction: only `cedeos.*` emails can sign in
- Mandatory 2FA (TOTP) for all users
- Admin functions restricted to `alvin@cedeos.co.ke`
- Activity logging on all verification actions
- No sign-up flow — admin creates accounts with passwords
- SSH key required for server access
- Supabase RLS policies on all tables

---

## Cost

| Component | Monthly Cost |
|-----------|-------------|
| AWS Lightsail ($5 plan) | $5.00 |
| Static IP (attached) | $0.00 |
| SSL (Let's Encrypt) | $0.00 |
| DNS (Cloud DNS zone) | $0.20 |
| Supabase (free tier) | $0.00 |
| GitHub Actions (free tier) | $0.00 |
| **Total** | **~$5.20/month** |
