import { useMemo, useRef, useState } from 'react'

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n))
}

function niceMax(v) {
  if (v <= 0) return 1
  const exp = Math.floor(Math.log10(v))
  const base = 10 ** exp
  const m = v / base
  const step = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10
  return step * base
}

function buildPath({ values, xAt, yAt }) {
  let d = ''
  for (let i = 0; i < values.length; i += 1) {
    const x = xAt(i)
    const y = yAt(values[i])
    d += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`
  }
  return d
}

export function TimeSeriesChart({ xLabels, series, yLabel, formatY }) {
  const svgRef = useRef(null)
  const [hover, setHover] = useState(null) // { idx, x, y }

  const { w, h, pad, innerW, innerH } = useMemo(() => {
    const w0 = 980
    const h0 = 420
    const pad0 = { l: 60, r: 20, t: 18, b: 46 }
    return {
      w: w0,
      h: h0,
      pad: pad0,
      innerW: w0 - pad0.l - pad0.r,
      innerH: h0 - pad0.t - pad0.b,
    }
  }, [])

  const yMax = useMemo(() => {
    let m = 0
    for (const s of series) {
      for (const v of s.values) m = Math.max(m, Number.isFinite(v) ? v : 0)
    }
    return niceMax(m)
  }, [series])

  const xCount = xLabels.length
  const xAt = (i) => pad.l + (xCount <= 1 ? innerW / 2 : (i / (xCount - 1)) * innerW)
  const yAt = (v) => pad.t + innerH - (clamp(v, 0, yMax) / yMax) * innerH

  const yTicks = useMemo(() => {
    const n = 5
    const out = []
    for (let i = 0; i <= n; i += 1) out.push((yMax * i) / n)
    return out
  }, [yMax])

  const xTickEvery = useMemo(() => {
    if (xCount <= 12) return 1
    if (xCount <= 24) return 2
    if (xCount <= 48) return 4
    return 6
  }, [xCount])

  const onMove = (e) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    const nx = (px / rect.width) * w
    const ny = (py / rect.height) * h
    const t = clamp((nx - pad.l) / innerW, 0, 1)
    const idx = Math.round(t * (xCount - 1))
    setHover({ idx, x: xAt(idx), y: ny })
  }

  const onLeave = () => setHover(null)

  return (
    <div className="tsChart">
      <svg
        ref={svgRef}
        className="tsChartSvg"
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label="Time series chart"
        onMouseMove={onMove}
        onMouseLeave={onLeave}
      >
        {/* Grid + Y axis */}
        {yTicks.map((t) => {
          const y = yAt(t)
          return (
            <g key={t}>
              <line x1={pad.l} y1={y} x2={w - pad.r} y2={y} className="tsGrid" />
              <text x={pad.l - 10} y={y + 4} textAnchor="end" className="tsAxisText">
                {formatY ? formatY(t) : String(Math.round(t))}
              </text>
            </g>
          )
        })}

        {/* X axis labels */}
        {xLabels.map((lab, i) => {
          if (i % xTickEvery !== 0 && i !== xLabels.length - 1) return null
          const x = xAt(i)
          return (
            <text key={lab + i} x={x} y={h - 18} textAnchor="middle" className="tsAxisText">
              {lab}
            </text>
          )
        })}

        {/* Axis labels */}
        {yLabel ? (
          <text x={pad.l} y={14} textAnchor="start" className="tsAxisLabel">
            {yLabel}
          </text>
        ) : null}

        {/* Series */}
        {series.map((s) => (
          <path key={s.id} d={buildPath({ values: s.values, xAt, yAt })} fill="none" stroke={s.color} strokeWidth="2.4" />
        ))}

        {/* Hover line + dots */}
        {hover && hover.idx != null ? (
          <g>
            <line x1={xAt(hover.idx)} y1={pad.t} x2={xAt(hover.idx)} y2={h - pad.b} className="tsHoverLine" />
            {series.map((s) => {
              const v = s.values[hover.idx] ?? 0
              return <circle key={s.id} cx={xAt(hover.idx)} cy={yAt(v)} r="4.2" fill={s.color} />
            })}
          </g>
        ) : null}
      </svg>

      <div className="tsLegend">
        {series.map((s) => (
          <div key={s.id} className="tsLegendItem">
            <span className="tsLegendSwatch" style={{ background: s.color }} />
            <span>{s.name}</span>
          </div>
        ))}
      </div>

      {hover && (
        <div className="tsTooltip" aria-live="polite">
          <div className="tsTooltipTitle">{xLabels[hover.idx]}</div>
          {series.map((s) => (
            <div key={s.id} className="tsTooltipRow">
              <span className="tsLegendSwatch" style={{ background: s.color }} />
              <span className="tsTooltipName">{s.name}</span>
              <span className="tsTooltipVal">{formatY ? formatY(s.values[hover.idx] ?? 0) : String(s.values[hover.idx] ?? 0)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


