# Changelog

## 2026-04-19

### Added
- `GET /order/:orderId` ahora expone de forma aditiva:
  - `invoiceRequired` (boolean)
  - `financial.{grandTotal,productTotal,taxAmount,shippingFeeTotal}` (números normalizados)
  - `addressBilling` y `addressShipping` (alias directos para consumo del subscriber ERP).

### Notes
- Cambio backward-compatible: se mantienen `totals` y el resto del contrato previo.

## 2026-04-15

### Added
- New internal endpoint `POST /v1/status/ready-to-ship` to call Seller Center `SetStatusToReadyToShip` with JSON input (`orderItemIds`, `packageId`) and effective JSON output.
- Route wiring for `/v1/status/ready-to-ship` in HTTP server.
- New tests for ready-to-ship flow (use case, repository mapping, controller, route smoke).

### Changed
- Added Seller Center adapter for ready-to-ship using POST `application/x-www-form-urlencoded` with signed URL params and `Format=JSON`.
- Reused existing signing/timestamp/user credentials flow without introducing DB dependencies.

## 2026-03-27

### Added
- New stock read endpoint: `GET /v1/stock/:sku` (Falabella `GetStock` XML mapped to effective JSON).
- New stock update endpoint: `PUT /v1/stock` with JSON body (`sellerSku`, `quantity`) mapped internally to Falabella `UpdateStock` XML.
- New feed status endpoint: `GET /v1/feed/status/:feedId` and alias `GET /v1/fee/status/:feedId` (Falabella `FeedStatus` XML mapped to effective JSON).
- Added required env var for stock update facility mapping: `SC_GSC_FACILITY_ID`.
- Added smoke test report document: `docs/SMOKE-TESTS.md`.

### Changed
- `sellerCenterClient.httpPost` now supports XML request body and extra headers for `UpdateStock`.
- HTTP server route wiring now includes stock and feed v1 endpoints.
- README and architecture docs updated with request/response contracts, status codes, and usage examples.

### Testing
- Automated tests updated and expanded (`npm test`):
  - use cases (`GetStockBySku`, `UpdateStock`, `GetFeedStatus`)
  - controllers (`Stock`, `StockUpdate`, `FeedStatus`)
  - repository XML parsing/mapping (`GetStock`, `UpdateStock`, `FeedStatus`)
  - route-level smoke tests for the new endpoints
- Real smoke checks executed against Seller Center for:
  - `GET /v1/stock/:sku`
  - `PUT /v1/stock`
  - `GET /v1/feed/status/:feedId`
  - `GET /v1/fee/status/:feedId`

## 2026-03-19

### Fixed
- `GetProducts` now sends `Version=1.0` explicitly in `ProductRepositorySellerCenter` to avoid Falabella Seller Center error `E002: Invalid Version` for `/sku/:sku`.
- Added minimal diagnostic context to product warning logs when no product data is returned:
  - `action: "GetProducts"`
  - `requestedVersion: "1.0"`

### Notes
- This was a surgical change scoped only to the product lookup flow.
- No changes were made to other proxy endpoints (`/order`, `/orders`, `/orderItems`, `/label`) or shared Seller Center client/environment config.
- Align ready-to-ship request with Seller Center/Postman behavior by signing `OrderItemIds` and `PackageId` in the URL and also sending them in the x-www-form-urlencoded body.
