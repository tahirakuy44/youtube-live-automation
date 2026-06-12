import { useState, useEffect, useRef } from 'react';
import { 
  Folder, Film, Music, Image as ImageIcon, 
  Trash2, Plus, Upload, CheckSquare, Square, 
  ListVideo, Shuffle, Play, X, Loader2, CheckCircle2, AlertCircle, PlusCircle
} from 'lucide-react';
import { apiFetch } from '../utils/api';
import { ConfirmModal, PromptModal, AlertModal } from '../components/Modal';

export default function Media() {
  const [activeFolder, setActiveFolder] = useState('all');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [showPlaylistBuilder, setShowPlaylistBuilder] = useState(false);
  
  // Custom Modals State
  const [promptModal, setPromptModal] = useState({ isOpen: false });
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, action: null, title: '', message: '' });
  const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '' });

  // Upload State
  const [uploadQueue, setUploadQueue] = useState([]);
  const isUploading = uploadQueue.some(q => q.status === 'uploading');
  
  // Persisted Data
  const [folders, setFolders] = useState(() => {
    const saved = localStorage.getItem('stream_folders');
    return saved ? JSON.parse(saved) : [{ id: 'all', name: 'All Files' }];
  });
  
  const [files, setFiles] = useState([]);
  
  // Playlist Builder States
  const [playlistItems, setPlaylistItems] = useState([]);
  const [playlistName, setPlaylistName] = useState('');
  
  // Saved Playlists (Logical Folders)
  const [savedPlaylists, setSavedPlaylists] = useState([]);

  useEffect(() => {
    apiFetch('/api/files')
      .then(res => res.json())
      .then(data => setFiles(data))
      .catch(console.error);

    apiFetch('/api/playlists')
      .then(res => res.json())
      .then(data => setSavedPlaylists(data))
      .catch(console.error);
  }, []);

  const fileInputRef = useRef(null);

  // --- Effects for Persistence ---
  useEffect(() => localStorage.setItem('stream_folders', JSON.stringify(folders)), [folders]);

  // --- Upload Sequential Loop ---
  useEffect(() => {
    if (uploadQueue.length === 0 || isUploading) return;
    
    const nextItemIndex = uploadQueue.findIndex(item => item.status === 'pending');
    if (nextItemIndex === -1) return;
    
    const uploadTimer = setTimeout(() => {
      const item = uploadQueue[nextItemIndex];
      setUploadQueue(prev => prev.map((q, i) => i === nextItemIndex ? { ...q, status: 'uploading' } : q));
      
      const formData = new FormData();
      formData.append('mediaFile', item.file);
      formData.append('folderId', item.targetFolder);
      
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/upload', true);
      const apiKey = localStorage.getItem('api_key');
      if (apiKey) xhr.setRequestHeader('Authorization', `Bearer ${apiKey}`);
      
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percentComplete = Math.round((e.loaded / e.total) * 100);
          setUploadQueue(prev => prev.map((q, i) => i === nextItemIndex ? { ...q, progress: percentComplete } : q));
        }
      };
      
      xhr.onload = () => {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          const sizeMB = (item.file.size / (1024 * 1024)).toFixed(2);
          const sizeStr = sizeMB >= 1000 ? (sizeMB / 1024).toFixed(2) + ' GB' : sizeMB + ' MB';
          
          let type = 'unknown';
          if (item.file.type.startsWith('video/')) type = 'video';
          else if (item.file.type.startsWith('audio/')) type = 'audio';
          else if (item.file.type.startsWith('image/')) type = 'image';

          const newFile = {
            id: 'file_' + Date.now() + Math.random().toString(36).substr(2, 9),
            name: response.file.originalName,
            serverName: response.file.filename,
            type: type,
            size: sizeStr,
            url: response.file.url,
            folderId: item.targetFolder
          };
          
          setFiles(prev => [...prev, newFile]);
          setUploadQueue(prev => prev.map((q, i) => i === nextItemIndex ? { ...q, status: 'done', progress: 100 } : q));
        } else {
          setUploadQueue(prev => prev.map((q, i) => i === nextItemIndex ? { ...q, status: 'error' } : q));
        }
      };
      
      xhr.onerror = () => {
        setUploadQueue(prev => prev.map((q, i) => i === nextItemIndex ? { ...q, status: 'error' } : q));
      };
      
      xhr.send(formData);
    }, 0);

    return () => clearTimeout(uploadTimer);
  }, [uploadQueue, isUploading]);


  // --- Actions ---
  const handleCreateFolder = () => {
    setPromptModal({ isOpen: true });
  };

  const confirmCreateFolder = (name) => {
    setFolders([...folders, { id: 'folder_' + Date.now(), name: name.trim() }]);
    setPromptModal({ isOpen: false });
  };

  const handleDeleteFolder = (id, e) => {
    e.stopPropagation();
    setConfirmModal({
      isOpen: true,
      title: 'Delete Folder',
      message: 'Are you sure you want to delete this folder? Files inside will be moved to All Files.',
      action: () => {
        setFolders(folders.filter(f => f.id !== id));
        setFiles(files.map(f => f.folderId === id ? { ...f, folderId: 'all' } : f));
        if (activeFolder === id) setActiveFolder('all');
        setConfirmModal({ isOpen: false });
      }
    });
  };

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileChange = (e) => {
    const uploadedFiles = Array.from(e.target.files);
    if (uploadedFiles.length === 0) return;

    const newQueueItems = uploadedFiles.map(file => ({
      file,
      id: 'queue_' + Date.now() + Math.random(),
      name: file.name,
      progress: 0,
      status: 'pending',
      targetFolder: activeFolder === 'all' ? 'all' : activeFolder
    }));
    
    setUploadQueue(prev => [...prev, ...newQueueItems]);
    e.target.value = '';
  };

  const clearCompletedQueue = () => {
    setUploadQueue(prev => prev.filter(q => q.status === 'pending' || q.status === 'uploading'));
  };

  const handleSelectFile = (id) => {
    if (selectedFiles.includes(id)) setSelectedFiles(selectedFiles.filter(f => f !== id));
    else setSelectedFiles([...selectedFiles, id]);
  };

  const handleSelectAll = () => {
    if (selectedFiles.length === filteredFiles.length) setSelectedFiles([]);
    else setSelectedFiles(filteredFiles.map(f => f.id));
  };

  const handleDeleteSelectedFiles = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Files',
      message: `Are you sure you want to delete ${selectedFiles.length} selected files?`,
      action: () => {
        selectedFiles.forEach(id => apiFetch(`/api/files/${id}`, { method: 'DELETE' }).catch(console.error));
        setFiles(files.filter(f => !selectedFiles.includes(f.id)));
        setPlaylistItems(playlistItems.filter(p => !selectedFiles.includes(p.id)));
        setSelectedFiles([]);
        setConfirmModal({ isOpen: false });
      }
    });
  };

  // --- Playlist Logic ---
  const handleAddSelectedToPlaylist = () => {
    const filesToAdd = files.filter(f => selectedFiles.includes(f.id));
    setPlaylistItems([...playlistItems, ...filesToAdd]);
    setSelectedFiles([]);
    setShowPlaylistBuilder(true);
  };

  const handleAddSingleToPlaylist = (file, e) => {
    e.stopPropagation();
    setPlaylistItems([...playlistItems, file]);
    setShowPlaylistBuilder(true);
  };

  const handleRemoveFromPlaylist = (indexToRemove) => {
    setPlaylistItems(playlistItems.filter((_, index) => index !== indexToRemove));
  };

  const handleShufflePlaylist = () => {
    const shuffled = [...playlistItems].sort(() => Math.random() - 0.5);
    setPlaylistItems(shuffled);
  };

  const handleSavePlaylist = () => {
    if (!playlistName.trim()) {
      setAlertModal({ isOpen: true, title: 'Name Required', message: 'Please enter a name for your playlist before saving.'});
      return;
    }
    if (playlistItems.length === 0) {
      setAlertModal({ isOpen: true, title: 'Empty Playlist', message: 'You cannot save an empty playlist. Please add some media files first.'});
      return;
    }

    const newPlaylist = {
      id: 'pl_' + Date.now(),
      name: playlistName.trim(),
      items: playlistItems
    };
    
    apiFetch('/api/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newPlaylist)
    }).then(() => {
      setSavedPlaylists([...savedPlaylists, newPlaylist]);
      setAlertModal({ isOpen: true, title: 'Playlist Saved', message: `Playlist "${newPlaylist.name}" has been saved as a folder.`});
      
      // Reset builder
      setPlaylistItems([]);
      setPlaylistName('');
      setShowPlaylistBuilder(false);
    }).catch(err => {
      setAlertModal({ isOpen: true, title: 'Error', message: err.message });
    });
  };

  const handleDeleteSavedPlaylist = (id, e) => {
    e.stopPropagation();
    setConfirmModal({
      isOpen: true,
      title: 'Delete Playlist',
      message: 'Are you sure you want to delete this playlist?',
      action: () => {
        apiFetch(`/api/playlists/${id}`, { method: 'DELETE' }).then(() => {
          setSavedPlaylists(savedPlaylists.filter(pl => pl.id !== id));
          if (activeFolder === id) setActiveFolder('all');
          setConfirmModal({ isOpen: false });
        }).catch(console.error);
      }
    });
  };

  // Determine what files to show based on active selection (Folder or Playlist)
  let filteredFiles = [];
  if (activeFolder.startsWith('pl_')) {
    const activePl = savedPlaylists.find(p => p.id === activeFolder);
    filteredFiles = activePl ? activePl.items : [];
  } else {
    filteredFiles = activeFolder === 'all' ? files : files.filter(f => f.folderId === activeFolder);
  }

  return (
    <div className="h-full flex flex-col relative">
      <input type="file" multiple ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="video/*,audio/*,image/*" />

      {/* Header Actions */}
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Media & File Manager</h1>
          <p className="text-slate-400 text-sm mt-1">Manage your video loops, music, and stream assets.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={handleCreateFolder} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium flex items-center gap-2 border border-slate-700">
            <Plus size={16} /> New Folder
          </button>
          <button onClick={handleUploadClick} className="bg-purple-600 hover:bg-purple-700 shadow-lg shadow-purple-600/20 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium flex items-center gap-2">
            <Upload size={16} /> Upload Media
          </button>
        </div>
      </div>

      <div className="flex gap-6 flex-1 min-h-0">
        {/* Left Sidebar */}
        <div className="w-64 shrink-0 flex flex-col gap-4">
          <div className="glass-panel p-4 rounded-2xl flex-1 overflow-y-auto">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 px-2">Directories</h2>
            <ul className="space-y-1 mb-6">
              {folders.map(folder => {
                const isActive = activeFolder === folder.id;
                return (
                  <li key={folder.id} onClick={() => setActiveFolder(folder.id)} className={`p-3 rounded-xl cursor-pointer transition-all duration-200 flex items-center justify-between group ${isActive ? 'bg-purple-500/20 text-purple-400 font-medium' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
                    <div className="flex items-center gap-3 truncate">
                      <Folder size={18} className={isActive ? 'text-purple-400' : 'text-slate-500'} />
                      <span className="truncate">{folder.name}</span>
                    </div>
                    {folder.id !== 'all' && (
                      <button onClick={(e) => handleDeleteFolder(folder.id, e)} className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-opacity" title="Delete Folder">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>

            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 px-2">Saved Playlists</h2>
            {savedPlaylists.length === 0 ? (
              <p className="text-xs text-slate-600 px-2 italic">No playlists saved.</p>
            ) : (
              <ul className="space-y-1">
                {savedPlaylists.map(playlist => {
                  const isActive = activeFolder === playlist.id;
                  return (
                    <li key={playlist.id} onClick={() => setActiveFolder(playlist.id)} className={`p-3 rounded-xl cursor-pointer transition-all duration-200 flex items-center justify-between group ${isActive ? 'bg-purple-500/20 text-purple-400 font-medium' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
                      <div className="flex items-center gap-3 truncate">
                        <ListVideo size={18} className={isActive ? 'text-purple-400' : 'text-slate-500'} />
                        <span className="truncate">{playlist.name}</span>
                      </div>
                      <button onClick={(e) => handleDeleteSavedPlaylist(playlist.id, e)} className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-opacity" title="Delete Playlist">
                        <Trash2 size={14} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          
          <button onClick={() => setShowPlaylistBuilder(!showPlaylistBuilder)} className="glass-panel p-4 rounded-2xl flex items-center justify-between hover:bg-slate-800/80 transition-colors group cursor-pointer border-purple-500/30 shadow-[0_0_20px_rgba(168,85,247,0.1)]">
            <div className="flex items-center gap-3 text-purple-300 font-medium">
              <div className="bg-purple-500/20 p-2 rounded-lg group-hover:bg-purple-500/40 transition-colors relative">
                <PlusCircle size={18} />
                {playlistItems.length > 0 && <span className="absolute -top-1 -right-1 bg-purple-600 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">{playlistItems.length}</span>}
              </div>
              Create Playlist
            </div>
          </button>
        </div>

        {/* Right Content Grid */}
        <div className="flex-1 glass-panel rounded-2xl flex flex-col overflow-hidden relative">
          <div className="bg-slate-900/50 p-4 border-b border-slate-700/50 flex items-center justify-between shrink-0 h-16">
            <div className="flex items-center gap-4">
              <button onClick={handleSelectAll} className="flex items-center gap-2 text-sm text-slate-300 hover:text-white transition-colors disabled:opacity-50" disabled={filteredFiles.length === 0}>
                {selectedFiles.length > 0 && selectedFiles.length === filteredFiles.length ? <CheckSquare size={18} className="text-purple-400" /> : <Square size={18} />} Select All
              </button>
              {selectedFiles.length > 0 && <span className="text-xs font-medium text-purple-400 bg-purple-400/10 px-2 py-1 rounded-md">{selectedFiles.length} selected</span>}
            </div>
            
            {selectedFiles.length > 0 && (
              <div className="flex items-center gap-3 animate-in fade-in slide-in-from-right-4 duration-200">
                <button onClick={handleAddSelectedToPlaylist} className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg transition-colors text-sm font-medium flex items-center gap-2 border border-slate-700">
                  <ListVideo size={14} /> Add to Playlist Builder
                </button>
                {/* Hanya tampilkan delete file jika bukan berada di dalam mode view playlist */}
                {!activeFolder.startsWith('pl_') && (
                  <button onClick={handleDeleteSelectedFiles} className="bg-red-950/40 hover:bg-red-900/60 text-red-400 px-3 py-1.5 rounded-lg transition-colors text-sm font-medium flex items-center gap-2 border border-red-900/50">
                    <Trash2 size={14} /> Delete
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 p-6 overflow-y-auto">
            {filteredFiles.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500">
                {activeFolder.startsWith('pl_') ? (
                  <>
                    <ListVideo size={48} className="mb-4 opacity-50" />
                    <p>This playlist is empty.</p>
                  </>
                ) : (
                  <>
                    <Folder size={48} className="mb-4 opacity-50" />
                    <p>No files in this folder.</p>
                    <p className="text-sm">Click "Upload Media" to add some files.</p>
                  </>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredFiles.map((file, idx) => {
                  const isSelected = selectedFiles.includes(file.id);
                  // Pada mode view playlist, ID bisa saja sama, jadi kita gabung dengan index
                  const uniqueKey = activeFolder.startsWith('pl_') ? `${file.id}_${idx}` : file.id;
                  
                  return (
                    <div key={uniqueKey} onClick={() => handleSelectFile(file.id)} className={`group relative bg-slate-800/50 border rounded-xl overflow-hidden cursor-pointer transition-all duration-200 ${isSelected ? 'border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.15)] bg-slate-800' : 'border-slate-700/50 hover:border-slate-600'}`}>
                      <div className="absolute top-3 left-3 z-10">
                        {isSelected ? <CheckSquare size={20} className="text-purple-400 drop-shadow-md" /> : <Square size={20} className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-md" />}
                      </div>

                      {/* Quick Add To Playlist Button */}
                      {!activeFolder.startsWith('pl_') && (
                        <div 
                          onClick={(e) => handleAddSingleToPlaylist(file, e)}
                          className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-md bg-slate-900/80 p-1.5 rounded hover:bg-purple-600 hover:text-white text-slate-300"
                          title="Add to Playlist Builder"
                        >
                          <Plus size={16} />
                        </div>
                      )}

                      <div className="aspect-video bg-slate-900 flex items-center justify-center relative overflow-hidden">
                        {file.type === 'video' && <Film size={32} className="text-slate-600" />}
                        {file.type === 'audio' && <Music size={32} className="text-blue-900/50" />}
                        {file.type === 'image' && (
                           file.url ? <img src={`http://localhost:3001${file.url}`} alt={file.name} className="object-cover w-full h-full opacity-60" /> : <ImageIcon size={32} className="text-slate-600" />
                        )}
                        {file.type === 'unknown' && <Folder size={32} className="text-slate-700" />}
                        {(file.type === 'video' || file.type === 'audio') && (
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Play size={36} className="text-white fill-white/20" />
                          </div>
                        )}
                      </div>
                      <div className="p-3 border-t border-slate-700/50">
                        <p className="text-sm font-medium text-slate-200 truncate" title={file.name}>{file.name}</p>
                        <p className="text-xs text-slate-500 mt-1">{file.size} • {file.type.toUpperCase()}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating Upload Queue Modal */}
      {uploadQueue.length > 0 && (
        <div className="absolute bottom-6 right-6 w-80 glass-panel rounded-xl shadow-2xl border border-slate-700/50 overflow-hidden flex flex-col z-30 animate-in slide-in-from-bottom-8">
          <div className="bg-slate-800 p-3 border-b border-slate-700/50 flex justify-between items-center">
            <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Loader2 size={16} className={isUploading ? "animate-spin text-purple-400" : "text-slate-400"} />
              Upload Progress ({uploadQueue.filter(q => q.status === 'done').length}/{uploadQueue.length})
            </h4>
            <button onClick={clearCompletedQueue} className="text-slate-400 hover:text-white" title="Clear Completed"><X size={16}/></button>
          </div>
          <div className="max-h-64 overflow-y-auto p-2 bg-slate-900/50">
            {uploadQueue.map(q => (
              <div key={q.id} className="p-2 border-b last:border-b-0 border-slate-800 flex flex-col gap-1">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium text-slate-300 truncate w-48" title={q.name}>{q.name}</span>
                  {q.status === 'pending' && <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded">Pending</span>}
                  {q.status === 'uploading' && <span className="text-[10px] text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded">{q.progress}%</span>}
                  {q.status === 'done' && <CheckCircle2 size={14} className="text-green-500" />}
                  {q.status === 'error' && <AlertCircle size={14} className="text-red-500" />}
                </div>
                {q.status === 'uploading' && (
                  <div className="w-full bg-slate-800 rounded-full h-1 mt-1 overflow-hidden">
                    <div className="bg-gradient-to-r from-purple-500 to-pink-500 h-1 transition-all duration-300" style={{ width: `${q.progress}%` }}></div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Playlist Builder Drawer */}
      {showPlaylistBuilder && (
        <div className="absolute top-0 right-0 bottom-0 w-[400px] glass-panel border-l border-slate-700/50 shadow-2xl flex flex-col z-20 animate-in slide-in-from-right-8 duration-300">
          <div className="p-5 border-b border-slate-700/50 flex justify-between items-center bg-slate-900/50">
            <h3 className="font-bold text-lg text-slate-100 flex items-center gap-2">
              <ListVideo className="text-purple-400" size={20} /> Playlist Builder
            </h3>
            <button onClick={() => setShowPlaylistBuilder(false)} className="text-slate-400 hover:text-white">✕</button>
          </div>
          <div className="p-4 border-b border-slate-700/50 flex flex-col gap-3 bg-slate-800/30">
            <label className="text-xs text-slate-400 font-medium uppercase tracking-wider">Playlist Name *</label>
            <div className="flex gap-2">
              <input 
                type="text" 
                value={playlistName}
                onChange={e => setPlaylistName(e.target.value)}
                placeholder="e.g. My 24/7 Gaming Loop" 
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500 w-full"
              />
              <button onClick={handleShufflePlaylist} className="text-slate-400 hover:text-purple-400 transition-colors p-2 rounded-lg bg-slate-900 border border-slate-700 hover:border-purple-500" title="Shuffle Mode">
                <Shuffle size={16} />
              </button>
            </div>
          </div>
          <div className="flex-1 p-4 overflow-y-auto space-y-2">
            {playlistItems.length === 0 ? (
              <div className="text-center text-slate-500 mt-10 text-sm">
                <p>Your builder is empty.</p>
                <p className="mt-2 text-xs">Hover over any media file and click the <strong className="text-slate-300">+</strong> icon to add it here.</p>
              </div>
            ) : (
              playlistItems.map((item, idx) => (
                <div key={idx} className="bg-slate-800 p-3 rounded-lg border border-slate-700 flex items-center gap-3">
                  <div className="w-8 h-8 bg-slate-900 rounded flex items-center justify-center shrink-0">
                    {item.type === 'video' && <Film size={14} className="text-slate-500" />}
                    {item.type === 'audio' && <Music size={14} className="text-slate-500" />}
                    {item.type === 'image' && <ImageIcon size={14} className="text-slate-500" />}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <p className="text-sm text-slate-200 truncate">{item.name}</p>
                    <p className="text-xs text-slate-500">{item.size}</p>
                  </div>
                  <button onClick={() => handleRemoveFromPlaylist(idx)} className="text-slate-500 hover:text-red-400 p-2"><Trash2 size={16} /></button>
                </div>
              ))
            )}
          </div>
          <div className="p-4 border-t border-slate-700/50 bg-slate-900/50 flex justify-between gap-3">
            <button onClick={() => setPlaylistItems([])} className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-2 px-4 rounded-lg transition-colors text-sm">Clear</button>
            <button onClick={handleSavePlaylist} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 rounded-lg transition-colors text-sm shadow-lg shadow-purple-600/20">
              Save Playlist
            </button>
          </div>
        </div>
      )}

      {/* Global Modals */}
      <AlertModal 
        isOpen={alertModal.isOpen} 
        title={alertModal.title} 
        message={alertModal.message} 
        onClose={() => setAlertModal({ ...alertModal, isOpen: false })} 
      />
      <ConfirmModal 
        isOpen={confirmModal.isOpen} 
        title={confirmModal.title} 
        message={confirmModal.message} 
        onConfirm={confirmModal.action} 
        onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })} 
      />
      <PromptModal 
        isOpen={promptModal.isOpen} 
        title="Create New Folder" 
        placeholder="e.g. My Videos" 
        onConfirm={confirmCreateFolder} 
        onCancel={() => setPromptModal({ isOpen: false })} 
      />
    </div>
  );
}
