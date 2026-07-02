// api/macro.js
// Fetches macro data from FRED (Federal Reserve)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-av-key,x-fmp-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const FRED_KEY = process.env.FRED_API_KEY || 'abcdef1234567890abcdef1234567890';
  const base = `https://api.stlouisfed.org/fred/series/observations?sort_order=desc&limit=3&file_type=json&api_key=${FRED_KEY}`;

  try {
    const [fedRes, t10Res, t2Res] = await Promise.all([
      fetch(`${base}&series_id=FEDFUNDS`),
      fetch(`${base}&series_id=DGS10`),
      fetch(`${base}&series_id=DGS2`),
    ]);

    const [fedData, t10Data, t2Data] = await Promise.all([
      fedRes.json(),
      t10Res.json(),
      t2Res.json(),
    ]);

    const fed    = parseFloat(fedData.observations?.[0]?.value || 0);
    const t10    = parseFloat(t10Data.observations?.[0]?.value || 0);
    const t2     = parseFloat(t2Data.observations?.[0]?.value  || 0);
    const spread = parseFloat((t10 - t2).toFixed(2));

    const getMacroSignal = (fed, spread) => {
      const curveNormal  = spread > 0;
      const rateOk       = fed < 6;
      const t10Ok        = t10 < 5;

      if (curveNormal && rateOk && t10Ok)
        return { signal:'EXPANSION',  label:'🟢 Expansión',  color:'#16a34a', score:85, desc:'Ciclo favorable — Ferrer y Grantham indican posicionamiento en RV' };
      if (!curveNormal)
        return { signal:'CAUTION',    label:'🔴 Precaución', color:'#dc2626', score:30, desc:'Curva invertida — Grantham: cautela. Ferrer: sin entradas nuevas' };
      return   { signal:'NEUTRAL',    label:'🟡 Neutro',     color:'#d97706', score:55, desc:'Ciclo mixto — vigilar PMI y amplitud de mercado' };
    };

    const macro = getMacroSignal(fed, spread);

    res.status(200).json({
      success: true,
      data: { fedFunds: fed, t10y: t10, t2y: t2, spread, macro,
              updatedAt: t10Data.observations?.[0]?.date,
              fetchedAt: new Date().toISOString() }
    });

  } catch (error) {
    // Fallback estimado
    res.status(200).json({
      success: true, estimated: true,
      data: {
        fedFunds: 4.33, t10y: 4.28, t2y: 4.22, spread: 0.06,
        macro: { signal:'NEUTRAL', label:'🟡 Estimado', color:'#d97706', score:55,
                 desc:'FRED no disponible — datos de referencia junio 2026' },
        fetchedAt: new Date().toISOString()
      }
    });
  }
}
