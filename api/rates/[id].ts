/**
 * Proxies HDB's application-rate JSON for the app's live ballot odds (src/engine/liveRates.ts):
 * GET /api/rates/BTO202611 → services-homes.hdb.gov.sg/sales/files/apprates/BTO202611.json.
 * HDB sends no CORS headers, so the browser can't fetch its file directly. Cached on Vercel's
 * CDN for 10 minutes — HDB only updates the counts a few times a day.
 */
export async function GET(request: Request): Promise<Response> {
  const id = new URL(request.url).pathname.split('/').pop()?.toUpperCase() ?? ''
  if (!/^(BTO|SBF)\d{6}$/.test(id)) return Response.json({ error: 'bad launch id' }, { status: 400 })
  let res: Response
  try {
    res = await fetch(`https://services-homes.hdb.gov.sg/sales/files/apprates/${id}.json`, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; bto-money-timeline rates proxy)' },
      redirect: 'manual', // HDB 302-redirects a missing file to its error page
    })
  } catch {
    return Response.json({ error: 'HDB not reachable' }, { status: 502 })
  }
  if (!res.ok) return Response.json({ error: 'not published' }, { status: 404 })
  return new Response(await res.text(), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=600, stale-while-revalidate=600',
    },
  })
}
