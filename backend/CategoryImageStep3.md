# Step 3 — Persistent Category Images

## Objective

Add category image persistence without changing the existing menu/category architecture. Category images are now stored on the existing `Category` document and can be supplied either as an uploaded image or an HTTP/HTTPS URL.

## Data model

`Category.image` contains:

- `url`: the image URL displayed by clients.
- `public_id`: the Cloudinary asset ID when the image was uploaded through the application.

Existing categories remain valid because both fields default to empty strings.

## Upload behavior

- Uploaded files use a dedicated Cloudinary folder: `utc-cafe/categories`.
- Accepted formats: JPG, JPEG, PNG, WEBP.
- Maximum upload size: 5 MB.
- The existing Cloudinary credentials are reused; no secret is exposed to the frontend.
- Replacing a Cloudinary-backed image deletes the previous Cloudinary asset before saving the replacement.
- Deleting a category also deletes its Cloudinary-backed image.

## URL behavior

`image_url` accepts only HTTP or HTTPS URLs. URL-backed images are stored as external URLs with an empty `public_id`; the backend does not download arbitrary remote URLs. This avoids turning the API into a server-side URL fetcher and keeps SSRF risk out of the category image flow.

## API contract

Existing protected category endpoints remain in place:

- `GET /api/categories`
- `POST /api/categories` — master admin; multipart field `image` or body field `image_url`.
- `PUT /api/categories/:id` — master admin; multipart field `image`, body field `image_url`, or `removeImage=true`.
- `DELETE /api/categories/:id` — removes the category image when it owns a Cloudinary asset.

No existing endpoint was removed or renamed.

## Image precedence

For create/update:

1. Uploaded `image` file wins.
2. Otherwise a supplied `image_url` is used.
3. Otherwise the existing image remains unchanged.
4. `removeImage=true` explicitly clears the image when no replacement is supplied.

## Dynamic-category relationship

The Master Admin menu filters continue to derive category names from menu data. Category images are metadata for those categories and do not become a new sidebar/dashboard section. The standalone Categories route remains an API capability for compatibility and administrative operations, while the Master Admin Menu Management experience remains the primary category-management surface.

## Required Step 3 tests

1. Create category without an image — succeeds with empty image fields.
2. Create category with a valid HTTPS URL — stores URL and empty `public_id`.
3. Create category with a valid uploaded image — stores Cloudinary URL and `public_id`.
4. Reject an invalid image URL such as `javascript:` or an invalid URL string.
5. Reject a non-image upload.
6. Reject an image larger than 5 MB.
7. Update URL-backed image with another URL.
8. Replace Cloudinary image with a new upload and remove the old Cloudinary asset.
9. Remove an existing image with `removeImage=true`.
10. Delete a category with a Cloudinary image and verify the delete path is invoked.
11. Preserve categories created before this schema change.
12. Verify master-admin authorization remains enforced on POST/PUT/DELETE.
13. Verify menu item category references are not changed by image updates.
14. Verify dynamic menu category filters remain derived from menu items and are unaffected when a category image changes.

## Important integration note

This step provides the persistent backend capability. The Excel/JSON Master Menu UI should consume it in the next integration step by adding `category_image_url` to the import/export contract and resolving each normalized imported category to its Category document before applying the image.
