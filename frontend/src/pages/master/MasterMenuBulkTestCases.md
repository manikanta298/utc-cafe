# Master Menu Bulk Update — Test Cases

Scope: `frontend/src/pages/master/MasterMenuPage.jsx` only. These cases cover the Master Admin Excel/JSON workflow, existing manual CRUD, Cloudinary image upload/URL workflows, validation, franchise propagation, and regression risks.

## Functional tests

| ID | Scenario | Steps | Expected |
|---|---|---|---|
| MM-001 | Open bulk tool | Master Admin → Menu Management → Bulk Excel / JSON | Modal opens without affecting existing menu list. |
| MM-002 | Download Excel | Open bulk tool → Download Excel | `.xlsx` downloads and contains one `Menu` sheet with the documented columns, including `image_url`. |
| MM-003 | Download JSON | Open bulk tool → Download JSON | Valid JSON array downloads; each row contains `_id`, `operation: UPDATE`, and `image_url` when an image exists. |
| MM-004 | Excel round trip | Download Excel → change one price → upload | File parses, row previews, validation passes, and update is applied. |
| MM-005 | JSON round trip | Download JSON → change one description → upload | JSON parses and the item is updated. |
| MM-006 | ADD row | Add a valid row with blank `_id` and `operation=ADD` | New menu item is created. |
| MM-007 | UPDATE row | Existing `_id`, `operation=UPDATE`, changed fields | Existing item is updated; its existing image remains unchanged when `image_url` is unchanged. |
| MM-008 | DELETE row | Existing `_id`, `operation=DELETE` | Item is deleted and disappears from Master Admin list. |
| MM-009 | Multiple operations | Upload ADD + UPDATE + DELETE rows | Each valid operation is applied and final counts are shown. |
| MM-010 | Validation blocks requests | Upload invalid operation/name/category/price/GST | Validation errors are displayed and Apply is disabled; no API request is sent. |
| MM-011 | UPDATE missing ID | UPDATE row with blank `_id` | Validation error; Apply disabled. |
| MM-012 | ADD with ID | ADD row containing `_id` | Validation error; Apply disabled. |
| MM-013 | Invalid GST | GST outside 0/5/12/18/28 | Validation error; Apply disabled. |
| MM-014 | Negative numeric fields | Negative price/prep time/stock/threshold | Validation error; Apply disabled. |
| MM-015 | Boolean parsing | Upload `true/false`, `1/0`, `yes/no` values | Values are normalised to booleans correctly. |
| MM-016 | Empty file | Upload empty workbook | No destructive request occurs; user sees validation/read feedback. |
| MM-017 | Malformed JSON | Upload invalid JSON | Read error displayed; Apply disabled. |
| MM-018 | Unsupported file | Upload unrelated file | Read/format error displayed; Apply disabled. |
| MM-019 | Partial API failure | Include one invalid server-side row among valid rows | Successful rows remain saved; failed rows are reported with row numbers. |
| MM-020 | Manual Add | Use existing Add Item flow | Item creation still works. |
| MM-021 | Manual Edit | Edit an existing item | Item updates normally. |
| MM-022 | Manual Delete | Delete an item | Existing confirmation and deletion still work. |
| MM-023 | Global toggle | Enable/disable item | Existing global active state changes and list refreshes. |
| MM-024 | Search/filter regression | Search, category filter, status tabs | Existing filtering remains functional after bulk operations. |
| MM-025 | Manual image file | Add/edit item → Upload File → choose JPG/PNG/WEBP | Image previews locally and is sent through the existing Cloudinary upload endpoint. |
| MM-026 | Manual Cloudinary URL | Add/edit item → paste valid HTTP/HTTPS image URL | URL previews; image is fetched as a file and sent through the existing Cloudinary upload endpoint. |
| MM-027 | Invalid image URL | Paste malformed/non-HTTP URL | User receives validation feedback and no menu request is submitted. |
| MM-028 | URL is not an image | Paste URL that returns non-image content | Save fails with a clear image-type error; menu data is not partially submitted by the frontend. |
| MM-029 | Bulk image URL ADD | ADD row contains a valid `image_url` | Image is fetched and uploaded through existing backend Cloudinary handling; new item stores the resulting Cloudinary image. |
| MM-030 | Bulk image URL UPDATE | UPDATE row changes `image_url` | New image replaces the existing Cloudinary image through the existing backend update flow. |
| MM-031 | Bulk unchanged image URL | UPDATE row contains the item's existing `image_url` | Existing image is preserved and is not re-uploaded. |
| MM-032 | Bulk image fetch failure | `image_url` is unreachable or blocks browser CORS | Only that row fails and the row-level failure is reported; other valid rows continue according to the existing partial-failure behavior. |
| MM-033 | Image URL in Excel | Export/download Excel, edit `image_url`, re-upload | URL is retained/updated and preview shows the image URL value. |
| MM-034 | Image URL in JSON | Export/download JSON, edit `image_url`, re-upload | URL is retained/updated and the corresponding Cloudinary image is persisted. |

## Cross-role propagation tests

| ID | Scenario | Expected |
|---|---|---|
| FR-001 | Bulk update active item | Franchise-facing menu/POS retrieves the updated item and price through the existing `/menu` data path. |
| FR-002 | Bulk deactivate item | Franchise-facing menu/POS no longer exposes the item because existing backend filtering uses `isGlobalActive`. |
| FR-003 | Bulk add item | New active item becomes available to franchise-facing menu/POS after reload. |
| FR-004 | Bulk delete item | Deleted item is absent from franchise-facing menu/POS after reload. |
| FR-005 | Existing franchise override | Global bulk update does not erase `disabledInFranchises`; franchise-specific availability remains intact. |
| FR-006 | Real-time POS refresh | For updates that trigger the existing `menu:globalUpdate` event, open POS screens refresh their menu. |
| FR-007 | Global image replacement | Franchise/POS clients receive the updated menu item/image after the existing global update event or subsequent menu reload. |

## Security and regression tests

| ID | Scenario | Expected |
|---|---|---|
| SEC-001 | Non-Master Admin opens page | Existing route/authorization rules prevent unauthorized access. |
| SEC-002 | Non-Master Admin submits API | Existing backend authorization rejects create/update/delete. |
| SEC-003 | XSS strings in spreadsheet | Text is rendered as React text, not executable HTML. |
| SEC-004 | Large sheet | Preview is capped to the first 100 rows while all validated rows remain eligible for Apply. |
| SEC-005 | Refresh after import | Master list is reloaded from `/menu/all`, so UI reflects persisted server state. |
| SEC-006 | Existing architecture | No backend model, route, controller, package manifest, or global layout file is changed by this feature. |
| SEC-007 | Image URL protocol validation | `image_url` accepts only HTTP/HTTPS URLs; malformed schemes are rejected before API calls. |
| SEC-008 | Cloudinary credential safety | No Cloudinary API secret, unsigned-upload secret, or credential is embedded in the frontend source. |
| SEC-009 | Existing Cloudinary lifecycle | Image replacement/removal remains delegated to the existing backend Cloudinary helper rather than manipulating Cloudinary credentials in the browser. |
| SEC-010 | Unchanged image efficiency | Bulk UPDATE with the current `image_url` does not trigger an unnecessary image upload. |

## Code-review checklist

- Confirm changes are limited to `frontend/src/pages/master/`.
- Confirm existing `/menu`, `/menu/:id`, `/menu/:id/global-toggle`, and `/menu/:id/toggle` API contracts are not changed.
- Confirm bulk validation occurs before the first mutation request.
- Confirm ADD does not accept client-supplied `_id`.
- Confirm UPDATE/DELETE require `_id`.
- Confirm failed rows are isolated and reported with spreadsheet row numbers.
- Confirm existing images are preserved unless a new file/URL is supplied or removal is explicitly requested.
- Confirm URL images are uploaded through the existing backend Cloudinary flow rather than exposing Cloudinary credentials in the browser.
- Confirm no unnecessary re-upload occurs for unchanged `image_url` values.
- Confirm Master Admin reloads server state after bulk completion.
- Confirm existing franchise-specific disable state is not overwritten by the frontend bulk workflow.
- Confirm the SheetJS loader remains lazy and only loads when Excel functionality is used.

## Acceptance criteria

- Master Admin can download current menu data as Excel and JSON.
- Master Admin can upload Excel or JSON and preview/validate changes before applying them.
- ADD, UPDATE, and DELETE operations are supported.
- Existing manual add/edit/delete/toggle functionality remains available.
- Menu images can be supplied by file upload or HTTP/HTTPS URL; URL images are routed through the existing backend Cloudinary upload path.
- Bulk exports include the current image URL so menu data can be round-tripped without losing image references.
- Bulk operations use the existing protected menu APIs, so authorization and franchise propagation stay within the existing architecture.
- Failed rows are reported without hiding successful operations.
- No files outside `frontend/src/pages/master/` are modified for this feature.
