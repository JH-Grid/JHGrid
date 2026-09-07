---
title: Spring Boot Integration
nav_order: 6
---

# Spring Boot Integration

[← Docs index](README.md)

JH Grid pairs naturally with a Spring Boot REST backend.

## Backend API shape

```
GET /api/grid/meta
→ { "totalRows": 100000, "columns": ["id", "name", "value"] }

GET /api/grid/data?page=0&size=300
→ { "rows": [ { "id": 1, "name": "Alice", "value": 42 }, ... ] }
```

## SQL pagination (OFFSET / FETCH)

```sql
SELECT *
FROM your_table
ORDER BY id
OFFSET :offset ROWS FETCH NEXT :size ROWS ONLY
```
