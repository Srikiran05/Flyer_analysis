-- ============================================================
-- SECURE THE profiles VIEW
--
-- public.profiles is a view over client_users LEFT JOIN permissions
-- with no per-user filter. By default views execute with the OWNER's
-- privileges (postgres), which bypasses RLS on the base tables — so
-- any authenticated user could read every user's role and permission
-- flags through it.
--
-- Fix: run the view with the CALLER's privileges (security_invoker,
-- Postgres 15+). Then the RLS policies on client_users (own row by
-- email, added in 20260711_lockdown_anon_access.sql) and on
-- permissions (added below) apply, and each user sees only their own
-- profile row.
-- ============================================================

ALTER VIEW public.profiles SET (security_invoker = true);

-- The view's LEFT JOIN reads permissions, so with security_invoker the
-- caller needs SELECT privilege + an RLS policy scoped to their own row.
REVOKE ALL ON public.permissions FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.permissions FROM authenticated;
GRANT SELECT ON public.permissions TO authenticated;

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read their own permissions" ON public.permissions;
CREATE POLICY "Users can read their own permissions"
    ON public.permissions
    FOR SELECT
    TO authenticated
    USING (
        client_user_id IN (
            SELECT id FROM public.client_users
            WHERE email = (auth.jwt() ->> 'email')
        )
    );

-- Make sure the caller can still read the view and its base table
-- (writes were already revoked in the lockdown migration; RLS on
-- client_users limits reads to the caller's own row).
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.client_users TO authenticated;
