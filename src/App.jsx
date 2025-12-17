import './App.css'

import { useEffect, useMemo, useRef, useState } from 'react'
import csvUrl from '../Warehouse_and_Retail_Sales.csv?url'
import { TimeSeriesChart } from './components/TimeSeriesChart.jsx'
import { AuthCard } from './components/AuthCard.jsx'
import { parseCsvRow } from './utils/csv.js'
import { auth, firebaseInitError } from './firebase.js'
import { onAuthStateChanged, signOut } from 'firebase/auth'

const moneyFmt = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
})

function monthKey(year, month) {
  return `${String(year)}-${String(month).padStart(2, '0')}`
}

function monthKeyLabel(key) {
  const [y, m] = key.split('-')
  return `${y}-${m}`
}

function safeNumber(v) {
  const n = Number.parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

function sortMonthKeys(keys) {
  return [...keys].sort((a, b) => {
    const [ay, am] = a.split('-').map(Number)
    const [by, bm] = b.split('-').map(Number)
    return ay !== by ? ay - by : am - bm
  })
}

function getOrInit(map, key, init) {
  const existing = map.get(key)
  if (existing !== undefined) return existing
  const v = init()
  map.set(key, v)
  return v
}

async function loadAggregates({ signal, onProgress }) {
  const res = await fetch(csvUrl, { signal })
  if (!res.ok) throw new Error(`Failed to load CSV: ${res.status} ${res.statusText}`)
  if (!res.body) throw new Error('Streaming not supported in this browser/environment')

  const totalBytes = Number(res.headers.get('content-length')) || 0
  const reader = res.body.getReader()
  const decoder = new TextDecoder()

  let buffer = ''
  let header = null
  let idx = null
  let bytesRead = 0
  let rowsRead = 0
  let lastYieldAt = 0

  const suppliers = new Set()
  const months = new Set()

  // supplier -> monthKey -> { retailSales, retailTransfers, warehouseSales }
  const bySupplier = new Map()
  // monthKey -> { retailSales, retailTransfers, warehouseSales }
  const totals = new Map()

  const initAgg = () => ({ retailSales: 0, retailTransfers: 0, warehouseSales: 0 })

  const bumpAgg = (agg, retailSales, retailTransfers, warehouseSales) => {
    agg.retailSales += retailSales
    agg.retailTransfers += retailTransfers
    agg.warehouseSales += warehouseSales
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    bytesRead += value.byteLength
    buffer += decoder.decode(value, { stream: true })

    let lineBreak
    // eslint-disable-next-line no-cond-assign
    while ((lineBreak = buffer.indexOf('\n')) !== -1) {
      const rawLine = buffer.slice(0, lineBreak)
      buffer = buffer.slice(lineBreak + 1)
      const line = rawLine.replace(/\r$/, '')
      if (!line) continue

      if (!header) {
        header = parseCsvRow(line)
        const byName = new Map(header.map((name, i) => [name.trim(), i]))
        idx = {
          year: byName.get('YEAR'),
          month: byName.get('MONTH'),
          supplier: byName.get('SUPPLIER'),
          retailSales: byName.get('RETAIL SALES'),
          retailTransfers: byName.get('RETAIL TRANSFERS'),
          warehouseSales: byName.get('WAREHOUSE SALES'),
        }
        const missing = Object.entries(idx)
          .filter(([, v]) => v === undefined)
          .map(([k]) => k)
        if (missing.length) {
          throw new Error(`CSV missing required columns: ${missing.join(', ')}`)
        }
        continue
      }

      const row = parseCsvRow(line)
      const year = Number.parseInt(row[idx.year], 10)
      const month = Number.parseInt(row[idx.month], 10)
      const supplier = (row[idx.supplier] || 'Unknown').trim() || 'Unknown'
      if (!Number.isFinite(year) || !Number.isFinite(month)) continue

      const retailSales = safeNumber(row[idx.retailSales])
      const retailTransfers = safeNumber(row[idx.retailTransfers])
      const warehouseSales = safeNumber(row[idx.warehouseSales])

      const mk = monthKey(year, month)
      months.add(mk)
      suppliers.add(supplier)

      bumpAgg(getOrInit(totals, mk, initAgg), retailSales, retailTransfers, warehouseSales)
      const supplierMap = getOrInit(bySupplier, supplier, () => new Map())
      bumpAgg(getOrInit(supplierMap, mk, initAgg), retailSales, retailTransfers, warehouseSales)

      rowsRead += 1

      // Yield occasionally to keep UI responsive during the big parse.
      if (rowsRead - lastYieldAt >= 5000) {
        lastYieldAt = rowsRead
        onProgress?.({ bytesRead, totalBytes, rowsRead })
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 0))
      }
    }
  }

  // Final flush (in case there is no trailing newline)
  const tail = buffer.trim()
  if (tail) {
    if (!header) {
      header = parseCsvRow(tail)
    } else {
      const row = parseCsvRow(tail)
      const year = Number.parseInt(row[idx.year], 10)
      const month = Number.parseInt(row[idx.month], 10)
      const supplier = (row[idx.supplier] || 'Unknown').trim() || 'Unknown'
      if (Number.isFinite(year) && Number.isFinite(month)) {
        const retailSales = safeNumber(row[idx.retailSales])
        const retailTransfers = safeNumber(row[idx.retailTransfers])
        const warehouseSales = safeNumber(row[idx.warehouseSales])
        const mk = monthKey(year, month)
        months.add(mk)
        suppliers.add(supplier)
        bumpAgg(getOrInit(totals, mk, initAgg), retailSales, retailTransfers, warehouseSales)
        const supplierMap = getOrInit(bySupplier, supplier, () => new Map())
        bumpAgg(getOrInit(supplierMap, mk, initAgg), retailSales, retailTransfers, warehouseSales)
        rowsRead += 1
      }
    }
  }

  onProgress?.({ bytesRead, totalBytes, rowsRead })

  const monthKeys = sortMonthKeys(months)
  const supplierList = [...suppliers].sort((a, b) => a.localeCompare(b))

  return {
    monthKeys,
    suppliers: supplierList,
    bySupplier,
    totals,
    rowsRead,
  }
}

function sumAggs(a, b) {
  return {
    retailSales: (a?.retailSales || 0) + (b?.retailSales || 0),
    retailTransfers: (a?.retailTransfers || 0) + (b?.retailTransfers || 0),
    warehouseSales: (a?.warehouseSales || 0) + (b?.warehouseSales || 0),
  }
}

function pickAggForSelection({ selection, monthKeys, totals, bySupplier }) {
  if (!selection || selection === '__ALL__') {
    return monthKeys.map((k) => totals.get(k) || { retailSales: 0, retailTransfers: 0, warehouseSales: 0 })
  }
  const supplierMap = bySupplier.get(selection)
  return monthKeys.map((k) => supplierMap?.get(k) || { retailSales: 0, retailTransfers: 0, warehouseSales: 0 })
}

function App() {
  const abortRef = useRef(null)
  const [authState, setAuthState] = useState({ status: 'loading', user: null })
  const [loadState, setLoadState] = useState({ status: 'idle' })
  const [supplierQuery, setSupplierQuery] = useState('')
  const [selectedSupplier, setSelectedSupplier] = useState('__ALL__')
  const [showRetailSales, setShowRetailSales] = useState(true)
  const [showRetailTransfers, setShowRetailTransfers] = useState(true)
  const [showWarehouseSales, setShowWarehouseSales] = useState(true)

  useEffect(() => {
    if (firebaseInitError || !auth) {
      setAuthState({ status: 'ready', user: null })
      return
    }
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthState({ status: 'ready', user })
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    // Only load & parse the large CSV after the user is logged in / registered.
    if (authState.status !== 'ready' || !authState.user) return

    abortRef.current?.abort?.()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setLoadState({ status: 'loading', progress: { bytesRead: 0, totalBytes: 0, rowsRead: 0 } })
    loadAggregates({
      signal: ctrl.signal,
      onProgress: (progress) => setLoadState((s) => (s.status === 'loading' ? { ...s, progress } : s)),
    })
      .then((data) => setLoadState({ status: 'ready', data }))
      .catch((err) => {
        if (ctrl.signal.aborted) return
        setLoadState({ status: 'error', error: err instanceof Error ? err : new Error(String(err)) })
      })

    return () => ctrl.abort()
  }, [authState.status, authState.user])

  const data = loadState.status === 'ready' ? loadState.data : null

  const supplierOptions = useMemo(() => {
    if (!data) return []
    const q = supplierQuery.trim().toLowerCase()
    const all = data.suppliers
    if (!q) return all
    return all.filter((s) => s.toLowerCase().includes(q))
  }, [data, supplierQuery])

  const monthAggs = useMemo(() => {
    if (!data) return []
    return pickAggForSelection({
      selection: selectedSupplier,
      monthKeys: data.monthKeys,
      totals: data.totals,
      bySupplier: data.bySupplier,
    })
  }, [data, selectedSupplier])

  const totalsForSelection = useMemo(() => {
    if (!monthAggs.length) return { retailSales: 0, retailTransfers: 0, warehouseSales: 0 }
    return monthAggs.reduce((acc, a) => sumAggs(acc, a), { retailSales: 0, retailTransfers: 0, warehouseSales: 0 })
  }, [monthAggs])

  const chartSeries = useMemo(() => {
    if (!data) return []
    const series = []
    if (showRetailSales) {
      series.push({
        id: 'retailSales',
        name: 'Retail Sales',
        color: '#60a5fa',
        values: monthAggs.map((a) => a.retailSales),
      })
    }
    if (showRetailTransfers) {
      series.push({
        id: 'retailTransfers',
        name: 'Retail Transfers',
        color: '#34d399',
        values: monthAggs.map((a) => a.retailTransfers),
      })
    }
    if (showWarehouseSales) {
      series.push({
        id: 'warehouseSales',
        name: 'Warehouse Sales',
        color: '#f472b6',
        values: monthAggs.map((a) => a.warehouseSales),
      })
    }
    return series
  }, [data, monthAggs, showRetailSales, showRetailTransfers, showWarehouseSales])

  const titleSupplier = selectedSupplier === '__ALL__' ? 'All suppliers' : selectedSupplier

  const progressPct =
    loadState.status === 'loading' && loadState.progress.totalBytes
      ? Math.min(100, Math.round((loadState.progress.bytesRead / loadState.progress.totalBytes) * 100))
      : null

  return (
    <div className="page">
      <header className="header">
        <div>
          <h1 className="title">Warehouse & Retail Sales Dashboard</h1>
          <p className="subtitle">
            Segment by <strong>supplier (warehouse)</strong> and view monthly totals for <strong>Retail Sales</strong>,{' '}
            <strong>Retail Transfers</strong>, and <strong>Warehouse Sales</strong>.
          </p>
        </div>
        {authState.status === 'ready' && authState.user ? (
          <div className="userBar">
            <div className="userText">
              <div className="userTitle">Thank you for your support.</div>
              <div className="userEmail">{authState.user.email}</div>
            </div>
            <button type="button" className="userBtn" onClick={() => signOut(auth)}>
              Sign out
            </button>
          </div>
        ) : null}
      </header>

      {authState.status !== 'ready' ? (
        <main className="grid single">
          <section className="card authCard">
            <div className="cardTitle">Loading…</div>
            <div className="chartPlaceholder">Checking login status…</div>
          </section>
        </main>
      ) : !authState.user ? (
        <main className="grid single">
          <AuthCard />
        </main>
      ) : (
        <main className="grid">
        <section className="card controls">
          <div className="cardTitle">Filters</div>

          <label className="field">
            <div className="label">Supplier search</div>
            <input
              className="input"
              value={supplierQuery}
              placeholder="Type to filter suppliers…"
              onChange={(e) => setSupplierQuery(e.target.value)}
            />
          </label>

          <label className="field">
            <div className="label">Supplier (warehouse)</div>
            <select
              className="select"
              value={selectedSupplier}
              onChange={(e) => setSelectedSupplier(e.target.value)}
              disabled={!data}
            >
              <option value="__ALL__">All suppliers</option>
              {supplierOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <div className="field">
            <div className="label">Series</div>
            <div className="checks">
              <label className="check">
                <input type="checkbox" checked={showRetailSales} onChange={(e) => setShowRetailSales(e.target.checked)} />
                <span>Retail Sales</span>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={showRetailTransfers}
                  onChange={(e) => setShowRetailTransfers(e.target.checked)}
                />
                <span>Retail Transfers</span>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={showWarehouseSales}
                  onChange={(e) => setShowWarehouseSales(e.target.checked)}
                />
                <span>Warehouse Sales</span>
              </label>
            </div>
          </div>

          {loadState.status === 'loading' && (
            <div className="status">
              <div className="statusRow">
                <div className="statusDot" />
                <div>
                  Loading & aggregating CSV…
                  {progressPct !== null ? ` ${progressPct}%` : ''}
                </div>
              </div>
              <div className="statusMeta">
                Rows processed: {moneyFmt.format(loadState.progress.rowsRead)}
                {loadState.progress.totalBytes ? ` · ${moneyFmt.format(loadState.progress.bytesRead / 1e6)}MB` : ''}
              </div>
            </div>
          )}

          {loadState.status === 'error' && (
            <div className="status error">
              <div className="statusRow">
                <div className="statusDot error" />
                <div>Failed to load data</div>
              </div>
              <div className="statusMeta">{loadState.error.message}</div>
            </div>
          )}

          {loadState.status === 'ready' && (
            <div className="status ok">
              <div className="statusRow">
                <div className="statusDot ok" />
                <div>Ready</div>
              </div>
              <div className="statusMeta">
                {moneyFmt.format(data.rowsRead)} rows · {data.suppliers.length} suppliers · {data.monthKeys.length} months
              </div>
            </div>
          )}
        </section>

        <section className="card chart">
          <div className="cardTitle">Monthly totals — {titleSupplier}</div>

          {loadState.status !== 'ready' ? (
            <div className="chartPlaceholder">Loading chart…</div>
          ) : chartSeries.length === 0 ? (
            <div className="chartPlaceholder">Select at least one series to graph.</div>
          ) : (
            <TimeSeriesChart
              xLabels={data.monthKeys.map(monthKeyLabel)}
              series={chartSeries}
              yLabel="Units"
              formatY={(v) => moneyFmt.format(v)}
            />
          )}

          {loadState.status === 'ready' && (
            <div className="summary">
              <div className="summaryItem">
                <div className="summaryLabel">Retail Sales (sum)</div>
                <div className="summaryValue">{moneyFmt.format(totalsForSelection.retailSales)}</div>
              </div>
              <div className="summaryItem">
                <div className="summaryLabel">Retail Transfers (sum)</div>
                <div className="summaryValue">{moneyFmt.format(totalsForSelection.retailTransfers)}</div>
              </div>
              <div className="summaryItem">
                <div className="summaryLabel">Warehouse Sales (sum)</div>
                <div className="summaryValue">{moneyFmt.format(totalsForSelection.warehouseSales)}</div>
              </div>
            </div>
          )}
        </section>
      </main>
      )}
    </div>
  )
}

export default App
