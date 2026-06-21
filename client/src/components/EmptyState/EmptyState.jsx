import './EmptyState.css';

const ILLUSTRATIONS = {
  chart: (
    <svg viewBox="0 0 200 140" width="160" height="112" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="es-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="6" y="14" width="188" height="108" rx="14" fill="rgba(99,102,241,0.06)" stroke="rgba(99,102,241,0.18)" />
      <path d="M20 100 L50 70 L80 88 L110 50 L140 64 L170 38 L180 38 L180 110 L20 110 Z" fill="url(#es-area)" />
      <path d="M20 100 L50 70 L80 88 L110 50 L140 64 L170 38" stroke="#818cf8" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="50" cy="70" r="3" fill="#818cf8" />
      <circle cx="110" cy="50" r="3" fill="#818cf8" />
      <circle cx="170" cy="38" r="3.5" fill="#0ea5e9" />
    </svg>
  ),
  upload: (
    <svg viewBox="0 0 200 140" width="160" height="112" fill="none">
      <rect x="40" y="36" width="120" height="84" rx="12" fill="rgba(14,165,233,0.08)" stroke="rgba(14,165,233,0.25)" />
      <path d="M70 92 L100 60 L130 92" stroke="#0ea5e9" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M100 60 L100 100" stroke="#0ea5e9" strokeWidth="2.6" strokeLinecap="round" />
      <rect x="62" y="106" width="76" height="6" rx="3" fill="rgba(14,165,233,0.25)" />
    </svg>
  ),
  pie: (
    <svg viewBox="0 0 200 140" width="160" height="112" fill="none">
      <circle cx="100" cy="70" r="48" fill="rgba(99,102,241,0.10)" />
      <path d="M100 22 A48 48 0 0 1 148 70 L100 70 Z" fill="#818cf8" opacity="0.85" />
      <path d="M148 70 A48 48 0 0 1 70 102 L100 70 Z" fill="#0ea5e9" opacity="0.85" />
      <circle cx="100" cy="70" r="22" fill="var(--bg-card)" />
    </svg>
  ),
  product: (
    <svg viewBox="0 0 200 140" width="160" height="112" fill="none">
      <rect x="48" y="46" width="104" height="68" rx="10" fill="rgba(245,158,11,0.10)" stroke="rgba(245,158,11,0.30)" />
      <rect x="48" y="46" width="104" height="20" rx="10" fill="rgba(245,158,11,0.18)" />
      <line x1="48" y1="66" x2="152" y2="66" stroke="rgba(245,158,11,0.30)" strokeDasharray="3 3" />
      <line x1="100" y1="46" x2="100" y2="114" stroke="rgba(245,158,11,0.30)" strokeDasharray="3 3" />
      <circle cx="100" cy="80" r="8" fill="#f59e0b" />
    </svg>
  ),
  target: (
    <svg viewBox="0 0 200 140" width="160" height="112" fill="none">
      <defs>
        <radialGradient id="es-target" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stopColor="#6366f1" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="70" r="56" fill="url(#es-target)" />
      <circle cx="100" cy="70" r="46" fill="none" stroke="rgba(99,102,241,0.30)" strokeWidth="2" />
      <circle cx="100" cy="70" r="32" fill="none" stroke="rgba(99,102,241,0.45)" strokeWidth="2" />
      <circle cx="100" cy="70" r="18" fill="none" stroke="rgba(99,102,241,0.65)" strokeWidth="2" />
      <circle cx="100" cy="70" r="5" fill="#818cf8" />
      <path d="M40 30 L100 70" stroke="#0ea5e9" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M30 24 L46 28 L42 36 Z" fill="#0ea5e9" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 200 140" width="160" height="112" fill="none">
      <defs>
        <radialGradient id="es-check" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stopColor="#10b981" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="70" r="58" fill="url(#es-check)" />
      <circle cx="100" cy="70" r="40" fill="rgba(16,185,129,0.12)" stroke="rgba(16,185,129,0.35)" strokeWidth="2" />
      <path d="M80 70 L94 84 L122 56" stroke="#10b981" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  ),
  forecast: (
    <svg viewBox="0 0 200 140" width="160" height="112" fill="none">
      <defs>
        <linearGradient id="es-fc" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M20 90 L60 80 L100 60 L140 50 L180 30 L180 110 L20 110 Z" fill="url(#es-fc)" opacity="0.7" />
      <path d="M20 90 L60 80 L100 60 L140 50 L180 30" stroke="#10b981" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeDasharray="0" />
      <path d="M100 60 L140 50 L180 30" stroke="#10b981" strokeWidth="2.4" fill="none" strokeDasharray="4 3" />
      <circle cx="180" cy="30" r="4" fill="#10b981" />
      <circle cx="180" cy="30" r="9" fill="#10b981" opacity="0.18" />
    </svg>
  ),
};

export default function EmptyState({ illustration = 'chart', title, message, action }) {
  return (
    <div className="empty-state-wrap">
      <div className="empty-state-svg">{ILLUSTRATIONS[illustration] || ILLUSTRATIONS.chart}</div>
      {title && <h3>{title}</h3>}
      {message && <p>{message}</p>}
      {action}
    </div>
  );
}
