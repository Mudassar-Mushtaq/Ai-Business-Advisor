import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload as UploadIcon, FileText, CheckCircle, AlertCircle, X, ArrowRight, Info, Clock, FileSpreadsheet, Trash2 } from 'lucide-react';
import { uploadFile, getUploadHistory } from '../api';
import toast from 'react-hot-toast';
import './Upload.css';

function PreviewTable({ data }) {
  if (!data?.length) return null;
  const cols = Object.keys(data[0]);
  return (
    <div style={{ overflowX:'auto', marginTop: 20 }}>
      <p style={{ fontSize:'0.82rem', color:'var(--text-secondary)', marginBottom:8 }}>
        Showing first {data.length} rows:
      </p>
      <table className="data-table">
        <thead>
          <tr>{cols.map(c => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i}>
              {cols.map(c => <td key={c}>{String(row[c] ?? '')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatFileSize(bytes) {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function UploadHistorySection({ history, loading }) {
  if (loading) {
    return (
      <div className="upload-history">
        <h3 className="upload-history__title">
          <Clock size={16} /> Recent Uploads
        </h3>
        <div className="upload-history__list">
          {[1, 2, 3].map(i => (
            <div key={i} className="upload-history__item skeleton-item">
              <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 10 }} />
              <div style={{ flex: 1 }}>
                <div className="skeleton" style={{ width: '70%', height: 14, borderRadius: 6, marginBottom: 6 }} />
                <div className="skeleton" style={{ width: '40%', height: 11, borderRadius: 6 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!history?.length) return null;

  return (
    <div className="upload-history">
      <h3 className="upload-history__title">
        <Clock size={16} /> Recent Uploads
      </h3>
      <div className="upload-history__list">
        {history.map((h) => (
          <div key={h._id} className={`upload-history__item ${h.status === 'failed' ? 'failed' : ''}`}>
            <div className={`upload-history__icon ${h.status === 'failed' ? 'icon-failed' : ''}`}>
              <FileSpreadsheet size={18} />
            </div>
            <div className="upload-history__info">
              <div className="upload-history__name" title={h.fileName}>{h.fileName}</div>
              <div className="upload-history__meta">
                <span>{formatFileSize(h.fileSize)}</span>
                <span className="meta-dot">·</span>
                <span>{h.rowsImported.toLocaleString()} rows</span>
                <span className="meta-dot">·</span>
                <span>{h.productsUpdated} products</span>
              </div>
            </div>
            <div className="upload-history__right">
              <span className={`upload-history__status ${h.status}`}>
                {h.status === 'success' ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
                {h.status === 'success' ? 'Success' : 'Failed'}
              </span>
              <span className="upload-history__time">{timeAgo(h.createdAt)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Upload() {
  const [file, setFile]             = useState(null);
  const [uploading, setUploading]   = useState(false);
  const [progress, setProgress]     = useState(0);
  const [result, setResult]         = useState(null);
  const [error, setError]           = useState(null);
  const [history, setHistory]       = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // Load upload history on mount
  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const data = await getUploadHistory(10);
      setHistory(data);
    } catch {
      // Silently fail — history is non-critical
    }
    setHistoryLoading(false);
  };

  const onDrop = useCallback((accepted) => {
    if (accepted[0]) {
      setFile(accepted[0]);
      setResult(null);
      setError(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    maxSize: 25 * 1024 * 1024,
    multiple: false,
  });

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setProgress(0);
    setError(null);
    setResult(null);

    const fd = new FormData();
    fd.append('file', file);

    try {
      const res = await uploadFile(fd, (pct) => {
        // Cap at 95% during upload — the last 5% represents server-side processing
        setProgress(Math.min(pct, 95));
      });
      setProgress(100);
      setResult(res);
      toast.success(`✅ ${res.rowsImported} rows imported successfully!`);
      // Refresh history after successful upload
      loadHistory();
    } catch (err) {
      const msg = err.response?.data?.error || 'Upload failed. Please try again.';
      setError(msg);
      toast.error(msg);
      // Refresh history to show failed record
      loadHistory();
    }
    setUploading(false);
  };

  const reset = () => { setFile(null); setResult(null); setError(null); setProgress(0); };

  return (
    <div className="page-wrapper fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Upload Data</h1>
          <p className="page-subtitle">Import your sales data from CSV or Excel files</p>
        </div>
      </div>

      <div className="upload-layout">
        <div className="upload-main">
          {/* Drop Zone */}
          {!result && (
            <>
              <div {...getRootProps()} className={`dropzone ${isDragActive ? 'active' : ''} ${file ? 'has-file' : ''}`}>
                <input {...getInputProps()} />
                {file ? (
                  <div className="dropzone-file">
                    <FileText size={40} style={{ color:'var(--primary-light)' }} />
                    <div className="file-name">{file.name}</div>
                    <div className="file-size">{(file.size / 1024).toFixed(1)} KB</div>
                    <button className="remove-file" onClick={e => { e.stopPropagation(); reset(); }}>
                      <X size={14} /> Remove
                    </button>
                  </div>
                ) : (
                  <div className="dropzone-empty">
                    <div className="dropzone-icon"><UploadIcon size={36} /></div>
                    <h3>{isDragActive ? 'Drop your file here!' : 'Drag & drop your file here'}</h3>
                    <p>or <span className="link-style">browse to choose</span></p>
                    <p className="dropzone-hint">Supports CSV, XLSX, XLS up to 25MB</p>
                  </div>
                )}
              </div>

              {file && !uploading && (
                <button className="btn btn-primary" style={{ width:'100%', justifyContent:'center', marginTop:16 }} onClick={handleUpload}>
                  <UploadIcon size={17} /> Upload & Process File <ArrowRight size={17} />
                </button>
              )}

              {uploading && (
                <div className="progress-wrap">
                  <div className="progress-label">
                    <span>{progress >= 100 ? 'Done!' : progress >= 95 ? 'Processing on server...' : 'Uploading...'}</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )}

              {error && (
                <div className="upload-error">
                  <AlertCircle size={18} /> {error}
                </div>
              )}
            </>
          )}

          {/* Success Result */}
          {result && (
            <div className="upload-success fade-in">
              <div className="success-header">
                <CheckCircle size={40} style={{ color:'var(--success)' }} />
                <div>
                  <h3>Upload Successful!</h3>
                  <p>Your data has been processed and stored.</p>
                </div>
              </div>
              <div className="success-stats">
                <div className="stat-pill"><span>{result.rowsImported}</span><label>Rows Imported</label></div>
                <div className="stat-pill"><span>{result.productsUpdated}</span><label>Products Updated</label></div>
                <div className="stat-pill"><span>{result.alerts?.length || 0}</span><label>Alerts Generated</label></div>
              </div>

              {result.alerts?.length > 0 && (
                <div className="upload-alerts">
                  <p className="section-label" style={{ color:'var(--warning)' }}>⚠️ AI Alerts Generated</p>
                  {result.alerts.map((a, i) => (
                    <div key={i} className="upload-alert-item">
                      <strong>{a.title}</strong>: {a.message}
                    </div>
                  ))}
                </div>
              )}

              <PreviewTable data={result.preview} />

              <button className="btn btn-secondary" style={{ marginTop:20 }} onClick={reset}>
                Upload Another File
              </button>
            </div>
          )}

          {/* Upload History */}
          <UploadHistorySection history={history} loading={historyLoading} />
        </div>

        {/* Sidebar Guide */}
        <div className="upload-guide">
          <div className="card">
            <h3 style={{ marginBottom:16, fontSize:'1rem' }}>📋 Expected Columns</h3>
            <div className="guide-cols">
              {[
                { col: 'date / sale_date', req: true },
                { col: 'product / product_name', req: true },
                { col: 'quantity / qty', req: true },
                { col: 'revenue / sales / amount', req: true },
                { col: 'category', req: false },
                { col: 'cost / cogs', req: false },
                { col: 'region / location', req: false },
              ].map(({ col, req }) => (
                <div key={col} className="guide-col-row">
                  <code>{col}</code>
                  <span className={`badge ${req ? 'badge-danger' : 'badge-muted'}`}>
                    {req ? 'Required' : 'Optional'}
                  </span>
                </div>
              ))}
            </div>
            <div className="guide-note">
              <Info size={13} /> Column names are flexible — the system auto-detects common variants.
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h3 style={{ marginBottom:12, fontSize:'1rem' }}>⚡ What happens next?</h3>
            <ol className="guide-steps">
              <li>File is parsed and validated</li>
              <li>Rows are saved to MongoDB</li>
              <li>Inventory is auto-updated</li>
              <li>AI alerts are generated</li>
              <li>Ready for forecast generation</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
