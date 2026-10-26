import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, LoaderCircle, Plus, Search, X } from 'lucide-react';
import apiService from '../../services/api';
import './EarwormView.css';

const VERSION = '1.1';
const pad = (value) => String(value).padStart(2, '0');
const dateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const timeKey = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

function monthBounds(month) {
  return { start: dateKey(new Date(month.getFullYear(), month.getMonth(), 1)), end: dateKey(new Date(month.getFullYear(), month.getMonth() + 1, 0)) };
}

const EarwormView = () => {
  const today = new Date();
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(dateKey(today));
  const [entries, setEntries] = useState([]);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [displayTime, setDisplayTime] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [error, setError] = useState('');
  const searchRequestId = useRef(0);

  const loadEntries = useCallback(async () => {
    try { setLoading(true); setError(''); setEntries(await apiService.getEarwormEntries(monthBounds(month))); }
    catch (requestError) { setError(requestError.message || 'Could not load music memories.'); }
    finally { setLoading(false); }
  }, [month]);
  useEffect(() => { loadEntries(); }, [loadEntries]);

  useEffect(() => {
    const query = search.trim();
    const requestId = ++searchRequestId.current;
    if (query.length < 2) { setResults([]); setSearchLoading(false); setSearchError(''); return undefined; }
    setSearchLoading(true); setSearchError('');
    const timer = setTimeout(async () => {
      try {
        const response = await apiService.searchEarwormMusic(query);
        if (requestId !== searchRequestId.current) return;
        setResults(response.results || []);
      } catch (requestError) {
        if (requestId !== searchRequestId.current) return;
        setResults([]); setSearchError(requestError.message || 'Music search failed.');
      } finally { if (requestId === searchRequestId.current) setSearchLoading(false); }
    }, 450);
    return () => clearTimeout(timer);
  }, [search]);

  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const total = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return [...Array(offset).fill(null), ...Array.from({ length: total }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1))];
  }, [month]);
  const grouped = useMemo(() => entries.reduce((map, entry) => { (map[entry.entry_date] ||= []).push(entry); return map; }, {}), [entries]);
  const selectedEntries = (grouped[selectedDate] || []).slice().sort((a, b) => a.display_time.localeCompare(b.display_time));
  const todayKey = dateKey(today);

  const openModal = () => { setSearch(''); setResults([]); setSelectedTrack(null); setNote(''); setSearchError(''); setDisplayTime(timeKey(new Date())); setModalOpen(true); };
  const saveEntry = async () => {
    if (!selectedTrack) return;
    try { setLoading(true); await apiService.createEarwormEntry({ entry_date: selectedDate, display_time: displayTime, note, ...selectedTrack }); setModalOpen(false); await loadEntries(); }
    catch (requestError) { setError(requestError.message || 'Could not save the memory.'); }
    finally { setLoading(false); }
  };
  const moveMonth = (delta) => setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));

  return <div className="earworm-page">
    <header className="earworm-header"><div className="earworm-brand"><span className="earworm-mark">♪</span><span>Earworm</span><small>v{VERSION}</small></div><button type="button" className="earworm-primary" onClick={openModal}><Plus size={16} /> Add song</button></header>
    {error && <div className="earworm-alert" role="alert">{error}</div>}
    <div className="earworm-layout"><section><div className="earworm-kicker">Your sound calendar</div><div className="earworm-calendar-title"><div><h1>{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h1><p>songs that stayed with you</p></div><div className="earworm-month-nav"><button type="button" onClick={() => moveMonth(-1)} aria-label="Previous month"><ChevronLeft size={17} /></button><strong>{month.getFullYear()}.{pad(month.getMonth() + 1)}</strong><button type="button" onClick={() => moveMonth(1)} aria-label="Next month"><ChevronRight size={17} /></button></div></div><div className="earworm-calendar" aria-label="Music calendar">{['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((day) => <div className="earworm-weekday" key={day}>{day}</div>)}{days.map((day, index) => { if (!day) return <div className="earworm-day blank" key={`blank-${index}`} />; const key = dateKey(day); const dayEntries = grouped[key] || []; const isFuture = key > todayKey; return <button type="button" disabled={isFuture} aria-disabled={isFuture} className={`earworm-day ${key === selectedDate ? 'selected' : ''} ${key === todayKey ? 'today' : ''} ${isFuture ? 'future' : ''}`} key={key} onClick={() => !isFuture && setSelectedDate(key)}><span className="earworm-day-number">{day.getDate()}</span><span className="earworm-covers">{dayEntries.slice(0, 1).map((entry) => <img key={entry.id} src={entry.cover_art_url || '/logo.png'} alt="" />)}{dayEntries.length > 1 && <b>+{dayEntries.length - 1}</b>}</span>{dayEntries.length > 0 && <small>{dayEntries.length} {dayEntries.length === 1 ? 'song' : 'songs'}</small>}</button>; })}</div></section>
      <aside className="earworm-detail"><div className="earworm-kicker">Selected day</div><h2>{new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</h2><p className="earworm-muted">{selectedEntries.length} {selectedEntries.length === 1 ? 'song' : 'songs'} remembered</p><div className="earworm-timeline">{selectedEntries.length === 0 ? <div className="earworm-empty">Nothing stuck today.<br />Maybe that is part of the record too.</div> : selectedEntries.map((entry) => <article className="earworm-track" key={entry.id}><img src={entry.cover_art_url || '/logo.png'} alt="" /><div><strong>{entry.title}</strong><span>{entry.artist_name}{entry.release_name ? ` • ${entry.release_name}` : ''}</span>{entry.note && <em>{entry.note}</em>}</div><time>{entry.display_time}</time></article>)}</div><button type="button" className="earworm-add-day" onClick={openModal}><Plus size={16} /> Add a song to this day</button>{loading && <p className="earworm-muted earworm-loading">Syncing…</p>}</aside>
    </div>
    {modalOpen && <div className="earworm-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setModalOpen(false)}><div className="earworm-modal" role="dialog" aria-modal="true" aria-labelledby="earworm-modal-title"><div className="earworm-modal-head"><div><div className="earworm-kicker">New memory</div><h2 id="earworm-modal-title">Add a song</h2><p>{selectedDate}</p></div><button type="button" className="earworm-close" onClick={() => setModalOpen(false)} aria-label="Close"><X size={19} /></button></div><label htmlFor="earworm-search">Find a song</label><div className="earworm-search"><Search size={16} /><input id="earworm-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Song title or artist" autoFocus /></div><div className="earworm-results" aria-live="polite">{searchLoading && <div className="earworm-search-status"><LoaderCircle className="earworm-spinner" size={18} /> Searching MusicBrainz…</div>}{!searchLoading && searchError && <div className="earworm-search-status earworm-search-error" role="alert">{searchError}</div>}{!searchLoading && !searchError && search.trim().length >= 2 && results.length === 0 && <div className="earworm-search-status">No matching songs found.</div>}{results.map((track) => <button type="button" className={`earworm-result ${selectedTrack?.recording_mbid === track.recording_mbid ? 'selected' : ''}`} key={track.recording_mbid} onClick={() => setSelectedTrack(track)}><img src={track.cover_art_url || '/logo.png'} alt="" /><span><strong>{track.title}</strong><small>{track.artist_name} • {track.release_name || 'Unknown release'}</small></span></button>)}</div><div className="earworm-form-row"><label htmlFor="earworm-time">Display time</label><input id="earworm-time" type="time" value={displayTime} onChange={(event) => setDisplayTime(event.target.value)} /></div><label htmlFor="earworm-note">Note <span>(optional)</span></label><textarea id="earworm-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Why did this one stay with you?" /><p className="earworm-helper">The actual save time is stored separately. Only this display time appears in the calendar.</p><div className="earworm-modal-actions"><button type="button" className="earworm-secondary" onClick={() => setModalOpen(false)}>Cancel</button><button type="button" className="earworm-primary" disabled={!selectedTrack || loading} onClick={saveEntry}>Save memory</button></div></div></div>}
  </div>;
};

export default EarwormView;
