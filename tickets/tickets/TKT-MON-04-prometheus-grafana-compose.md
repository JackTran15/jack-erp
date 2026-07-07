# TKT-MON-04 Infra: Prometheus + Grafana docker-compose

## Epic

[EPIC-07072026 API monitoring — Prometheus metrics](../epics/EPIC-07072026-api-metrics-monitoring.md)

## Summary

Thêm `prometheus` + `grafana` vào root `docker-compose.yml` để chạy vòng monitoring local:
Prometheus scrape `/metrics` của API, Grafana provision datasource + 1 starter dashboard.

## Deliverables

- `docker-compose.yml` (root) — thêm 2 service:
  - `prometheus` (`prom/prometheus`), port host `9090`, mount `./docker/prometheus/prometheus.yml`.
  - `grafana` (`grafana/grafana`), port host `3002` (3000/3001 đã dùng bởi web apps), mount
    provisioning + dashboards, volume `erp-grafana-data`.
- `docker/prometheus/prometheus.yml` — global scrape interval 15s, job `erp-api` target
  `host.docker.internal:4000`, `metrics_path: /metrics`.
- `docker/grafana/provisioning/datasources/prometheus.yml` — datasource Prometheus
  (`http://prometheus:9090`, default).
- `docker/grafana/provisioning/dashboards/dashboards.yml` + `docker/grafana/dashboards/erp-api.json`
  — starter dashboard: HTTP request rate/latency (p95)/error rate, Node memory, Kafka publish rate,
  checkout duration.

## Acceptance Criteria

- [ ] `docker compose up -d prometheus grafana` khởi động sạch, không port conflict
      (tránh 5433/6380/19092/18080/18088/3000/3001/4000).
- [ ] Prometheus UI (`:9090`) → Status → Targets: job `erp-api` `UP` (API chạy trên host `:4000`).
- [ ] Grafana (`:3002`) tự có datasource Prometheus + dashboard "ERP API" render panel.
- [ ] Volume `erp-grafana-data` khai báo ở block `volumes:`.

## Definition of Done

- [ ] `docker compose config` valid (không lỗi YAML/tham chiếu).
- [ ] File dashboard JSON hợp lệ (import được).
- [ ] Không đụng service/port hiện có; không đổi code API.

## Tech Approach

```yaml
# docker-compose.yml (thêm)
  prometheus:
    image: prom/prometheus:latest
    container_name: erp-prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./docker/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
    extra_hosts:
      - "host.docker.internal:host-gateway"
    restart: unless-stopped

  grafana:
    image: grafana/grafana:latest
    container_name: erp-grafana
    depends_on: [prometheus]
    ports:
      - "3002:3000"
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_ADMIN_PASSWORD:-admin}
      GF_USERS_ALLOW_SIGN_UP: "false"
    volumes:
      - ./docker/grafana/provisioning:/etc/grafana/provisioning:ro
      - ./docker/grafana/dashboards:/var/lib/grafana/dashboards:ro
      - erp-grafana-data:/var/lib/grafana
    restart: unless-stopped
```

```yaml
# docker/prometheus/prometheus.yml
global:
  scrape_interval: 15s
scrape_configs:
  - job_name: erp-api
    metrics_path: /metrics
    static_configs:
      - targets: ["host.docker.internal:4000"]
```

## Testing Strategy

- Manual: chạy API host `:4000`, `docker compose up -d prometheus grafana`, kiểm Targets `UP`,
  mở Grafana dashboard.

## Dependencies

- Depends on: TKT-MON-01 (endpoint `/metrics` tồn tại)
- Blocks: TKT-MON-05
