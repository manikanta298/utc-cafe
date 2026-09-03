# Master Menu Bulk Update — Test Cases

Scope: Master Admin menu bulk workflow plus the minimal shared-layout sidebar change required for Step 1/2. These cases cover Excel/JSON import, dynamic category mapping, existing manual CRUD, Cloudinary image URL workflows, validation, franchise propagation, and regression risks.

## Step 2 — Dynamic category mapping tests

| ID | Scenario | Steps | Expected |
|---|---|---|---|
| CAT-001 | New category in import | Upload a valid ADD row with a category not currently used by menu items | Preview marks the category `NEW`; after Apply and reload, the new category appears automatically beside search. |
| CAT-002 | Existing category in import | Upload rows using an existing category | Preview marks the category `EXISTING` and shows current item count. |
| CAT-003 | Case variation | Import `Beverages`, `beverages`, and `BEVERAGES` | Preview resolves them to one normalized category mapping. |
| CAT-004 | Whitespace variation | Import `  Cold   Drinks  ` and `Cold Drinks` | Preview resolves them to one normalized category mapping. |
| CAT-005 | Multiple categories | Import rows for several categories | Every distinct normalized category is displayed in the mapping preview. |
| CAT-006 | Category filter after import | Apply an import containing a new category, then select its filter | New category filter returns only matching menu items. |
| CAT-007 | Category removal | Delete/update the last item belonging to a category | The category disappears from dynamic filters after the menu reload. |
| CAT-008 | Selected filter disappears | Select a category, then remove its last item | Selected category filter is automatically cleared instead of leaving an empty locked filter. |
| CAT-009 | Import preview does not mutate | Upload a file but do not press Apply | No menu mutation request occurs; mapping is preview-only. |
| CAT-010 | Duplicate IDs | Upload two rows with the same `_id` | Validation fails before any mutation request is sent. |

## Existing functional tests

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
| MM-028 | URL is not an image | Paste URL that returns non-image content | Save fails with a clear image-type error. |
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
| SEC-006 | Architecture safety | Backend models/routes/controllers remain unchanged for this step; only the Master Menu page and the minimal shared sidebar entry are changed. |
| SEC-007 | Image URL protocol validation | `image_url` accepts only HTTP/HTTPS URLs; malformed schemes are rejected before API calls. |
| SEC-008 | Cloudinary credential safety | No Cloudinary API secret or upload secret is embedded in the frontend source. |
| SEC-009 | Existing Cloudinary lifecycle | Image replacement/removal remains delegated to the existing backend Cloudinary helper rather than manipulating Cloudinary credentials in the browser. |
| SEC-010 | Unchanged image efficiency | Bulk UPDATE with the current `image_url` does not trigger an unnecessary image upload. |

## Important Step 2 limitation

The current backend `Category` schema stores `name`, `color`, `icon`, `sortOrder`, and `isActive`; it has no category image field. Therefore this step does **not** pretend that `category_image_url` is persistently supported. Menu-item `image_url` is fully supported through the existing Cloudinary flow. Persistent category-image upload/URL support requires a small, explicit backend schema/API extension and should be treated as the next isolated step rather than silently changing the architecture.

## Code-review checklist

- Confirm dynamic category mapping is derived from imported rows before Apply.
- Confirm normalized category keys are case-insensitive and whitespace-safe.
- Confirm previewing an import never mutates server state.
- Confirm duplicate `_id` values are rejected before mutations.
- Confirm new categories appear automatically after successful menu reload.
- Confirm category filters are derived from menu items, not the standalone Categories API.
- Confirm menu-item image URLs use the existing backend Cloudinary flow.
- Confirm no Cloudinary credentials are exposed in frontend code.
- Confirm Master Admin reloads server state after bulk completion.
- Confirm franchise-specific disable state is not overwritten by the frontend bulk workflow.
- Confirm no backend schema/controller changes were introduced in this step.

## Acceptance criteria

- Bulk Excel/JSON imports provide a clear preflight dynamic category mapping preview.
- New categories in imported menu data automatically become available as Menu Management filters after Apply and reload.
- Category names with case/whitespace differences resolve to one filter category.
- Duplicate IDs are rejected before mutation.
- Existing ADD/UPDATE/DELETE and manual CRUD workflows remain functional.
- Menu images can be supplied by file upload or HTTP/HTTPS URL and URL images use the existing backend Cloudinary path.
- No unsupported category-image persistence is falsely represented; that capability remains isolated for a future backend step.
