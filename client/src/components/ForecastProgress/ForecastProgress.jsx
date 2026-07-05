import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import './ForecastProgress.css';

const formatTime = (ms) => {
  if (!ms || ms <= 0) return 'estimating...';
  const totalSecs = Math.round(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
};

const formatRemainingTime = (ms, index) => {
  if (index === 0) return 'estimating...';
  if (!ms || ms <= 0) return '0s';
  const totalSecs = Math.round(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
};

export default function ForecastProgress({ job }) {
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    if (job && job.status === 'generating') {
      const interval = setInterval(() => {
        setCurrentSlide((prev) => (prev + 1) % 4);
      }, 3000);
      return () => clearInterval(interval);
    } else {
      setCurrentSlide(0);
    }
  }, [job]);

  if (!job || job.status !== 'generating') return null;

  const pct = job.total > 0 ? Math.round((job.index / job.total) * 100) : 0;

  return (
    <div className="forecast-progress-card stagger">
      <div className="progress-card-header">
        <div className="progress-title-group">
          <div className="pulse-icon">
            <Activity size={18} />
          </div>
          <div>
            <h3 className="progress-card-title">Generating Demand Forecasts</h3>
            <p className="progress-card-subtitle">
              Training forecasting models for sales history...
            </p>
          </div>
        </div>
        <div className="progress-time-info">
          <span className="time-badge">
            Elapsed: {formatTime(job.elapsedTime)}
          </span>
          <span className="time-badge remaining">
            Est. Remaining: {formatRemainingTime(job.estimatedRemainingTime, job.index)}
          </span>
        </div>
      </div>

      <div className="progress-bar-container">
        <div 
          className="progress-bar-fill" 
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Rotating Slideshow */}
      <div className="slideshow-container">
        {currentSlide === 0 && (
          <div className="slide-fade">
            <span>📊 <strong>Overall Progress:</strong> {pct}% Complete ({job.index} of {job.total} products)</span>
          </div>
        )}
        {currentSlide === 1 && (
          <div className="slide-fade">
            <span>📦 <strong>Current Item:</strong> {job.product ? `Forecasting "${job.product}"` : 'Processing products...'} ({Math.max(0, job.total - job.index)} left)</span>
          </div>
        )}
        {currentSlide === 2 && (
          <div className="slide-fade">
            <span>⏱️ <strong>Estimated Time:</strong> ~{formatRemainingTime(job.estimatedRemainingTime, job.index)} remaining (elapsed: {formatTime(job.elapsedTime)})</span>
          </div>
        )}
        {currentSlide === 3 && (
          <div className="slide-fade">
            <span>🤖 <strong>Active Engines:</strong> Prophet, Random Forest & Weighted Moving Average (EMA)</span>
          </div>
        )}
      </div>
    </div>
  );
}
