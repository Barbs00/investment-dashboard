// api/whales.js — reads FMP key from Vercel env vars

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { ticker } = req.query;
  const FMP_KEY = process.env.FMP_KEY;

  if (!ticker) return res.status(400).json({ error: 'ticker required' });
  if (!FMP_KEY) return res.status(200).json({
    success: false, noKey: true,
    message: 'FMP_KEY no configurada en Vercel Environment Variables'
  });

  try {
    const [instRes, insiderRes] = await Promise.all([
      fetch(`https://financialmodelingprep.com/api/v3/institutional-holder/${ticker}?apikey=${FMP_KEY}`),
      fetch(`https://financialmodelingprep.com/api/v4/insider-trading?symbol=${ticker}&limit=10&apikey=${FMP_KEY}`),
    ]);
    const [instData, insiderData] = await Promise.all([instRes.json(), insiderRes.json()]);

    const institutions = Array.isArray(instData) ? instData.slice(0, 8) : [];
    const insiders     = Array.isArray(insiderData) ? insiderData.slice(0, 8) : [];

    const buys  = insiders.filter(i => i.acquistionOrDisposition === 'A');
    const sells = insiders.filter(i => i.acquistionOrDisposition === 'D');
    const sentiment = buys.length > sells.length ? 'BULLISH' : buys.length < sells.length ? 'BEARISH' : 'NEUTRAL';
    const sentimentColor = sentiment === 'BULLISH' ? '#16a34a' : sentiment === 'BEARISH' ? '#dc2626' : '#d97706';
    const totalInst = institutions.reduce((s, i) => s + (parseFloat(i.weightPercent) || 0), 0);

    res.status(200).json({
      success: true,
      ticker: ticker.toUpperCase(),
      data: {
        institutions: institutions.map(i => ({
          name:   i.holder,
          shares: i.shares,
          value:  i.value,
          change: i.change,
          changeType: i.change > 0 ? 'increase' : i.change < 0 ? 'decrease' : 'unchanged',
        })),
        insiders: insiders.map(i => ({
          name:   i.reportingName,
          role:   i.typeOfOwner,
          type:   i.transactionType,
          shares: i.securitiesTransacted,
          value:  (i.securitiesTransacted || 0) * (i.price || 0),
          date:   i.transactionDate,
          isBuy:  i.acquistionOrDisposition === 'A',
        })),
        summary: {
          topInstitutions:        institutions.length,
          totalInstOwnershipPct:  totalInst.toFixed(1),
          insiderBuys:            buys.length,
          insiderSells:           sells.length,
          insiderSentiment:       sentiment,
          insiderSentimentColor:  sentimentColor,
        },
        fetchedAt: new Date().toISOString(),
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}
