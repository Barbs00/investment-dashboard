# Investment Intelligence Dashboard

Dashboard de inversión con 8 capas combinadas: Hugo Ferrer + Jeremy Grantham + ETF.com + Smart Money.

## Stack
- **Frontend:** HTML/JS puro (sin frameworks)
- **Backend:** Vercel Serverless Functions (Node.js)
- **APIs:** TradingView Scanner (gratis), FRED (gratis), Alpha Vantage (key gratis), FMP (key gratis)

## Deploy en Vercel — paso a paso (sin instalar nada)

### Paso 1: Crear cuenta en GitHub
1. Ve a **github.com** y crea una cuenta gratuita

### Paso 2: Crear repositorio
1. Click en "New repository"
2. Nombre: `investment-dashboard`
3. Público o privado (cualquiera funciona)
4. Click "Create repository"

### Paso 3: Subir los archivos
1. En tu nuevo repositorio, click "uploading an existing file"
2. Arrastra y suelta TODOS los archivos de esta carpeta:
   - `vercel.json`
   - `api/screener.js`
   - `api/macro.js`
   - `api/technical.js`
   - `api/targets.js`
   - `api/whales.js`
   - `public/index.html`
3. Click "Commit changes"

### Paso 4: Deploy en Vercel
1. Ve a **vercel.com** y crea cuenta con tu GitHub
2. Click "New Project"
3. Importa tu repositorio `investment-dashboard`
4. En "Framework Preset" selecciona "Other"
5. En "Output Directory" escribe: `public`
6. Click "Deploy"

### Paso 5: Variables de entorno (opcional)
En Vercel → Settings → Environment Variables:
- `FRED_API_KEY` → key de fred.stlouisfed.org/docs/api/api_key.html (gratis)

### Paso 6: Usar el dashboard
1. Abre tu URL de Vercel (ej: `investment-dashboard-xxx.vercel.app`)
2. Agrega tus keys de Alpha Vantage y FMP en el panel lateral
3. Click "Cargar S&P500 en vivo"
4. Filtra por horizonte (Largo/Medio/Corto) y criterios
5. Click en cualquier fila para ver el detalle completo con semáforo
6. Doble click → gráfico TradingView interactivo

## APIs necesarias

| API | Para qué | Costo | Link |
|-----|----------|-------|------|
| TradingView Scanner | S&P500 en vivo con SMA200, RSI, recomendación | Gratis | Automático |
| FRED | Macro: yields, fed funds, curva | Gratis | fred.stlouisfed.org |
| Alpha Vantage | Técnico profundo: SMA50, MACD, señales | Gratis (25/día) | alphavantage.co |
| FMP | Price targets, ratings analistas, institucionales | Gratis (250/día) | financialmodelingprep.com |

## Funcionalidades

### Screener en vivo
- S&P500 completo con datos técnicos de TradingView
- Filtros: sector, score mínimo, P/E, indicadores técnicos, horizonte

### 8 Capas de selección (semáforo 🟢🟡🔴)
1. **Ciclo macro** (Hugo Ferrer) — FRED en vivo
2. **Momentum técnico** (HF) — SMA200, RSI, MACD
3. **Valoración histórica** (Grantham) — P/E, P/B vs historia
4. **Calidad balance** (GMO) — ROE, deuda, FCF
5. **Pricing power** (Grantham) — márgenes brutos
6. **Eficiencia instrumento** (ETF.com) — para ETFs
7. **Smart money** — insider trades, institucionales
8. **Fit horizonte** — largo/medio/corto plazo

### Por ticker (click en fila)
- Todos los indicadores técnicos en vivo (Alpha Vantage)
- Price target consenso alto/medio/bajo (FMP)
- Upgrades/downgrades recientes de analistas
- Insider trading (compras vs ventas)
- Institucionales: top holders y cambios de posición
- Gráfico TradingView interactivo con SMA200, SMA50, RSI embebido

### Finviz
- 5 filtros preconfigurados con criterios Ferrer + Grantham
- Abre Finviz con los parámetros exactos en una pestaña

## Refresh
- Manual: botón "↻ Refresh" en la página
- El screener de TradingView trae datos del mercado actual
- Para auto-refresh: puedes agregar `setInterval(refreshAll, 15*60*1000)` en el JS
