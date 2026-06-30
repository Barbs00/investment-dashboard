// api/technical.js
// Deep technical analysis for a single ticker via Alpha Vantage

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { ticker } = req.query;
  const AV_KEY = process.env.ALPHA_VANTAGE_KEY || req.headers['x-av-key'];

  if (!ticker) return res.status(400).json({ error: 'ticker required' });
  if (!AV_KEY) return res.status(400).json({ error: 'Alpha Vantage key required' });

  const base = `https://www.alphavantage.co/query`;

  try {
    // Sequential to respect rate limits (5/min free tier)
    const quoteRes = await fetch(`${base}?function=GLOBAL_QUOTE&symbol=${ticker}&apikey=${AV_KEY}`);
    const quoteData = await quoteRes.json();
    const quote = quoteData['Global Quote'];

    if (!quote || !quote['05. price']) {
      return res.status(404).json({ error: 'Ticker not found or API limit reached' });
    }

    // Small delay to respect rate limit
    await new Promise(r => setTimeout(r, 300));

    const [sma200Res, sma50Res] = await Promise.all([
      fetch(`${base}?function=SMA&symbol=${ticker}&interval=daily&time_period=200&series_type=close&apikey=${AV_KEY}`),
      fetch(`${base}?function=SMA&symbol=${ticker}&interval=daily&time_period=50&series_type=close&apikey=${AV_KEY}`),
    ]);

    await new Promise(r => setTimeout(r, 300));

    const [rsiRes, macdRes] = await Promise.all([
      fetch(`${base}?function=RSI&symbol=${ticker}&interval=daily&time_period=14&series_type=close&apikey=${AV_KEY}`),
      fetch(`${base}?function=MACD&symbol=${ticker}&interval=daily&series_type=close&apikey=${AV_KEY}`),
    ]);

    const [sma200Data, sma50Data, rsiData, macdData] = await Promise.all([
      sma200Res.json(), sma50Res.json(), rsiRes.json(), macdRes.json()
    ]);

    const price = parseFloat(quote['05. price']);
    const change = parseFloat(quote['09. change']);
    const changePct = parseFloat(quote['10. change percent']?.replace('%', ''));
    const volume = parseInt(quote['06. volume']);

    const sma200Vals = sma200Data['Technical Analysis: SMA'];
    const sma50Vals  = sma50Data['Technical Analysis: SMA'];
    const rsiVals    = rsiData['Technical Analysis: RSI'];
    const macdVals   = macdData['Technical Analysis: MACD'];

    const sma200 = sma200Vals ? parseFloat(Object.values(sma200Vals)[0]['SMA']) : null;
    const sma50  = sma50Vals  ? parseFloat(Object.values(sma50Vals)[0]['SMA'])  : null;
    const rsi    = rsiVals    ? parseFloat(Object.values(rsiVals)[0]['RSI'])    : null;
    const macd   = macdVals   ? parseFloat(Object.values(macdVals)[0]['MACD'])  : null;
    const macdSignal = macdVals ? parseFloat(Object.values(macdVals)[0]['MACD_Signal']) : null;
    const macdHist   = macdVals ? parseFloat(Object.values(macdVals)[0]['MACD_Hist'])   : null;

    // Signal logic
    const aboveSMA200 = sma200 ? price > sma200 : null;
    const aboveSMA50  = sma50  ? price > sma50  : null;
    const rsiOk       = rsi    ? rsi >= 50 && rsi <= 70 : null;
    const macdBull    = macd !== null && macdSignal !== null ? macd > macdSignal : null;

    // Technical score (0-100)
    let techScore = 50;
    if (aboveSMA200 === true)  techScore += 20;
    if (aboveSMA200 === false) techScore -= 20;
    if (aboveSMA50 === true)   techScore += 10;
    if (aboveSMA50 === false)  techScore -= 10;
    if (rsiOk === true)        techScore += 15;
    if (rsi > 70)              techScore -= 10;
    if (rsi < 40)              techScore -= 15;
    if (macdBull === true)     techScore += 15;
    if (macdBull === false)    techScore -= 10;
    techScore = Math.max(0, Math.min(100, techScore));

    res.status(200).json({
      success: true,
      ticker: ticker.toUpperCase(),
      data: {
        price, change, changePct, volume,
        sma200, sma50, rsi, macd, macdSignal, macdHist,
        aboveSMA200, aboveSMA50, rsiOk, macdBull,
        techScore,
        fetchedAt: new Date().toISOString(),
      }
    });

  } catch (error) {
    res.status(500).json({ error: 'Technical analysis failed', message: error.message });
  }
}
