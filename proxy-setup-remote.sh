#!/bin/bash
set -e

apt-get update -y >/dev/null 2>&1
apt-get install -y dante-server netcat-openbsd >/dev/null 2>&1

cat > /etc/danted.conf << 'CONFEOF'
logoutput: /var/log/danted.log
internal: 0.0.0.0 port = 1080
external: eth0
socksmethod: username
user.privileged: root
user.unprivileged: nobody
client pass {
    from: 0.0.0.0/0 to: 0.0.0.0/0
    log: error
}
socks pass {
    from: 0.0.0.0/0 to: 0.0.0.0/0
    protocol: tcp
    log: error
}
CONFEOF

# Create proxy user
id proxyuser >/dev/null 2>&1 || useradd -r -s /bin/false proxyuser
echo 'proxyuser:CedeSmtp2026!' | chpasswd

# Restart dante
systemctl enable danted >/dev/null 2>&1
systemctl restart danted
sleep 2

# Verify
if ss -tlnp | grep -q ':1080'; then
  echo "PROXY_RUNNING"
else
  echo "PROXY_FAILED"
  journalctl -u danted --no-pager -n 30
  exit 1
fi

# Test port 25 outbound
if timeout 5 bash -c 'cat < /dev/tcp/gmail-smtp-in.l.google.com/25' 2>/dev/null | head -1 | grep -q "220"; then
  echo "PORT_25_OPEN"
else
  echo "PORT_25_BLOCKED_OR_TIMEOUT"
fi
