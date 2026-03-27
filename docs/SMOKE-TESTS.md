# Smoke Tests

## Ejecución: 2026-03-27 (America/Santiago)

Datos usados:
- `orderId=1147452528`
- `sku=3466871818`

Headers:
- `x-api-key: <API_KEY desde .env>`

Resultados:

1. `GET /order/1147452528`
- HTTP `200`
- Validado: `orderId=1147452528`, `status=pending`, `orderNumber=3229515115`.

2. `GET /orderItems/1147452528`
- HTTP `200`
- Validado: `orderId=1147452528`, `items[0].sku=3466871818`, `items[0].status=pending`.

3. `GET /sku/3466871818`
- HTTP `200`
- Validado: `sku=3466871818`, `price=43990`, `salePrice=41990`, `stock=1`, `status=active`.

4. `GET /orders`
- HTTP `200`
- Validado: lista con orden pendiente e `orderId=1147452528`.

5. `GET /v1/stock/3466871818`
- HTTP `200`
- Validado: `sku=3466871818`, `totalQuantity=1`, `warehouses[0].facilityId=GSC-SCBFD321E8A8D71`.

6. `PUT /v1/stock`
- Request: `{ "sellerSku": "3516192124", "quantity": 3 }`
- HTTP `200`
- Validado: `success=true`, `status=accepted`, `action=UpdateStock`, `facilityId=GSC-SCBFD321E8A8D71`, `feedId` presente.

7. `GET /v1/feed/status/90ffc2f7-99d4-4fb2-b7d4-bfe8e5f7c34c`
- HTTP `200`
- Validado: `success=true`, `status=Finished`, `action=ProductStockUpdate`, `totalRecords=1`, `processedRecords=1`, `failedRecords=0`.

8. `GET /v1/fee/status/90ffc2f7-99d4-4fb2-b7d4-bfe8e5f7c34c` (alias)
- HTTP `200`
- Validado: misma respuesta que `/v1/feed/status/:feedId`.

Conclusión:
- Todos los endpoints probados respondieron OK (`200`) en el smoke test.
