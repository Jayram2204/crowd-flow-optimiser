# Security Policy

## Supported Versions

We currently provide security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

As this platform is designed as a safety-critical crowd management system, security is of paramount importance. Do **not** open public issues for security vulnerabilities.

If you discover a vulnerability or a flaw that could be exploited to manipulate crowd telemetry, intervention logic, or the physical digital signage, please follow these steps:

1. Send an email directly to the maintainers of this repository.
2. Include a detailed description of the vulnerability, the components affected (e.g., Python Telemetry, Go Backend, Next.js Frontend), and steps to reproduce.
3. Allow up to 48 hours for a response acknowledging the report.

### Scope
- **In Scope:** Exploits allowing unauthenticated POST requests to the telemetry ingest endpoints, WebSocket hijacked interventions, LLM prompt injections that bypass the deterministic failsafe, and frontend XSS vulnerabilities.
- **Out of Scope:** Physical tampering with edge CCTV hardware.

We will provide a timeline for a patch and will credit you in the release notes once the vulnerability has been safely resolved.
