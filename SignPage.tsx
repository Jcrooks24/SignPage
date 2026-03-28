import { useEffect, useRef, useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────
interface JobData {
  ok: boolean
  jobId: string
  status: string
  alreadySigned: boolean
  error?: string
  client: { name: string; email: string; phone: string; address: string }
  job: {
    package: string; addons: string; date: string; startTime: string
    total: number; deposit: number; balance: number
    tripMiles: number; tripCharge: number; discount: number; notes: string
  }
  company: { name: string; phone: string; email: string; website: string; footer: string }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL as string

function fmt(n: number) {
  return '$' + Number(n || 0).toLocaleString('en-US')
}

function fmtTime(t: string) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

// ─── Signature Canvas ─────────────────────────────────────────────────────────
function SignatureCanvas({ onSigned }: { onSigned: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const hasSig = useRef(false)

  const getPos = (e: MouseEvent | TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect()
    const src = 'touches' in e ? e.touches[0] : e
    return { x: src.clientX - rect.left, y: src.clientY - rect.top }
  }

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    ctx.strokeStyle = '#1A2E3B'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    const start = (e: MouseEvent | TouchEvent) => {
      e.preventDefault()
      drawing.current = true
      const { x, y } = getPos(e, canvas)
      ctx.beginPath(); ctx.moveTo(x, y)
    }
    const move = (e: MouseEvent | TouchEvent) => {
      e.preventDefault()
      if (!drawing.current) return
      hasSig.current = true
      const { x, y } = getPos(e, canvas)
      ctx.lineTo(x, y); ctx.stroke()
      onSigned(canvas.toDataURL())
    }
    const end = () => { drawing.current = false }

    canvas.addEventListener('mousedown', start)
    canvas.addEventListener('mousemove', move)
    canvas.addEventListener('mouseup', end)
    canvas.addEventListener('touchstart', start, { passive: false })
    canvas.addEventListener('touchmove', move, { passive: false })
    canvas.addEventListener('touchend', end)
    return () => {
      canvas.removeEventListener('mousedown', start)
      canvas.removeEventListener('mousemove', move)
      canvas.removeEventListener('mouseup', end)
      canvas.removeEventListener('touchstart', start)
      canvas.removeEventListener('touchmove', move)
      canvas.removeEventListener('touchend', end)
    }
  }, [onSigned])

  const clear = () => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    hasSig.current = false
    onSigned('')
  }

  return (
    <div style={{ position: 'relative' }}>
      <canvas
        ref={canvasRef}
        width={560}
        height={160}
        style={{
          width: '100%', height: 160, border: '1.5px solid #D5D3CC',
          borderRadius: 8, background: '#FAFAF8', touchAction: 'none', cursor: 'crosshair',
          display: 'block',
        }}
      />
      <button
        onClick={clear}
        style={{
          position: 'absolute', top: 8, right: 8,
          fontSize: 11, color: '#9AA8B0', background: 'none',
          border: '1px solid #D5D3CC', borderRadius: 4,
          padding: '2px 8px', cursor: 'pointer',
        }}
      >
        Clear
      </button>
      <p style={{ fontSize: 11, color: '#9AA8B0', margin: '6px 0 0', textAlign: 'center' }}>
        Sign above with mouse or finger
      </p>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SignPage() {
  const params = new URLSearchParams(window.location.search)
  const jobId = params.get('jobId') || ''
  const token = params.get('token') || ''

  const [data, setData] = useState<JobData | null>(null)
  const [error, setError] = useState('')
  const [sigDataUrl, setSigDataUrl] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  // Fetch job data from Apps Script in JSON mode
  useEffect(() => {
    if (!jobId || !token) { setError('Invalid link — missing job ID or token.'); return }
    const url = `${APPS_SCRIPT_URL}?jobId=${encodeURIComponent(jobId)}&token=${encodeURIComponent(token)}&fmt=json`
    fetch(url)
      .then(r => r.json())
      .then((d: JobData) => {
        if (d.error === 'invalid_token') setError('This link has expired or is invalid. Please contact us for a new estimate link.')
        else if (d.error === 'job_not_found') setError('Estimate not found. Please contact us.')
        else if (d.error) setError('Something went wrong. Please contact us.')
        else setData(d)
      })
      .catch(() => setError('Could not load estimate. Please check your connection and try again.'))
  }, [jobId, token])

  // Submit signature back to Apps Script via doPost
  const submit = async () => {
    if (!sigDataUrl) return
    setSubmitting(true)
    try {
      const r = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ jobId, token, sig: sigDataUrl }),
      })
      const d = await r.json()
      if (d.success) setDone(true)
      else setError(d.error || 'Signing failed. Please contact us.')
    } catch {
      setError('Could not submit signature. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Styles ─────────────────────────────────────────────────────────────────
  const s = {
    page: {
      minHeight: '100vh', background: '#F4F3F0',
      fontFamily: "'DM Sans', Arial, sans-serif",
      padding: '0 0 60px',
    } as React.CSSProperties,
    header: {
      background: '#1A2E3B', padding: '18px 24px',
      display: 'flex', alignItems: 'center', gap: 12,
    } as React.CSSProperties,
    logo: { color: '#1D9E75', fontWeight: 800, fontSize: 20, letterSpacing: '-0.02em' },
    sub:  { color: '#8FA5B2', fontSize: 13 },
    card: {
      background: '#fff', borderRadius: 12, border: '1px solid #E2E0DA',
      padding: '24px', marginBottom: 16,
      boxShadow: '0 1px 3px rgba(0,0,0,.06)',
    } as React.CSSProperties,
    label: { fontSize: 10, fontWeight: 700, color: '#9AA8B0', textTransform: 'uppercase' as const, letterSpacing: '.08em', marginBottom: 4 },
    value: { fontSize: 15, fontWeight: 600, color: '#1A2E3B' },
    row:   { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 0', borderBottom: '1px solid #F4F3F0' } as React.CSSProperties,
    total: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '12px 0 0', marginTop: 4 } as React.CSSProperties,
    btn: {
      width: '100%', padding: '15px', background: '#1D9E75', color: '#fff',
      border: 'none', borderRadius: 9, fontSize: 16, fontWeight: 700,
      cursor: 'pointer', letterSpacing: '-0.01em',
      opacity: 1, transition: 'opacity .15s',
    } as React.CSSProperties,
    btnDisabled: { opacity: 0.4, cursor: 'not-allowed' } as React.CSSProperties,
    section: { maxWidth: 600, margin: '0 auto', padding: '0 16px' },
  }

  if (error) return (
    <div style={s.page}>
      <div style={s.header}>
        <span style={s.logo}>Mountaineer Moving</span>
      </div>
      <div style={s.section}>
        <div style={{ ...s.card, marginTop: 32, textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
          <p style={{ color: '#1A2E3B', fontSize: 16, lineHeight: 1.6 }}>{error}</p>
        </div>
      </div>
    </div>
  )

  if (!data) return (
    <div style={s.page}>
      <div style={s.header}><span style={s.logo}>Mountaineer Moving</span></div>
      <div style={{ ...s.section, textAlign: 'center', paddingTop: 80 }}>
        <div style={{ width: 36, height: 36, border: '3px solid #1D9E75', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
        <p style={{ color: '#9AA8B0' }}>Loading your estimate…</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    </div>
  )

  if (data.alreadySigned || done) return (
    <div style={s.page}>
      <div style={s.header}>
        <span style={s.logo}>{data?.company.name || 'Mountaineer Moving'}</span>
      </div>
      <div style={{ ...s.section, textAlign: 'center', paddingTop: 60 }}>
        <div style={{ ...s.card, padding: 48 }}>
          <div style={{ width: 64, height: 64, background: '#EAF3DE', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 28 }}>✓</div>
          <h2 style={{ color: '#1D9E75', margin: '0 0 12px', fontSize: 24 }}>
            {done ? 'Estimate signed!' : 'Already signed'}
          </h2>
          <p style={{ color: '#6B7E8A', margin: 0, lineHeight: 1.6 }}>
            {done
              ? `Thank you, ${data.client.name.split(' ')[0]}. We'll be in touch to confirm your booking.`
              : `This estimate (${data.jobId}) has already been signed. We'll be in touch shortly.`}
          </p>
          {data.company.phone && (
            <p style={{ color: '#9AA8B0', fontSize: 13, marginTop: 24 }}>
              Questions? Call us at {data.company.phone}
            </p>
          )}
        </div>
      </div>
    </div>
  )

  const { job, client, company } = data
  const addons = job.addons ? job.addons.split(',').map(s => s.trim()).filter(Boolean) : []
  const canSubmit = !!sigDataUrl && agreed && !submitting

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <div style={s.logo}>{company.name}</div>
          <div style={s.sub}>Estimate {data.jobId}</div>
        </div>
      </div>

      <div style={s.section}>
        <div style={{ paddingTop: 24 }} />

        {/* Client & Job Info */}
        <div style={s.card}>
          <div style={s.label}>Prepared for</div>
          <div style={{ ...s.value, marginBottom: 4 }}>{client.name}</div>
          <div style={{ fontSize: 13, color: '#6B7E8A' }}>{client.address}</div>
        </div>

        {/* Estimate Details */}
        <div style={s.card}>
          <div style={{ ...s.label, marginBottom: 12 }}>Estimate summary</div>

          {/* Date */}
          {job.date && (
            <div style={s.row}>
              <span style={{ fontSize: 14, color: '#6B7E8A' }}>Service date</span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>
                {job.date}{job.startTime ? ` at ${fmtTime(job.startTime)}` : ''}
              </span>
            </div>
          )}

          {/* Package */}
          <div style={s.row}>
            <span style={{ fontSize: 14, color: '#6B7E8A' }}>{job.package}</span>
            <span style={{ fontSize: 14, fontWeight: 600 }}></span>
          </div>

          {/* Add-ons */}
          {addons.map(a => (
            <div key={a} style={{ ...s.row, color: '#9AA8B0' }}>
              <span style={{ fontSize: 13 }}>+ {a}</span>
            </div>
          ))}

          {/* Trip */}
          {job.tripCharge > 0 && (
            <div style={s.row}>
              <span style={{ fontSize: 14, color: '#6B7E8A' }}>Trip charge ({job.tripMiles} mi)</span>
              <span style={{ fontSize: 14 }}>{fmt(job.tripCharge)}</span>
            </div>
          )}

          {/* Discount */}
          {job.discount > 0 && (
            <div style={s.row}>
              <span style={{ fontSize: 14, color: '#6B7E8A' }}>Discount</span>
              <span style={{ fontSize: 14, color: '#1D9E75' }}>-{fmt(job.discount)}</span>
            </div>
          )}

          {/* Total */}
          <div style={s.total}>
            <span style={{ fontSize: 17, fontWeight: 700 }}>Total</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: '#1D9E75' }}>{fmt(job.total)}</span>
          </div>

          {/* Deposit */}
          {job.deposit > 0 && (
            <div style={{ background: '#F8F7F4', borderRadius: 6, padding: '10px 12px', marginTop: 12, fontSize: 13, color: '#6B7E8A' }}>
              Deposit due at signing: <strong style={{ color: '#1A2E3B' }}>{fmt(job.deposit)}</strong>
              {' '}· Balance due at service: <strong style={{ color: '#1A2E3B' }}>{fmt(job.balance)}</strong>
            </div>
          )}
        </div>

        {/* Client Notes */}
        {job.notes && (
          <div style={{ ...s.card, background: '#F8F7F4', borderColor: '#E2E0DA' }}>
            <div style={s.label}>Notes</div>
            <p style={{ fontSize: 14, color: '#1A2E3B', margin: 0, lineHeight: 1.6 }}>{job.notes}</p>
          </div>
        )}

        {/* Signature */}
        <div style={s.card}>
          <div style={{ ...s.label, marginBottom: 12 }}>Your signature</div>
          <SignatureCanvas onSigned={setSigDataUrl} />

          {/* Legal agreement */}
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 20, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
              style={{ marginTop: 2, width: 16, height: 16, cursor: 'pointer' }}
            />
            <span style={{ fontSize: 13, color: '#6B7E8A', lineHeight: 1.5 }}>
              By signing I confirm I have reviewed this estimate and authorise{' '}
              <strong style={{ color: '#1A2E3B' }}>{company.name}</strong> to perform
              the described services on the stated date.
            </span>
          </label>

          {/* Submit */}
          <button
            style={{ ...s.btn, marginTop: 20, ...(canSubmit ? {} : s.btnDisabled) }}
            disabled={!canSubmit}
            onClick={submit}
          >
            {submitting ? 'Submitting…' : 'Sign & confirm estimate'}
          </button>

          {!sigDataUrl && agreed && (
            <p style={{ fontSize: 12, color: '#E24B4A', textAlign: 'center', marginTop: 8 }}>
              Please add your signature above
            </p>
          )}
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', padding: '8px 0 0' }}>
          <p style={{ fontSize: 12, color: '#9AA8B0', lineHeight: 1.8, margin: 0 }}>
            {company.name}
            {company.phone && <> · {company.phone}</>}
            {company.email && <> · {company.email}</>}
          </p>
          {company.footer && <p style={{ fontSize: 11, color: '#C5C3BC', marginTop: 4 }}>{company.footer}</p>}
        </div>
      </div>

      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800&display=swap" rel="stylesheet" />
    </div>
  )
}
