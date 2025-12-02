import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles, Trash2, Loader2, ChevronRight } from 'lucide-react';
import { collection, getDocs, deleteDoc, doc, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';

type SavedVibe = {
  id: string;
  pattern: string;
  movies: {
    id: number;
    title: string;
    year: string;
    posterPath: string | null;
    mediaType: 'movie' | 'tv';
  }[];
  createdAt: any;
};

const buildImageUrl = (path: string | null) => {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/w200${path}`;
};

export default function SavedVibesScreen() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [vibes, setVibes] = useState<SavedVibe[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchVibes = useCallback(async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      const vibesRef = collection(db, 'users', user.uid, 'saved_vibes');
      const q = query(vibesRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      
      const fetchedVibes = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as SavedVibe[];
      
      setVibes(fetchedVibes);
    } catch (error) {
      console.error('Failed to fetch vibes:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchVibes();
  }, [fetchVibes]);

  const handleDelete = async (vibeId: string) => {
    if (!user) return;
    
    setDeletingId(vibeId);
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'saved_vibes', vibeId));
      setVibes((prev) => prev.filter((v) => v.id !== vibeId));
    } catch (error) {
      console.error('Failed to delete vibe:', error);
    } finally {
      setDeletingId(null);
    }
  };

  const handleVibeClick = (vibe: SavedVibe) => {
    // Navigate to discover with the vibe pattern as context
    // For now, we'll navigate to the first movie in the vibe
    if (vibe.movies.length > 0) {
      const firstMovie = vibe.movies[0];
      navigate(`/movie/${firstMovie.id}?type=${firstMovie.mediaType}`);
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-black/95 backdrop-blur-sm border-b border-gray-800">
        <div className="flex items-center gap-3 p-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-xl font-bold">Saved Vibes</h1>
            <p className="text-sm text-gray-500">Your curated taste patterns</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
          </div>
        ) : vibes.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-purple-900/30 flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-purple-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-300 mb-2">
              No saved vibes yet
            </h3>
            <p className="text-gray-500 max-w-xs mx-auto mb-6">
              Explore movies in Discover and save interesting patterns you find.
            </p>
            <button
              onClick={() => navigate('/discover')}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-500 rounded-xl font-semibold transition-colors"
            >
              Start Discovering
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {vibes.map((vibe) => (
              <div
                key={vibe.id}
                className="rounded-2xl bg-gradient-to-br from-gray-900 to-gray-950 border border-gray-800 overflow-hidden"
              >
                {/* Vibe Header */}
                <button
                  onClick={() => handleVibeClick(vibe)}
                  className="w-full p-4 text-left hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="w-4 h-4 text-purple-400 flex-shrink-0" />
                        <span className="text-xs text-gray-500">
                          {formatDate(vibe.createdAt)}
                        </span>
                      </div>
                      <p className="text-gray-200 leading-relaxed line-clamp-2">
                        {vibe.pattern}
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-500 flex-shrink-0 mt-1" />
                  </div>
                </button>

                {/* Movie Posters */}
                <div className="px-4 pb-4">
                  <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
                    {vibe.movies.slice(0, 6).map((movie) => (
                      <div
                        key={`${movie.mediaType}-${movie.id}`}
                        className="flex-shrink-0 w-16"
                      >
                        {movie.posterPath ? (
                          <img
                            src={buildImageUrl(movie.posterPath)!}
                            alt={movie.title}
                            className="w-16 h-24 rounded-lg object-cover border border-gray-700"
                          />
                        ) : (
                          <div className="w-16 h-24 rounded-lg bg-gray-800 flex items-center justify-center border border-gray-700">
                            <span className="text-xs text-gray-500">?</span>
                          </div>
                        )}
                        <p className="text-xs text-gray-500 mt-1 truncate">
                          {movie.title}
                        </p>
                      </div>
                    ))}
                    {vibe.movies.length > 6 && (
                      <div className="flex-shrink-0 w-16 h-24 rounded-lg bg-gray-800 flex items-center justify-center border border-gray-700">
                        <span className="text-sm text-gray-400">
                          +{vibe.movies.length - 6}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Delete Button */}
                <div className="px-4 pb-4 flex justify-end">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(vibe.id);
                    }}
                    disabled={deletingId === vibe.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {deletingId === vibe.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

