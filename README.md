# EduPulse Audit Service (`edupulse-audit-service`)

Audit Logging Microservice for the EduPulse System.

## Architecture

* **Runtime:** Node.js 22 (runs non-root on port `6000`).
* **Database:** MySQL 8.4 (`audit_db`).
* **Event Consumer:** Listens to RabbitMQ exchange for user login, registration, and student mutation events, appending them immutably into `audit_db`.
* **API:** Provides `GET /api/audit` (restricted to teachers/admins) to query history logs.
* **Health Check:** `GET /health` returns `200 OK`.

## DevSecOps Pipeline

1. **Secret Scanning:** `gitleaks` checks for hardcoded tokens and credentials.
2. **SCA & Dependency Vulnerability Gate:** `npm audit --omit=dev --audit-level=high` fails on high-risk dependencies.
3. **SAST Syntax & Linting:** `node --check` validates JavaScript syntax.
4. **Dockerfile Linting:** `hadolint` verifies container security standards.
5. **Vulnerability Scanning:** Aqua `trivy` scans for OS and package vulnerabilities.
6. **CycloneDX SBOM:** Generated and preserved as an audit artifact.
7. **Container Signing:** Signed with Sigstore `cosign` using GitHub OIDC.
8. **Deployment:** Pushes to Amazon ECR and updates the ECS Fargate `audit-service`.

## Required Environment Variables

| Variable | Description |
|---|---|
| `DB_HOST` | MySQL hostname or private IP |
| `DB_USER` | `audit` |
| `DB_PASSWORD` | Injected via AWS Secrets Manager |
| `DB_DATABASE` | `audit_db` |
| `RABBITMQ_URL` | AMQP URL with credentials |

## Local Development

```bash
npm install
npm start
```
