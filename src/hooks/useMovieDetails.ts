import { useState, useCallback } from 'react';
import { callGemini } from '../lib/gemini';

const TMDB_API_KEY =
  (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_TMDB_API_KEY) ||
  '087e509f6f93e629488a550f1451bb76';

const TMDB_BASE = 'https://api.themoviedb.org/3';

export type MovieDetails = {
  id: number;
  title: string;
  year: string;
  runtime: string;
  posterPath: string | null;
  backdropPath: string | null;
  logoPath: string | null;
  genres: string[];
  overview: string;
  tagline: string;
  voteAverage: number;
  voteCount: number;
  director: string | null;
  cast: { id: number; name: string; character: string; profilePath: string | null }[];
  trailer: { key: string; site: string; name: string } | null;
  watchProviders: {
    flatrate: { name: string; logoPath: string }[];
    rent: { name: string; logoPath: string }[];
    buy: { name: string; logoPath: string }[];
  } | null;
  vibeDescription: string | null;
  mediaType: 'movie' | 'tv';
};

const formatRuntime = (minutes?: number | null): string => {
  if (!minutes || minutes <= 0) return '';
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
};

export function useMovieDetails() {
  const [details, setDetails] = useState<MovieDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingVibe, setIsLoadingVibe] = useState(false);

  const fetchDetails = useCallback(async (movieId: number, mediaType: 'movie' | 'tv' = 'movie'): Promise<MovieDetails | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const endpoint = mediaType === 'tv' ? 'tv' : 'movie';
      
      // Fetch main details, credits, videos, watch providers, and images in parallel
      const [detailsRes, creditsRes, videosRes, providersRes, imagesRes] = await Promise.all([
        fetch(`${TMDB_BASE}/${endpoint}/${movieId}?api_key=${TMDB_API_KEY}&language=en-US`),
        fetch(`${TMDB_BASE}/${endpoint}/${movieId}/credits?api_key=${TMDB_API_KEY}`),
        fetch(`${TMDB_BASE}/${endpoint}/${movieId}/videos?api_key=${TMDB_API_KEY}`),
        fetch(`${TMDB_BASE}/${endpoint}/${movieId}/watch/providers?api_key=${TMDB_API_KEY}`),
        fetch(`${TMDB_BASE}/${endpoint}/${movieId}/images?api_key=${TMDB_API_KEY}`),
      ]);

      if (!detailsRes.ok) {
        throw new Error('Failed to fetch movie details');
      }

      const [detailsData, creditsData, videosData, providersData, imagesData] = await Promise.all([
        detailsRes.json(),
        creditsRes.ok ? creditsRes.json() : { crew: [], cast: [] },
        videosRes.ok ? videosRes.json() : { results: [] },
        providersRes.ok ? providersRes.json() : { results: {} },
        imagesRes.ok ? imagesRes.json() : { logos: [] },
      ]);

      // Find director (for movies) or creator (for TV)
      let director: string | null = null;
      if (mediaType === 'movie') {
        const directorCredit = creditsData.crew?.find((c: any) => c.job === 'Director');
        director = directorCredit?.name || null;
      } else {
        director = detailsData.created_by?.[0]?.name || null;
      }

      // Get top cast
      const cast = (creditsData.cast || []).slice(0, 6).map((c: any) => ({
        id: c.id,
        name: c.name,
        character: c.character,
        profilePath: c.profile_path,
      }));

      // Find trailer (prefer official YouTube trailers)
      const videos = videosData.results || [];
      const trailer = videos.find((v: any) => 
        v.type === 'Trailer' && v.site === 'YouTube' && v.official
      ) || videos.find((v: any) => 
        v.type === 'Trailer' && v.site === 'YouTube'
      ) || null;

      // Get US watch providers
      const usProviders = providersData.results?.US;
      const watchProviders = usProviders ? {
        flatrate: (usProviders.flatrate || []).slice(0, 4).map((p: any) => ({
          name: p.provider_name,
          logoPath: p.logo_path,
        })),
        rent: (usProviders.rent || []).slice(0, 4).map((p: any) => ({
          name: p.provider_name,
          logoPath: p.logo_path,
        })),
        buy: (usProviders.buy || []).slice(0, 4).map((p: any) => ({
          name: p.provider_name,
          logoPath: p.logo_path,
        })),
      } : null;

      // Find English logo (prefer PNG for transparency)
      const logos = imagesData.logos || [];
      const englishLogo = logos.find((l: any) => l.iso_639_1 === 'en') || logos[0];
      const logoPath = englishLogo?.file_path || null;

      // Generate AI vibe description
      const vibePrompt = `You're a witty film critic. Describe the VIBE of "${detailsData.title || detailsData.name}" (${detailsData.release_date?.slice(0, 4) || detailsData.first_air_date?.slice(0, 4)}) in 1-2 sentences.

Genres: ${detailsData.genres?.map((g: any) => g.name).join(', ')}
${director ? `Director: ${director}` : ''}
Tagline: ${detailsData.tagline || 'N/A'}

Focus on mood, style, and tone - NOT plot. Be playful and specific. Use film references if relevant.
Examples:
- "Peak 90s Tarantino energy - all swagger, sharp suits, and even sharper dialogue."
- "Cozy autumn vibes meets existential crisis. Bring tissues and a warm blanket."

DO NOT spoil anything. Keep it under 2 sentences.`;

      // Start fetching vibe description in background (don't block page load)
      const vibePromise = callGemini(vibePrompt);

      // Build movie details immediately (without waiting for AI)
      const movieDetails: MovieDetails = {
        id: detailsData.id,
        title: detailsData.title || detailsData.name,
        year: (detailsData.release_date || detailsData.first_air_date)?.slice(0, 4) || '',
        runtime: mediaType === 'movie' 
          ? formatRuntime(detailsData.runtime)
          : detailsData.episode_run_time?.[0] ? `${detailsData.episode_run_time[0]}m/ep` : '',
        posterPath: detailsData.poster_path,
        backdropPath: detailsData.backdrop_path,
        logoPath,
        genres: detailsData.genres?.map((g: any) => g.name) || [],
        overview: detailsData.overview || '',
        tagline: detailsData.tagline || '',
        voteAverage: detailsData.vote_average || 0,
        voteCount: detailsData.vote_count || 0,
        director,
        cast,
        trailer: trailer ? { key: trailer.key, site: trailer.site, name: trailer.name } : null,
        watchProviders,
        vibeDescription: null, // Will be loaded async
        mediaType,
      };

      // Set details immediately so page renders fast
      setDetails(movieDetails);
      
      // Then update with vibe description when ready
      setIsLoadingVibe(true);
      vibePromise.then(vibeDescription => {
        if (vibeDescription) {
          setDetails(prev => prev ? { ...prev, vibeDescription: vibeDescription.trim() } : null);
        }
        setIsLoadingVibe(false);
      }).catch(() => setIsLoadingVibe(false));

      return movieDetails;
    } catch (err) {
      console.error('Failed to fetch movie details:', err);
      setError('Failed to load movie details');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearDetails = useCallback(() => {
    setDetails(null);
    setError(null);
  }, []);

  return {
    details,
    isLoading,
    isLoadingVibe,
    error,
    fetchDetails,
    clearDetails,
  };
}

