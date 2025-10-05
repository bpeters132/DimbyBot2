# Blue-Green Deployment and Rollback Overview

## 1. Environment Topology
```mermaid
flowchart LR
    subgraph Blue["Blue Stack (Active)"]
        BBot[Bot Container]
        BLava[Lavalink Container]
    end
    subgraph Green["Green Stack (Idle)"]
        GBot[Bot Container]
        GLava[Lavalink Container]
    end
    Proxy[Reverse Proxy / Switch] --> BBot
    Proxy --> BLava
    Monitoring[Metrics & Logs] --> Proxy
    Monitoring --> BBot
    Monitoring --> GBot
```
**Notes**
- Only one stack is active at a time; the other is ready for the next release.
- Shared volumes (downloads, logs) must be carefully managed or namespaced per color.

## 2. Deployment Orchestration Sequence
```mermaid
sequenceDiagram
    participant GH as GitHub Actions
    participant Server as Deployment Server
    participant Blue as Blue Stack
    participant Green as Green Stack
    GH->>Server: Deploy new image to inactive stack (e.g., Green)
    Server->>Green: docker compose up -d --build
    Server->>Green: Run smoke tests (commands, Lavalink ping)
    alt Health OK
        Server->>Proxy: Switch traffic to Green
        Proxy->>Blue: Stop old containers
    else Health Fail
        Server->>Green: Stop new containers
        Server->>Blue: Keep existing stack active
        GH->>Server: Trigger rollback notification
    end
    Server->>Logs: Publish deployment summary (color, commit, status)
```

## 3. Health Check Coverage Map
| Layer | Check Type | Tooling | Threshold |
|-------|------------|---------|-----------|
| Bot Process | Slash command invocation, heartbeat monitoring | Custom script via Discord staging guild | Success within 30s |
| Lavalink | REST `/version` ping, voice connect/disconnect | curl + mock voice session | No errors in 60s window |
| Infrastructure | Container status, resource usage | `docker inspect`, metrics collector | CPU < 70%, no restarts |
| Proxy/Switch | Target route validation | `curl` or test webhook | HTTP 200 within 2 retries |

## 4. Rollback Trigger Points
```mermaid
flowchart TD
    A[Deployment Initiated] --> B{Pre-switch health pass?}
    B -- No --> R1[Abort deploy keep active color]
    B -- Yes --> C[Switch traffic]
    C --> D{Post-switch health stable?}
    D -- Yes --> S[Mark deployment successful]
    D -- No --> R2[Invoke rollback script => restore previous color]
    R2 --> S
```

## 5. Operator Checklist
- [ ] Confirm inactive stack has latest `.env.<color>` secrets.
- [ ] Review health-check output artifacts before traffic switch.
- [ ] Verify monitoring dashboard reflects new color after cutover.
- [ ] Document deployment in release log (active color, commit, status).
- [ ] For rollback: execute `ci_rollback.sh`, verify bot reconnects, notify stakeholders.

## 6. Additional References
- Detailed implementation tasks: [`docs/suggestions/blue-green-deployment.md`](docs/suggestions/blue-green-deployment.md:1)
- Health/rollback plan: [`docs/suggestions/deployment-health-checks-rollbacks.md`](docs/suggestions/deployment-health-checks-rollbacks.md:1)