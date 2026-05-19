#!/bin/bash
# Run this on the Kamatera server (45.91.169.203) as root
# SSH in: ssh root@45.91.169.203
# Then paste this entire script

set -e

echo "=== Installing SOCKS5 proxy (dante-server) ==="
apt-get update -y
apt-get install -y dante-server

echo "=== Configuring SOCKS5 proxy ==="
cat > /etc/danted.conf << 'EOF'
logoutput: syslog

# Listen on all interfaces, port 1080
internal: 0.0.0.0 port = 1080

# Use the main interface for outbound
external: eth0

# Authentication method
socksmethod: username

# Allow authenticated users
client pass {
    from: 0.0.0.0/0 to: 0.0.0.0/0
    log: connect disconnect error
}

# Allow SMTP (port 25) and other connections
socks pass {
    from: 0.0.0.0/0 to: 0.0.0.0/0
    protocol: tcp
    log: connect disconnect error
}
EOF

echo "=== Creating proxy user ==="
useradd -r -s /bin/false proxyuser 2>/dev/null || true
echo "proxyuser:CedeSmtp2026!" | chpasswd

echo "=== Starting dante SOCKS5 proxy ==="
systemctl enable danted
systemctl restart danted

echo "=== Verifying proxy is running ==="
sleep 2
if ss -tlnp | grep -q 1080; then
    echo ""
    echo "=========================================="
    echo "  SOCKS5 PROXY IS RUNNING ON PORT 1080"
    echo "=========================================="
    echo ""
    echo "  Proxy URI: socks5://proxyuser:CedeSmtp2026!@45.91.169.203:1080"
    echo ""
    echo "  Test port 25 connectivity:"
    echo "  telnet gmail-smtp-in.l.google.com 25"
    echo ""
else
    echo "ERROR: Proxy failed to start"
    journalctl -u danted --no-pager -n 20
    exit 1
fi

echo "=== Testing port 25 outbound ==="
if timeout 5 bash -c 'echo QUIT | nc -w5 gmail-smtp-in.l.google.com 25' 2>/dev/null | grep -q "220"; then
    echo ""
    echo "PORT 25 IS OPEN - SMTP VERIFICATION WILL WORK!"
    echo ""
else
    echo ""
    echo "WARNING: Port 25 test inconclusive (may still work via SOCKS)"
    echo ""
fi
