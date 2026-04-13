import React, { useState, useEffect } from 'react';
import { Key, ExternalLink, Cloud, X } from 'lucide-react';

interface ApiKeyModalProps {
  onConnect: () => void;
  onClose?: () => void; // Optional close if invoked manually
  isOverlay?: boolean;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ onConnect, onClose, isOverlay }) => {
  const [activeTab, setActiveTab] = useState<'cloud' | 'manual'>('cloud');
  const [manualKey, setManualKey] = useState('');

  useEffect(() => {
      // Check if there is already a manual key saved to populate field
      const saved = localStorage.getItem('gemini_custom_api_key');
      if (saved) setManualKey(saved);
  }, []);

  const handleCloudConnect = async () => {
      // Clear manual key to ensure we rely on the cloud project key
      localStorage.removeItem('gemini_custom_api_key');
      if (window.aistudio) {
          try {
              await window.aistudio.openSelectKey();
              onConnect();
          } catch (e) {
              console.error(e);
          }
      } else {
          alert("AI Studio helper not found.");
      }
  };

  const handleManualSave = () => {
      if (!manualKey.trim()) return;
      localStorage.setItem('gemini_custom_api_key', manualKey.trim());
      onConnect();
  };

  const handleManualClear = () => {
      localStorage.removeItem('gemini_custom_api_key');
      setManualKey('');
  };

  return (
    <div className={`fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 ${isOverlay ? 'animate-in fade-in zoom-in-95 duration-200' : ''}`}>
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-0 max-w-md w-full shadow-2xl relative overflow-hidden flex flex-col">
        
        {/* Close button if overlay */}
        {onClose && (
            <button onClick={onClose} className="absolute top-4 right-4 z-20 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
            </button>
        )}

        {/* Background decoration */}
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 -mb-8 -ml-8 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 p-8 pb-4">
            <div className="flex items-center justify-center w-16 h-16 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 rounded-2xl mb-6 mx-auto border border-indigo-500/20 shadow-inner">
                <Key className="w-8 h-8 text-indigo-400" />
            </div>
            
            <h2 className="text-2xl font-bold text-center text-white mb-2">Connect to Gemini</h2>
            <p className="text-slate-400 text-center mb-6 text-sm">
                Choose how you want to authenticate requests.
            </p>

            {/* Tabs */}
            <div className="flex bg-slate-900/50 p-1 rounded-lg mb-6 border border-slate-700/50">
                <button 
                    onClick={() => setActiveTab('cloud')}
                    className={`flex-1 py-2 text-sm font-bold rounded-md flex items-center justify-center gap-2 transition-all ${activeTab === 'cloud' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                >
                    <Cloud className="w-4 h-4" /> Google Cloud
                </button>
                <button 
                    onClick={() => setActiveTab('manual')}
                    className={`flex-1 py-2 text-sm font-bold rounded-md flex items-center justify-center gap-2 transition-all ${activeTab === 'manual' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                >
                    <Key className="w-4 h-4" /> API Key
                </button>
            </div>

            {/* Content */}
            {activeTab === 'cloud' ? (
                <div className="space-y-4">
                    <p className="text-sm text-slate-300 text-center leading-relaxed">
                        Connect a Google Cloud Project with billing enabled. Recommended for security.
                    </p>
                    <button
                        onClick={handleCloudConnect}
                        className="w-full py-3 px-6 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-900/20 transform hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center gap-2"
                    >
                        <Cloud className="w-5 h-5" />
                        Select Project
                    </button>
                </div>
            ) : (
                <div className="space-y-4">
                    <p className="text-sm text-slate-300 text-center leading-relaxed">
                        Paste your API key directly. This key is stored locally in your browser.
                    </p>
                    <div className="relative">
                        <input 
                            type="password" 
                            placeholder="AIzaSy..."
                            value={manualKey}
                            onChange={(e) => setManualKey(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-xl text-white placeholder-slate-600 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none font-mono text-sm"
                        />
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleManualSave}
                            disabled={!manualKey.trim()}
                            className="flex-1 py-3 px-6 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
                        >
                            <Key className="w-4 h-4" />
                            Save Key
                        </button>
                        {localStorage.getItem('gemini_custom_api_key') && (
                            <button
                                onClick={handleManualClear}
                                className="px-4 py-3 bg-slate-700 hover:bg-red-600 text-white font-bold rounded-xl transition-colors"
                                title="Clear stored key"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>

        <div className="bg-slate-900/50 p-4 border-t border-slate-700/50 text-center">
            <a 
                href="https://ai.google.dev/gemini-api/docs/billing" 
                target="_blank" 
                rel="noreferrer" 
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-400 transition-colors"
            >
                Learn more about API keys & billing <ExternalLink className="w-3 h-3" />
            </a>
        </div>
      </div>
    </div>
  );
};
