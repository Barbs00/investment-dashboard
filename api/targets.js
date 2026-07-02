// api/targets.js
// Price targets + analyst ratings from Financial Modeling Prep

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { ticker } = req.query;
  const FMP_KEY = process.env.FMP_KEY || req.headers['x-fmp-key'];

  if (!ticker) return res.status(400).json({ error: 'ticker required' });
  if (!FMP_KEY) return res.status(400).json({ error: 'FMP key required' });

  try {
    const [targetRes, ratingRes, gradeRes] = await Promise.all([
      fetch(`https://financialmodelingprep.com/api/v4/price-target-consensus?symbol=${ticker}&apikey=${FMP_KEY}`),
      fetch(`https://financialmodelingprep.com/api/v3/rating/${ticker}?apikey=${FMP_KEY}`),
      fetch(`https://financialmodelingprep.com/api/v3/grade/${ticker}?limit=10&apikey=${FMP_KEY}`),
    ]);

    const [targetData, ratingData, gradeData] = await Promise.all([
      targetRes.json(), ratingRes.json(), gradeRes.json()
    ]);

    const target = Array.isArray(targetData) ? targetData[0] : targetData;
    const rating = Array.isArray(ratingData) ? ratingData[0] : ratingData;
    const grades = Array.isArray(gradeData) ? gradeData.slice(0, 5) : [];

    // Upside potential
    const currentPrice = rating?.price;
    const consensus = target?.targetConsensus;
    const upside = currentPrice && consensus
      ? ((consensus - currentPrice) / currentPrice * 100).toFixed(1)
      : null;

    res.status(200).json({
      success: true,
      ticker: ticker.toUpperCase(),
      data: {
        targetHigh: target?.targetHigh,
        targetLow: target?.targetLow,
        targetConsensus: consensus,
        targetMedian: target?.targetMedian,
        upside: upside,
        recommendation: rating?.ratingRecommendation,
        ratingScore: rating?.ratingScore,
        ratingDetail: rating?.ratingDetailsDCFScore ? {
          dcf: rating.ratingDetailsDCFScore,
          roe: rating.ratingDetailsROEScore,
          roa: rating.ratingDetailsROAScore,
          de: rating.ratingDetailsDEScore,
          pe: rating.ratingDetailsPEScore,
          pb: rating.ratingDetailsPBScore,
        } : null,
        recentGrades: grades.map(g => ({
          date: g.date,
          company: g.gradingCompany,
          from: g.previousGrade,
          to: g.newGrade,
          action: g.action,
        })),
        fetchedAt: new Date().toISOString(),
      }
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch targets', message: error.message });
  }
}
