import { useEffect, useState } from 'react';
import { BarChart2, Search, Download } from 'lucide-react';
import { getSales, getSalesInsights, getTopProducts, getCategories } from '../api';
import { TopProductsChart, RevenueTrendChart } from '../components/Charts/Charts';
import { getSalesTrend } from '../api';
import CategorySelect from '../components/CategorySelect/CategorySelect';
import toast from 'react-hot-toast';
import './SalesPage.css';

const fmt = (n) => n >= 1000 ? `$${(n/1000).toFixed(1)}K` : `$${(n||0).toFixed(2)}`;

export default function SalesPage() {
  const [sales, setSales]         = useState([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [pages, setPages]         = useState(1);
  const [loading, setLoading]     = useState(true);
  const [products, setProducts]   = useState([]);
  const [trend, setTrend]         = useState([]);
  const [insights, setInsights]   = useState(null);
  const [search, setSearch]       = useState('');
  const [category, setCategory]   = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate]     = useState('');
  const [categories, setCategories] = useState([]);

  const load = async (p = 1) => {
    setLoading(true);
    try {
      const [salesData, prods, tr, ins] = await Promise.all([
        getSales({ page: p, limit: 15, product: search, category, startDate, endDate }),
        getTopProducts(),
        getSalesTrend(90),
        getSalesInsights(),
      ]);
      setSales(salesData.data);
      setTotal(salesData.total);
      setPage(salesData.page);
      setPages(salesData.pages);
      setProducts(prods.slice(0, 8));
      setTrend(tr);
      setInsights(ins);
    } catch { toast.error('Failed to load sales data.'); }
    setLoading(false);
  };

  useEffect(() => { load(1); }, []);

  useEffect(() => {
    getCategories()
      .then((cats) => setCategories(cats.map((c) => ({ value: c._id, label: c._id, count: c.totalQuantity }))))
      .catch(() => {});
  }, []);

  const handleSearch = (e) => { e.preventDefault(); load(1); };

  const exportCSV = () => {
    if (!sales.length) return;
    const cols = ['date','product','category','quantity','revenue','cost','region'];
    const rows = sales.map(r =>
      cols.map(c => {
        const v = r[c];
        return c === 'date' ? new Date(v).toLocaleDateString() : v ?? '';
      }).join(',')
    );
    const csv = [cols.join(','), ...rows].join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `sales_${Date.now()}.csv`;
    a.click();
  };

  return (
    <div className="page-wrapper fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Sales Data</h1>
          <p className="page-subtitle">
            {total.toLocaleString()} total records
            {insights?.summary?.totalRevenue ? ` · ${fmt(insights.summary.totalRevenue)} total revenue` : ''}
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={exportCSV}>
          <Download size={14}/> Export CSV
        </button>
      </div>

      {/* Charts row */}
      <div className="grid-2" style={{ marginBottom: 24 }}>
        <div className="card">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <h3>Revenue Trend (90 days)</h3>
          </div>
          {trend.length > 0
            ? <RevenueTrendChart data={trend} />
            : <div className="empty-state"><p>No trend data yet</p></div>
          }
        </div>
        <div className="card">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <h3>Top Products</h3>
          </div>
          {products.length > 0
            ? <TopProductsChart data={products} />
            : <div className="empty-state"><p>No product data yet</p></div>
          }
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom:20, padding:'16px 20px' }}>
        <form onSubmit={handleSearch} className="sales-filter-form">
          <div className="form-group search-field">
            <label className="form-label">Search Product</label>
            <input className="form-input" placeholder="Product name..." value={search} onChange={e=>setSearch(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Category</label>
            <CategorySelect
              options={categories}
              value={category}
              onChange={setCategory}
              placeholder="All categories"
              variant="filter"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Start Date</label>
            <input className="form-input" type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">End Date</label>
            <input className="form-input" type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-sm" type="submit">
            <Search size={14}/> Search
          </button>
          <button className="btn btn-secondary btn-sm" type="button" onClick={()=>{ setSearch(''); setCategory(''); setStartDate(''); setEndDate(''); setTimeout(()=>load(1),0); }}>
            Clear
          </button>
        </form>
      </div>

      {/* Data Table */}
      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        {loading ? (
          <div style={{ display:'flex', justifyContent:'center', padding:'60px 0' }}><div className="spinner spinner-lg"/></div>
        ) : (
          <>
            <div style={{ overflowX:'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th><th>Product</th><th>Category</th>
                    <th>Qty</th><th>Revenue</th><th>Cost</th><th>Profit</th><th>Region</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign:'center', padding:'48px', color:'var(--text-muted)' }}>
                      No records found
                    </td></tr>
                  ) : sales.map(row => {
                    const profit = (row.revenue||0) - (row.cost||0);
                    return (
                      <tr key={row._id}>
                        <td data-label="Date" style={{ fontSize:'0.82rem', color:'var(--text-secondary)' }}>
                          {new Date(row.date).toLocaleDateString()}
                        </td>
                        <td data-label="Product"><strong>{row.product}</strong></td>
                        <td data-label="Category"><span className="badge badge-muted">{row.category}</span></td>
                        <td data-label="Qty">{row.quantity?.toLocaleString()}</td>
                        <td data-label="Revenue" style={{ color:'var(--primary-light)', fontWeight:600 }}>{fmt(row.revenue)}</td>
                        <td data-label="Cost" className="col-hide-mobile" style={{ color:'var(--text-secondary)' }}>{row.cost ? fmt(row.cost) : '—'}</td>
                        <td data-label="Profit" style={{ color: profit>=0?'var(--success)':'var(--danger)', fontWeight:600 }}>
                          {row.cost ? fmt(profit) : '—'}
                        </td>
                        <td data-label="Region" className="col-hide-mobile" style={{ color:'var(--text-muted)', fontSize:'0.82rem' }}>{row.region}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pages > 1 && (
              <div className="pagination">
                <button className="btn btn-secondary btn-sm" onClick={()=>load(page-1)} disabled={page<=1}>← Prev</button>
                <span style={{ color:'var(--text-secondary)', fontSize:'0.85rem' }}>
                  Page {page} of {pages} · {total.toLocaleString()} records
                </span>
                <button className="btn btn-secondary btn-sm" onClick={()=>load(page+1)} disabled={page>=pages}>Next →</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
