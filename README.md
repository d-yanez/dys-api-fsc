dys-api-fsc/
  src/
    domain/
      orders/
    application/
      use-cases/
    infrastructure/
      config/
      logger/
      sellercenter/
    interfaces/
      http/
        controllers/
        routes/
        server.ts


curl -H "x-api-key: xxxxx" \
  http://localhost:8080/order/1130565543

  source: https://chatgpt.com/g/g-p-68f4447035d881918c6c1f14de9e7ef6-falabella-seller-center/c/69194008-2a64-8333-8cd0-3be4f14812e1

  npm run dev

## Endpoint nuevo: Stock por SKU (v1)

### GET `/v1/stock/:sku`

Obtiene stock de Falabella `GetStock` (XML) y responde JSON efectivo.

Ejemplo:

```bash
curl -H "x-api-key: xxxxx" \
  http://localhost:8080/v1/stock/1901928641
```

Respuesta `200`:

```json
{
  "sku": "1901928641",
  "totalQuantity": 2,
  "warehouses": [
    {
      "sellerWarehouseId": null,
      "facilityId": "GSC-SCBFD321E8A8D71",
      "sellerSku": "1901928641",
      "quantity": 2
    }
  ]
}
```

Error mapeado desde FSC `ErrorResponse` (`ErrorCode=1001`):

```json
{
  "error": "SKU no encontrado en Falabella Seller Center",
  "details": {
    "code": "1001",
    "message": "Invalid Seller Sku List: 1901928642"
  }
}
```

Códigos esperados:
- `200`: stock encontrado
- `400`: SKU inválido (formato)
- `404`: SKU no encontrado en FSC (mapeo `ErrorCode=1001`)
- `502`: error upstream Falabella
- `500`: error interno no controlado

### PUT `/v1/stock`

Actualiza stock de un SKU en Falabella (`UpdateStock`) con body JSON local, internamente transformado a XML.

Body:

```json
{
  "sellerSku": "3516192124",
  "quantity": 3
}
```

Respuesta `200`:

```json
{
  "success": true,
  "status": "accepted",
  "action": "UpdateStock",
  "sellerSku": "3516192124",
  "quantity": 3,
  "facilityId": "GSC-SCBFD321E8A8D71",
  "feedId": "1c41eff7-89ea-4ef4-b078-48421a90ca08"
}
```

Variable de entorno requerida:
- `SC_GSC_FACILITY_ID` (ejemplo: `GSC-SCBFD321E8A8D71`)

Códigos esperados:
- `200`: update aceptado por FSC (retorna `feedId`)
- `400`: `sellerSku` o `quantity` inválidos
- `404`: SKU no encontrado en FSC (mapeo `ErrorCode=1001`)
- `502`: error upstream Falabella
- `500`: error interno no controlado

### GET `/v1/feed/status/:feedId`

Consulta el estado detallado de un `feed` en Falabella (`FeedStatus`).

Ejemplo:

```bash
curl -H "x-api-key: xxxxx" \
  http://localhost:8080/v1/feed/status/90ffc2f7-99d4-4fb2-b7d4-bfe8e5f7c34c
```

También disponible alias:
- `GET /v1/fee/status/:feedId`

Respuesta `200`:

```json
{
  "success": true,
  "feedId": "90ffc2f7-99d4-4fb2-b7d4-bfe8e5f7c34c",
  "status": "Finished",
  "action": "ProductStockUpdate",
  "creationDate": "2026-03-26 23:35:38",
  "updatedDate": "2026-03-26 23:35:39",
  "source": "api",
  "totalRecords": 1,
  "processedRecords": 1,
  "failedRecords": 0
}
```

Códigos esperados:
- `200`: feed encontrado
- `400`: `feedId` inválido (formato)
- `404`: feed no encontrado en FSC
- `502`: error upstream Falabella
- `500`: error interno no controlado

### POST `/v1/status/ready-to-ship`

Marca una orden como **Ready to Ship** en Falabella (`SetStatusToReadyToShip`).

Body:

```json
{
  "orderItemIds": [163398544],
  "packageId": "PKG00002CZXL5"
}
```

Nota técnica:
- El adapter Seller Center firma la URL con `OrderItemIds` y `PackageId` y además los envía en body `application/x-www-form-urlencoded`, alineado con el request validado en Postman para `SetStatusToReadyToShip`.

Respuesta `200`:

```json
{
  "ok": true,
  "action": "SetStatusToReadyToShip",
  "purchaseOrderId": "1150140518",
  "purchaseOrderNumber": "3231960534"
}
```

Error funcional FSC `400`:

```json
{
  "ok": false,
  "action": "SetStatusToReadyToShip",
  "errorCode": "20",
  "errorMessage": "E020: \"163398544\" Invalid Order Item ID"
}
```

Códigos esperados:
- `200`: operación aceptada por FSC
- `400`: validación local o error funcional FSC
- `502`: error upstream Falabella
- `500`: error interno no controlado

## Tests

```bash
npm test
```

Registro de smoke tests reales:
- `docs/SMOKE-TESTS.md`
