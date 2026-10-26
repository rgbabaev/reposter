# 0010. Local-network HTTP access

## Context

Loopback-only HTTP prevents access from other devices on a LAN and through private container bridges.

## Decision

Allow HTTP origins with LAN IP addresses or hostnames and non-loopback bind addresses. Accept HTTP sockets from loopback, RFC 1918, IPv4 link-local, IPv6 unique-local and IPv6 link-local networks, including mapped IPv4 addresses. Keep HTTPS trusted-proxy checks, exact write-origin checks and authentication unchanged.

## Consequences

LAN clients can sign in with HttpOnly, SameSite cookies over HTTP. Secure cookies remain specific to HTTPS. Public socket addresses still require the HTTPS proxy mode. HTTP traffic on the local network is unencrypted; operators control listener exposure and network access.
