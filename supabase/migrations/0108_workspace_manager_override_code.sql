-- Manager override code: a shared, rotatable code that owner/admin sets in
-- Settings, replacing the named-manager-username+PIN approval flow for
-- refunds, void orders, and item cancellations (all funnel through
-- manager-approval-verify). Lets any on-duty staff member unlock these
-- actions without needing a second named person's login credentials
-- physically present. Write-only from the client's perspective — never
-- echoed back once set, same pattern as a password reset (see
-- supabase/functions/workspace-approval-code).
alter table workspaces add column if not exists manager_override_code text;
