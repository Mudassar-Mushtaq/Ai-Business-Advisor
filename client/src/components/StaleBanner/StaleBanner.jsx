import { AlertTriangle, RefreshCw } from 'lucide-react';
import './StaleBanner.css';

export default function StaleBanner({ generating, onGenerate }) {
  return (
    <div className={`stale-banner fade-in ${generating ? 'is-generating' : ''}`}>
      <div className="stale-banner-content">
        <div className="stale-banner-icon-wrap">
          <AlertTriangle size={16} className="stale-banner-icon" />
        </div>
        <div className="stale-banner-text-group">
          {generating ? (
            <>
              <strong>Forecast updates in progress.</strong> Previous estimations are shown below. Please wait a few minutes for the process to complete.
            </>
          ) : (
            <>
              <strong>New data uploaded.</strong> The forecasts, charts, and recommendations below are based on previous dataset history.
            </>
          )}
        </div>
      </div>
      {!generating && onGenerate && (
        <button className="stale-banner-btn" onClick={onGenerate}>
          <RefreshCw size={13} /> Regenerate Now
        </button>
      )}
    </div>
  );
}
