export default function Logs() {
  return (
    <div>
      <h1 className="text-3xl font-bold text-slate-100 mb-6">System Logs</h1>
      <div className="glass-panel p-6 rounded-2xl h-[500px] overflow-y-auto font-mono text-sm">
        <div className="text-green-400 mb-2">[INFO] Server started successfully.</div>
        <div className="text-slate-400 mb-2">[INFO] Checking for upcoming schedules...</div>
        <div className="text-slate-400 mb-2">[INFO] Found 1 schedule for today.</div>
        <div className="text-yellow-400 mb-2">[WARN] Storage is reaching 80% capacity.</div>
      </div>
    </div>
  );
}
