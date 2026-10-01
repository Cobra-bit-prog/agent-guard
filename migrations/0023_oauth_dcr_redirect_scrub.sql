-- Scrub OAuth clients that can receive an authorization code on an
-- attacker-controlled https callback.
--
-- Allowlist matches isAllowedRedirectUri in src/lib/oauth/protocol.ts:
--   https://claude.ai/api/mcp/auth_callback
--   https://claude.ai:443/api/mcp/auth_callback   (same origin, default port)
--   http://localhost[:port][/path][?query]
--   http://127.0.0.1[:port][/path][?query]
-- Port is 1-65535 with no leading zero. No userinfo and no fragment.
-- Arbitrary https is outside the allowlist.
--
-- Also deletes the named probe/reporter clients even if a redirect would match,
-- plus their auth codes and access/refresh token rows.
-- Safe to re-run: a client id that is already gone is a no-op.

create temporary table oauth_clients_revoke (client_id text primary key) on commit drop;

insert into oauth_clients_revoke (client_id)
select c.client_id
from oauth_clients c
where c.client_id in (
    'oc_1bU6z8SaoeoRlStOJl0oTrWwwP-CnlWYmJNUYx2kwws',
    'oc_dmurdNaX9cvvH8Q1iidwwgOIA27OTihm',
    'oc_eHzS8tel4nLCf6ubDGRONJFuTuAO3Ygf'
  )
  or jsonb_typeof(c.redirect_uris) is distinct from 'array'
  or jsonb_array_length(c.redirect_uris) = 0
  or exists (
    select 1
    from jsonb_array_elements_text(c.redirect_uris) as u(uri)
    where not (
      lower(u.uri) in (
        'https://claude.ai/api/mcp/auth_callback',
        'https://claude.ai:443/api/mcp/auth_callback'
      )
      or (
        lower(u.uri) ~ '^http://(localhost|127\.0\.0\.1)(:[0-9]{1,5})?(/[^[:space:]#?]*)?(\?[^[:space:]#]*)?$'
        and (
          substring(lower(u.uri) from '^http://[^/?#]+:([0-9]{1,5})') is null
          or (
            substring(lower(u.uri) from '^http://[^/?#]+:([0-9]{1,5})') !~ '^0'
            and substring(lower(u.uri) from '^http://[^/?#]+:([0-9]{1,5})')::int between 1 and 65535
          )
        )
      )
    )
  );

delete from oauth_access_tokens
where client_id in (select client_id from oauth_clients_revoke);

delete from oauth_auth_codes
where client_id in (select client_id from oauth_clients_revoke);

delete from oauth_clients
where client_id in (select client_id from oauth_clients_revoke);
