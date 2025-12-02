import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ThumbsUp, ThumbsDown, Loader2, Film, Plus, X, Upload } from 'lucide-react';
import { useRecommendation, type WatchedRecommendation } from '../hooks/useRecommendation';
import { useLetterboxdImport } from '../hooks/useLetterboxdImport';
import { useIMDBImport, detectImportType, type ImportType } from '../hooks/useIMDBImport';

export default function WatchedScreen() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { fetchRatedRecommendations } = useRecommendation();
  const { 
    importFromLetterboxd, 
    isImporting: isLetterboxdImporting, 
    progress: letterboxdProgress, 
    error: letterboxdError, 
    importedCount: letterboxdImportedCount 
  } = useLetterboxdImport();
  const { 
    importFromIMDB,
    importFromCSV,
    isImporting: isIMDBImporting, 
    progress: imdbProgress, 
    error: imdbError, 
    importedCount: imdbImportedCount 
  } = useIMDBImport();
  
  const [watchedMovies, setWatchedMovies] = useState<WatchedRecommendation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'liked' | 'disliked'>('all');
  const [showImportModal, setShowImportModal] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importSuccess, setImportSuccess] = useState<number | null>(null);
  const [detectedType, setDetectedType] = useState<ImportType>('unknown');
  const [importMode, setImportMode] = useState<'url' | 'csv'>('url');

  const isImporting = isLetterboxdImporting || isIMDBImporting;
  const progress = isLetterboxdImporting ? letterboxdProgress : imdbProgress;
  const importError = isLetterboxdImporting ? letterboxdError : imdbError;
  const importedCount = isLetterboxdImporting ? letterboxdImportedCount : imdbImportedCount;

  useEffect(() => {
    const loadWatched = async () => {
      setIsLoading(true);
      const movies = await fetchRatedRecommendations();
      setWatchedMovies(movies);
      setIsLoading(false);
    };
    loadWatched();
  }, [fetchRatedRecommendations]);

  // Detect import type when URL changes
  useEffect(() => {
    if (importUrl.trim()) {
      setDetectedType(detectImportType(importUrl));
    } else {
      setDetectedType('unknown');
    }
  }, [importUrl]);

  const filteredMovies = watchedMovies.filter((movie) => {
    if (filter === 'all') return true;
    if (filter === 'liked') return movie.rating === 'up';
    if (filter === 'disliked') return movie.rating === 'down';
    return true;
  });

  const likedCount = watchedMovies.filter((m) => m.rating === 'up').length;
  const dislikedCount = watchedMovies.filter((m) => m.rating === 'down').length;

  const handleImport = async () => {
    if (!importUrl.trim()) return;
    
    let count = 0;
    
    if (detectedType === 'letterboxd') {
      // Extract username from Letterboxd URL
      const match = importUrl.match(/letterboxd\.com\/([^\/]+)/i);
      const username = match ? match[1] : importUrl.trim();
      count = await importFromLetterboxd(username);
    } else if (detectedType === 'imdb-ratings') {
      count = await importFromIMDB(importUrl, 'imdb-ratings');
    } else if (detectedType === 'imdb-watchlist') {
      // Redirect to watchlist screen for this
      navigate('/watchlist');
      return;
    }

    if (count > 0) {
      setImportSuccess(count);
      // Reload the watched movies
      const movies = await fetchRatedRecommendations();
      setWatchedMovies(movies);
      // Close modal after a delay
      setTimeout(() => {
        setShowImportModal(false);
        setImportUrl('');
        setImportSuccess(null);
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
        const count = await importFromCSV(csvContent, 'imdb-ratings');
        if (count > 0) {
          setImportSuccess(count);
          const movies = await fetchRatedRecommendations();
          setWatchedMovies(movies);
          setTimeout(() => {
            setShowImportModal(false);
            setImportSuccess(null);
            setImportMode('url');
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

  const getImportTypeLabel = () => {
    switch (detectedType) {
      case 'letterboxd':
        return { text: 'Letterboxd Diary detected', color: 'text-[#ff8000]', valid: true };
      case 'imdb-ratings':
        return { text: 'IMDB Ratings detected', color: 'text-yellow-400', valid: true };
      case 'imdb-watchlist':
        return { text: 'IMDB Watchlist detected (go to Watchlist screen)', color: 'text-blue-400', valid: false };
      default:
        return { text: '', color: '', valid: false };
    }
  };

  const isValidImport = () => {
    return detectedType === 'letterboxd' || detectedType === 'imdb-ratings';
  };

  const getImportButtonColor = () => {
    if (detectedType === 'letterboxd') return 'bg-[#ff8000] hover:bg-[#e67300]';
    if (detectedType === 'imdb-ratings') return 'bg-yellow-500 hover:bg-yellow-400';
    return 'bg-gray-600';
  };

  const typeLabel = getImportTypeLabel();

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
            <h1 className="text-xl font-bold text-white">Watched</h1>
            <p className="text-xs text-gray-500">Your rated recommendations</p>
          </div>
        </div>
        <button
          onClick={() => setShowImportModal(true)}
          className="flex items-center gap-2 px-3 py-2 bg-[#ff8000] hover:bg-[#e67300] text-white rounded-xl text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          <span className="hidden sm:inline">Import</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="px-4 py-3 flex gap-2 border-b border-gray-800">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            filter === 'all'
              ? 'bg-white text-black'
              : 'bg-gray-900 text-gray-400 hover:text-white border border-gray-800'
          }`}
        >
          All ({watchedMovies.length})
        </button>
        <button
          onClick={() => setFilter('liked')}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5 ${
            filter === 'liked'
              ? 'bg-green-500 text-white'
              : 'bg-gray-900 text-gray-400 hover:text-white border border-gray-800'
          }`}
        >
          <ThumbsUp size={14} />
          {likedCount}
        </button>
        <button
          onClick={() => setFilter('disliked')}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5 ${
            filter === 'disliked'
              ? 'bg-red-500 text-white'
              : 'bg-gray-900 text-gray-400 hover:text-white border border-gray-800'
          }`}
        >
          <ThumbsDown size={14} />
          {dislikedCount}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-gray-500 animate-spin" />
          </div>
        ) : filteredMovies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 rounded-full bg-gray-900 flex items-center justify-center mb-4">
              <Film className="w-10 h-10 text-gray-600" />
            </div>
            <h3 className="text-lg font-medium text-gray-300 mb-2">
              {filter === 'all' ? 'No rated movies yet' : `No ${filter} movies`}
            </h3>
            <p className="text-sm text-gray-500 max-w-xs">
              {filter === 'all'
                ? 'Rate recommendations from the home screen and they\'ll appear here.'
                : `You haven't ${filter === 'liked' ? 'liked' : 'disliked'} any recommendations yet.`}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {filteredMovies.map((movie) => (
              <div
                key={movie.id}
                className="relative rounded-xl overflow-hidden bg-gray-900 border border-gray-800 group"
              >
                <img
                  src={movie.poster}
                  alt={movie.title}
                  className="w-full aspect-[2/3] object-cover"
                />
                
                {/* Rating Badge */}
                <div
                  className={`absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center shadow-lg ${
                    movie.rating === 'up'
                      ? 'bg-green-500 text-white'
                      : 'bg-red-500 text-white'
                  }`}
                >
                  {movie.rating === 'up' ? (
                    <ThumbsUp size={14} className="fill-current" />
                  ) : (
                    <ThumbsDown size={14} className="fill-current" />
                  )}
                </div>

                {/* Hover Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                  <h4 className="text-xs font-bold text-white leading-tight truncate">
                    {movie.title}
                  </h4>
                  <p className="text-[10px] text-gray-400">{movie.year}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Unified Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/70 backdrop-blur-sm" 
            onClick={() => !isImporting && setShowImportModal(false)} 
          />
          
          <div className="bg-[#18181b] w-full max-w-sm rounded-2xl p-6 shadow-2xl z-50 relative border border-gray-800">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#ff8000] to-yellow-500 flex items-center justify-center">
                  <Film className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-white">Import Watched Movies</h3>
                  <p className="text-xs text-gray-500">Letterboxd or IMDB Ratings</p>
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
                <p className="text-gray-400">{importSuccess} movies imported</p>
              </div>
            ) : isImporting ? (
              <div className="text-center py-6">
                <Loader2 className={`w-10 h-10 animate-spin mx-auto mb-4 ${importMode === 'csv' ? 'text-yellow-400' : detectedType === 'letterboxd' ? 'text-[#ff8000]' : 'text-yellow-400'}`} />
                <h4 className="text-lg font-bold text-white mb-1">Importing...</h4>
                <p className="text-gray-400">
                  {progress.current} of {progress.total} films
                </p>
                {importedCount > 0 && (
                  <p className="text-sm text-green-400 mt-2">{importedCount} new movies added</p>
                )}
              </div>
            ) : (
              <>
                {/* Import Mode Tabs */}
                <div className="flex gap-2 mb-4">
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
                  <button
                    onClick={() => setImportMode('csv')}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                      importMode === 'csv'
                        ? 'bg-yellow-500 text-black'
                        : 'bg-gray-900 text-gray-400 hover:text-white border border-gray-800'
                    }`}
                  >
                    Upload CSV
                  </button>
                </div>

                {importMode === 'url' ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">
                        Paste your URL
                      </label>
                      <input
                        type="text"
                        value={importUrl}
                        onChange={(e) => setImportUrl(e.target.value)}
                        placeholder="letterboxd.com/username or imdb.com/user/.../ratings"
                        className="w-full bg-gray-900 rounded-xl py-3 px-4 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-[#ff8000] transition-all border border-gray-800"
                        autoFocus
                      />
                      {typeLabel.text && (
                        <p className={`text-xs mt-2 ${typeLabel.color}`}>
                          ✓ {typeLabel.text}
                        </p>
                      )}
                    </div>

                    {importError && (
                      <div className="p-3 rounded-xl bg-red-900/30 border border-red-800/50">
                        <p className="text-sm text-red-400">{importError}</p>
                      </div>
                    )}

                    {/* Supported formats */}
                    <div className="p-3 rounded-xl bg-gray-900 border border-gray-800">
                      <p className="text-xs font-medium text-gray-300 mb-2">Supported formats:</p>
                      <ul className="text-xs text-gray-500 space-y-1">
                        <li className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-[#ff8000]"></span>
                          letterboxd.com/<span className="text-[#ff8000]">username</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                          imdb.com/user/ur.../ratings/
                        </li>
                      </ul>
                    </div>

                    <button
                      onClick={handleImport}
                      disabled={!isValidImport()}
                      className={`w-full py-4 rounded-xl font-bold text-lg text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed ${getImportButtonColor()}`}
                    >
                      Import Films
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-gray-900 border border-gray-800 border-dashed">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv"
                        onChange={handleCSVUpload}
                        className="hidden"
                        id="csv-upload"
                      />
                      <label
                        htmlFor="csv-upload"
                        className="flex flex-col items-center justify-center cursor-pointer py-6"
                      >
                        <Upload className="w-10 h-10 text-yellow-400 mb-3" />
                        <p className="text-sm font-medium text-white mb-1">Upload IMDB CSV</p>
                        <p className="text-xs text-gray-500">Click to select your ratings.csv file</p>
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
                        <li>Go to your IMDB Ratings page</li>
                        <li>Click the three dots menu (⋮)</li>
                        <li>Select "Export"</li>
                        <li>Upload the downloaded CSV here</li>
                      </ol>
                    </div>
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
