# Step 2 — Bulk Category Mapping

## Goal

Make the uploaded Excel/JSON menu file the preflight source for dynamic category discovery without introducing a second category-management workflow.

## Algorithm

1. Parse Excel or JSON into rows.
2. Normalize each `category` value by trimming and collapsing whitespace.
3. Generate a case-insensitive category key.
4. Build a `Map` keyed by the normalized category key.
5. Count imported rows for each category.
6. Compare each imported category against the current menu item data.
7. Mark each category as `EXISTING` or `NEW` in the preview.
8. Reject duplicate `_id` values before any mutation request.
9. Only after the administrator presses Apply are menu API mutations sent.
10. Reload `/menu/all` after completion; dynamic category filters are then recalculated from persisted menu data.

## Image handling

The existing `image_url` field is part of the bulk schema. For ADD/UPDATE rows, a valid HTTP/HTTPS image URL is fetched in the browser as an image file and passed through the existing backend Cloudinary upload flow. An unchanged UPDATE URL is not re-uploaded.

A persistent `category_image_url` field is intentionally not included yet because the current backend Category schema has no image property. Adding it safely requires an explicit backend schema/API change and will be handled as a separate step.

## Safety properties

- Preview is non-destructive.
- Existing backend authorization remains authoritative.
- No Cloudinary credentials are exposed in the frontend.
- Existing franchise-specific menu state is not modified by the category mapping layer.
- Bulk execution remains compatible with the existing ADD/UPDATE/DELETE APIs.
