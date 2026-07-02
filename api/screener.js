// api/screener.js — FULL GLOBAL SCREENER
// Fetches ALL opportunities: USA stocks, European stocks, Asian stocks,
// global ETFs, REITs, commodities ETFs, bond ETFs
// Uses TradingView Scanner API (no key required)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-av-key,x-fmp-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const {
    market    = 'all',   // all | america | uk | europe | japan | hongkong | australia | etf
    type      = 'all',   // all | stock | etf | fund | reit
    limit     = 500,
    minCap    = 500,     // $500M minimum market cap
    minVol    = 100000,  // 100K minimum volume
    sortBy    = 'volume_delta',
  } = req.query;

  // ── MARKET CONFIGS ───────────────────────────────────────────────────────
  const MARKETS = {
    america:   { markets: ['america'],           label: 'USA' },
    uk:        { markets: ['uk'],                label: 'UK' },
    europe:    { markets: ['europe'],            label: 'Europa' },
    germany:   { markets: ['germany'],           label: 'Alemania' },
    france:    { markets: ['france'],            label: 'Francia' },
    japan:     { markets: ['japan'],             label: 'Japón' },
    hongkong:  { markets: ['hongkong'],          label: 'Hong Kong' },
    australia: { markets: ['australia'],         label: 'Australia' },
    canada:    { markets: ['canada'],            label: 'Canadá' },
    india:     { markets: ['india'],             label: 'India' },
    brazil:    { markets: ['brazil'],            label: 'Brasil' },
    all: {
      markets: ['america','uk','europe','germany','france','japan','hongkong','australia','canada','india','brazil'],
      label: 'Global'
    },
  };

  const config = MARKETS[market] || MARKETS['all'];

  // ── COLUMNS TO FETCH ─────────────────────────────────────────────────────
  const COLUMNS = [
    'name',                        // 0  full name
    'description',                 // 1  ticker description
    'close',                       // 2  current price
    'change',                      // 3  % change today
    'change_abs',                  // 4  absolute change
    'volume',                      // 5  today's volume
    'market_cap_basic',            // 6  market cap USD
    'SMA200',                      // 7  200-day SMA
    'SMA50',                       // 8  50-day SMA
    'RSI',                         // 9  RSI(14)
    'MACD.macd',                   // 10 MACD line
    'MACD.signal',                 // 11 MACD signal
    'Recommend.All',               // 12 TV overall recommendation (-1 to 1)
    'Recommend.MA',                // 13 MA recommendation
    'Recommend.Other',             // 14 oscillators recommendation
    'relative_volume_10d_calc',    // 15 relative volume vs 10d avg
    'average_volume_10d_calc',     // 16 10-day avg volume
    'sector',                      // 17 sector
    'industry',                    // 18 industry
    'P.E',                         // 19 P/E ratio
    'price_earnings_ttm',          // 20 forward P/E alternative
    'EPS.diluted.TTM',             // 21 EPS TTM
    'gross_profit_margin_TTM',     // 22 gross margin
    'return_on_equity',            // 23 ROE
    'debt_to_equity',              // 24 D/E ratio
    'price_book_ratio',            // 25 P/B ratio
    '52_week_high',                // 26 52-week high
    '52_week_low',                 // 27 52-week low
    'dividends_yield',             // 28 dividend yield
    'price_to_revenue_ttm',        // 29 P/S ratio
    'enterprise_value_ebitda_ttm', // 30 EV/EBITDA
    'net_income_ttm',              // 31 net income
    'total_revenue_ttm',           // 32 revenue
    'currency',                    // 33 currency
    'country',                     // 34 country
    'type',                        // 35 stock/etf/fund/reit
    'exchange',                    // 36 exchange
    'Volatility.D',                // 37 daily volatility
    'ATR',                         // 38 ATR(14)
    'float_shares_outstanding',    // 39 float shares
  ];

  // ── BUILD FILTER ─────────────────────────────────────────────────────────
  const buildFilter = () => {
    const filters = [
      { left: 'market_cap_basic', operation: 'greater', right: parseInt(minCap) * 1e6 },
      { left: 'average_volume_10d_calc', operation: 'greater', right: parseInt(minVol) },
    ];

    if (type === 'stock') {
      filters.push({ left: 'type', operation: 'in_range', right: ['stock', 'dr'] });
    } else if (type === 'etf') {
      filters.push({ left: 'type', operation: 'equal', right: 'fund' });
    } else if (type === 'reit') {
      filters.push({ left: 'type', operation: 'equal', right: 'fund' });
      filters.push({ left: 'sector', operation: 'equal', right: 'Real Estate' });
    }

    return filters;
  };

  // ── FETCH FROM A SINGLE MARKET ───────────────────────────────────────────
  const fetchMarket = async (marketName, fetchLimit) => {
    const payload = {
      filter: buildFilter(),
      options: { lang: 'en' },
      markets: [marketName],
      symbols: { query: { types: [] } },
      columns: COLUMNS,
      sort: { sortBy, sortOrder: 'desc' },
      range: [0, Math.min(fetchLimit, 300)], // TV caps per-request
    };

    const response = await fetch(`https://scanner.tradingview.com/${marketName}/scan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://www.tradingview.com',
        'Referer': 'https://www.tradingview.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return [];
    const data = await response.json();
    return (data.data || []).map(item => transformItem(item, marketName));
  };

  // ── TRANSFORM RAW ITEM ───────────────────────────────────────────────────
  const transformItem = (item, marketName) => {
    const d = item.d;
    const price    = d[2];
    const sma200   = d[7];
    const sma50    = d[8];
    const rsi      = d[9];
    const recAll   = d[12];
    const high52   = d[26];
    const low52    = d[27];

    const getRecLabel = (v) => {
      if (v == null) return 'N/A';
      if (v >= 0.5)  return 'Strong Buy';
      if (v >= 0.1)  return 'Buy';
      if (v > -0.1)  return 'Neutral';
      if (v > -0.5)  return 'Sell';
      return 'Strong Sell';
    };

    const getRecColor = (v) => {
      if (v == null) return 'gray';
      if (v >= 0.5)  return 'strongbuy';
      if (v >= 0.1)  return 'buy';
      if (v > -0.1)  return 'neutral';
      if (v > -0.5)  return 'sell';
      return 'strongsell';
    };

    const aboveSMA200    = sma200 && price ? price > sma200 : null;
    const aboveSMA50     = sma50  && price ? price > sma50  : null;
    const rsiOk          = rsi ? rsi >= 50 && rsi <= 70 : null;
    const macdBull       = d[10] != null && d[11] != null ? d[10] > d[11] : null;
    const distFromHigh   = high52 && price ? ((price - high52) / high52 * 100).toFixed(1) : null;
    const distFromLow    = low52  && price ? ((price - low52)  / low52  * 100).toFixed(1) : null;
    const nearHigh52     = distFromHigh ? parseFloat(distFromHigh) > -10 : false;

    // Clean ticker
    const rawSymbol = item.s || '';
    const ticker = rawSymbol.includes(':') ? rawSymbol.split(':')[1] : rawSymbol;
    const exchange = rawSymbol.includes(':') ? rawSymbol.split(':')[0] : marketName.toUpperCase();

    return {
      ticker,
      exchange,
      fullSymbol: rawSymbol,
      marketName,
      name: d[0],
      description: d[1],
      price,
      change: d[3],
      changeAbs: d[4],
      volume: d[5],
      marketCap: d[6],
      sma200, sma50, rsi,
      macd: d[10], macdSignal: d[11],
      recAll, recLabel: getRecLabel(recAll), recColor: getRecColor(recAll),
      recMA: d[13], recOsc: d[14],
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
      high52w: high52,
      low52w: low52,
      divYield: d[28],
      ps: d[29],
      evEbitda: d[30],
      netIncome: d[31],
      revenue: d[32],
      currency: d[33],
      country: d[34],
      assetType: d[35],
      volatilityD: d[37],
      atr: d[38],
      // Computed
      aboveSMA200, aboveSMA50, rsiOk, macdBull,
      distFromHigh, distFromLow, nearHigh52,
      // 8-layer pre-score (lightweight, full scoring in frontend)
      preScore: computePreScore({ aboveSMA200, rsi, recAll, pe: d[19], roe: d[23], grossMargin: d[22], debtEquity: d[24] }),
      fetchedAt: new Date().toISOString(),
    };
  };

  // ── LIGHTWEIGHT PRE-SCORE ────────────────────────────────────────────────
  const computePreScore = ({ aboveSMA200, rsi, recAll, pe, roe, grossMargin, debtEquity }) => {
    let score = 50;
    if (aboveSMA200 === true)        score += 20;
    if (aboveSMA200 === false)       score -= 20;
    if (rsi >= 50 && rsi <= 70)      score += 10;
    if (rsi > 75)                    score -= 10;
    if (rsi < 35)                    score -= 15;
    if (recAll >= 0.5)               score += 15;
    if (recAll >= 0.1)               score += 8;
    if (recAll <= -0.3)              score -= 15;
    if (pe > 0 && pe < 15)           score += 10;
    if (pe > 0 && pe > 35)           score -= 10;
    if (roe > 15)                    score += 8;
    if (grossMargin > 40)            score += 5;
    if (debtEquity < 1)              score += 5;
    if (debtEquity > 3)              score -= 10;
    return Math.max(0, Math.min(100, Math.round(score)));
  };

  // ── FETCH ALL MARKETS IN PARALLEL ────────────────────────────────────────
  try {
    const perMarket = Math.ceil(parseInt(limit) / config.markets.length);
    const results = await Promise.allSettled(
      config.markets.map(m => fetchMarket(m, perMarket))
    );

    // Merge results from all markets
    let allItems = [];
    const marketStats = {};

    results.forEach((result, i) => {
      const marketName = config.markets[i];
      if (result.status === 'fulfilled') {
        marketStats[marketName] = result.value.length;
        allItems = allItems.concat(result.value);
      } else {
        marketStats[marketName] = 0;
        console.error(`Failed to fetch ${marketName}:`, result.reason?.message);
      }
    });

    // Sort combined results by preScore desc, then by volume
    allItems.sort((a, b) => (b.preScore - a.preScore) || (b.volume - a.volume));

    // Deduplicate by ticker
    const seen = new Set();
    const deduplicated = allItems.filter(item => {
      if (seen.has(item.ticker)) return false;
      seen.add(item.ticker);
      return true;
    });

    // Summary stats
    const stats = {
      total: deduplicated.length,
      byMarket: marketStats,
      aboveSMA200: deduplicated.filter(i => i.aboveSMA200 === true).length,
      strongBuy: deduplicated.filter(i => i.recAll >= 0.5).length,
      rsiOk: deduplicated.filter(i => i.rsiOk === true).length,
      nearHigh52: deduplicated.filter(i => i.nearHigh52).length,
      avgScore: Math.round(deduplicated.reduce((s, i) => s + i.preScore, 0) / (deduplicated.length || 1)),
    };

    res.status(200).json({
      success: true,
      stats,
      fetchedAt: new Date().toISOString(),
      data: deduplicated,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Screener fetch failed',
      message: error.message,
    });
  }
}
