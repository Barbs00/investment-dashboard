// api/technical.js
// Reads Alpha Vantage key from Vercel env vars — no client input needed

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { ticker } = req.query;
  // Key comes from Vercel env var — never from client
  const AV_KEY = process.env.ALPHA_VANTAGE_KEY;

  if (!ticker) return res.status(400).json({ error: 'ticker required' });
  if (!AV_KEY) return res.status(200).json({
    success: false,
    noKey: true,
    message: 'ALPHA_VANTAGE_KEY no configurada en Vercel Environment Variables'
  });

  const base = 'https://www.alphavantage.co/query';

  try {
    // Quote + SMA200 en paralelo (2 llamadas)
    const [quoteRes, sma200Res] = await Promise.all([
      fetch(`${base}?function=GLOBAL_QUOTE&symbol=${ticker}&apikey=${AV_KEY}`),
      fetch(`${base}?function=SMA&symbol=${ticker}&interval=daily&time_period=200&series_type=close&apikey=${AV_KEY}`),
    ]);
    const [quoteData, sma200Data] = await Promise.all([quoteRes.json(), sma200Res.json()]);

    const quote = quoteData['Global Quote'];
    if (!quote?.['05. price']) {
      return res.status(200).json({ success: false, error: 'Ticker no encontrado o límite de API alcanzado (25/día en tier gratis)' });
    }

    // Small delay to stay within 5 req/min
    await new Promise(r => setTimeout(r, 250));

    // SMA50 + RSI en paralelo
    const [sma50Res, rsiRes] = await Promise.all([
      fetch(`${base}?function=SMA&symbol=${ticker}&interval=daily&time_period=50&series_type=close&apikey=${AV_KEY}`),
      fetch(`${base}?function=RSI&symbol=${ticker}&interval=daily&time_period=14&series_type=close&apikey=${AV_KEY}`),
    ]);
    const [sma50Data, rsiData] = await Promise.all([sma50Res.json(), rsiRes.json()]);

    const price   = parseFloat(quote['05. price']);
    const change  = parseFloat(quote['09. change']);
    const changePct = parseFloat(quote['10. change percent']?.replace('%', ''));
    const volume  = parseInt(quote['06. volume']);
    const prevClose = parseFloat(quote['08. previous close']);

    const s200v = sma200Data['Technical Analysis: SMA'];
    const s50v  = sma50Data['Technical Analysis: SMA'];
    const rsiv  = rsiData['Technical Analysis: RSI'];

    const sma200 = s200v ? parseFloat(Object.values(s200v)[0]['SMA']) : null;
    const sma50  = s50v  ? parseFloat(Object.values(s50v)[0]['SMA'])  : null;
    const rsi    = rsiv  ? parseFloat(Object.values(rsiv)[0]['RSI'])  : null;

    const aboveSMA200 = sma200 ? price > sma200 : null;
    const aboveSMA50  = sma50  ? price > sma50  : null;
    const rsiOk       = rsi    ? rsi >= 50 && rsi <= 70 : null;

    let techScore = 50;
    if (aboveSMA200 === true)  techScore += 20;
    if (aboveSMA200 === false) techScore -= 20;
    if (aboveSMA50  === true)  techScore += 10;
    if (aboveSMA50  === false) techScore -= 10;
    if (rsiOk === true)        techScore += 15;
    if (rsi > 70)              techScore -= 10;
    if (rsi < 40)              techScore -= 15;
    techScore = Math.max(0, Math.min(100, techScore));

    res.status(200).json({
      success: true,
      ticker: ticker.toUpperCase(),
      source: 'alpha_vantage',
      data: {
        price, change, changePct, volume, prevClose,
        sma200, sma50, rsi,
        aboveSMA200, aboveSMA50, rsiOk,
        techScore,
        fetchedAt: new Date().toISOString(),
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}
