import { useState, useEffect } from 'react';
import { Activity, Server, Cpu, HardDrive, Clock, StopCircle, RefreshCw, CheckCircle2, AlertCircle, Database, Eye, ExternalLink, Copy } from 'lucide-react';
import { apiFetch } from '../utils/api';
import { ConfirmModal, AlertModal } from '../components/Modal';

export default function Monitoring() {
  const [stats, setStats] = useState({ cpu: '-', cpuCores: '-', ramTotal: '0', ramUsed: '0', uptime: 0, diskTotal: '0', diskUsed: '0', diskFree: '0' });
  const [schedules, setSchedules] = useState([]);
  const [viewers, setViewers] = useState({});
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modals
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, action: null, title: '', message: '' });
  const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '' });

  const fetchData = async (showIndicator = true) => {
    if (showIndicator) setIsRefreshing(true);
    try {
      const [statsRes, schedRes] = await Promise.all([
        apiFetch('/api/stats'),
        apiFetch('/api/schedules')
      ]);
      const statsData = await statsRes.json();
      const schedData = await schedRes.json();
      
      if(statsData.cpu) setStats(statsData);
      if(Array.isArray(schedData)) {
        setSchedules(schedData);
        // Fetch viewers for live streams
        schedData.filter(s => s.status === 'live').forEach(async (sch) => {
          try {
            const vRes = await apiFetch(`/api/schedules/${sch.id}/viewers`);
            const vData = await vRes.json();
            setViewers(prev => ({ ...prev, [sch.id]: vData.viewers }));
          } catch (e) {
            console.error('Failed to fetch viewers for schedule:', sch.id, e);
          }
        });
      }
    } catch (error) {
      console.error('Failed to apiFetch monitoring data', error);
    }
    if (showIndicator) setIsRefreshing(false);
  };

  useEffect(() => {
    // Jalankan pertama kali secara asynchronous tanpa trigger animasi memuat
    setTimeout(() => fetchData(false), 0);
    
    // Polling setiap 5 detik tanpa mengubah state isRefreshing
    const interval = setInterval(() => fetchData(false), 5000); 
    return () => clearInterval(interval);
  }, []);

  const formatUptime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h}h ${m}m ${s}s`;
  };

  const handleForceStop = (id) => {
    setConfirmModal({
      isOpen: true,
      title: 'Force Stop Stream?',
      message: 'Are you sure you want to kill this live stream? This will forcefully terminate the FFmpeg process.',
      action: async () => {
        try {
          const res = await apiFetch(`/api/schedules/${id}/stop`, { method: 'POST' });
          if (res.ok) {
            setAlertModal({ isOpen: true, title: 'Stopped', message: 'The stream has been stopped successfully.'});
            fetchData();
          } else {
            const data = await res.json();
            setAlertModal({ isOpen: true, title: 'Error', message: data.error || 'Failed to stop stream.'});
          }
        } catch (err) {
          setAlertModal({ isOpen: true, title: 'Error', message: err.message });
        }
        setConfirmModal({ ...confirmModal, isOpen: false });
      }
    });
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'live':
        return <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-semibold animate-pulse"><span className="w-2 h-2 rounded-full bg-red-500"></span> LIVE</span>;
      case 'starting':
        return <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs font-semibold"><RefreshCw size={12} className="animate-spin" /> STARTING</span>;
      case 'completed':
        return <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold"><CheckCircle2 size={12} /> COMPLETED</span>;
      case 'error':
        return <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-semibold"><AlertCircle size={12} /> ERROR</span>;
      default:
        return <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-700 text-slate-300 border border-slate-600 text-xs font-semibold"><Clock size={12} /> PENDING</span>;
    }
  };

  const activeStreamsCount = schedules.filter(s => s.status === 'live' || s.status === 'starting').length;
  const ramPercentage = (parseFloat(stats.ramUsed) / parseFloat(stats.ramTotal)) * 100 || 0;
  const diskPercentage = (parseFloat(stats.diskUsed) / parseFloat(stats.diskTotal)) * 100 || 0;

  return (
    <div className="h-full flex flex-col relative animate-in fade-in duration-500">
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-100 flex items-center gap-2 md:gap-3">
            <Activity className="text-purple-500" size={28} /> <span className="hidden sm:inline">System Monitoring</span><span className="sm:hidden">Monitoring</span>
          </h1>
          <p className="text-slate-400 text-xs md:text-sm mt-1">Real-time status of your VPS and active streams.</p>
        </div>
        <button onClick={() => fetchData(true)} className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors">
          <RefreshCw size={20} className={isRefreshing ? "animate-spin" : ""} />
        </button>
      </div>

      {/* System Resources Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8 shrink-0">
        <div className="glass-panel p-5 rounded-xl border-l-4 border-l-blue-500">
          <div className="flex items-center gap-3 text-slate-400 mb-2">
            <Server size={18} /> <h3 className="font-medium text-sm">Server Status</h3>
          </div>
          <div className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]"></div>
            Online
          </div>
          <p className="text-xs text-slate-500 mt-2">Active Streams: {activeStreamsCount}</p>
        </div>

        <div className="glass-panel p-5 rounded-xl border-l-4 border-l-purple-500">
          <div className="flex items-center gap-3 text-slate-400 mb-2">
            <Clock size={18} /> <h3 className="font-medium text-sm">Engine Uptime</h3>
          </div>
          <div className="text-xl font-bold text-slate-100">{formatUptime(stats.uptime)}</div>
          <p className="text-xs text-slate-500 mt-2">Continuous running time</p>
        </div>

        <div className="glass-panel p-5 rounded-xl border-l-4 border-l-rose-500">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <div className="flex items-center gap-3"><Cpu size={18} /> <h3 className="font-medium text-sm">CPU Load</h3></div>
            <span className="text-xs font-bold text-rose-500">{stats.cpuUsage || 0}%</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2 mb-3 mt-4 overflow-hidden">
            <div className="bg-gradient-to-r from-rose-500 to-pink-600 h-2 rounded-full transition-all duration-1000" style={{ width: `${Math.min(stats.cpuUsage || 0, 100)}%` }}></div>
          </div>
          <div className="text-xs text-slate-500 mt-2 truncate" title={stats.cpu}>{stats.cpu} ({stats.cpuCores} Cores)</div>
        </div>

        <div className="glass-panel p-5 rounded-xl border-l-4 border-l-amber-500">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <div className="flex items-center gap-3"><Database size={18} /> <h3 className="font-medium text-sm">RAM Usage</h3></div>
            <span className="text-xs font-bold text-amber-500">{ramPercentage.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2 mb-3 mt-4 overflow-hidden">
            <div className="bg-gradient-to-r from-amber-500 to-orange-600 h-2 rounded-full transition-all duration-1000" style={{ width: `${Math.min(ramPercentage, 100)}%` }}></div>
          </div>
          <p className="text-xs text-slate-500 flex justify-between">
            <span>{stats.ramUsed} GB</span>
            <span>{stats.ramTotal} GB</span>
          </p>
        </div>

        <div className="glass-panel p-5 rounded-xl border-l-4 border-l-cyan-500">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <div className="flex items-center gap-3"><HardDrive size={18} /> <h3 className="font-medium text-sm">Disk Space</h3></div>
            <span className="text-xs font-bold text-cyan-500">{diskPercentage.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2 mb-3 mt-4 overflow-hidden">
            <div className="bg-gradient-to-r from-cyan-500 to-blue-600 h-2 rounded-full transition-all duration-1000" style={{ width: `${Math.min(diskPercentage, 100)}%` }}></div>
          </div>
          <p className="text-xs text-slate-500 flex justify-between">
            <span>{stats.diskUsed} GB</span>
            <span>{stats.diskTotal} GB</span>
          </p>
        </div>
      </div>

      {/* Streams Table */}
      <div className="glass-panel rounded-2xl overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-900/50 shrink-0">
          <h2 className="text-lg font-bold text-slate-200">Broadcast Jobs</h2>
          <span className="text-xs font-medium bg-slate-800 text-slate-400 px-3 py-1 rounded-full">{schedules.length} Total Jobs</span>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-400">
            <thead className="bg-slate-900/80 text-slate-500 text-xs uppercase font-semibold">
              <tr>
                <th className="px-6 py-4">Title</th>
                <th className="px-6 py-4">Scheduled Time</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Stream ID</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {schedules.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center text-slate-500">
                    <Activity size={32} className="mx-auto mb-3 opacity-20" />
                    No streams scheduled. Go to Schedule to add one.
                  </td>
                </tr>
              ) : (
                schedules.map((schedule) => (
                  <tr key={schedule.id} className="hover:bg-slate-800/20 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-200">{schedule.title}</td>
                    <td className="px-6 py-4">
                      <div className="text-slate-300">{schedule.startDate}</div>
                      <div className="text-xs text-slate-500">{schedule.startTime} - {schedule.endTime}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {getStatusBadge(schedule.status)}
                        {schedule.status === 'live' && viewers[schedule.id] !== undefined && (
                          <div className="flex items-center gap-1.5 px-2.5 py-1 w-max rounded bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] font-bold shadow-[0_0_8px_rgba(239,68,68,0.2)] animate-pulse">
                            <Eye size={12} /> {viewers[schedule.id]} Viewers
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs font-mono text-slate-500">
                      {schedule.stream_id || 'N/A'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {schedule.broadcast_id && (
                          <>
                            <button
                              onClick={() => window.open(`https://studio.youtube.com/video/${schedule.broadcast_id}/livestreaming`, '_blank')}
                              className="p-2 text-blue-400 hover:text-white hover:bg-blue-500/20 rounded-lg transition-colors border border-transparent hover:border-blue-500/30"
                              title="Open in YouTube Studio"
                            >
                              <ExternalLink size={18} />
                            </button>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(`https://youtu.be/${schedule.broadcast_id}`);
                                setAlertModal({ isOpen: true, title: 'Copied', message: 'YouTube Link copied to clipboard!' });
                              }}
                              className="p-2 text-emerald-400 hover:text-white hover:bg-emerald-500/20 rounded-lg transition-colors border border-transparent hover:border-emerald-500/30"
                              title="Copy Share Link"
                            >
                              <Copy size={18} />
                            </button>
                          </>
                        )}
                        {schedule.status === 'live' || schedule.status === 'starting' ? (
                          <button 
                            onClick={() => handleForceStop(schedule.id)}
                            className="p-2 text-rose-400 hover:text-white hover:bg-rose-500/20 rounded-lg transition-colors border border-transparent hover:border-rose-500/30"
                            title="Force Stop Stream"
                          >
                            <StopCircle size={18} />
                          </button>
                        ) : !schedule.broadcast_id && (
                          <span className="text-xs text-slate-600">-</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      <AlertModal isOpen={alertModal.isOpen} title={alertModal.title} message={alertModal.message} onClose={() => setAlertModal({ ...alertModal, isOpen: false })} />
      <ConfirmModal isOpen={confirmModal.isOpen} title={confirmModal.title} message={confirmModal.message} onConfirm={confirmModal.action} onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })} />
    </div>
  );
}
