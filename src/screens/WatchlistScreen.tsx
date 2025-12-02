import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Bookmark, Trash2, CalendarPlus, Plus, X, Upload } from 'lucide-react';
import { useWatchlist, type WatchlistItem } from '../hooks/useWatchlist';
import { useIMDBImport, detectImportType } from '../hooks/useIMDBImport';
import { useLetterboxdImport } from '../hooks/useLetterboxdImport';

export default function WatchlistScreen() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { items, loading, removeFromWatchlist, refreshWatchlist } = useWatchlist();
  const { importFromIMDB, importFromCSV, isImporting: isIMDBImporting, progress: imdbProgress, error: imdbError, importedCount: imdbImportedCount } = useIMDBImport();
  // Letterboxd import not used on watchlist screen but keeping hook for potential future use
  const { isImporting: isLetterboxdImporting, progress: letterboxdProgress, error: letterboxdError, importedCount: letterboxdImportedCount } = useLetterboxdImport();
  
  const [showImportModal, setShowImportModal] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importSuccess, setImportSuccess] = useState<number | null>(null);
  const [selectedMovie, setSelectedMovie] = useState<WatchlistItem | null>(null);
  const [showActionModal, setShowActionModal] = useState(false);
  const [importMode, setImportMode] = useState<'url' | 'csv'>('csv'); // Default to CSV since it's more reliable

  const isImporting = isIMDBImporting || isLetterboxdImporting;
  const progress = isIMDBImporting ? imdbProgress : letterboxdProgress;
  const importError = isIMDBImporting ? imdbError : letterboxdError;
  const importedCount = isIMDBImporting ? imdbImportedCount : letterboxdImportedCount;

  const handleImport = async () => {
    if (!importUrl.trim()) return;
    
    const importType = detectImportType(importUrl);
    
    if (importType === 'unknown') {
      return;
    }

    let count = 0;
    
    if (importType === 'imdb-watchlist') {
      count = await importFromIMDB(importUrl, 'imdb-watchlist');
    } else if (importType === 'letterboxd') {
      // Letterboxd doesn't have a separate watchlist, but we could support it in the future
      // For now, show an error
      return;
    }

    if (count > 0) {
      setImportSuccess(count);
      await refreshWatchlist();
      setTimeout(() => {
        setShowImportModal(false);
        setImportUrl('');
        setImportSuccess(null);
        setImportMode('csv');
      }, 2000);
    }
  };

  const handleCSVUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const csvContent = e.target?.result as string;
      if (csvContent) {
        const count = await importFromCSV(csvContent, 'imdb-watchlist');
        if (count > 0) {
          setImportSuccess(count);
          await refreshWatchlist();
          setTimeout(() => {
            setShowImportModal(false);
            setImportSuccess(null);
            setImportMode('csv');
          }, 2000);
        }
      }
    };
    reader.readAsText(file);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemove = async (item: WatchlistItem) => {
    await removeFromWatchlist(item.id);
    setShowActionModal(false);
    setSelectedMovie(null);
  };

  const handleMarkAsWatched = (item: WatchlistItem) => {
    // Navigate to calendar with the movie pre-selected
    // We'll pass the movie data via state
    navigate('/app', { 
      state: { 
        addMovie: {
          id: item.movieId,
          title: item.title,
          year: item.year,
          poster: item.poster,
          backdrop: item.backdrop,
          runtime: item.runtime,
        }
      }
    });
  };

  const getImportTypeLabel = () => {
    const type = detectImportType(importUrl);
    switch (type) {
      case 'imdb-watchlist':
        return 'IMDB Watchlist detected';
      case 'imdb-ratings':
        return 'IMDB Ratings detected (use Watched screen for this)';
      case 'letterboxd':
        return 'Letterboxd detected (use Watched screen for diary)';
      default:
        return '';
    }
  };

  const isValidImportUrl = () => {
    const type = detectImportType(importUrl);
    return type === 'imdb-watchlist';
  };

  return (
    <div className="min-h-screen bg-[#09090b] font-sans text-gray-100 flex flex-col max-w-md mx-auto shadow-2xl overflow-hidden border-x border-gray-800">
      {/* Header */}
      <div className="bg-[#09090b]/90 backdrop-blur-md px-4 py-4 flex items-center justify-between sticky top-0 z-10 border-b border-gray-800">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/app')}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-full transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">Watchlist</h1>
            <p className="text-xs text-gray-500">Movies you want to watch</p>
          </div>
        </div>
        <button
          onClick={() => setShowImportModal(true)}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          <span className="hidden sm:inline">Import</span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-gray-500 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 rounded-full bg-gray-900 flex items-center justify-center mb-4">
              <Bookmark className="w-10 h-10 text-gray-600" />
            </div>
            <h3 className="text-lg font-medium text-gray-300 mb-2">
              Your watchlist is empty
            </h3>
            <p className="text-sm text-gray-500 max-w-xs mb-6">
              Import your IMDB watchlist or add movies you want to watch.
            </p>
            <button
              onClick={() => setShowImportModal(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-colors"
            >
              Import from IMDB
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {items.map((item) => (
              <div
                key={item.id}
                onClick={() => {
                  setSelectedMovie(item);
                  setShowActionModal(true);
                }}
                className="relative rounded-xl overflow-hidden bg-gray-900 border border-gray-800 group cursor-pointer"
              >
                <img
                  src={item.poster}
                  alt={item.title}
                  className="w-full aspect-[2/3] object-cover"
                />
                
                {/* Bookmark Badge */}
                <div className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center shadow-lg bg-blue-500 text-white">
                  <Bookmark size={14} className="fill-current" />
                </div>

                {/* Hover Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                  <h4 className="text-xs font-bold text-white leading-tight truncate">
                    {item.title}
                  </h4>
                  <p className="text-[10px] text-gray-400">{item.year}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action Modal */}
      {showActionModal && selectedMovie && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/70 backdrop-blur-sm" 
            onClick={() => {
              setShowActionModal(false);
              setSelectedMovie(null);
            }} 
          />
          
          <div className="bg-[#18181b] w-full max-w-sm rounded-2xl p-6 shadow-2xl z-50 relative border border-gray-800">
            <div className="flex gap-4 mb-6">
              <img
                src={selectedMovie.poster}
                alt={selectedMovie.title}
                className="w-20 h-28 object-cover rounded-xl border border-gray-800"
              />
              <div className="flex-1">
                <h3 className="font-bold text-white text-lg">{selectedMovie.title}</h3>
                <p className="text-sm text-gray-400">{selectedMovie.year}</p>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => handleMarkAsWatched(selectedMovie)}
                className="w-full py-3 rounded-xl font-medium bg-green-600 hover:bg-green-500 text-white flex items-center justify-center gap-2 transition-colors"
              >
                <CalendarPlus size={18} />
                Mark as Watched
              </button>
              
              <button
                onClick={() => handleRemove(selectedMovie)}
                className="w-full py-3 rounded-xl font-medium bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-800/50 flex items-center justify-center gap-2 transition-colors"
              >
                <Trash2 size={18} />
                Remove from Watchlist
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/70 backdrop-blur-sm" 
            onClick={() => !isImporting && setShowImportModal(false)} 
          />
          
          <div className="bg-[#18181b] w-full max-w-sm rounded-2xl p-6 shadow-2xl z-50 relative border border-gray-800">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <Bookmark className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="font-bold text-white">Import Watchlist</h3>
                  <p className="text-xs text-gray-500">Add movies to watch later</p>
                </div>
              </div>
              {!isImporting && (
                <button
                  onClick={() => setShowImportModal(false)}
                  className="p-2 text-gray-500 hover:text-white hover:bg-gray-800 rounded-full transition-colors"
                >
                  <X size={18} />
                </button>
              )}
            </div>

            {importSuccess !== null ? (
              <div className="text-center py-6">
                <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h4 className="text-lg font-bold text-white mb-1">Import Complete!</h4>
                <p className="text-gray-400">{importSuccess} movies added to watchlist</p>
              </div>
            ) : isImporting ? (
              <div className="text-center py-6">
                <Loader2 className="w-10 h-10 text-blue-500 animate-spin mx-auto mb-4" />
                <h4 className="text-lg font-bold text-white mb-1">Importing...</h4>
                <p className="text-gray-400">
                  {progress.current} of {progress.total} movies
                </p>
                {importedCount > 0 && (
                  <p className="text-sm text-green-400 mt-2">{importedCount} added to watchlist</p>
                )}
              </div>
            ) : (
              <>
                {/* Import Mode Tabs */}
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setImportMode('csv')}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                      importMode === 'csv'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-900 text-gray-400 hover:text-white border border-gray-800'
                    }`}
                  >
                    Upload CSV
                  </button>
                  <button
                    onClick={() => setImportMode('url')}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                      importMode === 'url'
                        ? 'bg-white text-black'
                        : 'bg-gray-900 text-gray-400 hover:text-white border border-gray-800'
                    }`}
                  >
                    Paste URL
                  </button>
                </div>

                {importMode === 'csv' ? (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-gray-900 border border-gray-800 border-dashed">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv"
                        onChange={handleCSVUpload}
                        className="hidden"
                        id="watchlist-csv-upload"
                      />
                      <label
                        htmlFor="watchlist-csv-upload"
                        className="flex flex-col items-center justify-center cursor-pointer py-6"
                      >
                        <Upload className="w-10 h-10 text-blue-400 mb-3" />
                        <p className="text-sm font-medium text-white mb-1">Upload IMDB Watchlist CSV</p>
                        <p className="text-xs text-gray-500">Click to select your watchlist.csv file</p>
                      </label>
                    </div>

                    {importError && (
                      <div className="p-3 rounded-xl bg-red-900/30 border border-red-800/50">
                        <p className="text-sm text-red-400">{importError}</p>
                      </div>
                    )}

                    <div className="p-3 rounded-xl bg-gray-900 border border-gray-800">
                      <p className="text-xs font-medium text-gray-300 mb-2">How to export from IMDB:</p>
                      <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside">
                        <li>Go to your IMDB Watchlist page</li>
                        <li>Click the three dots menu (⋮) or "Export"</li>
                        <li>Download the CSV file</li>
                        <li>Upload it here</li>
                      </ol>
                      <p className="text-xs text-green-400 mt-2">
                        ✓ This method imports ALL your movies
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">
                        IMDB Watchlist URL
                      </label>
                      <input
                        type="text"
                        value={importUrl}
                        onChange={(e) => setImportUrl(e.target.value)}
                        placeholder="https://www.imdb.com/user/ur.../watchlist/"
                        className="w-full bg-gray-900 rounded-xl py-3 px-4 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all border border-gray-800"
                        autoFocus
                      />
                      {importUrl && (
                        <p className={`text-xs mt-2 ${isValidImportUrl() ? 'text-green-400' : 'text-yellow-400'}`}>
                          {getImportTypeLabel()}
                        </p>
                      )}
                    </div>

                    <div className="p-3 rounded-xl bg-yellow-900/20 border border-yellow-800/50">
                      <p className="text-xs text-yellow-400">
                        ⚠️ URL import only gets ~25 movies due to IMDB limitations. Use CSV upload for your full list.
                      </p>
                    </div>

                    {importError && (
                      <div className="p-3 rounded-xl bg-red-900/30 border border-red-800/50">
                        <p className="text-sm text-red-400">{importError}</p>
                      </div>
                    )}

                    <button
                      onClick={handleImport}
                      disabled={!isValidImportUrl()}
                      className="w-full py-4 rounded-xl font-bold text-lg bg-blue-600 hover:bg-blue-500 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Import Watchlist
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

