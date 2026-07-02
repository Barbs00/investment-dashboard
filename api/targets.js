// api/targets.js — reads FMP key from Vercel env vars

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
    const [targetRes, ratingRes, gradeRes] = await Promise.all([
      fetch(`https://financialmodelingprep.com/api/v4/price-target-consensus?symbol=${ticker}&apikey=${FMP_KEY}`),
      fetch(`https://financialmodelingprep.com/api/v3/rating/${ticker}?apikey=${FMP_KEY}`),
      fetch(`https://financialmodelingprep.com/api/v3/grade/${ticker}?limit=8&apikey=${FMP_KEY}`),
    ]);

    const [targetData, ratingData, gradeData] = await Promise.all([
      targetRes.json(), ratingRes.json(), gradeRes.json()
    ]);

    const target = Array.isArray(targetData) ? targetData[0] : targetData;
    const rating = Array.isArray(ratingData) ? ratingData[0] : ratingData;
    const grades = Array.isArray(gradeData) ? gradeData.slice(0, 6) : [];

    const currentPrice = rating?.price;
    const consensus    = target?.targetConsensus;
    const upside = currentPrice && consensus
      ? ((consensus - currentPrice) / currentPrice * 100).toFixed(1)
      : null;

    res.status(200).json({
      success: true,
      ticker: ticker.toUpperCase(),
      data: {
        targetHigh:      target?.targetHigh,
        targetLow:       target?.targetLow,
        targetConsensus: consensus,
        targetMedian:    target?.targetMedian,
        upside,
        recommendation:  rating?.ratingRecommendation,
        ratingScore:     rating?.ratingScore,
        recentGrades: grades.map(g => ({
          date:    g.date,
          company: g.gradingCompany,
          from:    g.previousGrade,
          to:      g.newGrade,
          action:  g.action,
        })),
        fetchedAt: new Date().toISOString(),
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}
