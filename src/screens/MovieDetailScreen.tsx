import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Star, Play, ChevronDown, ChevronUp, ExternalLink, Loader2 } from 'lucide-react';
import { useMovieDetails } from '../hooks/useMovieDetails';
import { useSimilarVibes } from '../hooks/useSimilarVibes';
import { useWatchlist } from '../hooks/useWatchlist';
import { useCalendarLogs } from '../hooks/useCalendarLogs';
import { useExploration } from '../contexts/ExplorationContext';
import MovieActions from '../components/MovieActions';
import SearchResultCard from '../components/SearchResultCard';
import PatternAssistant from '../components/PatternAssistant';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';

const buildImageUrl = (path: string | null, size: 'w200' | 'w500' | 'w780' | 'original' = 'w500') => {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
};

export default function MovieDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preSelectedDate = searchParams.get('date');
  const mediaType = (searchParams.get('type') as 'movie' | 'tv') || 'movie';
  
  const { user } = useAuth();
  const { details, isLoading, isLoadingVibe, error, fetchDetails } = useMovieDetails();
  const { similarMovies, isLoading: isLoadingSimilar, loadMore, hasMore } = useSimilarVibes();
  const { addToWatchlist, isInWatchlist } = useWatchlist();
  const { addEvent } = useCalendarLogs();
  const {
    clickedMovies,
    addMovie,
    patternInsight,
    isAnalyzing,
    showMoreMovies,
    showMoreResults,
    isLoadingMore,
    saveVibe,
    isSavingVibe,
    vibeSaved,
  } = useExploration();
  
  const [showFullSynopsis, setShowFullSynopsis] = useState(false);
  const [isAddingToCalendar, setIsAddingToCalendar] = useState(false);
  const [isAddingToWatchlist, setIsAddingToWatchlist] = useState(false);
  const [isMarkingSeen, setIsMarkingSeen] = useState(false);
  const [isMarkedSeen, setIsMarkedSeen] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(preSelectedDate || new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (id) {
      fetchDetails(parseInt(id), mediaType);
    }
  }, [id, mediaType, fetchDetails]);

  // Track this movie view for pattern detection
  useEffect(() => {
    if (details) {
      addMovie({
        id: details.id,
        title: details.title,
        year: details.year,
        posterPath: details.posterPath,
        backdropPath: details.backdropPath,
        genres: details.genres,
        mediaType: details.mediaType,
      });
    }
  }, [details, addMovie]);

  const handleBack = () => {
    navigate(-1);
  };

  const showPatternAssistant = clickedMovies.length >= 3 && patternInsight;

  const handleAddToCalendar = useCallback(async () => {
    if (!details || !user) return;
    
    if (!preSelectedDate && !showDatePicker) {
      setShowDatePicker(true);
      return;
    }

    setIsAddingToCalendar(true);
    try {
      await addEvent({
        movieId: details.id,
        title: details.title,
        poster: buildImageUrl(details.posterPath) || '',
        date: selectedDate,
        inviteFriend: false,
        backdrop: buildImageUrl(details.backdropPath, 'w780') || undefined,
        mediaType: details.mediaType,
        year: details.year,
        runtimeLabel: details.runtime || 'Feature',
      });
      
      setShowDatePicker(false);
      // Navigate back to calendar on the selected date
      navigate(`/app?date=${selectedDate}`);
    } catch (err) {
      console.error('Failed to add to calendar:', err);
    } finally {
      setIsAddingToCalendar(false);
    }
  }, [details, user, preSelectedDate, showDatePicker, selectedDate, addEvent, navigate]);

  const handleAddToWatchlist = useCallback(async () => {
    if (!details) return;
    
    setIsAddingToWatchlist(true);
    try {
      await addToWatchlist({
        movieId: details.id,
        title: details.title,
        year: details.year,
        poster: buildImageUrl(details.posterPath) || '',
        backdrop: buildImageUrl(details.backdropPath, 'w780') || undefined,
        runtime: details.runtime,
      });
    } catch (err) {
      console.error('Failed to add to watchlist:', err);
    } finally {
      setIsAddingToWatchlist(false);
    }
  }, [details, addToWatchlist]);

  const handleMarkAsSeen = useCallback(async (rating: 'up' | 'down') => {
    if (!details || !user) return;
    
    setIsMarkingSeen(true);
    try {
      const watchedRef = collection(db, 'users', user.uid, 'watched_recommendations');
      await addDoc(watchedRef, {
        movieId: details.id,
        title: details.title,
        year: details.year,
        poster: buildImageUrl(details.posterPath) || '',
        backdrop: buildImageUrl(details.backdropPath, 'w780') || undefined,
        runtime: details.runtime,
        mediaType: details.mediaType,
        rating,
        ratedAt: serverTimestamp(),
        source: 'discovery',
      });
      setIsMarkedSeen(true);
    } catch (err) {
      console.error('Failed to mark as seen:', err);
    } finally {
      setIsMarkingSeen(false);
    }
  }, [details, user]);

  const handleSimilarMovieClick = (movie: any) => {
    navigate(`/movie/${movie.id}?type=movie`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
      </div>
    );
  }

  if (error || !details) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white p-4">
        <p className="text-red-400 mb-4">{error || 'Movie not found'}</p>
        <button onClick={handleBack} className="text-blue-400 hover:underline">
          Go back
        </button>
      </div>
    );
  }

  const backdropUrl = buildImageUrl(details.backdropPath, 'original');
  const posterUrl = buildImageUrl(details.posterPath, 'w500');

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Pattern Assistant - sticky at top when triggered */}
      {showPatternAssistant && (
        <div className="sticky top-0 z-30">
          <PatternAssistant
            insight={patternInsight}
            isAnalyzing={isAnalyzing}
            onShowMore={showMoreMovies}
            onSaveVibe={saveVibe}
            isLoadingMore={isLoadingMore}
            isSavingVibe={isSavingVibe}
            vibeSaved={vibeSaved}
            movieCount={clickedMovies.length}
            showMoreResults={showMoreResults}
            onMovieClick={(movie) => navigate(`/movie/${movie.id}?type=movie`)}
          />
        </div>
      )}
      
      {/* Hero Section */}
      <div className="relative">
        {/* Backdrop */}
        <div className="h-72 sm:h-96 relative overflow-hidden">
          {backdropUrl ? (
            <img
              src={backdropUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
        </div>

        {/* Back Button */}
        <button
          onClick={handleBack}
          className="absolute top-4 left-4 p-2 bg-black/50 backdrop-blur-sm rounded-full text-white hover:bg-black/70 transition-colors z-10"
        >
          <ArrowLeft size={24} />
        </button>

        {/* Poster & Title Overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-4 flex gap-4">
          {posterUrl && (
            <img
              src={posterUrl}
              alt={details.title}
              className="w-28 sm:w-36 rounded-xl border-2 border-gray-800 shadow-2xl -mt-20 relative z-10"
            />
          )}
          <div className="flex-1 min-w-0 self-end pb-2">
            {/* Movie Logo or Title */}
            {details.logoPath ? (
              <img
                src={`https://image.tmdb.org/t/p/w500${details.logoPath}`}
                alt={details.title}
                className="h-12 sm:h-16 w-auto max-w-full object-contain drop-shadow-lg"
              />
            ) : (
              <h1 className="text-2xl sm:text-3xl font-bold leading-tight">
                {details.title}
              </h1>
            )}
            <div className="flex items-center gap-2 mt-2 text-sm text-gray-300 flex-wrap">
              <span>{details.year}</span>
              {details.runtime && (
                <>
                  <span className="text-gray-600">•</span>
                  <span>{details.runtime}</span>
                </>
              )}
              {details.voteAverage > 0 && (
                <>
                  <span className="text-gray-600">•</span>
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                    <span>{details.voteAverage.toFixed(1)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-6">
        {/* Genre Tags */}
        {details.genres.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {details.genres.map((genre) => (
              <span
                key={genre}
                className="px-3 py-1 rounded-full bg-gray-800 text-sm text-gray-300"
              >
                {genre}
              </span>
            ))}
          </div>
        )}

        {/* AI Vibe Description */}
        {(details.vibeDescription || isLoadingVibe) && (
          <div className="p-4 rounded-xl bg-gradient-to-r from-purple-900/30 to-blue-900/30 border border-purple-500/20">
            {isLoadingVibe ? (
              <div className="flex items-center gap-2 text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm italic">Reading the vibe...</span>
              </div>
            ) : (
              <p className="text-gray-200 italic leading-relaxed">
                "{details.vibeDescription}"
              </p>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <MovieActions
          onAddToCalendar={handleAddToCalendar}
          onAddToWatchlist={handleAddToWatchlist}
          onMarkAsSeen={handleMarkAsSeen}
          isInWatchlist={isInWatchlist(details.id)}
          isMarkedSeen={isMarkedSeen}
          isAddingToCalendar={isAddingToCalendar}
          isAddingToWatchlist={isAddingToWatchlist}
          isMarkingSeen={isMarkingSeen}
        />

        {/* Date Picker Modal */}
        {showDatePicker && (
          <div className="p-4 rounded-xl bg-gray-900 border border-gray-700">
            <label className="block text-sm text-gray-400 mb-2">Select date:</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full p-3 rounded-lg bg-gray-800 border border-gray-700 text-white mb-3"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowDatePicker(false)}
                className="flex-1 py-2 rounded-lg border border-gray-700 text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleAddToCalendar}
                disabled={isAddingToCalendar}
                className="flex-1 py-2 rounded-lg bg-white text-black font-semibold hover:bg-gray-200 disabled:opacity-50"
              >
                {isAddingToCalendar ? 'Adding...' : 'Confirm'}
              </button>
            </div>
          </div>
        )}

        {/* Director & Cast */}
        {(details.director || details.cast.length > 0) && (
          <div className="space-y-3">
            {details.director && (
              <div>
                <span className="text-gray-500 text-sm">Directed by</span>
                <p className="text-white font-medium">{details.director}</p>
              </div>
            )}
            {details.cast.length > 0 && (
              <div>
                <span className="text-gray-500 text-sm">Starring</span>
                <p className="text-white">
                  {details.cast.map((c) => c.name).join(', ')}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Synopsis */}
        {details.overview && (
          <div>
            <h3 className="text-lg font-semibold mb-2">Synopsis</h3>
            <p className={`text-gray-300 leading-relaxed ${!showFullSynopsis && 'line-clamp-3'}`}>
              {details.overview}
            </p>
            {details.overview.length > 200 && (
              <button
                onClick={() => setShowFullSynopsis(!showFullSynopsis)}
                className="flex items-center gap-1 text-blue-400 text-sm mt-2 hover:underline"
              >
                {showFullSynopsis ? (
                  <>Show less <ChevronUp size={16} /></>
                ) : (
                  <>Show more <ChevronDown size={16} /></>
                )}
              </button>
            )}
          </div>
        )}

        {/* Streaming Availability */}
        {details.watchProviders && (
          <div>
            <h3 className="text-lg font-semibold mb-3">Where to Watch</h3>
            {details.watchProviders.flatrate.length > 0 && (
              <div className="mb-3">
                <span className="text-xs text-gray-500 uppercase tracking-wide">Stream</span>
                <div className="flex gap-2 mt-1">
                  {details.watchProviders.flatrate.map((p) => (
                    <img
                      key={p.name}
                      src={`https://image.tmdb.org/t/p/w92${p.logoPath}`}
                      alt={p.name}
                      title={p.name}
                      className="w-10 h-10 rounded-lg"
                    />
                  ))}
                </div>
              </div>
            )}
            {details.watchProviders.rent.length > 0 && (
              <div className="mb-3">
                <span className="text-xs text-gray-500 uppercase tracking-wide">Rent</span>
                <div className="flex gap-2 mt-1">
                  {details.watchProviders.rent.map((p) => (
                    <img
                      key={p.name}
                      src={`https://image.tmdb.org/t/p/w92${p.logoPath}`}
                      alt={p.name}
                      title={p.name}
                      className="w-10 h-10 rounded-lg"
                    />
                  ))}
                </div>
              </div>
            )}
            {details.watchProviders.flatrate.length === 0 && details.watchProviders.rent.length === 0 && (
              <p className="text-gray-500 text-sm">No streaming info available</p>
            )}
          </div>
        )}

        {/* Trailer */}
        {details.trailer && (
          <a
            href={`https://www.youtube.com/watch?v=${details.trailer.key}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-4 rounded-xl bg-gray-900 border border-gray-800 hover:border-gray-700 transition-colors"
          >
            <div className="p-3 rounded-full bg-red-600">
              <Play className="w-5 h-5 fill-white text-white" />
            </div>
            <div className="flex-1">
              <p className="font-medium">Watch Trailer</p>
              <p className="text-sm text-gray-500">{details.trailer.name}</p>
            </div>
            <ExternalLink className="w-5 h-5 text-gray-500" />
          </a>
        )}

        {/* Similar Vibes Section */}
        <div>
          <h3 className="text-lg font-semibold mb-4">More of this vibe</h3>
          {isLoadingSimilar && similarMovies.length === 0 ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
            </div>
          ) : similarMovies.length > 0 ? (
            <div className="space-y-3">
              {similarMovies.map((movie) => (
                <SearchResultCard
                  key={movie.id}
                  movieId={movie.id}
                  title={movie.title}
                  year={movie.year}
                  posterPath={movie.posterPath}
                  backdropPath={movie.backdropPath}
                  genres={movie.genres || []}
                  onClick={() => handleSimilarMovieClick(movie)}
                />
              ))}
              {hasMore && (
                <button
                  onClick={loadMore}
                  disabled={isLoadingSimilar}
                  className="w-full py-3 rounded-xl bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors disabled:opacity-50"
                >
                  {isLoadingSimilar ? 'Loading...' : 'Load more'}
                </button>
              )}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">
              Finding similar vibes...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

