/**
 * The UpScout bridge: connect it to Upwork once, then Refresh works forever.
 *
 * Two problems stand between a page in your browser and Upwork's job search,
 * and this worker solves both:
 *
 *  1. A browser may only fetch from a server that permits it, and neither
 *     upwork.com nor api.upwork.com does. A server has no such rule.
 *  2. Upwork's API is OAuth2. Access tokens last a day and refresh tokens
 *     rotate, so something has to hold them and quietly renew them. That's
 *     what this does — you authorise once, in a browser, and the worker keeps
 *     the connection alive from then on.
 *
 * Deploy it, open its URL, press "Connect Upwork", and paste the URL it shows
 * you into UpScout. After that there is nothing to copy, paste or re-authorise
 * — the app's Refresh button talks to /jobs and gets live postings.
 *
 * Endpoints:
 *   GET  /            a small page: connection status and the Connect button
 *   GET  /connect     starts the Upwork authorisation
 *   GET  /callback    where Upwork returns; stores the tokens
 *   GET  /status      { connected, expiresAt } — what the app polls
 *   GET  /jobs        { jobs: [...] } — live search, the app's Refresh
 *   POST /apply       501 by design; see the note at the bottom
 *
 * Setup is in README.md next to this file.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const TOKEN_URL = 'https://www.upwork.com/api/v3/oauth2/token'
const AUTHORIZE_URL = 'https://www.upwork.com/ab/account-security/oauth2/authorize'
const GRAPHQL_URL = 'https://api.upwork.com/graphql'

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } })

const html = (body, status = 200) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })

/** The shared secret the app sends, as a header or as ?key= on a link. */
function authorised(request, url, env) {
  if (!env.UPSCOUT_TOKEN) return true
  const header = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  return header === env.UPSCOUT_TOKEN || url.searchParams.get('key') === env.UPSCOUT_TOKEN
}

/* ---------------------------------------------------------------- tokens */

const load = (env) => env.UPSCOUT.get('tokens', 'json')

/**
 * Swaps a code or a refresh token for an access token.
 *
 * Upwork rotates refresh tokens: the response to a refresh contains a *new*
 * one and the old one stops working. Losing that response means re-authorising
 * by hand, which is exactly what this worker exists to avoid — so the result
 * is written back before it's used.
 */
async function exchange(env, params) {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.UPWORK_CLIENT_ID,
      client_secret: env.UPWORK_CLIENT_SECRET,
      ...params,
    }),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok || data.error) {
    throw Object.assign(new Error(data.error_description ?? data.error ?? `Upwork said ${response.status}`), {
      status: response.status === 400 ? 401 : 502,
    })
  }

  const tokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? params.refresh_token,
    expiresAt: Date.now() + (Number(data.expires_in) || 86_400) * 1000,
    connectedAt: new Date().toISOString(),
  }
  await env.UPSCOUT.put('tokens', JSON.stringify(tokens))
  return tokens
}

/** A live access token, renewed a minute before it expires. */
async function accessToken(env) {
  const stored = await load(env)
  if (!stored?.refreshToken) {
    throw Object.assign(new Error('Not connected to Upwork yet — open this worker in a browser and press Connect.'), {
      status: 409,
    })
  }
  if (stored.accessToken && Date.now() < stored.expiresAt - 60_000) return stored.accessToken
  const refreshed = await exchange(env, { grant_type: 'refresh_token', refresh_token: stored.refreshToken })
  return refreshed.accessToken
}

/* ------------------------------------------------------------- searching */

const SEARCH = `query JobSearch($filter: MarketplaceJobPostingsSearchFilter, $pagination: PaginationInput) {
  marketplaceJobPostingsSearch(
    marketPlaceJobFilter: $filter
    searchType: USER_JOBS_SEARCH
    sortAttributes: [{ field: RECENCY }]
  ) {
    edges {
      node {
        id
        title
        description
        ciphertext
        createdDateTime
        duration
        experienceLevel
        totalApplicants
        preferredFreelancerLocation
        amount { rawValue currency }
        hourlyBudgetMin { rawValue }
        hourlyBudgetMax { rawValue }
        skills { name }
        client {
          totalHires
          totalPostedJobs
          totalSpent { rawValue }
          totalFeedback
          verificationStatus
          location { country }
        }
      }
    }
  }
}`

const money = (value) => {
  const raw = value && typeof value === 'object' ? value.rawValue : value
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : undefined
}

/** One GraphQL node in the shape UpScout documents for a bridge. */
function toJob(node) {
  const client = node.client ?? {}
  const hourlyMin = money(node.hourlyBudgetMin)
  const hourlyMax = money(node.hourlyBudgetMax)
  const hourly = hourlyMin !== undefined || hourlyMax !== undefined

  return {
    id: node.ciphertext ?? node.id,
    title: node.title,
    description: node.description,
    url: node.ciphertext ? `https://www.upwork.com/jobs/${node.ciphertext}` : undefined,
    postedAt: node.createdDateTime,
    type: hourly ? 'hourly' : 'fixed',
    hourlyMin,
    hourlyMax,
    amount: hourly ? undefined : money(node.amount),
    currency: node.amount?.currency,
    skills: (node.skills ?? []).map((skill) => skill?.name).filter(Boolean),
    duration: node.duration,
    experienceLevel: typeof node.experienceLevel === 'string' ? node.experienceLevel.toLowerCase() : undefined,
    proposals: money(node.totalApplicants),
    client: {
      country: client.location?.country,
      paymentVerified:
        typeof client.verificationStatus === 'string' ? client.verificationStatus.toUpperCase() === 'VERIFIED' : undefined,
      rating: money(client.totalFeedback),
      totalSpend: money(client.totalSpent),
      hires: money(client.totalHires),
      jobsPosted: money(client.totalPostedJobs),
    },
  }
}

async function search(env, query, limit) {
  const token = await accessToken(env)
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      // Only some accounts need a tenant; it's harmless when set correctly.
      ...(env.UPWORK_TENANT_ID ? { 'X-Upwork-API-TenantId': env.UPWORK_TENANT_ID } : {}),
    },
    body: JSON.stringify({
      query: SEARCH,
      variables: {
        filter: { searchExpression_eq: query || undefined },
        pagination: { first: limit, after: '0' },
      },
    }),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw Object.assign(new Error(`Upwork API said ${response.status}`), { status: 502 })
  }
  if (data.errors?.length) {
    throw Object.assign(new Error(data.errors.map((error) => error.message).join('; ')), { status: 502 })
  }

  const edges = data.data?.marketplaceJobPostingsSearch?.edges ?? []
  return edges.map((edge) => edge?.node).filter(Boolean).map(toJob)
}

/* ------------------------------------------------------------------ page */

function setupPage(url, connected, tokenInQuery) {
  const base = `${url.origin}`
  const key = tokenInQuery ? `?key=${encodeURIComponent(tokenInQuery)}` : ''
  return html(`<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>UpScout bridge</title>
<style>
  body { font: 16px/1.6 ui-sans-serif, system-ui, -apple-system, sans-serif; background: #0b0e14; color: #e9edf5;
         margin: 0; padding: 32px 20px; display: flex; justify-content: center; }
  main { max-width: 34rem; }
  h1 { font-size: 20px; }
  code { background: #1c222d; padding: 2px 6px; border-radius: 6px; word-break: break-all; }
  .state { border-left: 3px solid ${connected ? '#4ade80' : '#fbbf24'}; background: #141922;
           padding: 12px 16px; border-radius: 8px; margin: 20px 0; }
  a.button { display: inline-block; background: #4cc2ff; color: #05121b; font-weight: 650;
             padding: 12px 20px; border-radius: 10px; text-decoration: none; }
</style></head>
<body><main>
  <h1>UpScout bridge</h1>
  <div class="state">${connected ? 'Connected to Upwork. Nothing else to do.' : 'Not connected to Upwork yet.'}</div>
  <p><a class="button" href="${base}/connect${key}">${connected ? 'Reconnect' : 'Connect Upwork'}</a></p>
  <h2>In the app</h2>
  <p>UpScout → You → Sources → add a source of kind <strong>UpScout bridge</strong> with this URL:</p>
  <p><code>${base}</code></p>
  <p>Then press Refresh whenever you like.</p>
</main></body></html>`)
}

/* ----------------------------------------------------------------- routes */

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS })

    const url = new URL(request.url)
    const path = url.pathname.replace(/\/+$/, '') || '/'

    if (!env.UPWORK_CLIENT_ID || !env.UPWORK_CLIENT_SECRET) {
      return json({ error: 'UPWORK_CLIENT_ID and UPWORK_CLIENT_SECRET are not set on this worker.' }, 500)
    }

    // The callback comes from Upwork, which knows nothing of our own secret;
    // it carries the one-time state instead.
    if (path !== '/callback' && !authorised(request, url, env)) return json({ error: 'Unauthorized' }, 401)

    try {
      switch (path) {
        case '/': {
          const stored = await load(env)
          return setupPage(url, Boolean(stored?.refreshToken), url.searchParams.get('key') ?? '')
        }

        case '/connect': {
          // The state ties this redirect to the callback that follows, so
          // somebody else's callback can't plant tokens in your worker.
          const state = crypto.randomUUID()
          await env.UPSCOUT.put(`state:${state}`, '1', { expirationTtl: 600 })
          const redirect = new URL(AUTHORIZE_URL)
          redirect.searchParams.set('response_type', 'code')
          redirect.searchParams.set('client_id', env.UPWORK_CLIENT_ID)
          redirect.searchParams.set('redirect_uri', `${url.origin}/callback`)
          redirect.searchParams.set('state', state)
          return Response.redirect(redirect.toString(), 302)
        }

        case '/callback': {
          const code = url.searchParams.get('code')
          const state = url.searchParams.get('state')
          if (!code || !state) return html('<p>Upwork did not send a code. Start again from the worker home page.</p>', 400)
          const pending = await env.UPSCOUT.get(`state:${state}`)
          if (!pending) return html('<p>That link has expired. Start again from the worker home page.</p>', 400)
          await env.UPSCOUT.delete(`state:${state}`)

          await exchange(env, {
            grant_type: 'authorization_code',
            code,
            redirect_uri: `${url.origin}/callback`,
          })
          return html(
            `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1" />
             <body style="font: 16px/1.6 system-ui; background:#0b0e14; color:#e9edf5; padding:32px">
             <h1>Connected</h1><p>Go back to UpScout and press Refresh. You won't need to do this again.</p></body>`,
          )
        }

        case '/status': {
          const stored = await load(env)
          return json({
            connected: Boolean(stored?.refreshToken),
            connectedAt: stored?.connectedAt,
            expiresAt: stored?.expiresAt ? new Date(stored.expiresAt).toISOString() : undefined,
            connectUrl: `${url.origin}/connect`,
          })
        }

        case '/jobs': {
          const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50))
          const jobs = await search(env, url.searchParams.get('q') ?? env.DEFAULT_QUERY ?? '', limit)
          return json({ jobs, fetchedAt: new Date().toISOString() })
        }

        case '/disconnect': {
          await env.UPSCOUT.delete('tokens')
          return json({ connected: false })
        }

        case '/apply':
          // Upwork publishes no endpoint that submits a proposal. Automating
          // one is a decision about your own account and Upwork's terms, so
          // it isn't something to inherit from a template: UpScout's manual
          // send (letter copied, apply page opened) is the default, and this
          // stays a stub unless you deliberately replace it.
          return json({ error: 'This bridge does not submit proposals.' }, 501)

        default:
          return json({ error: 'Not found' }, 404)
      }
    } catch (error) {
      return json({ error: error.message ?? String(error) }, error.status ?? 500)
    }
  },
}
