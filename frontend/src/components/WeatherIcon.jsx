import { useId } from 'react'

// Soft, colourful weather icons drawn as SVG so they stay sharp at any size and need no image files.
// icon: sun | partly | cloud | fog | drizzle | rain | heavy-rain | storm | snow (from the server); isDay=false gives the night version.

const CLOUD = 'M19 47h27a10.5 10.5 0 0 0 1.6-20.9A14.5 14.5 0 0 0 19.9 28.2 9.9 9.9 0 0 0 19 47z'
const RAYS = [0, 45, 90, 135, 180, 225, 270, 315]

const Sun = ({ id, cx = 32, cy = 32, r = 10, ray = 15, rayEnd = 19 }) => (
  <g>
    {RAYS.map((a) => (
      <line key={a} x1={cx} y1={cy - ray} x2={cx} y2={cy - rayEnd} stroke={`url(#${id}-sun)`} strokeWidth="2.6" strokeLinecap="round" transform={`rotate(${a} ${cx} ${cy})`} />
    ))}
    <circle cx={cx} cy={cy} r={r} fill={`url(#${id}-sun)`} />
  </g>
)

const Moon = ({ id, x = 0, y = 0, s = 1 }) => (
  <path
    transform={`translate(${x} ${y}) scale(${s})`}
    d="M40 12a20 20 0 1 0 14 34A17 17 0 0 1 40 12z"
    fill={`url(#${id}-moon)`}
  />
)

const Cloud = ({ id, y = 0, dark = false }) => (
  <path d={CLOUD} transform={`translate(0 ${y})`} fill={`url(#${id}-${dark ? 'dark' : 'cloud'})`} stroke={dark ? '#6b7a93' : '#b5c4dc'} strokeWidth="0.8" />
)

const Drops = ({ y = 0, n = 3, heavy = false }) => {
  const xs = n === 3 ? [25, 33, 41] : [22, 28, 34, 40, 46]
  return (
    <g stroke="#3b82f6" strokeWidth="2.6" strokeLinecap="round">
      {xs.map((x, i) => (
        <line key={x} x1={x + 1.5} y1={50 + y + (i % 2) * 3} x2={x - 1.5} y2={(heavy ? 58 : 55) + y + (i % 2) * 3} />
      ))}
    </g>
  )
}

const WeatherIcon = ({ icon = 'cloud', isDay = true, size = 48, className = '', title }) => {
  const id = useId().replace(/:/g, '')
  let body
  switch (icon) {
    case 'sun':
      body = isDay ? <Sun id={id} /> : <Moon id={id} />
      break
    case 'partly':
      body = isDay ? (
        <>
          <Sun id={id} cx={24} cy={22} r={8} ray={12} rayEnd={15.5} />
          <Cloud id={id} y={2} />
        </>
      ) : (
        <>
          <Moon id={id} x={-8} y={-6} s={0.7} />
          <Cloud id={id} y={2} />
        </>
      )
      break
    case 'fog':
      body = (
        <>
          <Cloud id={id} y={-6} />
          <g stroke="#94a3b8" strokeWidth="2.6" strokeLinecap="round">
            <line x1="16" y1="46" x2="48" y2="46" />
            <line x1="22" y1="52" x2="54" y2="52" />
            <line x1="16" y1="58" x2="42" y2="58" />
          </g>
        </>
      )
      break
    case 'drizzle':
      body = (
        <>
          <Cloud id={id} y={-5} />
          <Drops y={-3} n={5} />
        </>
      )
      break
    case 'rain':
      body = (
        <>
          <Cloud id={id} y={-6} />
          <Drops y={-1} />
        </>
      )
      break
    case 'heavy-rain':
      body = (
        <>
          <Cloud id={id} y={-8} dark />
          <Drops y={0} n={5} heavy />
        </>
      )
      break
    case 'storm':
      body = (
        <>
          <Cloud id={id} y={-8} dark />
          <polygon points="34,40 26,53 33,53 29,63 42,47 35,47 39,40" fill="#fbbf24" stroke="#f59e0b" strokeWidth="0.8" strokeLinejoin="round" />
        </>
      )
      break
    case 'snow':
      body = (
        <>
          <Cloud id={id} y={-6} />
          <g fill="#7dd3fc">
            {[24, 32, 40].map((x, i) => (
              <circle key={x} cx={x} cy={52 + (i % 2) * 4} r="2.4" />
            ))}
          </g>
        </>
      )
      break
    default:
      body = <Cloud id={id} />
  }
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : 'true'} focusable="false">
      <defs>
        <linearGradient id={`${id}-sun`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffd84d" />
          <stop offset="1" stopColor="#ff9f1c" />
        </linearGradient>
        <linearGradient id={`${id}-moon`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fde68a" />
          <stop offset="1" stopColor="#f6b94c" />
        </linearGradient>
        <linearGradient id={`${id}-cloud`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#d3dff0" />
        </linearGradient>
        <linearGradient id={`${id}-dark`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c2cde0" />
          <stop offset="1" stopColor="#8a99b3" />
        </linearGradient>
      </defs>
      {body}
    </svg>
  )
}

export default WeatherIcon
