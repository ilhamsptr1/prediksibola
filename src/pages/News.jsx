import React, { useState, useEffect, useCallback } from 'react';
import { ExternalLink, RefreshCw, Newspaper, Search, X, Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import { CapacitorHttp } from '@capacitor/core';
import './News.css';

// ─── Deteksi platform ────────────────────────────────────────────────────────
const isNative = () => !!window.Capacitor?.isNativePlatform();

// ─── HTTP helper: gunakan CapacitorHttp di native, fetch biasa di web ────────
const httpGet = async (url) => {
  if (isNative()) {
    const res = await CapacitorHttp.get({ url, connectTimeout: 8000, readTimeout: 8000 });
    return res.data;
  } else {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
};


// ─── Sumber Berita ───────────────────────────────────────────────────────────
const SOURCES = [
  {
    key: 'bbc',
    name: 'BBC Sport',
    flag: '🇬🇧',
    // allorigins wrap BBC RSS → no CORS
    rss: 'https://feeds.bbci.co.uk/sport/football/rss.xml',
  },
  {
    key: 'espn',
    name: 'ESPN FC',
    flag: '🇺🇸',
    rss: 'https://www.espn.com/espn/rss/soccer/news',
  },
  {
    key: 'sky',
    name: 'Sky Sports',
    flag: '🌍',
    rss: 'https://www.skysports.com/rss/12040',
  },
  {
    key: 'goal',
    name: 'Goal.com',
    flag: '⚽',
    rss: 'https://www.goal.com/en/feeds/news?fmt=rss',
  },
];

const ALLORIGINS = 'https://api.allorigins.win/get?url=';

// ─── XML Parser sederhana ────────────────────────────────────────────────────
const parseRSS = (xmlStr) => {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlStr, 'text/xml');
    const items = Array.from(doc.querySelectorAll('item'));
    
    return items.slice(0, 20).map(item => {
      // Ambil teks dasar
      const get = (tag) => item.querySelector(tag)?.textContent?.trim() || '';
      const getAttr = (tag, attr) => item.querySelector(tag)?.getAttribute(attr) || '';
      
      const link = get('link') || getAttr('link', 'href');
      const rawDesc = get('description') || get('summary') || get('content\\:encoded') || '';
      
      // 1. Ekstrak dari tag HTML <img> di dalam deskripsi
      const imgMatchDesc = rawDesc.match(/<img[^>]+src=["']([^"']+)["']/i);
      const htmlImg = imgMatchDesc ? imgMatchDesc[1] : null;

      // 2. Ekstrak paksa dari raw XML string untuk menghindari bug namespace DOMParser (media:thumbnail, dll)
      const rawXml = item.innerHTML || item.outerHTML || '';
      const mediaMatch = rawXml.match(/<(?:media:thumbnail|media:content|enclosure)[^>]+url=["']([^"']+)["']/i);
      const mediaImg = mediaMatch ? mediaMatch[1] : null;

      let imgUrl = mediaImg || getAttr('enclosure', 'url') || htmlImg || null;
      
      // Fix format URL jika dimulai dengan //
      if (imgUrl && imgUrl.startsWith('//')) {
        imgUrl = 'https:' + imgUrl;
      }
      
      const desc = cleanHTML(rawDesc);
      const title = get('title');
      const pubDate = get('pubDate') || get('published') || get('updated') || '';
      
      return { title, link, description: desc, image: imgUrl, pubDate };
    });
  } catch {
    return [];
  }
};

const cleanHTML = (html) => html
  .replace(/<[^>]*>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/\s{2,}/g, ' ').trim().slice(0, 180);

// ─── Fetch satu sumber via allorigins (proxy bebas CORS) ────────────────────
const fetchSource = async (src) => {
  try {
    const proxyUrl = `${ALLORIGINS}${encodeURIComponent(src.rss)}`;
    const data = await httpGet(proxyUrl);
    // allorigins returns { contents: "<xml>", status: {...} }
    let xml = '';
    if (typeof data === 'object' && data.contents) {
      xml = data.contents;
    } else if (typeof data === 'string') {
      // Mungkin sudah string JSON
      try { const obj = JSON.parse(data); xml = obj.contents || ''; } catch { xml = data; }
    }
    if (!xml) return [];
    const items = parseRSS(xml);
    return items.map(item => ({
      id: item.link || `${src.key}-${item.title}`,
      title: item.title,
      description: item.description,
      link: item.link,
      image: item.image,
      pubDate: item.pubDate,
      source: src.name,
      sourceFlag: src.flag,
      sourceKey: src.key,
    }));
  } catch (e) {
    console.warn(`[News] failed ${src.name}:`, e?.message);
    return [];
  }
};

// ─── Cache ───────────────────────────────────────────────────────────────────
const CACHE_KEY = 'ifootballmatch_news_v4';
const CACHE_TTL = 10 * 60 * 1000; // 10 menit

const saveCache = (articles) => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data: articles, ts: Date.now() })); } catch {}
};
const loadCache = () => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts < CACHE_TTL && data?.length > 0) return data;
  } catch {}
  return null;
};

// ─── Utilities ───────────────────────────────────────────────────────────────
const timeAgo = (dateStr) => {
  if (!dateStr) return '';
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (isNaN(diff) || diff < 0) return '';
  if (diff < 60)    return 'Baru saja';
  if (diff < 3600)  return `${Math.floor(diff / 60)} mnt lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  return `${Math.floor(diff / 86400)} hr lalu`;
};

// ─── Komponen Kartu ──────────────────────────────────────────────────────────
const NewsCard = ({ article }) => {
  const [imgErr, setImgErr] = useState(false);

  const handleClick = () => {
    try {
      if (isNative()) {
        window.open(article.link, '_system');
      } else {
        window.open(article.link, '_blank', 'noopener noreferrer');
      }
    } catch {
      window.location.href = article.link;
    }
  };

  return (
    <div className="news-card glass-card" onClick={handleClick}>
      <div className="news-img-wrap">
        {article.image && !imgErr ? (
          <img src={article.image} alt={article.title} className="news-img" onError={() => setImgErr(true)} />
        ) : (
          <div className="news-img-placeholder"><Newspaper size={32} /></div>
        )}
        <span className="news-source-badge">{article.sourceFlag} {article.source}</span>
      </div>
      <div className="news-content">
        <h3 className="news-title">{article.title}</h3>
        {article.description && <p className="news-desc text-muted">{article.description}</p>}
        <div className="news-meta">
          <span className="news-time">{timeAgo(article.pubDate)}</span>
          <span className="news-read">Baca <ExternalLink size={11} /></span>
        </div>
      </div>
    </div>
  );
};

// ─── Halaman Utama ───────────────────────────────────────────────────────────
const FILTERS = ['Semua', ...SOURCES.map(s => s.name)];

const News = () => {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [search, setSearch]     = useState('');
  const [activeSource, setActiveSource] = useState('Semua');
  const [fetchedAt, setFetchedAt] = useState(null);

  const loadNews = useCallback(async (force = false) => {
    if (!force) {
      const cached = loadCache();
      if (cached) {
        setArticles(cached);
        setFetchedAt(new Date());
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch semua sumber paralel, ambil yang berhasil
      const results = await Promise.allSettled(SOURCES.map(fetchSource));
      const all = results
        .flatMap(r => r.status === 'fulfilled' ? r.value : [])
        .filter(a => a.title && a.link)
        .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

      if (all.length === 0) {
        setError('Semua sumber berita gagal dimuat. Coba lagi nanti.');
      } else {
        setArticles(all);
        saveCache(all);
        setFetchedAt(new Date());
      }
    } catch (e) {
      setError('Koneksi bermasalah. Pastikan internet Anda aktif.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadNews(); }, [loadNews]);

  const filtered = articles.filter(a => {
    const matchSearch = !search || a.title.toLowerCase().includes(search.toLowerCase());
    const matchSource = activeSource === 'Semua' || a.source === activeSource;
    return matchSearch && matchSource;
  });

  return (
    <div className="news-page animate-fade-in">
      {/* Header */}
      <header className="news-header text-center">
        <div className="news-header-icon">📰</div>
        <h1 className="heading-lg">Berita <span className="text-gradient">Sepak Bola</span></h1>
        <p className="text-muted">Berita terkini langsung dari sumber internasional</p>
        {fetchedAt && !loading && (
          <div className="news-last-update">
            <Wifi size={12} />
            Diperbarui {fetchedAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
            <button className="news-refresh-btn" onClick={() => loadNews(true)} disabled={loading} title="Refresh">
              <RefreshCw size={13} className={loading ? 'spinning' : ''} />
            </button>
          </div>
        )}
      </header>

      {/* Source Filter */}
      <div className="news-source-filter">
        {FILTERS.map(f => {
          const src = SOURCES.find(s => s.name === f);
          return (
            <button
              key={f}
              className={`news-filter-btn ${activeSource === f ? 'active' : ''}`}
              onClick={() => setActiveSource(f)}
            >
              {src ? `${src.flag} ${f}` : `🌐 ${f}`}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="news-search-wrap">
        <Search size={15} className="news-search-icon" />
        <input
          type="text"
          className="news-search"
          placeholder="Cari berita..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button className="news-clear-search" onClick={() => setSearch('')}><X size={14} /></button>
        )}
      </div>

      {/* States */}
      {loading ? (
        <div className="news-loading">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="news-skeleton glass-card">
              <div className="skel-img" />
              <div className="skel-body">
                <div className="skel-line skel-line--title" />
                <div className="skel-line skel-line--desc" />
                <div className="skel-line skel-line--meta" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="news-error glass-card">
          <AlertTriangle size={48} style={{ color: '#f59e0b' }} />
          <h3>Gagal Memuat Berita</h3>
          <p className="text-muted">{error}</p>
          <button className="btn-primary" onClick={() => loadNews(true)}>
            <RefreshCw size={14} /> Coba Lagi
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="news-empty glass-card">
          <Newspaper size={48} />
          <p className="text-muted">Tidak ada berita yang cocok.</p>
          <button onClick={() => { setSearch(''); setActiveSource('Semua'); }} className="news-reset-btn">
            Reset Filter
          </button>
        </div>
      ) : (
        <>
          <p className="news-count text-muted">
            <strong>{filtered.length}</strong> berita{search && ` untuk "${search}"`}
          </p>
          <div className="news-grid">
            {filtered.map(article => <NewsCard key={article.id} article={article} />)}
          </div>
        </>
      )}
    </div>
  );
};

export default News;
