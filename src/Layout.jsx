import { useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { CalendarDays, MonitorPlay, Video, Settings, Activity, Menu, X } from 'lucide-react';

const Layout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const menuItems = [
    { name: 'Dashboard', path: '/monitoring', icon: <Activity size={20} /> },
    { name: 'Schedule', path: '/schedule', icon: <CalendarDays size={20} /> },
    { name: 'Media & Playlist', path: '/media', icon: <Video size={20} /> },
    { name: 'Accounts API', path: '/accounts', icon: <Settings size={20} /> },
    { name: 'System Logs', path: '/logs', icon: <MonitorPlay size={20} /> },
  ];

  return (
    <div className="flex h-screen overflow-hidden flex-col md:flex-row bg-slate-950">
      
      {/* Mobile Top Bar */}
      <div className="md:hidden flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900/50 backdrop-blur-lg z-30">
        <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
          StreamCloud
        </h1>
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className="p-2 bg-slate-800 text-slate-300 hover:text-white rounded-lg transition-colors"
        >
          <Menu size={24} />
        </button>
      </div>

      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed md:static inset-y-0 left-0 z-50 w-64 glass-panel border-r border-slate-700 flex flex-col transform transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        
        {/* Mobile Sidebar Close Button */}
        <div className="md:hidden absolute top-4 right-4">
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="p-2 bg-slate-800/50 text-slate-400 hover:text-white rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>
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
              onClick={() => setIsSidebarOpen(false)}
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
          <div 
            onClick={() => {
              localStorage.removeItem('api_key');
              localStorage.removeItem('username');
              window.location.href = '/login';
            }}
            className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-red-500/10 cursor-pointer text-slate-400 hover:text-red-400 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center font-bold text-slate-300">
              {(localStorage.getItem('username') || 'A').charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-medium text-slate-200 capitalize">{localStorage.getItem('username') || 'Admin'}</p>
              <p className="text-xs text-red-500/70">Logout</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/10 via-slate-900 to-slate-900/50 pointer-events-none -z-10" />
        
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;
