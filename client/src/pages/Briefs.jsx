import { useEffect, useMemo, useState } from 'react';
import {
  Sparkles, Mail, MessageSquare, Globe, Send,
  Settings, RefreshCw, Calendar, Clock, AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import EmptyState from '../components/EmptyState/EmptyState';
import {
  getBriefs, generateBriefNow,
  getBriefSettings, updateBriefSettings, testBriefDelivery,
} from '../api';
import './Briefs.css';

const KIND_META = {
  win:            { label: 'Win',            color: 'success', emoji: '🚀' },
  risk:           { label: 'Risk',           color: 'danger',  emoji: '⚠️' },
  anomaly:        { label: 'Anomaly',        color: 'warning', emoji: '👀' },
  recommendation: { label: 'Recommendation', color: 'primary', emoji: '💡' },
  goal:           { label: 'Goal',           color: 'purple',  emoji: '🎯' },
  info:           { label: 'Info',           color: 'muted',   emoji: '📊' },
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmtRange(start, end) {
  const s = new Date(start), e = new Date(end);
  const opt = { month: 'short', day: 'numeric' };
  return `${s.toLocaleDateString('en-US', opt)} – ${e.toLocaleDateString('en-US', opt)}`;
}

function detectTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function BriefCard({ brief, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`brief-card ${open ? 'is-open' : ''}`}>
      <button className="brief-card__head" onClick={() => setOpen(!open)}>
        <div className="brief-card__title">
          <span className="brief-card__date">{fmtRange(brief.weekStart, brief.weekEnd)}</span>
          <h3>{brief.headline || 'Weekly brief'}</h3>
        </div>
        <div className="brief-card__head-meta">
          {(brief.deliveredVia || []).map((d) => (
            <span key={d} className={`brief-chip brief-chip--${d}`}>
              {d === 'email' ? <Mail size={11} /> : d === 'slack' ? <MessageSquare size={11} /> : <Globe size={11} />}
              {d}
            </span>
          ))}
          <span className={`brief-chip brief-chip--${brief.trigger === 'manual' ? 'manual' : 'scheduled'}`}>
            {brief.trigger === 'manual' ? 'Manual' : 'Scheduled'}
          </span>
        </div>
      </button>
      {open && (
        <div className="brief-card__body">
          <ul className="brief-bullets">
            {brief.bullets?.map((b, i) => {
              const meta = KIND_META[b.kind] || KIND_META.info;
              return (
                <li key={i} className={`brief-bullet brief-bullet--${meta.color}`}>
                  <span className="brief-bullet__tag">
                    <span aria-hidden="true">{meta.emoji}</span> {meta.label}
                  </span>
                  <p>{b.text}</p>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function SettingsPanel({ settings, setSettings, onSave, saving }) {
  const toggleChannel = (channel) => {
    const has = settings.channels.includes(channel);
    const next = has
      ? settings.channels.filter((c) => c !== channel)
      : [...settings.channels, channel];
    setSettings({ ...settings, channels: next.length ? next : ['in_app'] });
  };

  const test = async (channel) => {
    try {
      const result = await testBriefDelivery(channel);
      if (result.skipped) {
        toast(result.reason === 'not_configured'
          ? 'Email is not configured on the server (RESEND_API_KEY missing).'
          : 'Skipped: ' + result.reason);
      } else {
        toast.success(`Test sent on ${channel}.`);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || `Test failed for ${channel}.`);
    }
  };

  return (
    <div className="brief-settings card">
      <div className="brief-settings__head">
        <h3><Settings size={16} /> Delivery preferences</h3>
        <label className="switch">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
          />
          <span className="switch__track" />
          <span className="switch__label">{settings.enabled ? 'Enabled' : 'Off'}</span>
        </label>
      </div>

      <div className="brief-settings__section">
        <label className="brief-settings__label">Channels</label>
        <div className="channel-grid">
          <button
            type="button"
            className={`channel-tile ${settings.channels.includes('in_app') ? 'on' : ''}`}
            onClick={() => toggleChannel('in_app')}
          >
            <Globe size={18} />
            <span>In-app</span>
            <small>Always on</small>
          </button>
          <button
            type="button"
            className={`channel-tile ${settings.channels.includes('email') ? 'on' : ''}`}
            onClick={() => toggleChannel('email')}
          >
            <Mail size={18} />
            <span>Email</span>
            <small>{settings.emailOverride || 'Account email'}</small>
          </button>
        </div>
      </div>

      <div className="brief-settings__row">
        <div className="form-group">
          <label>Delivery day</label>
          <select
            className="form-select"
            value={settings.dayOfWeek}
            onChange={(e) => setSettings({ ...settings, dayOfWeek: Number(e.target.value) })}
          >
            {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label>Hour (24h)</label>
          <select
            className="form-select"
            value={settings.hour}
            onChange={(e) => setSettings({ ...settings, hour: Number(e.target.value) })}
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Timezone</label>
          <input
            className="form-input"
            value={settings.timezone}
            onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
            placeholder="e.g. Asia/Karachi"
          />
        </div>
      </div>

      {settings.channels.includes('email') && (
        <div className="brief-settings__section">
          <label className="brief-settings__label">Override email (optional)</label>
          <input
            className="form-input"
            value={settings.emailOverride}
            onChange={(e) => setSettings({ ...settings, emailOverride: e.target.value })}
            placeholder="Leave blank to use your account email"
            type="email"
          />
          <button className="btn btn-secondary btn-sm" onClick={() => test('email')}>
            <Send size={13} /> Send test email
          </button>
        </div>
      )}



      <div className="brief-settings__foot">
        {settings.lastDeliveredAt && (
          <span className="brief-settings__last">
            <Clock size={12} /> Last delivered {new Date(settings.lastDeliveredAt).toLocaleString()}
          </span>
        )}
        <button className="btn btn-primary" onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save preferences'}
        </button>
      </div>
    </div>
  );
}

export default function Briefs() {
  const [briefs, setBriefs]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [generating, setGenerating] = useState(false);
  const [settings, setSettings] = useState(null);
  const [saving, setSaving]     = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [list, s] = await Promise.all([
        getBriefs(20),
        getBriefSettings(),
      ]);
      setBriefs(list || []);
      setSettings({ ...s, slackWebhook: '' });
    } catch {
      toast.error('Failed to load briefs.');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // If user hasn't picked a timezone, suggest the browser one.
  useEffect(() => {
    if (settings && (!settings.timezone || settings.timezone === 'UTC')) {
      const tz = detectTimezone();
      if (tz && tz !== 'UTC') setSettings((s) => ({ ...s, timezone: tz }));
    }
    // eslint-disable-next-line
  }, [settings?.enabled]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await generateBriefNow();
      toast.success('Brief ready.');
      const delivered = res.delivered || [];
      if (delivered.length > 1) toast(`Delivered via: ${delivered.join(', ')}`);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to generate brief.');
    }
    setGenerating(false);
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const payload = { ...settings };
      // Don't send the empty placeholder webhook — that would clear it.
      if (!payload.slackWebhook) delete payload.slackWebhook;
      const next = await updateBriefSettings(payload);
      setSettings({ ...next, slackWebhook: '' });
      toast.success('Preferences saved.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save preferences.');
    }
    setSaving(false);
  };

  const latest = useMemo(() => briefs[0] || null, [briefs]);

  return (
    <div className="page-wrapper page-enter">
      <div className="page-header">
        <div>
          <h1 className="page-title shimmer-text">
            <Sparkles size={26} style={{ verticalAlign: '-4px', marginRight: 10 }} />
            Weekly Executive Brief
          </h1>
          <p className="page-subtitle">
            An AI-written 5-bullet narrative of your business week — generated automatically and delivered where you want it.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={load}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button className="btn btn-primary" onClick={handleGenerate} disabled={generating}>
            <Sparkles size={14} /> {generating ? 'Generating…' : 'Generate this week\'s brief'}
          </button>
        </div>
      </div>

      {settings && <SettingsPanel
        settings={settings}
        setSettings={setSettings}
        onSave={handleSaveSettings}
        saving={saving}
      />}

      <h3 className="brief-section-title">
        <Calendar size={16} /> History
      </h3>

      {loading ? (
        <div style={{ display: 'grid', gap: 12 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 80, borderRadius: 16 }} />
          ))}
        </div>
      ) : briefs.length === 0 ? (
        <EmptyState
          illustration="forecast"
          title="No briefs yet"
          message="Click 'Generate this week's brief' above and we'll write your first one right now."
          action={
            <button className="btn btn-primary" onClick={handleGenerate} disabled={generating}>
              <Sparkles size={14} /> {generating ? 'Generating…' : 'Generate now'}
            </button>
          }
        />
      ) : (
        <div className="briefs-list">
          {briefs.map((b, i) => (
            <BriefCard key={String(b._id)} brief={b} defaultOpen={i === 0 && b === latest} />
          ))}
        </div>
      )}

      {!loading && briefs.length > 0 && !settings?.enabled && (
        <div className="brief-banner brief-banner--warning">
          <AlertTriangle size={16} />
          <div>
            <strong>Auto-delivery is off.</strong> Enable it above to receive a brief every week without clicking generate.
          </div>
        </div>
      )}
    </div>
  );
}
