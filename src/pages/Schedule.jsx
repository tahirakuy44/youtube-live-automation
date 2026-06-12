import { useState, useEffect } from 'react';
import { 
  format, addMonths, subMonths, startOfMonth, endOfMonth, 
  startOfWeek, endOfWeek, isSameMonth, isSameDay, addDays 
} from 'date-fns';
import { 
  ChevronLeft, ChevronRight, Calendar as CalendarIcon, 
  Clock, Video, User, Trash2, Settings, Image as ImageIcon,
  X, Tag, FileText, Globe
} from 'lucide-react';
import { apiFetch } from '../utils/api';
import { ConfirmModal, AlertModal } from '../components/Modal';

export default function Schedule() {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Real Data States
  const [schedules, setSchedules] = useState([]);
  
  // To populate media dropdown
  const [savedPlaylists, setSavedPlaylists] = useState([]);

  // To populate thumbnail dropdown
  const [images, setImages] = useState([]);

  // To populate background music dropdown
  // Removed audioFiles state since we are using Playlists now

  // To populate accounts dropdown
  const [accounts, setAccounts] = useState([]);

  useEffect(() => {
    apiFetch('/api/schedules')
      .then(res => res.json())
      .then(data => setSchedules(Array.isArray(data) ? data : []))
      .catch(console.error);

    apiFetch('/api/playlists')
      .then(res => res.json())
      .then(data => setSavedPlaylists(Array.isArray(data) ? data : []))
      .catch(console.error);

    apiFetch('/api/files')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setImages(data.filter(f => f.type === 'image'));
        }
      })
      .catch(console.error);

    apiFetch('/api/accounts')
      .then(res => res.json())
      .then(data => setAccounts(Array.isArray(data) ? data : []))
      .catch(console.error);
  }, []);

  // Drawer States
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  // Form State
  const initialForm = {
    title: '',
    startDate: format(new Date(), 'yyyy-MM-dd'),
    startTime: '10:00',
    endDate: format(new Date(), 'yyyy-MM-dd'),
    endTime: '12:00',
    accountId: '',
    mediaSource: '',
    description: '',
    category: '20', // 20 is Gaming in YT API
    tags: '',
    privacy: 'public',
    thumbnail: '',
    video_quality: '720p',
    background_music: 'none',
    loop_mode: 'infinite',
    use_custom_rtmp: false,
    rtmp_url: '',
    stream_name: ''
  };
  const [formData, setFormData] = useState(initialForm);

  // Modals
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, action: null, title: '', message: '' });
  const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '' });

  // No local storage persistence needed anymore

  // --- Calendar Logic ---
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const renderHeader = () => {
    return (
      <div className="flex items-center justify-between mb-4 border-b border-slate-700/50 pb-4">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <CalendarIcon className="text-purple-400" />
            {format(currentDate, "MMMM yyyy")}
          </h2>
          <button onClick={goToToday} className="text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1 rounded-lg transition-colors">
            Today
          </button>
        </div>
        <div className="flex gap-2">
          <button onClick={prevMonth} className="p-2 glass-panel rounded-lg hover:bg-slate-800 transition-colors text-slate-400 hover:text-white">
            <ChevronLeft size={20} />
          </button>
          <button onClick={nextMonth} className="p-2 glass-panel rounded-lg hover:bg-slate-800 transition-colors text-slate-400 hover:text-white">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
    );
  };

  const renderDays = () => {
    const days = [];
    const startDate = startOfWeek(currentDate);
    for (let i = 0; i < 7; i++) {
      days.push(
        <div className="text-center font-bold text-xs text-slate-400 py-2 border-b border-slate-700/50 uppercase tracking-wider" key={i}>
          {format(addDays(startDate, i), "EEE")}
        </div>
      );
    }
    return <div className="grid grid-cols-7 mb-2">{days}</div>;
  };

  const renderCells = () => {
    const rows = [];
    let days = [];
    let day = startDate;

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        const formattedDate = format(day, "d");
        const cloneDay = day;
        
        // Find schedules for this day
        const dayString = format(cloneDay, 'yyyy-MM-dd');
        const daySchedules = schedules.filter(sch => sch.startDate === dayString);

        days.push(
          <div 
            key={day} 
            className={`min-h-[120px] p-2 border-r border-b border-slate-700/50 hover:bg-slate-800/80 cursor-pointer transition-all relative flex flex-col gap-1 ${
              !isSameMonth(day, monthStart) ? "text-slate-600 bg-slate-900/30" : "text-slate-300 bg-slate-800/20"
            }`}
            onClick={() => handleDateClick(cloneDay)}
          >
            <div className="flex justify-between items-start">
              <span className={`text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full ${
                isSameDay(day, new Date()) ? "bg-purple-600 text-white shadow-[0_0_10px_rgba(168,85,247,0.5)]" : ""
              }`}>
                {formattedDate}
              </span>
            </div>
            
            <div className="flex-1 overflow-y-auto mt-1 space-y-1 scrollbar-hide">
              {daySchedules.map(sch => (
                <div 
                  key={sch.id}
                  onClick={(e) => { e.stopPropagation(); openEditDrawer(sch); }}
                  className="bg-slate-900/80 border-l-2 border-purple-500 text-slate-300 text-xs px-2 py-1.5 rounded-r truncate hover:bg-slate-800 hover:text-white transition-colors flex flex-col shadow-sm"
                  title={sch.title}
                >
                  <span className="font-semibold truncate text-purple-300">{sch.startTime} - {sch.endTime}</span>
                  <span className="truncate">{sch.title}</span>
                </div>
              ))}
            </div>
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(<div className="grid grid-cols-7" key={day}>{days}</div>);
      days = [];
    }
    return <div className="border-t border-l border-slate-700/50 rounded-xl overflow-hidden glass-panel">{rows}</div>;
  };

  // --- Handlers ---
  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const goToToday = () => setCurrentDate(new Date());

  const handleDateClick = (day) => {
    setFormData({
      ...initialForm,
      startDate: format(day, 'yyyy-MM-dd'),
      endDate: format(day, 'yyyy-MM-dd')
    });
    setEditingId(null);
    setIsDrawerOpen(true);
  };

  const openEditDrawer = (sch) => {
    setFormData(sch);
    setEditingId(sch.id);
    setIsDrawerOpen(true);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveSchedule = (e) => {
    e.preventDefault();
    
    const isCustom = String(formData.use_custom_rtmp) === 'true';

    if (!formData.mediaSource) {
      setAlertModal({ isOpen: true, title: 'Incomplete Form', message: 'Please select a Media Source (Playlist).'});
      return;
    }

    if (!isCustom && (!formData.title || !formData.accountId)) {
      setAlertModal({ isOpen: true, title: 'Incomplete Form', message: 'Please provide a Stream Title and select a Target Account.'});
      return;
    }

    if (isCustom && (!formData.rtmp_url || !formData.stream_name)) {
      setAlertModal({ isOpen: true, title: 'Incomplete Form', message: 'Please provide both RTMP URL and Stream Key.'});
      return;
    }

    const payload = editingId ? { ...formData, id: editingId } : { ...formData, id: 'sch_' + Date.now() };

    apiFetch('/api/schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(() => {
      if (editingId) {
        setSchedules(schedules.map(s => s.id === editingId ? payload : s));
        setAlertModal({ isOpen: true, title: 'Success', message: 'Schedule updated successfully.'});
      } else {
        setSchedules([...schedules, payload]);
        setAlertModal({ isOpen: true, title: 'Success', message: 'New schedule created successfully.'});
      }
      setIsDrawerOpen(false);
    }).catch(err => {
      setAlertModal({ isOpen: true, title: 'Error', message: err.message });
    });
  };

  const handleDelete = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Schedule',
      message: 'Are you sure you want to delete this scheduled live stream?',
      action: () => {
        fetch(`/api/schedules/${editingId}`, { method: 'DELETE' }).then(() => {
          setSchedules(schedules.filter(s => s.id !== editingId));
          setConfirmModal({ isOpen: false });
          setIsDrawerOpen(false);
        }).catch(console.error);
      }
    });
  };

  return (
    <div className="h-full flex flex-col relative">
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Live Schedule</h1>
          <p className="text-slate-400 text-sm mt-1">Plan and automate your 24/7 stream broadcasts.</p>
        </div>
        <button 
          onClick={() => { setFormData(initialForm); setEditingId(null); setIsDrawerOpen(true); }}
          className="bg-purple-600 hover:bg-purple-700 shadow-lg shadow-purple-600/20 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium flex items-center gap-2"
        >
          <CalendarIcon size={16} /> Add Schedule
        </button>
      </div>

      <div className="glass-panel p-6 rounded-2xl flex-1 flex flex-col min-h-0 overflow-y-auto">
        {renderHeader()}
        {renderDays()}
        {renderCells()}
      </div>

      {/* Slide-out Drawer for Schedule Form */}
      {isDrawerOpen && (
        <div className="absolute top-0 right-0 bottom-0 w-[500px] glass-panel border-l border-slate-700/50 shadow-2xl flex flex-col z-20 animate-in slide-in-from-right-8 duration-300">
          <div className="p-6 border-b border-slate-700/50 flex justify-between items-center bg-slate-900/80 shrink-0">
            <h3 className="font-bold text-xl text-slate-100 flex items-center gap-2">
              <CalendarIcon className="text-purple-400" size={24} /> 
              {editingId ? 'Edit Schedule' : 'New Schedule'}
            </h3>
            <button onClick={() => setIsDrawerOpen(false)} className="text-slate-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-slate-800">
              <X size={20} />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Time Settings */}
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-purple-400 uppercase tracking-wider flex items-center gap-2 border-b border-slate-800 pb-2">
                <Clock size={16} /> Timing
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 font-medium">Start Date</label>
                  <input type="date" name="startDate" value={formData.startDate} onChange={handleInputChange} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 font-medium">Start Time</label>
                  <input type="time" name="startTime" value={formData.startTime} onChange={handleInputChange} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 font-medium">End Date</label>
                  <input type="date" name="endDate" value={formData.endDate} onChange={handleInputChange} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 font-medium">End Time</label>
                  <input type="time" name="endTime" value={formData.endTime} onChange={handleInputChange} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none text-sm" />
                </div>
              </div>
            </div>

            {/* Media & Account */}
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-purple-400 uppercase tracking-wider flex items-center gap-2 border-b border-slate-800 pb-2">
                <Video size={16} /> Source & Destination
              </h4>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 font-medium flex items-center gap-1"><Globe size={14}/> Destination Mode</label>
                  <select name="use_custom_rtmp" value={String(formData.use_custom_rtmp) === 'true' ? 'true' : 'false'} onChange={(e) => setFormData(prev => ({ ...prev, use_custom_rtmp: e.target.value === 'true' }))} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none text-sm appearance-none font-bold text-purple-300">
                    <option value="false">📺 YouTube Auto (API) - Default</option>
                    <option value="true">🔗 Custom RTMP (Facebook, Twitch, TikTok, dll)</option>
                  </select>
                </div>

                {String(formData.use_custom_rtmp) === 'true' ? (
                  <div className="grid grid-cols-1 gap-3 p-3 bg-purple-900/20 border border-purple-500/30 rounded-lg">
                    <div className="space-y-1">
                      <label className="text-xs text-purple-300 font-medium">RTMP URL</label>
                      <input type="text" name="rtmp_url" value={formData.rtmp_url} onChange={handleInputChange} placeholder="e.g. rtmp://live.twitch.tv/app" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none text-sm" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-purple-300 font-medium">Stream Key</label>
                      <input type="password" name="stream_name" value={formData.stream_name} onChange={handleInputChange} placeholder="live_123456789" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none text-sm" />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 font-medium flex items-center gap-1"><User size={14}/> YouTube Account</label>
                    <select name="accountId" value={formData.accountId} onChange={handleInputChange} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none text-sm appearance-none">
                      <option value="">-- Select YouTube Account --</option>
                      {accounts.map(acc => (
                        <option key={acc.id} value={acc.id}>{acc.youtube_name}</option>
                      ))}
                    </select>
                    {accounts.length === 0 && <p className="text-[10px] text-red-500 mt-1">No accounts connected. Go to Accounts page.</p>}
                  </div>
                )}
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 font-medium flex items-center gap-1"><Video size={14}/> Media Source (Playlist)</label>
                  <select name="mediaSource" value={formData.mediaSource} onChange={handleInputChange} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none text-sm appearance-none">
                    <option value="">-- Select Playlist --</option>
                    {savedPlaylists.map(pl => (
                      <option key={pl.id} value={pl.id}>{pl.name} ({pl.items.length} items)</option>
                    ))}
                  </select>
                  {savedPlaylists.length === 0 && <p className="text-[10px] text-amber-500 mt-1">No playlists found. Create one in Media Manager first.</p>}
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-slate-400 font-medium flex items-center gap-1"><ImageIcon size={14}/> Custom Thumbnail</label>
                  <div className="flex gap-3 items-center">
                    {formData.thumbnail && images.find(img => img.id === formData.thumbnail)?.url ? (
                      <div className="w-24 h-16 bg-slate-900 rounded border border-slate-700 overflow-hidden shrink-0 shadow-inner">
                        <img 
                          src={`http://localhost:3001${images.find(img => img.id === formData.thumbnail).url}`} 
                          className="w-full h-full object-cover" 
                          alt="Thumbnail Preview" 
                        />
                      </div>
                    ) : (
                      <div className="w-24 h-16 bg-slate-900 rounded border border-slate-700 flex items-center justify-center shrink-0">
                        <ImageIcon size={20} className="text-slate-600" />
                      </div>
                    )}
                    <select name="thumbnail" value={formData.thumbnail} onChange={handleInputChange} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none text-sm appearance-none flex-1">
                      <option value="">-- Select Thumbnail (Optional) --</option>
                      {images.map(img => (
                        <option key={img.id} value={img.id}>{img.name}</option>
                      ))}
                    </select>
                  </div>
                  {images.length === 0 && <p className="text-[10px] text-amber-500 mt-1">No images uploaded. Upload in Media Manager first.</p>}
                </div>
              </div>
            </div>

            {/* Stream Metadata (Only for YouTube API) */}
            {String(formData.use_custom_rtmp) !== 'true' && (
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-purple-400 uppercase tracking-wider flex items-center gap-2 border-b border-slate-800 pb-2">
                  <Settings size={16} /> Stream Metadata
                </h4>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 font-medium flex items-center gap-1"><FileText size={14}/> Stream Title</label>
                    <input type="text" name="title" value={formData.title} onChange={handleInputChange} placeholder="e.g. 24/7 Chill Lofi Beats" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 font-medium">Description</label>
                    <textarea name="description" value={formData.description} onChange={handleInputChange} rows="3" placeholder="Stream description..." className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none text-sm resize-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs text-slate-400 font-medium">Category</label>
                      <select name="category" value={formData.category} onChange={handleInputChange} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none text-sm appearance-none">
                        <option value="20">Gaming</option>
                        <option value="10">Music</option>
                        <option value="24">Entertainment</option>
                        <option value="27">Education</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-slate-400 font-medium flex items-center gap-1"><Globe size={14}/> Privacy</label>
                      <select name="privacy" value={formData.privacy} onChange={handleInputChange} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none text-sm appearance-none">
                        <option value="public">Public</option>
                        <option value="unlisted">Unlisted</option>
                        <option value="private">Private</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 font-medium flex items-center gap-1"><Tag size={14}/> Tags (comma separated)</label>
                    <input type="text" name="tags" value={formData.tags} onChange={handleInputChange} placeholder="lofi, gaming, stream, 24/7" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none text-sm" />
                  </div>
                </div>
              </div>
            )}

            {/* Advanced FFmpeg Options */}
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-purple-400 uppercase tracking-wider flex items-center gap-2 border-b border-slate-800 pb-2">
                <Settings size={16} /> Advanced FFmpeg Options
              </h4>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 font-medium">Video Quality</label>
                  <select name="video_quality" value={formData.video_quality || '720p'} onChange={handleInputChange} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none text-sm appearance-none">
                    <option value="1080p">1080p (Highest Quality, CPU Heavy)</option>
                    <option value="720p">720p (Standard, Balanced)</option>
                    <option value="480p">480p (Low Quality, CPU Saver)</option>
                    <option value="copy">Passthrough / Copy (Zero CPU, Strict Format)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 font-medium">Background Music (Audio Playlist)</label>
                  <select name="background_music" value={formData.background_music || 'none'} onChange={handleInputChange} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none text-sm appearance-none">
                    <option value="none">-- No Background Music --</option>
                    {savedPlaylists.map(pl => (
                      <option key={pl.id} value={pl.id}>{pl.name} ({pl.items.length} items)</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 font-medium">Loop Mode</label>
                  <select name="loop_mode" value={formData.loop_mode || 'infinite'} onChange={handleInputChange} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none text-sm appearance-none">
                    <option value="infinite">Infinite Loop (24/7)</option>
                    <option value="once">Play Once & Stop</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
          
          <div className="p-6 border-t border-slate-700/50 bg-slate-900/80 flex justify-between gap-3 shrink-0">
            {editingId ? (
              <button onClick={handleDelete} className="bg-red-950/40 hover:bg-red-900/60 text-red-400 px-4 py-2 rounded-lg transition-colors text-sm font-medium border border-red-900/50 flex items-center gap-2">
                <Trash2 size={16} /> Delete
              </button>
            ) : (
              <div className="flex-1"></div> // Spacer
            )}
            <div className="flex gap-3">
              <button onClick={() => setIsDrawerOpen(false)} className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-lg transition-colors text-sm font-medium">Cancel</button>
              <button onClick={handleSaveSchedule} className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg transition-colors text-sm font-medium shadow-lg shadow-purple-600/20">
                {editingId ? 'Save Changes' : 'Schedule Live'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <AlertModal isOpen={alertModal.isOpen} title={alertModal.title} message={alertModal.message} onClose={() => setAlertModal({ ...alertModal, isOpen: false })} />
      <ConfirmModal isOpen={confirmModal.isOpen} title={confirmModal.title} message={confirmModal.message} onConfirm={confirmModal.action} onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })} />
    </div>
  );
}
