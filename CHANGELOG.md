# Changelog

## 2026-03-19

### Fixed
- `GetProducts` now sends `Version=1.0` explicitly in `ProductRepositorySellerCenter` to avoid Falabella Seller Center error `E002: Invalid Version` for `/sku/:sku`.
- Added minimal diagnostic context to product warning logs when no product data is returned:
  - `action: "GetProducts"`
  - `requestedVersion: "1.0"`

### Notes
- This was a surgical change scoped only to the product lookup flow.
- No changes were made to other proxy endpoints (`/order`, `/orders`, `/orderItems`, `/label`) or shared Seller Center client/environment config.
