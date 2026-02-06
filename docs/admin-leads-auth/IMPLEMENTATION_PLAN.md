# Implementation Plan: Admin Leads Authentication Fix

## Overview

The admin CRM UI cannot access leads functionality because the leads API (`/api/v1/leads/*`) requires API key authentication while the admin UI uses session-based authentication. This plan creates admin-specific leads endpoints that use session authentication.

## Related Specification Files

- [authentication.md](./authentication.md) - Authentication flow and middleware details
- [api-endpoints.md](./api-endpoints.md) - Complete API endpoint specifications
- [frontend-integration.md](./frontend-integration.md) - Frontend hook modifications
- [data-models.md](./data-models.md) - Database schema and types

---

## Phase 1: Backend Admin Leads API (MVP) ✅ COMPLETE

### Dependencies
- None (builds on existing infrastructure)

### Step-by-Step Checklist

- [x] **1.1** Create `packages/crm/src/routes/admin/leads.ts`
  - [x] Import required dependencies (Hono, Drizzle, middleware, validation)
  - [x] Apply `requireAuth` middleware to all routes
  - [x] Implement `GET /` - List leads with pagination, filtering, search
  - [x] Implement `GET /:id` - Get single lead with activities
  - [x] Implement `POST /` - Create new lead
  - [x] Implement `PATCH /:id` - Update lead
  - [x] Implement `DELETE /:id` - Delete lead
  - [x] Implement `POST /:id/activities` - Add activity to lead
  - [x] Implement `POST /parse` - AI-powered lead parsing

- [x] **1.2** Export from admin routes index
  - [x] Add export to `packages/crm/src/routes/admin/index.ts`

- [x] **1.3** Register route in application
  - [x] Add route registration in `packages/crm/src/app.ts` at `/api/admin/leads`

- [x] **1.4** Write unit tests
  - [x] Created `packages/crm/src/routes/admin/leads.test.ts`
  - [x] Test authentication requirements (session, CSRF header)
  - [x] Test validation error handling
  - [x] Test invalid UUID handling
  - [x] All 15 tests passing

### Testing Strategy - Phase 1

```bash
# Run unit tests
npm run test -w @octatech/crm -- src/routes/admin/leads.test.ts
```

- [x] Test authentication rejection without session
- [x] Test create lead with invalid data (validation error)
- [x] Test invalid UUID returns 404

---

## Phase 2: Frontend Integration ✅ COMPLETE

### Dependencies
- Phase 1 must be complete (backend endpoints available)

### Step-by-Step Checklist

- [x] **2.1** Update `packages/crm/admin/src/hooks/useLeads.ts`
  - [x] Change `useLeads` hook: `/v1/leads` → `/admin/leads`
  - [x] Change `useLead` hook: `/v1/leads/:id` → `/admin/leads/:id`
  - [x] Change `useCreateLead` hook: `/v1/leads` → `/admin/leads`
  - [x] Change `useUpdateLead` hook: `/v1/leads/:id` → `/admin/leads/:id`
  - [x] Change `useDeleteLead` hook: `/v1/leads/:id` → `/admin/leads/:id`
  - [x] Change `useAddActivity` hook: `/v1/leads/:id/activities` → `/admin/leads/:id/activities`
  - [x] Change `useParseLead` hook: `/v1/leads/parse` → `/admin/leads/parse`

- [x] **2.2** Fix response type handling
  - [x] Update `useLeads` to handle `{ data: Lead[], pagination: {...} }` response
  - [x] Update `useLead` to handle `{ data: LeadWithActivities }` response

- [x] **2.3** Fix bug in LeadAIPage.tsx (discovered during implementation)
  - [x] Fixed incorrect access to `result.parsed.confidence` → `result.confidence`
  - [x] Fixed incorrect access to `result.parsed.extractedFields` → `result.extractedFields`

### Testing Strategy - Phase 2

- [ ] Start dev servers: `npm run dev:crm` and `npm run dev:admin`
- [ ] Login to admin UI at `http://localhost:5173`
- [ ] Navigate to Leads page - verify leads load
- [ ] Test search functionality
- [ ] Test status filter dropdown
- [ ] Test pagination (if enough leads exist)
- [ ] Test "Add Lead" form
- [ ] Test "AI Add" parsing feature
- [ ] Test clicking on a lead to view details
- [ ] Test editing a lead
- [ ] Test changing lead status (verify activity is logged)
- [ ] Test adding a note/activity to a lead
- [ ] Test deleting a lead

### Verification
- [x] Admin UI builds successfully (TypeScript compiles with no errors)
- [x] All 1112 tests pass (28 test files)

---

## Phase 3: Testing & Validation

### Dependencies
- Phase 1 and Phase 2 complete

### Step-by-Step Checklist

- [x] **3.1** Write integration tests for admin leads routes (DONE IN PHASE 1)
  - [x] Create `packages/crm/src/routes/admin/leads.test.ts`
  - [x] Test authentication requirements
  - [x] Test validation error responses
  - [ ] Test webhook triggering on lead changes (requires DB integration tests)

- [ ] **3.2** End-to-end validation
  - [ ] Deploy to staging environment
  - [ ] Test full workflow: login → view leads → create lead → update → delete
  - [ ] Verify webhook delivery on lead events
  - [ ] Verify dashboard stats reflect lead changes

### Testing Strategy - Phase 3

```bash
# Run all CRM tests
npm run test -w @octatech/crm

# Run with coverage
npm run test -w @octatech/crm -- --coverage
```

---

## Phase 4: Documentation & Cleanup (Polish)

### Dependencies
- Phase 3 complete

### Step-by-Step Checklist

- [ ] **4.1** Update API documentation
  - [ ] Document admin leads endpoints in README or API docs
  - [ ] Note the distinction between `/api/v1/leads` (external) and `/api/admin/leads` (admin UI)

- [ ] **4.2** Code cleanup
  - [ ] Remove any debug logging
  - [ ] Ensure consistent error messages
  - [ ] Verify TypeScript types are complete

- [ ] **4.3** Delete these spec files (optional)
  - [ ] Remove `docs/admin-leads-auth/` after implementation complete

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking external API | High | Admin endpoints are separate; `/api/v1/leads` unchanged |
| Session expiry during long operations | Low | Frontend already handles 401 with redirect to login |
| Webhook duplication | Medium | Admin routes use same webhook triggers as v1 API |
| Performance on large lead lists | Low | Pagination already implemented; same queries as v1 |

---

## Rollback Plan

If issues are discovered post-deployment:

1. Revert frontend changes (switch hooks back to `/v1/leads`)
2. Remove admin leads route registration from `app.ts`
3. The backend route file can remain (unused code, no impact)

---

## Success Criteria

1. Admin user can login and view leads list
2. Admin user can create, read, update, delete leads
3. Admin user can add activities to leads
4. Admin user can use AI parsing feature
5. All existing `/api/v1/leads` functionality unchanged for external integrations
6. All tests pass
7. No authentication errors in browser console
