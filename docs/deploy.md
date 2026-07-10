# build.one.web — Production Deploy

The React SPA is hosted on **Azure Static Web Apps (Free SKU)** in the same
resource group as the API. Manual `swa deploy` from a local build; no
GitHub Actions yet. Mirrors the API repo's manual-CLI deploy style.

## Resources

| Thing | Value |
|---|---|
| Subscription | `bchristopher_subscription` (`c1767ed0-339f-4d5c-a0da-0d578bdb9972`) |
| Resource group | `buildone_group` |
| SWA name | `buildone-web` |
| SWA region | `eastus2` (metadata only — content served from global CDN) |
| SKU | Free ($0/mo, supports up to 2 custom domains + free TLS) |
| Default hostname | `witty-plant-04f092d0f.7.azurestaticapps.net` |
| Production hostname | `https://app.bld-one.com` |
| DNS provider | Squarespace Domains (registrar + DNS) |

## Routine deploy

From `build.one.web/`:

```bash
# 1. Build dist/
npm run build

# 2. Capture deployment token (don't echo it)
SWA_DEPLOYMENT_TOKEN=$(az staticwebapp secrets list \
  --name buildone-web --resource-group buildone_group \
  --query "properties.apiKey" -o tsv)

# 3. Deploy
npx --yes @azure/static-web-apps-cli deploy ./dist \
  --deployment-token "$SWA_DEPLOYMENT_TOKEN" \
  --env production
```

Deploy is content-only — no DNS, cert, or hostname work. Takes ~30s.

Verify:

```bash
curl -sI https://app.bld-one.com | head -3
```

## CORS gotcha

The API allows web origins via the `CORS_ALLOW_ORIGINS` App Service setting
on `buildone` / `buildone_group`. If you add a new web hostname (staging,
preview env, custom domain rename), update the setting:

```bash
az webapp config appsettings set \
  --name buildone --resource-group buildone_group \
  --settings "CORS_ALLOW_ORIGINS=https://app.bld-one.com,..."
```

Current value (last known): `https://app.bld-one.com,https://witty-plant-04f092d0f.7.azurestaticapps.net,http://localhost:3000,http://127.0.0.1:3000`

The App Service auto-recycles on settings change (~5–10s blip for in-flight
requests). The web app uses Bearer-token auth from localStorage, so no
cookie or CSRF dance is involved.

## Custom domain + cert

Currently `app.bld-one.com` is bound and serves a Let's Encrypt cert
auto-issued by Azure. Setup was:

1. Create CNAME in Squarespace (DNS Settings → Custom records):
   - Type: `CNAME`, Name: `app`, Data: `witty-plant-04f092d0f.7.azurestaticapps.net`, TTL: 1 hr
2. Bind hostname (validates via CNAME, kicks off cert issuance — 5–30 min):
   ```bash
   az staticwebapp hostname set \
     --name buildone-web --resource-group buildone_group \
     --hostname app.bld-one.com --validation-method cname-delegation
   ```
3. Status command (look for `"status": "Ready"`):
   ```bash
   az staticwebapp show \
     --name buildone-web --resource-group buildone_group \
     --query "customDomains"
   ```

## www / apex forwarding

Handled at Squarespace, not in Azure:

- **Squarespace → Website → Domain Forwarding** (not under DNS):
  - `www` → `https://app.bld-one.com` (301 Permanent, Do not forward paths)
  - `@` (apex) → `https://www.bld-one.com` (301 Permanent, Do not forward paths)

The default "Squarespace Defaults" DNS preset must be **deleted** before
the apex forwarding rule will save (its A records and www CNAME conflict
with the forwarder). Keep the "Email Security" preset (SPF/DMARC/DKIM
records that block spoofing of `bld-one.com`).

## Rollback

To revert to a prior deploy, rebuild the desired commit and re-run the
deploy command. SWA doesn't have a built-in "previous version" feature on
the Free tier; the source-of-truth is git.

```bash
git checkout <sha>
npm run build
# ...then the standard deploy block above
```

## Provisioning from scratch

If the SWA ever has to be recreated:

```bash
az staticwebapp create \
  --name buildone-web --resource-group buildone_group \
  --location eastus2 --sku Free
```

Then re-run the custom-domain steps above. The default hostname will
change (a new `*.azurestaticapps.net` URL) — update the Squarespace CNAME
and the API's `CORS_ALLOW_ORIGINS` accordingly.

## What's parked (Option B trim)

The repo contains ~32 entity-page folders that are excluded from
`tsc -b` via `tsconfig.app.json` and unreachable from `App.tsx` routes —
Vite won't bundle them. To re-incorporate a page:

1. Remove its glob from `tsconfig.app.json` `exclude`
2. Add its imports + routes back to `src/App.tsx`
3. If it should appear in the sidebar, add a `NavLink` to `src/layout/Sidebar.tsx`
4. Rebuild + redeploy

The Build.One agent tray under `src/agents/**` follows the same pattern.

## Useful one-liners

```bash
# Show all CORS-related app settings
az webapp config appsettings list --name buildone --resource-group buildone_group \
  --query "[?contains(name, 'CORS')]"

# Show the SWA's custom domain status
az staticwebapp show --name buildone-web --resource-group buildone_group \
  --query "customDomains" -o json

# Tail recent SWA hostname events (if cert ever fails to issue)
az staticwebapp show --name buildone-web --resource-group buildone_group \
  --query "{state:provisioningState, customDomains:customDomains}"
```
