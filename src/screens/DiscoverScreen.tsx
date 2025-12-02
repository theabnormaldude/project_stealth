import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, X, ArrowLeft, Loader2 } from 'lucide-react';
import { useMovieSearch, type SearchResult } from '../hooks/useMovieSearch';
import SearchResultCard from '../components/SearchResultCard';
import PatternAssistant from '../components/PatternAssistant';
import { useExploration } from '../contexts/ExplorationContext';

export default function DiscoverScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preSelectedDate = searchParams.get('date');
  
  const [query, setQuery] = useState('');
  const { results, isSearching, error, searchMovies, clearResults } = useMovieSearch();
  const { 
    clickedMovies, 
    addMovie, 
    resetSession, 
    patternInsight,
    isAnalyzing,
    showMoreMovies,
    showMoreResults,
    isLoadingMore,
    saveVibe,
    isSavingVibe,
    vibeSaved,
  } = useExploration();

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim()) {
        searchMovies(query);
      } else {
        clearResults();
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]); // searchMovies and clearResults are now stable refs

  const handleMovieClick = useCallback((movie: SearchResult) => {
    // Track the click for pattern detection
    addMovie({
      id: movie.id,
      title: movie.title,
      year: movie.year,
      posterPath: movie.posterPath,
      backdropPath: movie.backdropPath,
      genres: movie.genres,
      mediaType: movie.mediaType,
    });
    
    // Navigate to movie detail with pre-selected date if any
    const params = new URLSearchParams();
    if (preSelectedDate) params.set('date', preSelectedDate);
    params.set('type', movie.mediaType);
    
    navigate(`/movie/${movie.id}?${params.toString()}`);
  }, [addMovie, navigate, preSelectedDate]);

  const handleClearSearch = () => {
    setQuery('');
    clearResults();
    resetSession();
  };

  const handleBack = () => {
    navigate(-1);
  };

  const handleShowMore = async () => {
    const movies = await showMoreMovies();
    if (movies && movies.length > 0) {
      // Could navigate to a dedicated pattern results view
      // For now, we'll show them in the current results
    }
  };

  const handleSaveVibe = async () => {
    await saveVibe();
  };

  const showPatternAssistant = clickedMovies.length >= 3 && patternInsight;

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-black/95 backdrop-blur-sm border-b border-gray-800">
        {/* Pattern Assistant - shows above search when triggered */}
        {showPatternAssistant && (
          <PatternAssistant
            insight={patternInsight}
            isAnalyzing={isAnalyzing}
            onShowMore={handleShowMore}
            onSaveVibe={handleSaveVibe}
            isLoadingMore={isLoadingMore}
            isSavingVibe={isSavingVibe}
            vibeSaved={vibeSaved}
            movieCount={clickedMovies.length}
            showMoreResults={showMoreResults}
            onMovieClick={(movie) => navigate(`/movie/${movie.id}?type=movie`)}
          />
        )}
        
        {/* Search Bar */}
        <div className="flex items-center gap-3 p-4">
          <button
            onClick={handleBack}
            className="p-2 -ml-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search movies & shows..."
              autoFocus
              className="w-full pl-10 pr-10 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
            {query && (
              <button
                onClick={handleClearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>
        
        {/* Pre-selected date indicator */}
        {preSelectedDate && (
          <div className="px-4 pb-3">
            <div className="text-xs text-blue-400 bg-blue-500/10 px-3 py-1.5 rounded-full inline-block">
              Adding to {new Date(preSelectedDate + 'T12:00:00').toLocaleDateString('en-US', { 
                weekday: 'short', 
                month: 'short', 
                day: 'numeric' 
              })}
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Loading State */}
        {isSearching && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          </div>
        )}

        {/* Error State */}
        {error && !isSearching && (
          <div className="text-center py-12">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Empty State */}
        {!query && !isSearching && results.length === 0 && (
          <div className="text-center py-16">
            <Search className="w-16 h-16 text-gray-700 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-400 mb-2">
              Discover your next watch
            </h3>
            <p className="text-gray-600 max-w-xs mx-auto">
              Search for movies or shows. After exploring a few, I'll start spotting patterns in your taste.
            </p>
          </div>
        )}

        {/* No Results */}
        {query && !isSearching && results.length === 0 && !error && (
          <div className="text-center py-12">
            <p className="text-gray-400">No results for "{query}"</p>
            <p className="text-gray-600 text-sm mt-1">Try a different search term</p>
          </div>
        )}

        {/* Results List */}
        {results.length > 0 && !isSearching && (
          <div className="space-y-3">
            {results.map((movie) => (
              <SearchResultCard
                key={`${movie.mediaType}-${movie.id}`}
                movieId={movie.id}
                title={movie.title}
                year={movie.year}
                posterPath={movie.posterPath}
                backdropPath={movie.backdropPath}
                genres={movie.genres}
                onClick={() => handleMovieClick(movie)}
              />
            ))}
          </div>
        )}

        {/* Session Info (dev) */}
        {clickedMovies.length > 0 && clickedMovies.length < 3 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-gray-800 rounded-full text-sm text-gray-400">
            {3 - clickedMovies.length} more to unlock pattern insights
          </div>
        )}
      </div>
    </div>
  );
}
