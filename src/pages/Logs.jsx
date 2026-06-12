import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../utils/api';

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const bottomRef = useRef(null);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await apiFetch('/api/logs');
        const data = await res.json();
        if (Array.isArray(data)) setLogs(data);
      } catch (e) {
        console.error('Failed to fetch logs', e);
      }
    };
    
    fetchLogs();
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const getColor = (type) => {
    switch(type) {
      case 'ERROR': return 'text-red-400';
      case 'WARN': return 'text-amber-400';
      default: return 'text-green-400';
    }
  };

  return (
    <div className="h-full flex flex-col">
      <h1 className="text-3xl font-bold text-slate-100 mb-6 shrink-0">System Logs</h1>
      <div className="glass-panel p-6 rounded-2xl flex-1 overflow-y-auto font-mono text-sm bg-[#0f111a] border border-slate-800 shadow-inner">
        {logs.length === 0 ? (
          <div className="text-slate-500 italic">No logs available yet...</div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="mb-1.5 flex gap-3 hover:bg-slate-800/30 px-2 py-0.5 rounded transition-colors break-all">
              <span className="text-slate-500 shrink-0 select-none">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
              <span className={`shrink-0 font-bold ${getColor(log.type)}`}>[{log.type}]</span>
              <span className="text-slate-300">{log.message}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
