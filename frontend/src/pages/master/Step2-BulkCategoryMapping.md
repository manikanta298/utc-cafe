# Step 2 — Bulk Category Mapping

The Excel/JSON import is the non-destructive preflight source for dynamic category discovery.

## Algorithm

1. Parse Excel or JSON rows.
2. Normalize `category` by trimming and collapsing whitespace.
3. Generate a case-insensitive category key.
4. Build a `Map` of unique categories and count imported rows.
5. Compare imported categories with current menu data.
6. Mark each category `EXISTING` or `NEW` in the preview.
7. Reject duplicate `_id` values before mutation.
8. Apply only after administrator confirmation.
9. Reload `/menu/all` and recalculate live category filters from persisted menu data.

## Image handling

`image_url` is the supported bulk image field. Valid HTTP/HTTPS URLs are fetched as image files and sent through the existing backend Cloudinary flow. An unchanged UPDATE image URL is preserved without another upload. Manual Add/Edit continues to support local file upload.

Binary image files are not embedded into Excel/JSON; the portable bulk format uses image URLs.

The current backend Category schema has no image property, so persistent `category_image_url` support is intentionally deferred to a separate backend step rather than silently changing the architecture.

## Safety

- Preview does not mutate server data.
- Existing backend authorization remains authoritative.
- Cloudinary credentials are never exposed in frontend code.
- Existing franchise-specific menu state is not changed by category mapping.
