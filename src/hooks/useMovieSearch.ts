import { useState, useCallback, useRef } from 'react';

const TMDB_API_KEY =
  (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_TMDB_API_KEY) ||
  '087e509f6f93e629488a550f1451bb76';

const TMDB_BASE = 'https://api.themoviedb.org/3';

// Genre ID to name mapping
const GENRE_MAP: Record<number, string> = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Sci-Fi',
  10770: 'TV Movie',
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
};

export type SearchResult = {
  id: number;
  title: string;
  year: string;
  posterPath: string | null;
  backdropPath: string | null;
  genres: string[];
  overview: string;
  popularity: number;
  voteAverage: number;
  mediaType: 'movie' | 'tv';
};

export function useMovieSearch() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastQueryRef = useRef<string>('');

  const searchMovies = useCallback(async (query: string): Promise<SearchResult[]> => {
    const trimmedQuery = query.trim();
    
    // Skip if same query
    if (trimmedQuery === lastQueryRef.current) {
      return [];
    }
    
    lastQueryRef.current = trimmedQuery;
    
    if (!trimmedQuery) {
      setResults([]);
      return [];
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsSearching(true);
    setError(null);

    try {
      // Search both movies and TV shows
      const [movieRes, tvRes] = await Promise.all([
        fetch(
          `${TMDB_BASE}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(trimmedQuery)}&language=en-US&page=1`,
          { signal: abortControllerRef.current.signal }
        ),
        fetch(
          `${TMDB_BASE}/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(trimmedQuery)}&language=en-US&page=1`,
          { signal: abortControllerRef.current.signal }
        ),
      ]);

      if (!movieRes.ok || !tvRes.ok) {
        throw new Error('Search failed');
      }

      const [movieData, tvData] = await Promise.all([
        movieRes.json(),
        tvRes.json(),
      ]);

      const movies: SearchResult[] = (movieData.results || []).map((m: any) => ({
        id: m.id,
        title: m.title,
        year: m.release_date?.slice(0, 4) || '',
        posterPath: m.poster_path,
        backdropPath: m.backdrop_path,
        genres: (m.genre_ids || []).map((id: number) => GENRE_MAP[id]).filter(Boolean),
        overview: m.overview || '',
        popularity: m.popularity || 0,
        voteAverage: m.vote_average || 0,
        mediaType: 'movie' as const,
      }));

      const tvShows: SearchResult[] = (tvData.results || []).map((t: any) => ({
        id: t.id,
        title: t.name,
        year: t.first_air_date?.slice(0, 4) || '',
        posterPath: t.poster_path,
        backdropPath: t.backdrop_path,
        genres: (t.genre_ids || []).map((id: number) => GENRE_MAP[id]).filter(Boolean),
        overview: t.overview || '',
        popularity: t.popularity || 0,
        voteAverage: t.vote_average || 0,
        mediaType: 'tv' as const,
      }));

      // Combine and sort by popularity
      const combined = [...movies, ...tvShows].sort((a, b) => b.popularity - a.popularity);
      
      setResults(combined);
      return combined;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return []; // Return empty on abort, don't update state
      }
      console.error('Search failed:', err);
      setError('Search failed. Please try again.');
      return [];
    } finally {
      setIsSearching(false);
    }
  }, []); // No dependencies - stable callback

  const clearResults = useCallback(() => {
    setResults([]);
    setError(null);
    lastQueryRef.current = '';
  }, []);

  return {
    results,
    isSearching,
    error,
    searchMovies,
    clearResults,
  };
}
