// api/dataroma.js — Superinversores (Dataroma, sin key)
// Scrapea dataroma.com: Grand Portfolio (top holdings por nº de superinversores)
// y Top buys del último trimestre. Dato trimestral → cache CDN de 24h.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const stripTags = (s) => (s || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

// Extrae {ticker, name} de cada link a stock.php?sym=XXX dentro de un fragmento HTML.
// El texto del link en Dataroma suele ser "SYM - Company Name".
const extractStocks = (html, max = 30) => {
  const out = [];
  const seen = new Set();
  const re = /<a[^>]+href="[^"]*stock\.php\?sym=([A-Za-z0-9.\-]+)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < max) {
    const ticker = m[1].toUpperCase();
    if (seen.has(ticker)) continue;
    seen.add(ticker);
    let name = stripTags(m[2]);
    // "AAPL - Apple Inc." → "Apple Inc."
    const dash = name.indexOf(' - ');
    if (dash > -1) name = name.slice(dash + 3);
    out.push({ ticker, name: name || ticker });
  }
  return out;
};

// Grand Portfolio: intenta además capturar el nº de superinversores que tienen cada acción.
const parseGrandPortfolio = (html) => {
  // Acotar a la tabla principal si existe (id="grid"), si no usar todo el documento
  const gridMatch = html.match(/<table[^>]*id="grid"[^>]*>([\s\S]*?)<\/table>/i);
  const scope = gridMatch ? gridMatch[1] : html;

  const holdings = [];
  const seen = new Set();
  const rows = scope.split(/<tr[^>]*>/i).slice(1);
  for (const row of rows) {
    const symMatch = row.match(/stock\.php\?sym=([A-Za-z0-9.\-]+)/i);
    if (!symMatch) continue;
    const ticker = symMatch[1].toUpperCase();
    if (seen.has(ticker)) continue;

    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(c => stripTags(c[1]));
    const linkMatch = row.match(/<a[^>]+stock\.php\?sym=[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    let name = stripTags(linkMatch?.[1] || '');
    const dash = name.indexOf(' - ');
    if (dash > -1) name = name.slice(dash + 3);

    // Heurística: primer entero "suelto" después de la celda del símbolo = nº de gestores
    // (se salta la primera celda, que es el rank de la fila)
    let holders = null;
    const symIdx = cells.findIndex(c => c.toUpperCase().startsWith(ticker));
    for (let i = Math.max(1, symIdx + 1); i < cells.length; i++) {
      if (/^\d{1,3}$/.test(cells[i])) { holders = parseInt(cells[i]); break; }
    }

    seen.add(ticker);
    holdings.push({ rank: holdings.length + 1, ticker, name: name || ticker, holders });
    if (holdings.length >= 25) break;
  }
  // Fallback si el formato de tabla cambió: al menos devolver los links
  return holdings.length ? holdings
    : extractStocks(scope, 25).map((s, i) => ({ rank: i + 1, ...s, holders: null }));
};

// Home: sección "Top 10 buys" del último trimestre
const parseTopBuys = (html) => {
  const idx = html.search(/Top\s*10\s*buys/i);
  if (idx === -1) return extractStocks(html, 10);
  // Desde el heading hasta la próxima sección "Top 10 ..." (p.ej. sells) o fin
  const rest = html.slice(idx + 12);
  const next = rest.search(/Top\s*10\s*/i);
  const segment = next > -1 ? rest.slice(0, next) : rest;
  return extractStocks(segment, 10);
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const headers = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.dataroma.com/m/home.php',
  };

  try {
    const [grandRes, homeRes] = await Promise.allSettled([
      fetch('https://www.dataroma.com/m/g/portfolio.php?L=1', { headers, signal: AbortSignal.timeout(9000) }),
      fetch('https://www.dataroma.com/m/home.php',            { headers, signal: AbortSignal.timeout(9000) }),
    ]);

    const grandHtml = grandRes.status === 'fulfilled' && grandRes.value.ok ? await grandRes.value.text() : '';
    const homeHtml  = homeRes.status  === 'fulfilled' && homeRes.value.ok  ? await homeRes.value.text()  : '';

    const topHoldings = grandHtml ? parseGrandPortfolio(grandHtml) : [];
    const topBuys     = homeHtml  ? parseTopBuys(homeHtml)         : [];

    if (!topHoldings.length && !topBuys.length) {
      return res.status(200).json({
        success: false,
        error: 'Dataroma no devolvió datos (posible cambio de HTML o bloqueo)',
      });
    }

    // Dato trimestral (13F) — cachear en CDN 24h
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=43200');
    res.status(200).json({
      success: true,
      data: {
        topHoldings,
        topBuys,
        source: 'dataroma.com',
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (e) {
    res.status(200).json({ success: false, error: e.message });
  }
}
