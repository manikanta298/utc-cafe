# Master Menu Bulk Update — Test Cases

Scope: `frontend/src/pages/master/MasterMenuPage.jsx` only. These cases cover the Master Admin Excel/JSON workflow, existing manual CRUD, validation, franchise propagation, and regression risks.

## Functional tests

| ID | Scenario | Steps | Expected |
|---|---|---|---|
| MM-001 | Open bulk tool | Master Admin → Menu Management → Bulk Excel / JSON | Modal opens without affecting existing menu list. |
| MM-002 | Download Excel | Open bulk tool → Download Excel | `.xlsx` downloads and contains one `Menu` sheet with the documented columns. |
| MM-003 | Download JSON | Open bulk tool → Download JSON | Valid JSON array downloads; each row contains `_id` and `operation: UPDATE`. |
| MM-004 | Excel round trip | Download Excel → change one price → upload | File parses, row previews, validation passes, and update is applied. |
| MM-005 | JSON round trip | Download JSON → change one description → upload | JSON parses and the item is updated. |
| MM-006 | ADD row | Add a valid row with blank `_id` and `operation=ADD` | New menu item is created. |
| MM-007 | UPDATE row | Existing `_id`, `operation=UPDATE`, changed fields | Existing item is updated; its existing image remains unchanged. |
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

## Cross-role propagation tests

| ID | Scenario | Expected |
|---|---|---|
| FR-001 | Bulk update active item | Franchise-facing menu/POS retrieves the updated item and price through the existing `/menu` data path. |
| FR-002 | Bulk deactivate item | Franchise-facing menu/POS no longer exposes the item because existing backend filtering uses `isGlobalActive`. |
| FR-003 | Bulk add item | New active item becomes available to franchise-facing menu/POS after reload. |
| FR-004 | Bulk delete item | Deleted item is absent from franchise-facing menu/POS after reload. |
| FR-005 | Existing franchise override | Global bulk update does not erase `disabledInFranchises`; franchise-specific availability remains intact. |
| FR-006 | Real-time POS refresh | For updates that trigger the existing `menu:globalUpdate` event, open POS screens refresh their menu. |

## Security and regression tests

| ID | Scenario | Expected |
|---|---|---|
| SEC-001 | Non-Master Admin opens page | Existing route/authorization rules prevent unauthorized access. |
| SEC-002 | Non-Master Admin submits API | Existing backend authorization rejects create/update/delete. |
| SEC-003 | XSS strings in spreadsheet | Text is rendered as React text, not executable HTML. |
| SEC-004 | Large sheet | Preview is capped to the first 100 rows while all validated rows remain eligible for Apply. |
| SEC-005 | Refresh after import | Master list is reloaded from `/menu/all`, so UI reflects persisted server state. |
| SEC-006 | Existing architecture | No backend model, route, controller, package manifest, or global layout file is changed by this feature. |

## Acceptance criteria

- Master Admin can download current menu data as Excel and JSON.
- Master Admin can upload Excel or JSON and preview/validate changes before applying them.
- ADD, UPDATE, and DELETE operations are supported.
- Existing manual add/edit/delete/toggle functionality remains available.
- Bulk operations use the existing protected menu APIs, so authorization and franchise propagation stay within the existing architecture.
- Failed rows are reported without hiding successful operations.
- No files outside `frontend/src/pages/master/` are modified for this feature.
