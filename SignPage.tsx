import { useEffect, useRef, useState, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────
interface JobData {
  ok: boolean
  jobId: string
  status: string
  alreadySigned: boolean
  error?: string
  client: { name: string; email: string; phone: string; address: string }
  job: {
    package: string; pkgPrice: number; pkgRateLabel: string
    addonLines: { name: string; price: number }[]
    multiDaySchedule: { day: number; date: string; startTime: string; label: string; package?: string; notes?: string }[]
    customLineItems: { name: string; description: string; unitType: string; unitCost: number; unitQty: number; total: number }[]
    addons: string; date: string; startTime: string
    total: number; deposit: number; balance: number
    tripMiles: number; tripCharge: number; discount: number; notes: string
  }
  company: { name: string; phone: string; email: string; website: string; footer: string }
}

type Step = 'estimate' | 'agreement' | 'done'

const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL as string

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return '$' + Number(n || 0).toLocaleString('en-US')
}

function fmtDate(s: string | Date) {
  if (!s) return 'TBD'
  // If it's already a formatted string (e.g. "Apr 15, 2026"), return as-is
  if (typeof s === 'string' && !/^\d{4}-\d{2}|^\d+$/.test(s.trim())) return s
  // Parse date — add T12:00:00 to avoid UTC midnight timezone-shift bug
  const str = typeof s === 'string' ? s : s.toISOString()
  const normalized = str.includes('T') ? str : str.slice(0, 10) + 'T12:00:00'
  const d = new Date(normalized)
  if (isNaN(d.getTime())) return String(s)
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function fmtTime(t: string) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

function today() {
  return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

// ─── Signature Pad ────────────────────────────────────────────────────────────
function SigPad({ id, onSigned }: { id: string; onSigned: (url: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)

  const clear = useCallback(() => {
    const c = ref.current!
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, c.width, c.height)
    onSigned('')
  }, [onSigned])

  useEffect(() => {
    const c = ref.current!
    const ctx = c.getContext('2d')!
    ctx.strokeStyle = '#0F1923'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    const getXY = (e: MouseEvent | TouchEvent) => {
      const r = c.getBoundingClientRect()
      const src = 'touches' in e ? e.touches[0] : e
      return {
        x: (src.clientX - r.left) * (c.width / r.width),
        y: (src.clientY - r.top) * (c.height / r.height),
      }
    }

    const down = (e: MouseEvent | TouchEvent) => {
      e.preventDefault()
      drawing.current = true
      const p = getXY(e)
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
    }
    const mv = (e: MouseEvent | TouchEvent) => {
      e.preventDefault()
      if (!drawing.current) return
      const p = getXY(e)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
      onSigned(c.toDataURL())
    }
    const up = () => { drawing.current = false }

    c.addEventListener('mousedown', down)
    c.addEventListener('mousemove', mv)
    c.addEventListener('mouseup', up)
    c.addEventListener('mouseleave', up)
    c.addEventListener('touchstart', down, { passive: false })
    c.addEventListener('touchmove', mv, { passive: false })
    c.addEventListener('touchend', up)
    return () => {
      c.removeEventListener('mousedown', down)
      c.removeEventListener('mousemove', mv)
      c.removeEventListener('mouseup', up)
      c.removeEventListener('mouseleave', up)
      c.removeEventListener('touchstart', down)
      c.removeEventListener('touchmove', mv)
      c.removeEventListener('touchend', up)
    }
  }, [onSigned])

  return (
    <div style={{ position: 'relative' }}>
      <canvas
        ref={ref}
        id={id}
        width={600}
        height={150}
        style={{
          width: '100%', height: 120, border: '1px solid #CBD5E1',
          borderRadius: 6, background: '#FAFBFC', display: 'block',
          touchAction: 'none', cursor: 'crosshair',
        }}
      />
      <button
        onClick={clear}
        style={{
          position: 'absolute', top: 6, right: 8, fontSize: 11,
          color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px',
        }}
      >
        Clear
      </button>
      <p style={{ fontSize: 11, color: '#94A3B8', margin: '4px 0 0', textAlign: 'center' }}>
        Draw your signature above
      </p>
    </div>
  )
}

// ─── Progress ─────────────────────────────────────────────────────────────────
function Progress({ step }: { step: Step }) {
  const steps = [
    { key: 'estimate', label: 'Review Estimate' },
    { key: 'agreement', label: 'Service Agreement' },
    { key: 'done', label: 'Complete' },
  ]
  const idx = steps.findIndex(s => s.key === step)
  return (
    <div style={{ display: 'flex', alignItems: 'center', margin: '24px 0 28px' }}>
      {steps.map((s, i) => (
        <div key={s.key} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700,
              background: i <= idx ? '#0F4C35' : '#E2E8F0',
              color: i <= idx ? '#fff' : '#94A3B8',
            }}>
              {i < idx ? '✓' : i + 1}
            </div>
            <span style={{
              fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap',
              letterSpacing: '.04em', textTransform: 'uppercase',
              color: i <= idx ? '#0F4C35' : '#94A3B8',
            }}>
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div style={{
              flex: 1, height: 2,
              background: i < idx ? '#0F4C35' : '#E2E8F0',
              margin: '0 8px', marginBottom: 22,
            }} />
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Agreement Text ───────────────────────────────────────────────────────────
function AgreementText({ d }: { d: JobData }) {
  const { client, job, company } = d
  const addons = job.addons ? job.addons.split(',').map(s => s.trim()).filter(Boolean) : []

  const Sec = ({ n, t }: { n: string; t: string }) => (
    <div style={{ fontWeight: 700, fontSize: 13, color: '#0F1923', marginTop: 20, marginBottom: 6, borderLeft: '3px solid #0F4C35', paddingLeft: 8 }}>
      {n}. {t}
    </div>
  )
  const P = ({ children }: { children: React.ReactNode }) => (
    <p style={{ margin: '0 0 8px', color: '#334155', lineHeight: 1.65, fontSize: 12.5 }}>{children}</p>
  )
  const Li = ({ children }: { children: React.ReactNode }) => (
    <li style={{ margin: '3px 0', color: '#334155', lineHeight: 1.6, fontSize: 12.5 }}>{children}</li>
  )

  return (
    <div style={{ fontFamily: "'Georgia', serif", color: '#1E293B' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 20, paddingBottom: 16, borderBottom: '2px solid #0F4C35' }}>
        <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: '.06em', color: '#0F1923' }}>MOUNTAINEER MOVING</div>
        <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>Cleaning Division — Service Agreement</div>
        <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>406-201-9580 · management@mountaineermoving.com · mountaineermoving.com</div>
      </div>

      <Sec n="1" t="Parties" />
      <P>This Cleaning Service Agreement ("Agreement") is entered into between:</P>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12, fontSize: 12 }}>
        <tbody>
          {[
            ['Company:', 'Mountaineer Moving LLC ("MM" or "Company")'],
            ['Address:', '172 Timberline Drive, Bozeman, MT 59718'],
            ['Phone / Email:', '406-201-9580 · management@mountaineermoving.com'],
            ['Client Name:', client.name],
            ['Client Address:', client.address],
            ['Client Phone / Email:', [client.phone, client.email].filter(Boolean).join(' · ')],
            ['Service Address:', client.address],
            ['Agreement Date:', today()],
          ].map(([label, val]) => (
            <tr key={label}>
              <td style={{ padding: '4px 8px 4px 0', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap', verticalAlign: 'top', width: 140 }}>{label}</td>
              <td style={{ padding: '4px 0', color: '#0F1923', fontWeight: [client.name, today()].includes(val as string) ? 700 : 400 }}>{val || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <P>By signing below or accepting services, the Client agrees to all terms and conditions set forth in this Agreement. This Agreement constitutes a binding contract between the Client and Mountaineer Moving LLC (MM).</P>

      <Sec n="2" t="Service Rates" />
      <P>All services are priced according to the following schedule.</P>
      <div style={{ fontWeight: 600, fontSize: 12, marginTop: 10, marginBottom: 4, color: '#475569' }}>2a. Cleaning Packages</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 10 }}>
        <thead>
          <tr style={{ background: '#F1F5F9' }}>
            {['Package', 'Rate', 'Minimum', "What's Included"].map(h => (
              <th key={h} style={{ padding: '5px 8px', textAlign: 'left', fontWeight: 700, color: '#334155', borderBottom: '1px solid #CBD5E1' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[
            ['Basic Move Out Clean', '$0.50 / sq ft', '$350 minimum', 'Full deep clean of vacant property – all surfaces, appliance exteriors, floors, bathrooms, kitchen'],
            ['Deep Move Out Clean', '$0.60 / sq ft', 'None', 'Thorough clean including baseboards, inside appliances, light fixtures, and window tracks'],
            ['Recurring Clean', '$65 / hour', '$150 minimum', 'Regular maintenance clean – dust, vacuum, mop, bathrooms, kitchen surfaces'],
            ['Specialty Clean', '$75 / hour', '$150 minimum', 'Custom scope – post-construction, event cleanup, or other non-standard jobs'],
          ].map(([pkg, ...rest]) => (
            <tr key={pkg} style={{ borderBottom: '1px solid #F1F5F9' }}>
              <td style={{ padding: '4px 8px', fontWeight: 600 }}>{pkg}</td>
              {rest.map((v, i) => <td key={i} style={{ padding: '4px 8px', color: '#475569' }}>{v}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4, color: '#475569' }}>2c. Optional Add-Ons</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 10 }}>
        <thead>
          <tr style={{ background: '#F1F5F9' }}>
            {['Add-On', 'Price', 'Est. Time'].map(h => (
              <th key={h} style={{ padding: '5px 8px', textAlign: 'left', fontWeight: 700, color: '#334155', borderBottom: '1px solid #CBD5E1' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[['Inside Oven','$45','~30 min'],['Inside Fridge','$40','~20 min'],['Carpet Cleaning','$50/room','~30 min'],['Window Washing','$75','~45 min'],['Baseboard Detail','$35','~30 min'],['Garage / Utility','$60','~45 min']].map(([n,...r]) => (
            <tr key={n} style={{ borderBottom: '1px solid #F1F5F9' }}>
              <td style={{ padding: '4px 8px', fontWeight: 600 }}>{n}</td>
              {r.map((v,i) => <td key={i} style={{ padding: '4px 8px', color: '#475569' }}>{v}</td>)}
            </tr>
          ))}
        </tbody>
      </table>

      <Sec n="3" t="Estimates, Bids & Scope of Work" />
      <P><strong>3a. Estimates.</strong> An estimate is a best-guess price based on Client-provided information. Estimates are not firm prices. The actual price may vary based on conditions observed upon arrival.</P>
      <P><strong>3b. Fixed-Rate Bids.</strong> A bid is a firm price based on conditions specifically agreed upon in writing. Change orders must be in writing; a $75 administrative fee applies per change order.</P>
      <P><strong>3c. Scope Limitations.</strong> MM will perform only services described in the written estimate or job ticket. Interior appliances, carpet cleaning, window washing, and garage cleaning are excluded unless added as an add-on.</P>

      <Sec n="4" t="Payment Terms" />
      <ul style={{ margin: '0 0 8px', paddingLeft: 18 }}>
        <Li><strong>Methods:</strong> Credit card (3.5% fee), check, or ACH bank transfer.</Li>
        <Li><strong>Due:</strong> Within 14 days of invoice receipt.</Li>
        <Li><strong>Late fees:</strong> 1.5% per month compounding after due date.</Li>
        <Li><strong>Deposits:</strong> 30% deposit required for jobs exceeding $1,000.</Li>
        <Li><strong>Chargebacks:</strong> Client agrees not to initiate chargebacks for services rendered without first notifying MM in writing.</Li>
        <Li><strong>Collection:</strong> Client agrees to pay all collection expenses including reasonable attorney's fees.</Li>
      </ul>

      <Sec n="5" t="Cancellation, Rescheduling & Lockout" />
      <P><strong>5a.</strong> More than 5 business days' notice: full deposit refund. 2–5 business days: 50% refunded. Less than 1 business day: deposit forfeited.</P>
      <P><strong>5b.</strong> Rescheduling with 3+ business days' notice incurs no fee. Less than 3 days may result in deposit forfeiture at MM's discretion.</P>
      <P><strong>5c. Lockout Fee.</strong> If MM crew cannot access the property within 15 minutes of scheduled start, a $75 lockout fee applies and the original deposit is not refunded.</P>

      <Sec n="6" t="Right to Deny or Discontinue Service" />
      <P>MM reserves the right to deny or discontinue service at any time. A trip charge of $75 applies if MM declines service on-site. If work has begun, the Client will be charged for time worked at the applicable hourly rate plus the trip charge. MM will not be liable for any costs or damages resulting from a decision to deny or discontinue service.</P>

      <Sec n="7" t="Property Condition & Client Disclosure" />
      <P>Client is responsible for disclosing known mold, pests, hazardous materials, fragile surfaces, and chemical sensitivities prior to service. MM may adjust pricing, apply condition surcharges, or decline service for undisclosed conditions discovered upon arrival.</P>

      <Sec n="8" t="Damage, Claims & Right to Correct Work" />
      <P><strong>8a.</strong> All damage claims must be submitted in writing to management@mountaineermoving.com within <strong>24 hours</strong> of service completion.</P>
      <P><strong>8b.</strong> MM must be given the opportunity to correct disputed work within 3 business days before any refund is considered.</P>
      <P><strong>8c. Liability Limit.</strong> MM's maximum liability is limited to the cost of the service performed. MM is not liable for pre-existing damage, unsecured items, or specialty surfaces not disclosed in advance.</P>
      <P><strong>8e.</strong> No legal action may be initiated unless a timely written claim has been submitted and MM given opportunity to respond. Any action must commence within <strong>6 months</strong> of service date.</P>

      <Sec n="9" t="Supplies & Equipment" />
      <P>MM provides all cleaning supplies and equipment. If the Client requests specific products, the Client must supply them. MM is not responsible for results from Client-supplied products.</P>

      <Sec n="10" t="Access to Property" />
      <P>Client must ensure safe, unobstructed access at the scheduled start time. For move-out cleans, the property must be fully vacated and accessible before the crew arrives. Furniture, personal belongings, and debris must be removed in advance unless pre-arranged. For properties being staged, cleaners can work around them. Cleaners can remove up to one 50-gallon trash bag of debris at no additional charge. Client is responsible for providing keys, door codes, gate codes, and adequate parking. MM will not retain keys beyond the day of service. See Section 5c for lockout policy.</P>

      <Sec n="11-12" t="Confidentiality & Chemical Use" />
      <P>MM crew will not photograph or discuss the interior of Client's property with any third party. MM uses professional-grade chemicals per EPA/OSHA guidelines. Clients must disclose any known allergies or chemical sensitivities prior to scheduling.</P>

      <Sec n="13-14" t="Adverse Conditions & Holiday Rates" />
      <P>MM may reschedule due to adverse weather or circumstances beyond MM's reasonable control. Holiday rates (New Year's, Memorial Day, Independence Day, Labor Day, Thanksgiving, Christmas) are charged at 2× the standard rate.</P>

      <Sec n="15" t="Recurring Service Terms" />
      <P>A minimum of 7 days' written notice is required to cancel a recurring service agreement without penalty. MM conducts annual pricing reviews with 30 days' advance notice of rate changes.</P>

      <Sec n="16" t="Dispute Resolution" />
      <P>Client agrees to notify MM in writing before initiating legal action and allow MM no less than 10 business days to attempt resolution. Good-faith mediation is required before litigation. This Agreement is governed by the laws of the State of Montana.</P>

      <Sec n="17" t="Additional Terms" />
      <P>Delays caused by third parties are billable at normal hourly rates. Client is responsible for securing adequate parking and access for MM vehicles; tickets, towing, or delays caused by inadequate access are billable to the Client. Any amendment to this Agreement must be in writing and signed by both parties. If any provision is found unenforceable, remaining provisions remain in full force and effect. MM reserves the right to update these terms with written notice to the Client. Updated terms will not apply retroactively to confirmed jobs.</P>

      {/* Booked job summary */}
      <div style={{ margin: '20px 0', padding: '14px 16px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: '#0F4C35', marginBottom: 8, letterSpacing: '.04em' }}>SERVICES BOOKED UNDER THIS AGREEMENT</div>
        <table style={{ width: '100%', fontSize: 12 }}>
          <tbody>
            {/* Date */}
            <tr>
              <td style={{ padding: '2px 8px 2px 0', color: '#475569', fontWeight: 600, width: 140 }}>Job Reference:</td>
              <td style={{ padding: '2px 0', color: '#0F1923' }}>{d.jobId}</td>
            </tr>
            {(job.multiDaySchedule || []).length > 0 ? (
              <>
                <tr><td style={{ padding: '4px 8px 2px 0', color: '#475569', fontWeight: 700 }} colSpan={2}>Schedule ({job.multiDaySchedule.length} days):</td></tr>
                {job.multiDaySchedule.map(d => (
                  <tr key={d.day}>
                    <td style={{ padding: '3px 8px 3px 12px', color: '#475569', fontWeight: 600, verticalAlign: 'top' }}>
                      Day {d.day}{d.label ? ` — ${d.label}` : ''}:
                      {d.package && d.package !== 'N/A' && <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 400 }}>{d.package}</div>}
                    </td>
                    <td style={{ padding: '3px 0', color: '#0F1923', verticalAlign: 'top' }}>
                      {fmtDate(d.date)} at {fmtTime(d.startTime)}
                      {d.notes && <div style={{ fontSize: 10, color: '#64748B', fontStyle: 'italic' }}>{d.notes}</div>}
                    </td>
                  </tr>
                ))}
              </>
            ) : (
              <tr>
                <td style={{ padding: '2px 8px 2px 0', color: '#475569', fontWeight: 600 }}>Service Date:</td>
                <td style={{ padding: '2px 0', color: '#0F1923' }}>{fmtDate(job.date)}{job.startTime ? ` at ${fmtTime(job.startTime)}` : ''}</td>
              </tr>
            )}
            {/* Package line */}
            <tr>
              <td style={{ padding: '6px 8px 2px 0', color: '#475569', fontWeight: 600 }}>{job.package}:</td>
              <td style={{ padding: '6px 0 2px', color: '#0F1923' }}>{fmt(job.pkgPrice)}</td>
            </tr>
            {job.pkgRateLabel && (
              <tr>
                <td colSpan={2} style={{ padding: '0 8px 4px', color: '#94A3B8', fontSize: 10 }}>{job.pkgRateLabel}</td>
              </tr>
            )}
            {/* Addon lines */}
            {(job.addonLines || []).map(a => (
              <tr key={a.name}>
                <td style={{ padding: '2px 8px 2px 12px', color: '#64748B' }}>{a.name}:</td>
                <td style={{ padding: '2px 0', color: '#64748B' }}>{fmt(a.price)}</td>
              </tr>
            ))}
            {/* Custom line items */}
            {(job.customLineItems || []).map(cl => (
              <tr key={cl.name}>
                <td style={{ padding: '2px 8px 2px 12px', color: '#64748B' }}>
                  {cl.name}{cl.description ? ` — ${cl.description}` : ''}
                  {cl.unitType === 'hourly' && <span style={{ display: 'block', fontSize: 10, color: '#94A3B8' }}>{cl.unitQty} hr{cl.unitQty !== 1 ? 's' : ''} @ ${cl.unitCost}/hr</span>}:
                </td>
                <td style={{ padding: '2px 0', color: '#64748B' }}>{fmt(cl.total)}</td>
              </tr>
            ))}

            {/* Trip */}
            {job.tripCharge > 0 && (
              <tr>
                <td style={{ padding: '2px 8px 2px 0', color: '#475569', fontWeight: 600 }}>Trip charge ({job.tripMiles} mi):</td>
                <td style={{ padding: '2px 0', color: '#0F1923' }}>{fmt(job.tripCharge)}</td>
              </tr>
            )}
            {/* Discount */}
            {job.discount > 0 && (
              <tr>
                <td style={{ padding: '2px 8px 2px 0', color: '#475569', fontWeight: 600 }}>Discount:</td>
                <td style={{ padding: '2px 0', color: '#0F4C35' }}>−{fmt(job.discount)}</td>
              </tr>
            )}
            {/* Total */}
            <tr style={{ borderTop: '1px solid #BBF7D0' }}>
              <td style={{ padding: '6px 8px 2px 0', color: '#0F4C35', fontWeight: 700 }}>Total:</td>
              <td style={{ padding: '6px 0 2px', color: '#0F4C35', fontWeight: 700 }}>{fmt(job.total)}</td>
            </tr>
            {job.deposit > 0 && <>
              <tr>
                <td style={{ padding: '2px 8px 2px 0', color: '#475569', fontWeight: 600 }}>Deposit Due:</td>
                <td style={{ padding: '2px 0', color: '#0F1923' }}>{fmt(job.deposit)}</td>
              </tr>
              <tr>
                <td style={{ padding: '2px 8px 2px 0', color: '#475569', fontWeight: 600 }}>Balance at Service:</td>
                <td style={{ padding: '2px 0', color: '#0F1923' }}>{fmt(job.balance)}</td>
              </tr>
            </>}
          </tbody>
        </table>
      </div>

      <Sec n="18" t="Agreement & Signature" />
      <P>By signing below, both parties acknowledge they have read, understood, and agree to all terms and conditions of this Agreement.</P>
    </div>
  )
}

// ─── Header & Footer ──────────────────────────────────────────────────────────
function Header({ company, jobId }: { company?: string; jobId?: string }) {
  return (
    <div style={{ background: '#0F1923', padding: '16px 24px', display: 'flex', alignItems: 'center' }}>
      <div>
        <div style={{ color: '#34D399', fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em' }}>
          {company || 'Mountaineer Moving'}
        </div>
        {jobId && <div style={{ color: '#64748B', fontSize: 12, marginTop: 1 }}>Estimate {jobId}</div>}
      </div>
    </div>
  )
}

function Footer({ company }: { company: { name: string; phone: string; email: string; footer: string } }) {
  return (
    <div style={{ textAlign: 'center', paddingTop: 8, paddingBottom: 24 }}>
      <p style={{ fontSize: 12, color: '#94A3B8', lineHeight: 1.8, margin: 0 }}>
        {company.name}{company.phone && <> · {company.phone}</>}{company.email && <> · {company.email}</>}
      </p>
      {company.footer && <p style={{ fontSize: 11, color: '#CBD5E1', marginTop: 4 }}>{company.footer}</p>}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function SignPage() {
  const params = new URLSearchParams(window.location.search)
  const jobId = params.get('jobId') || ''
  const token = params.get('token') || ''

  const [data, setData] = useState<JobData | null>(null)
  const [error, setError] = useState('')
  const [step, setStep] = useState<Step>('estimate')
  const [sig1, setSig1] = useState('')
  const [agreed1, setAgreed1] = useState(false)
  const [submitting1, setSubmitting1] = useState(false)
  const [sig2, setSig2] = useState('')
  const [agreed2, setAgreed2] = useState(false)
  const [submitting2, setSubmitting2] = useState(false)
  const [scrolledToBottom, setScrolledToBottom] = useState(false)
  const agreementRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!jobId || !token) { setError('Invalid link — missing job ID or token.'); return }
    fetch(`${APPS_SCRIPT_URL}?jobId=${encodeURIComponent(jobId)}&token=${encodeURIComponent(token)}&fmt=json`)
      .then(r => r.json())
      .then((d: JobData) => {
        if (d.error === 'invalid_token') setError('This link has expired or is invalid. Please contact us.')
        else if (d.error === 'job_not_found') setError('Estimate not found. Please contact us.')
        else if (d.error) setError('Something went wrong. Please contact us.')
        else if (d.alreadySigned) setStep('done')
        else setData(d)
      })
      .catch(() => setError('Could not load estimate. Please check your connection and try again.'))
  }, [jobId, token])

  useEffect(() => {
    if (step !== 'agreement') return
    const el = agreementRef.current
    if (!el) return
    const check = () => {
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) setScrolledToBottom(true)
    }
    el.addEventListener('scroll', check)
    check()
    return () => el.removeEventListener('scroll', check)
  }, [step])

  const advanceToAgreement = async () => {
    if (!sig1) return
    setSubmitting1(true)
    await new Promise(r => setTimeout(r, 300))
    setSubmitting1(false)
    setStep('agreement')
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50)
  }

  const submitAll = async () => {
    if (!sig2) return
    setSubmitting2(true)
    try {
      // Apps Script blocks CORS preflight on JSON POSTs — use form-encoded instead
      // which sends as a simple request with no preflight
      const params = new URLSearchParams()
      params.append('jobId', jobId)
      params.append('token', token)
      params.append('sig',  sig1)
      params.append('sig2', sig2)

      const r = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      })
      const text = await r.text()
      let d: { success?: boolean; error?: string } = {}
      try { d = JSON.parse(text) } catch { d = { error: text } }
      if (d.success) setStep('done')
      else setError(d.error || 'Signing failed. Please contact us.')
    } catch (err) {
      console.error('Submit error:', err)
      setError('Could not submit. Please try again.')
    } finally {
      setSubmitting2(false)
    }
  }

  const page: React.CSSProperties = {
    minHeight: '100vh',
    background: 'linear-gradient(160deg, #F8FAFC 0%, #F0F4F8 100%)',
    fontFamily: "'DM Sans', system-ui, sans-serif",
    paddingBottom: 60,
  }
  const wrap: React.CSSProperties = { maxWidth: 660, margin: '0 auto', padding: '0 16px' }
  const card: React.CSSProperties = {
    background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0',
    padding: '24px', marginBottom: 16, boxShadow: '0 1px 4px rgba(15,25,35,.06)',
  }
  const makeBtn = (disabled: boolean): React.CSSProperties => ({
    width: '100%', padding: '14px', borderRadius: 8, border: 'none',
    background: disabled ? '#CBD5E1' : '#0F4C35', color: '#fff',
    fontSize: 15, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'background .2s',
  })
  const label: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, letterSpacing: '.08em',
    textTransform: 'uppercase', color: '#94A3B8', marginBottom: 6, display: 'block',
  }
  const row: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '9px 0', borderBottom: '1px solid #F1F5F9',
  }

  if (error) return (
    <div style={page}>
      <Header />
      <div style={wrap}>
        <div style={{ ...card, marginTop: 32, textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>⚠️</div>
          <p style={{ color: '#1E293B', fontSize: 15, lineHeight: 1.7, margin: 0 }}>{error}</p>
        </div>
      </div>
    </div>
  )

  if (!data && step !== 'done') return (
    <div style={page}>
      <Header />
      <div style={{ ...wrap, textAlign: 'center', paddingTop: 80 }}>
        <div style={{
          width: 36, height: 36, border: '3px solid #0F4C35', borderTopColor: 'transparent',
          borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px',
        }} />
        <p style={{ color: '#94A3B8' }}>Loading your estimate…</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    </div>
  )

  if (step === 'done') return (
    <div style={page}>
      <Header company={data?.company.name} />
      <div style={wrap}>
        <div style={{ ...card, marginTop: 32, textAlign: 'center', padding: 56 }}>
          <div style={{
            width: 64, height: 64, background: '#DCFCE7', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px', fontSize: 28,
          }}>✓</div>
          <h2 style={{ color: '#0F4C35', margin: '0 0 10px', fontSize: 22, fontWeight: 800 }}>
            {data?.alreadySigned ? 'Already signed' : 'All signed — thank you!'}
          </h2>
          <p style={{ color: '#64748B', margin: '0 0 8px', lineHeight: 1.7, fontSize: 14 }}>
            {data?.alreadySigned
              ? `This estimate (${data.jobId}) has already been signed. We'll be in touch shortly.`
              : `Thank you, ${data?.client.name.split(' ')[0]}. Your estimate and service agreement are signed. We'll be in touch to confirm your booking.`}
          </p>
          {data?.company.phone && (
            <p style={{ color: '#94A3B8', fontSize: 12, marginTop: 20 }}>Questions? {data.company.phone}</p>
          )}
        </div>
      </div>
    </div>
  )

  const { job, client, company } = data!
  const addons = job.addons ? job.addons.split(',').map(s => s.trim()).filter(Boolean) : []

  // ── Step 1: Estimate ─────────────────────────────────────────────────────────
  if (step === 'estimate') return (
    <div style={page}>
      <Header company={company.name} jobId={data!.jobId} />
      <div style={wrap}>
        <Progress step="estimate" />

        <div style={card}>
          <span style={label}>Prepared for</span>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#0F1923', marginBottom: 2 }}>{client.name}</div>
          <div style={{ fontSize: 13, color: '#64748B' }}>{client.address}</div>
        </div>

        <div style={card}>
          <span style={label}>Estimate summary</span>
          {/* Multi-day schedule or single date */}
          {(job.multiDaySchedule || []).length > 0 ? (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', letterSpacing: '.06em', textTransform: 'uppercase', padding: '6px 0 4px' }}>Schedule — {job.multiDaySchedule.length}-day job</div>
              {job.multiDaySchedule.map(d => (
                <div key={d.day} style={{ borderBottom: '1px solid #F1F5F9', paddingBottom: 8, marginBottom: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#0F1923' }}>
                      Day {d.day}{d.label ? ` — ${d.label}` : ''}
                    </span>
                    <span style={{ fontSize: 13, color: '#0F1923' }}>{fmtDate(d.date)} at {fmtTime(d.startTime)}</span>
                  </div>
                  {d.package && d.package !== 'N/A' && (
                    <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{d.package}</div>
                  )}
                  {d.notes && (
                    <div style={{ fontSize: 11, color: '#64748B', fontStyle: 'italic', marginTop: 2 }}>{d.notes}</div>
                  )}
                </div>
              ))}
            </>
          ) : job.date ? (
            <div style={row}>
              <span style={{ fontSize: 14, color: '#64748B' }}>Service date</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#0F1923' }}>
                {fmtDate(job.date)}{job.startTime ? ` at ${fmtTime(job.startTime)}` : ''}
              </span>
            </div>
          ) : null}
          {/* Package */}
          <div style={{ ...row, borderBottom: job.pkgRateLabel ? 'none' : undefined, paddingBottom: job.pkgRateLabel ? 4 : undefined }}>
            <span style={{ fontSize: 14, color: '#0F1923', fontWeight: 500 }}>{job.package}</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#0F1923' }}>{fmt(job.pkgPrice)}</span>
          </div>
          {job.pkgRateLabel && (
            <div style={{ fontSize: 11, color: '#94A3B8', padding: '0 0 9px', borderBottom: '1px solid #F1F5F9' }}>
              {job.pkgRateLabel}
            </div>
          )}

          {/* Add-ons — each with price */}
          {(job.addonLines || []).map(a => (
            <div key={a.name} style={{ ...row, borderColor: '#F1F5F9' }}>
              <span style={{ fontSize: 13, color: '#64748B' }}>+ {a.name}</span>
              <span style={{ fontSize: 13, color: '#64748B' }}>{fmt(a.price)}</span>
            </div>
          ))}

          {/* Custom line items */}
          {(job.customLineItems || []).map(cl => (
            <div key={cl.name} style={{ ...row, borderColor: '#F1F5F9' }}>
              <span style={{ fontSize: 13, color: '#64748B' }}>
                + {cl.name}
                {cl.description && <span style={{ color: '#94A3B8' }}> — {cl.description}</span>}
                {cl.unitType === 'hourly' && (
                  <span style={{ display: 'block', fontSize: 11, color: '#94A3B8' }}>
                    {cl.unitQty} hr{cl.unitQty !== 1 ? 's' : ''} @ ${cl.unitCost}/hr
                  </span>
                )}
              </span>
              <span style={{ fontSize: 13, color: '#64748B' }}>{fmt(cl.total)}</span>
            </div>
          ))}

          {/* Trip charge */}
          {job.tripCharge > 0 && (
            <div style={row}>
              <span style={{ fontSize: 13, color: '#64748B' }}>Trip charge ({job.tripMiles} mi)</span>
              <span style={{ fontSize: 13, color: '#64748B' }}>{fmt(job.tripCharge)}</span>
            </div>
          )}

          {/* Discount */}
          {job.discount > 0 && (
            <div style={row}>
              <span style={{ fontSize: 13, color: '#64748B' }}>Discount</span>
              <span style={{ fontSize: 13, color: '#0F4C35', fontWeight: 600 }}>−{fmt(job.discount)}</span>
            </div>
          )}

          {/* Total */}
          <div style={{ borderTop: '2px solid #0F1923', marginTop: 8, paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#0F1923' }}>Total</span>
            <span style={{ fontSize: 24, fontWeight: 800, color: '#0F4C35' }}>{fmt(job.total)}</span>
          </div>

          {job.deposit > 0 && (
            <div style={{ background: '#F0FDF4', borderRadius: 8, padding: '10px 14px', marginTop: 12, fontSize: 13, color: '#475569' }}>
              Deposit at signing: <strong style={{ color: '#0F4C35' }}>{fmt(job.deposit)}</strong>
              {' · '}Balance at service: <strong style={{ color: '#0F1923' }}>{fmt(job.balance)}</strong>
            </div>
          )}
        </div>

        {job.notes && (
          <div style={{ ...card, background: '#FAFBFC' }}>
            <span style={label}>Notes</span>
            <p style={{ fontSize: 13, color: '#334155', margin: 0, lineHeight: 1.7 }}>{job.notes}</p>
          </div>
        )}

        <div style={card}>
          <span style={label}>Signature 1 of 2 — Estimate Authorization</span>
          <p style={{ fontSize: 13, color: '#64748B', margin: '0 0 14px', lineHeight: 1.6 }}>
            By signing, you confirm you have reviewed this estimate and authorize {company.name} to perform the described services.
          </p>
          <SigPad id="sig1" onSigned={setSig1} />
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 16, cursor: 'pointer' }}>
            <input
              type="checkbox" checked={agreed1} onChange={e => setAgreed1(e.target.checked)}
              style={{ marginTop: 3, width: 16, height: 16, cursor: 'pointer', accentColor: '#0F4C35' }}
            />
            <span style={{ fontSize: 13, color: '#64748B', lineHeight: 1.5 }}>
              I have reviewed this estimate and authorize the services described above.
            </span>
          </label>
          <button
            style={{ ...makeBtn(!sig1 || !agreed1 || submitting1), marginTop: 18 }}
            disabled={!sig1 || !agreed1 || submitting1}
            onClick={advanceToAgreement}
          >
            {submitting1 ? 'Continuing…' : 'Sign estimate & continue to service agreement →'}
          </button>
          {!sig1 && agreed1 && (
            <p style={{ fontSize: 12, color: '#EF4444', textAlign: 'center', marginTop: 8 }}>
              Please add your signature above
            </p>
          )}
        </div>

        <Footer company={company} />
      </div>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800&display=swap" rel="stylesheet" />
    </div>
  )

  // ── Step 2: Agreement ────────────────────────────────────────────────────────
  return (
    <div style={page}>
      <Header company={company.name} jobId={data!.jobId} />
      <div style={wrap}>
        <Progress step="agreement" />

        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ background: '#F0FDF4', borderBottom: '1px solid #BBF7D0', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#0F4C35', fontWeight: 600 }}>✓ Estimate signed</span>
            <span style={{ color: '#CBD5E1', margin: '0 4px' }}>·</span>
            <span style={{ fontSize: 13, color: '#475569' }}>Please read and sign the service agreement below</span>
          </div>
          <div
            ref={agreementRef}
            style={{ maxHeight: 500, overflowY: 'auto', padding: '20px 24px', borderBottom: '1px solid #E2E8F0' }}
          >
            <AgreementText d={data!} />
          </div>
          {!scrolledToBottom && (
            <div style={{ textAlign: 'center', padding: '10px', background: '#FAFBFC', borderBottom: '1px solid #E2E8F0' }}>
              <span style={{ fontSize: 12, color: '#94A3B8' }}>↓ Scroll to read the full agreement</span>
            </div>
          )}
        </div>

        <div style={card}>
          <span style={label}>Signature 2 of 2 — Service Agreement</span>
          <p style={{ fontSize: 13, color: '#64748B', margin: '0 0 14px', lineHeight: 1.6 }}>
            By signing below you acknowledge you have read, understood, and agree to all terms of the Mountaineer Moving Cleaning Service Agreement.
          </p>
          <SigPad id="sig2" onSigned={setSig2} />
          <div style={{ fontSize: 12, color: '#94A3B8', margin: '8px 0 0', textAlign: 'center' }}>
            Print name: <strong style={{ color: '#334155' }}>{client.name}</strong>
            {' · '}Date: <strong style={{ color: '#334155' }}>{today()}</strong>
          </div>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 16, cursor: 'pointer' }}>
            <input
              type="checkbox" checked={agreed2} onChange={e => setAgreed2(e.target.checked)}
              style={{ marginTop: 3, width: 16, height: 16, cursor: 'pointer', accentColor: '#0F4C35' }}
            />
            <span style={{ fontSize: 13, color: '#64748B', lineHeight: 1.5 }}>
              I have read and agree to all terms and conditions of the Mountaineer Moving Service Agreement.
            </span>
          </label>
          {!scrolledToBottom && (
            <p style={{ fontSize: 12, color: '#B45309', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 6, padding: '8px 12px', marginTop: 12 }}>
              Please scroll through and read the full agreement above before signing.
            </p>
          )}
          <button
            style={{ ...makeBtn(!sig2 || !agreed2 || submitting2 || !scrolledToBottom), marginTop: 18 }}
            disabled={!sig2 || !agreed2 || submitting2 || !scrolledToBottom}
            onClick={submitAll}
          >
            {submitting2 ? 'Submitting…' : 'Sign service agreement & complete'}
          </button>
          {!sig2 && agreed2 && (
            <p style={{ fontSize: 12, color: '#EF4444', textAlign: 'center', marginTop: 8 }}>
              Please add your signature above
            </p>
          )}
        </div>

        <Footer company={company} />
      </div>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800&display=swap" rel="stylesheet" />
    </div>
  )
}