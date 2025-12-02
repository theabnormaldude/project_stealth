import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { callGemini } from '../lib/gemini';

const TMDB_API_KEY =
  (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_TMDB_API_KEY) ||
  '087e509f6f93e629488a550f1451bb76';

const TMDB_BASE = 'https://api.themoviedb.org/3';

// Genre ID to name mapping
const GENRE_MAP: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
  10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
};

export type SimilarMovie = {
  id: number;
  title: string;
  year: string;
  posterPath: string | null;
  backdropPath: string | null;
  genres: string[];
  overview: string;
  voteAverage: number;
};

const searchTMDB = async (title: string, year?: string): Promise<any | null> => {
  try {
    const url = new URL(`${TMDB_BASE}/search/movie`);
    url.searchParams.set('api_key', TMDB_API_KEY);
    url.searchParams.set('query', title);
    if (year) url.searchParams.set('year', year);
    
    const response = await fetch(url.toString());
    if (!response.ok) return null;
    const data = await response.json();
    return data.results?.[0] || null;
  } catch {
    return null;
  }
};

const fetchMovieDetails = async (movieId: number): Promise<any | null> => {
  try {
    const response = await fetch(
      `${TMDB_BASE}/movie/${movieId}?api_key=${TMDB_API_KEY}&language=en-US`
    );
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
};

export function useSimilarVibes() {
  const { id } = useParams<{ id: string }>();
  
  const [similarMovies, setSimilarMovies] = useState<SimilarMovie[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [movieDetails, setMovieDetails] = useState<any>(null);
  const loadedIdsRef = useRef<Set<number>>(new Set());

  // Fetch movie details for context
  useEffect(() => {
    if (id) {
      // Reset state when movie changes
      setSimilarMovies([]);
      setPage(0);
      setHasMore(true);
      loadedIdsRef.current = new Set();
      fetchMovieDetails(parseInt(id)).then(setMovieDetails);
    }
  }, [id]);

  // Initial load of similar movies using AI
  useEffect(() => {
    if (movieDetails && similarMovies.length === 0) {
      loadSimilarMovies(movieDetails, 0);
    }
  }, [movieDetails]);

  const loadSimilarMovies = useCallback(async (movie: any, currentPage: number) => {
    if (!movie || isLoading) return;
    
    setIsLoading(true);
    try {
      const alreadyLoaded = Array.from(loadedIdsRef.current);
      const skipList = similarMovies.map(m => m.title).join(', ');
      
      const prompt = `You're a film expert with encyclopedic knowledge. Given this movie:
Title: ${movie.title}
Year: ${movie.release_date?.slice(0, 4)}
Genres: ${movie.genres?.map((g: any) => g.name).join(', ')}
Overview: ${movie.overview?.slice(0, 300)}

Suggest ${currentPage === 0 ? 8 : 6} movies with a SIMILAR VIBE (tone, mood, style, themes).
${skipList ? `SKIP these already suggested: ${skipList}` : ''}

Focus on:
- Similar emotional tone and atmosphere
- Comparable directorial/visual style  
- Related themes or subject matter
- Mix of well-known classics and hidden gems
- Different decades for variety

Return ONLY a JSON array (no markdown, no explanation):
[{"title": "Movie Title", "year": "YYYY"}, ...]`;

      const response = await callGemini(prompt);
      if (!response) {
        // Fallback to TMDB similar endpoint
        await loadFromTMDBFallback(parseInt(id || '0'));
        return;
      }

      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        await loadFromTMDBFallback(parseInt(id || '0'));
        return;
      }

      let suggestions;
      try {
        suggestions = JSON.parse(jsonMatch[0]);
      } catch {
        await loadFromTMDBFallback(parseInt(id || '0'));
        return;
      }
      
      // Fetch TMDB details for each suggestion (in parallel for speed)
      const detailedMovies = await Promise.all(
        suggestions.map(async (s: { title: string; year: string }) => {
          const tmdb = await searchTMDB(s.title, s.year);
          if (tmdb && tmdb.id !== parseInt(id || '0') && !alreadyLoaded.includes(tmdb.id)) {
            loadedIdsRef.current.add(tmdb.id);
            return {
              id: tmdb.id,
              title: tmdb.title,
              year: tmdb.release_date?.slice(0, 4) || s.year,
              posterPath: tmdb.poster_path,
              backdropPath: tmdb.backdrop_path,
              genres: (tmdb.genre_ids || []).map((gid: number) => GENRE_MAP[gid]).filter(Boolean),
              overview: tmdb.overview || '',
              voteAverage: tmdb.vote_average || 0,
            };
          }
          return null;
        })
      );

      const validMovies = detailedMovies.filter(Boolean) as SimilarMovie[];
      
      if (currentPage === 0) {
        setSimilarMovies(validMovies);
      } else {
        setSimilarMovies(prev => [...prev, ...validMovies]);
      }
      
      setPage(currentPage + 1);
      setHasMore(validMovies.length >= 3);
    } catch (error) {
      console.error('Failed to load similar movies:', error);
      // Try TMDB fallback
      await loadFromTMDBFallback(parseInt(id || '0'));
    } finally {
      setIsLoading(false);
    }
  }, [id, similarMovies, isLoading]);

  // TMDB fallback if AI fails
  const loadFromTMDBFallback = async (movieId: number) => {
    try {
      const response = await fetch(
        `${TMDB_BASE}/movie/${movieId}/similar?api_key=${TMDB_API_KEY}&language=en-US&page=1`
      );
      if (!response.ok) {
        setHasMore(false);
        return;
      }
      const data = await response.json();
      const movies = (data.results || []).slice(0, 8).map((m: any) => ({
        id: m.id,
        title: m.title,
        year: m.release_date?.slice(0, 4) || '',
        posterPath: m.poster_path,
        backdropPath: m.backdrop_path,
        genres: (m.genre_ids || []).map((gid: number) => GENRE_MAP[gid]).filter(Boolean),
        overview: m.overview || '',
        voteAverage: m.vote_average || 0,
      }));
      setSimilarMovies(movies);
      setHasMore(false); // TMDB fallback doesn't support AI-powered "load more"
    } catch {
      setHasMore(false);
    }
  };

  const loadMore = useCallback(() => {
    if (!isLoading && hasMore && movieDetails) {
      loadSimilarMovies(movieDetails, page);
    }
  }, [isLoading, hasMore, movieDetails, page, loadSimilarMovies]);

  const reset = useCallback(() => {
    setSimilarMovies([]);
    setPage(0);
    setHasMore(true);
    loadedIdsRef.current = new Set();
  }, []);

  return {
    similarMovies,
    isLoading,
    hasMore,
    loadMore,
    reset,
  };
}
