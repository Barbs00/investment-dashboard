// api/whales.js
// Institutional ownership, hedge fund activity, insider trades

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { ticker } = req.query;
  const FMP_KEY = process.env.FMP_KEY || req.headers['x-fmp-key'];

  if (!ticker) return res.status(400).json({ error: 'ticker required' });
  if (!FMP_KEY) return res.status(400).json({ error: 'FMP key required' });

  try {
    const [instRes, insiderRes, hedgeRes] = await Promise.all([
      // Institutional ownership
      fetch(`https://financialmodelingprep.com/api/v3/institutional-holder/${ticker}?apikey=${FMP_KEY}`),
      // Insider trades
      fetch(`https://financialmodelingprep.com/api/v4/insider-trading?symbol=${ticker}&limit=10&apikey=${FMP_KEY}`),
      // 13F filings - top hedge funds
      fetch(`https://financialmodelingprep.com/api/v3/form-thirteen-f-asset-allocation-date?apikey=${FMP_KEY}`),
    ]);

    const [instData, insiderData, hedgeData] = await Promise.all([
      instRes.json(), insiderRes.json(), hedgeRes.json()
    ]);

    const institutions = Array.isArray(instData) ? instData.slice(0, 10) : [];
    const insiders = Array.isArray(insiderData) ? insiderData.slice(0, 8) : [];

    // Compute net insider sentiment
    const buys = insiders.filter(i => i.transactionType?.toLowerCase().includes('purchase') || i.transactionType?.toLowerCase().includes('buy'));
    const sells = insiders.filter(i => i.transactionType?.toLowerCase().includes('sale') || i.transactionType?.toLowerCase().includes('sell'));
    const insiderSentiment = buys.length > sells.length ? 'BULLISH' : buys.length < sells.length ? 'BEARISH' : 'NEUTRAL';

    // Total institutional ownership %
    const totalInstOwnership = institutions.reduce((sum, i) => sum + (parseFloat(i.weightPercent) || 0), 0);

    res.status(200).json({
      success: true,
      ticker: ticker.toUpperCase(),
      data: {
        institutions: institutions.map(i => ({
          name: i.holder,
          shares: i.shares,
          value: i.value,
          change: i.change,
          changeType: i.change > 0 ? 'increase' : i.change < 0 ? 'decrease' : 'unchanged',
        })),
        insiders: insiders.map(i => ({
          name: i.reportingName,
          role: i.typeOfOwner,
          type: i.transactionType,
          shares: i.securitiesTransacted,
          value: i.securitiesTransacted * i.price,
          date: i.transactionDate,
          isBuy: i.acquistionOrDisposition === 'A',
        })),
        summary: {
          topInstitutions: institutions.length,
          totalInstOwnershipPct: totalInstOwnership.toFixed(2),
          insiderBuys: buys.length,
          insiderSells: sells.length,
          insiderSentiment,
          insiderSentimentColor: insiderSentiment === 'BULLISH' ? '#16a34a' : insiderSentiment === 'BEARISH' ? '#dc2626' : '#d97706',
        },
        fetchedAt: new Date().toISOString(),
      }
    });

  } catch (error) {
    res.status(500).json({ error: 'Whale data fetch failed', message: error.message });
  }
}
