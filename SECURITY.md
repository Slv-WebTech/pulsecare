# Security Policy

PulseCare handles health-related data, so security reports are taken seriously.

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private reporting:
<https://github.com/Slv-WebTech/pulsecare/security/advisories/new>

Include what you found, how to reproduce it, and the impact. Never include real patient data, credentials or tokens.

## Scope and expectations

- This is a working application, **not yet certified for production handling of regulated health data**. See
  [`docs/QA-REPORT.md`](docs/QA-REPORT.md) for the current security posture and known limits.
- Secrets live only in git-ignored `.env` files; only `*.env.example` templates with placeholders are tracked. If you spot a
  real credential anywhere in the history, report it privately so it can be rotated.
