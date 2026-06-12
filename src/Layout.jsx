import { Outlet, NavLink } from 'react-router-dom';
import { CalendarDays, MonitorPlay, Video, Settings, Activity } from 'lucide-react';

const Layout = () => {
  const menuItems = [
    { name: 'Dashboard', path: '/monitoring', icon: <Activity size={20} /> },
    { name: 'Schedule', path: '/schedule', icon: <CalendarDays size={20} /> },
    { name: 'Media & Playlist', path: '/media', icon: <Video size={20} /> },
    { name: 'Accounts API', path: '/accounts', icon: <Settings size={20} /> },
    { name: 'System Logs', path: '/logs', icon: <MonitorPlay size={20} /> },
  ];

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 glass-panel border-r border-slate-700 flex flex-col">
        <div className="p-6 border-b border-slate-700/50">
          <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
            StreamCloud
          </h1>
          <p className="text-xs text-slate-400 mt-1">24/7 Broadcaster</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {menuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                  isActive
                    ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.15)]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`
              }
            >
              {item.icon}
              <span className="font-medium">{item.name}</span>
            </NavLink>
          ))}
        </nav>
        
        <div className="p-4 border-t border-slate-700/50">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-800/50 cursor-pointer text-slate-400 transition-colors">
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">A</div>
            <div>
              <p className="text-sm font-medium text-slate-200">Admin</p>
              <p className="text-xs text-slate-500">Logout</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/10 via-slate-900 to-slate-900/50 pointer-events-none -z-10" />
        
        <div className="flex-1 overflow-y-auto p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;
