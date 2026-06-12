import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, ShieldCheck } from 'lucide-react';

export default function Login() {
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      setError('Master API Key is required');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // Test the API key by fetching a lightweight endpoint
      const res = await fetch('/api/stats', {
        headers: {
          'Authorization': `Bearer ${apiKey.trim()}`
        }
      });

      if (res.ok) {
        // Save to localStorage and redirect
        localStorage.setItem('api_key', apiKey.trim());
        navigate('/monitoring');
      } else {
        setError('Invalid Master API Key. Access Denied.');
      }
    } catch (err) {
      setError('Network error or server is down. ' + err.message);
    }
    
    setIsLoading(false);
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-slate-950 relative overflow-hidden">
      {/* Decorative Background Glows */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-purple-600/20 blur-[120px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-pink-600/20 blur-[120px] rounded-full pointer-events-none"></div>

      <div className="glass-panel p-8 rounded-2xl w-full max-w-md shadow-2xl relative z-10 animate-in zoom-in-95 duration-500">
        <div className="flex justify-center mb-4">
          <div className="p-4 bg-slate-900 rounded-full border border-slate-800 shadow-[0_0_30px_rgba(168,85,247,0.3)]">
            <ShieldCheck size={48} className="text-purple-400" />
          </div>
        </div>
        
        <h1 className="text-3xl font-bold text-slate-100 mb-2 text-center">
          Secure Access
        </h1>
        <p className="text-slate-400 text-center text-sm mb-8">
          Enter your Master API Key to control the Engine.
        </p>

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
              <KeyRound size={16} className="text-pink-400" /> Master API Key
            </label>
            <input 
              type="password" 
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all text-center tracking-widest font-mono"
              placeholder="••••••••••••••••"
              disabled={isLoading}
            />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3 rounded-lg text-center animate-in fade-in">
              {error}
            </div>
          )}

          <button 
            type="submit"
            disabled={isLoading}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold py-3 rounded-xl transition-all shadow-[0_0_20px_rgba(168,85,247,0.4)] hover:shadow-[0_0_30px_rgba(168,85,247,0.6)] disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
          >
            {isLoading ? (
              <span className="animate-pulse">Verifying...</span>
            ) : (
              'Unlock Engine'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
