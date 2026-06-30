// api/macro.js
// Fetches macro data from FRED (Federal Reserve) — free, no key needed for basic series

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // FRED public API - use env var key or fallback
  const FRED_KEY = process.env.FRED_API_KEY || 'abcdef1234567890abcdef1234567890';
  const base = `https://api.stlouisfed.org/fred/series/observations?sort_order=desc&limit=5&file_type=json&api_key=${FRED_KEY}`;

  try {
    const [fedRes, t10Res, t2Res, t10t2Res] = await Promise.all([
      fetch(`${base}&series_id=FEDFUNDS`),
      fetch(`${base}&series_id=DGS10`),
      fetch(`${base}&series_id=DGS2`),
      fetch(`${base}&series_id=T10Y2Y`), // 10Y-2Y spread direct series
    ]);

    const [fedData, t10Data, t2Data, spreadData] = await Promise.all([
      fedRes.json(),
      t10Res.json(),
      t2Data.json(),
      spreadData.json(),
    ]);

    const fed = parseFloat(fedData.observations?.[0]?.value || 0);
    const t10 = parseFloat(t10Data.observations?.[0]?.value || 0);
    const t2 = parseFloat(t2Data.observations?.[0]?.value || 0);
    const spread = parseFloat(spreadData.observations?.[0]?.value || (t10 - t2).toFixed(2));

    // Grantham/Ferrer macro signal
    const getMacroSignal = (fed, t10, t2, spread) => {
      const curveNormal = spread > 0;
      const rateModerate = fed < 6;
      const t10Reasonable = t10 < 5;

      if (curveNormal && rateModerate && t10Reasonable) {
        return { signal: 'EXPANSION', label: '🟢 Expansión', color: '#16a34a', score: 85, desc: 'Ciclo favorable — Ferrer indica posicionamiento en RV' };
      } else if (!curveNormal) {
        return { signal: 'CAUTION', label: '🔴 Precaución', color: '#dc2626', score: 30, desc: 'Curva invertida — Grantham/Ferrer indican cautela en RV' };
      } else {
        return { signal: 'NEUTRAL', label: '🟡 Neutro', color: '#d97706', score: 55, desc: 'Ciclo mixto — vigilar PMI y breadth antes de posicionar' };
      }
    };

    const macroSignal = getMacroSignal(fed, t10, t2, spread);

    res.status(200).json({
      success: true,
      data: {
        fedFunds: fed,
        t10y: t10,
        t2y: t2,
        spread: spread,
        macro: macroSignal,
        updatedAt: t10Data.observations?.[0]?.date,
        fetchedAt: new Date().toISOString(),
      }
    });

  } catch (error) {
    // Fallback with estimated data if FRED fails
    res.status(200).json({
      success: true,
      estimated: true,
      data: {
        fedFunds: 4.33,
        t10y: 4.28,
        t2y: 4.22,
        spread: 0.06,
        macro: {
          signal: 'NEUTRAL',
          label: '🟡 Datos estimados',
          color: '#d97706',
          score: 55,
          desc: 'FRED no disponible — datos de referencia junio 2026'
        },
        fetchedAt: new Date().toISOString(),
      }
    });
  }
}
