// api/screener.js
// Proxies TradingView Scanner API — bypasses CORS, returns stocks with SMA200, RSI, recommendation

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { market = 'america', limit = 100, sort = 'volume_delta' } = req.query;

  const payload = {
    filter: [
      { left: 'market_cap_basic', operation: 'greater', right: 1000000000 }, // >$1B market cap
      { left: 'average_volume_10d_calc', operation: 'greater', right: 500000 }, // >500K avg volume
      { left: 'type', operation: 'equal', right: 'stock' }
    ],
    options: { lang: 'en' },
    markets: [market],
    symbols: { query: { types: [] } },
    columns: [
      'name',
      'description',
      'close',
      'change',
      'change_abs',
      'volume',
      'market_cap_basic',
      'SMA200',
      'SMA50',
      'RSI',
      'MACD.macd',
      'MACD.signal',
      'Recommend.All',        // TradingView overall recommendation -1 to 1
      'Recommend.MA',         // Moving averages recommendation
      'Recommend.Other',      // Oscillators recommendation
      'relative_volume_10d_calc',
      'average_volume_10d_calc',
      'sector',
      'industry',
      'P.E',
      'price_earnings_ttm',
      'EPS.diluted.TTM',
      'gross_profit_margin_TTM',
      'return_on_equity',
      'debt_to_equity',
      'price_book_ratio',
      '52_week_high',
      '52_week_low',
    ],
    sort: { sortBy: sort, sortOrder: 'desc' },
    range: [0, parseInt(limit)],
  };

  try {
    const response = await fetch('https://scanner.tradingview.com/america/scan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://www.tradingview.com',
        'Referer': 'https://www.tradingview.com/',
        'User-Agent': 'Mozilla/5.0 (compatible; InvestmentDashboard/1.0)',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'TradingView API error', status: response.status });
    }

    const data = await response.json();

    // Transform into clean objects
    const stocks = (data.data || []).map(item => {
      const d = item.d;
      const price = d[2];
      const sma200 = d[7];
      const sma50 = d[8];
      const rsi = d[9];
      const recAll = d[12]; // -1 (strong sell) to 1 (strong buy)

      // Convert TradingView recommendation to label
      const getRecLabel = (v) => {
        if (v === null || v === undefined) return 'N/A';
        if (v >= 0.5) return 'Strong Buy';
        if (v >= 0.1) return 'Buy';
        if (v > -0.1) return 'Neutral';
        if (v > -0.5) return 'Sell';
        return 'Strong Sell';
      };

      const getRecColor = (v) => {
        if (v === null || v === undefined) return 'gray';
        if (v >= 0.5) return 'strongbuy';
        if (v >= 0.1) return 'buy';
        if (v > -0.1) return 'neutral';
        if (v > -0.5) return 'sell';
        return 'strongsell';
      };

      // Above SMA200?
      const aboveSMA200 = sma200 && price ? price > sma200 : null;
      const aboveSMA50 = sma50 && price ? price > sma50 : null;
      const rsiOk = rsi ? rsi >= 50 && rsi <= 70 : null;

      // Distance from 52W high
      const high52 = d[27];
      const distFromHigh = high52 && price ? ((price - high52) / high52 * 100).toFixed(1) : null;

      return {
        ticker: item.s.replace('NASDAQ:', '').replace('NYSE:', '').replace('AMEX:', ''),
        exchange: item.s.split(':')[0],
        fullSymbol: item.s,
        name: d[0],
        description: d[1],
        price: price,
        change: d[3],
        changeAbs: d[4],
        volume: d[5],
        marketCap: d[6],
        sma200: sma200,
        sma50: sma50,
        rsi: rsi,
        macd: d[9],
        macdSignal: d[10],
        recAll: recAll,
        recLabel: getRecLabel(recAll),
        recColor: getRecColor(recAll),
        recMA: d[13],
        recOsc: d[14],
        relVolume: d[15],
        avgVolume: d[16],
        sector: d[17],
        industry: d[18],
        pe: d[19] || d[20],
        eps: d[21],
        grossMargin: d[22],
        roe: d[23],
        debtEquity: d[24],
        pb: d[25],
        high52w: d[26],
        low52w: d[27],
        distFromHigh: distFromHigh,
        // Computed flags
        aboveSMA200,
        aboveSMA50,
        rsiOk,
        // Timestamp
        fetchedAt: new Date().toISOString(),
      };
    });

    res.status(200).json({
      success: true,
      count: stocks.length,
      fetchedAt: new Date().toISOString(),
      data: stocks,
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch screener data', message: error.message });
  }
}
