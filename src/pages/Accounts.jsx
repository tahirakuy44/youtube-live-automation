import { useState, useEffect } from 'react';
import { MonitorPlay, Plus, Trash2, CheckCircle2, RefreshCw } from 'lucide-react';
import { apiFetch } from '../utils/api';
import { ConfirmModal, AlertModal } from '../components/Modal';

export default function Accounts() {
  const [accounts, setAccounts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Modals
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, action: null, title: '', message: '' });
  const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '' });
  const [connectModal, setConnectModal] = useState({ isOpen: false, clientId: '', clientSecret: '' });

  const apiFetchAccounts = () => {
    apiFetch('/api/accounts')
      .then(data => {
        if (Array.isArray(data)) {
          setAccounts(data);
        } else {
          console.error('API Error:', data);
          setAccounts([]);
        }
        setIsLoading(false);
      })
      .catch(err => {
        console.error(err);
        setIsLoading(false);
      });
  };

  useEffect(() => {
    apiFetchAccounts();
  }, []);

  const handleConnectDynamic = async (e) => {
    e.preventDefault();
    if (!connectModal.clientId.trim() || !connectModal.clientSecret.trim()) {
      setAlertModal({ isOpen: true, title: 'Incomplete', message: 'Client ID and Secret are required.'});
      return;
    }

    try {
      const res = await apiFetch('/api/auth/youtube/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: connectModal.clientId.trim(),
          client_secret: connectModal.clientSecret.trim()
        })
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setAlertModal({ isOpen: true, title: 'Error', message: data.error || 'Failed to generate URL'});
      }
    } catch (err) {
      setAlertModal({ isOpen: true, title: 'Network Error', message: err.message });
    }
  };

  const handleDelete = (id) => {
    setConfirmModal({
      isOpen: true,
      title: 'Disconnect Account',
      message: 'Are you sure you want to disconnect this YouTube account? Scheduled streams using this account will fail.',
      action: () => {
        apiFetch(`/api/accounts/${id}`, { method: 'DELETE' })
          .then(() => {
            apiFetchAccounts();
            setConfirmModal({ isOpen: false });
          })
          .catch(console.error);
      }
    });
  };

  return (
    <div className="h-full flex flex-col relative">
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-3">
            <MonitorPlay className="text-red-500" size={32} /> YouTube Accounts
          </h1>
          <p className="text-slate-400 text-sm mt-1">Manage connected channels for your automated live streams.</p>
        </div>
        <button 
          onClick={() => setConnectModal({ isOpen: true, clientId: '', clientSecret: '' })}
          className="bg-red-600 hover:bg-red-700 shadow-lg shadow-red-600/20 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium flex items-center gap-2"
        >
          <Plus size={16} /> Connect Account
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <RefreshCw className="animate-spin text-slate-500" size={32} />
          </div>
        ) : accounts.length === 0 ? (
          <div className="glass-panel rounded-2xl h-64 flex flex-col items-center justify-center text-slate-500">
            <MonitorPlay size={48} className="mb-4 opacity-30" />
            <p className="text-lg font-medium text-slate-300">No YouTube accounts connected.</p>
            <p className="text-sm mt-1">Click "Connect Account" to authenticate and add your channel.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {accounts.map(account => (
              <div key={account.id} className="glass-panel rounded-2xl p-6 border border-slate-700/50 hover:border-slate-600 transition-all flex flex-col relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
                
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-4">
                    {account.avatar_url && account.avatar_url.startsWith('http') ? (
                      <img src={account.avatar_url} alt="avatar" className="w-14 h-14 rounded-full border-2 border-slate-700 object-cover shadow-lg" />
                    ) : (
                      <div className={`w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold text-white shadow-lg ${account.avatar_url && account.avatar_url.startsWith('bg-') ? account.avatar_url : 'bg-slate-800'}`}>
                        {account.youtube_name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <h3 className="font-bold text-lg text-slate-100">{account.youtube_name}</h3>
                      <div className="flex items-center gap-1 text-xs text-green-400 mt-1 bg-green-400/10 w-max px-2 py-0.5 rounded-full">
                        <CheckCircle2 size={12} /> Connected
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="mt-auto pt-6 border-t border-slate-700/50 flex justify-between items-center">
                  <p className="text-xs text-slate-500">ID: {account.id}</p>
                  <button 
                    onClick={() => handleDelete(account.id)}
                    className="text-slate-400 hover:text-red-400 p-2 rounded-lg hover:bg-slate-800 transition-colors"
                    title="Disconnect Account"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <AlertModal isOpen={alertModal.isOpen} title={alertModal.title} message={alertModal.message} onClose={() => setAlertModal({ ...alertModal, isOpen: false })} />
      <ConfirmModal isOpen={confirmModal.isOpen} title={confirmModal.title} message={confirmModal.message} onConfirm={confirmModal.action} onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })} />
      
      {/* Dynamic OAuth Modal */}
      {connectModal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl shadow-2xl max-w-md w-full animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-slate-100 mb-4">Connect YouTube Channel</h3>
            <form onSubmit={handleConnectDynamic}>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1 block">Google Client ID</label>
                  <input 
                    type="text" 
                    value={connectModal.clientId} 
                    onChange={e => setConnectModal({...connectModal, clientId: e.target.value})} 
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 focus:outline-none focus:border-red-500 transition-colors text-sm"
                    placeholder="Enter your Client ID..."
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1 block">Google Client Secret</label>
                  <input 
                    type="text" 
                    value={connectModal.clientSecret} 
                    onChange={e => setConnectModal({...connectModal, clientSecret: e.target.value})} 
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 focus:outline-none focus:border-red-500 transition-colors text-sm"
                    placeholder="Enter your Client Secret..."
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1 block">Authorized Redirect URI (Copy to Google Cloud)</label>
                  <input 
                    type="text" 
                    readOnly
                    value={`${window.location.origin}/api/auth/youtube/callback`}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-slate-500 focus:outline-none text-xs cursor-text"
                    onClick={(e) => e.target.select()}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setConnectModal({ ...connectModal, isOpen: false })} className="px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 rounded-lg transition-colors">Cancel</button>
                <button type="submit" disabled={!connectModal.clientId || !connectModal.clientSecret} className="px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg transition-colors shadow-lg shadow-red-600/20">Login with Google</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
