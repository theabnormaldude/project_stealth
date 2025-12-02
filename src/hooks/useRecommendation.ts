import { useState, useCallback } from 'react';
import { collection, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';
import { useCalendarLogs } from './useCalendarLogs';
import { callGemini } from '../lib/gemini';

type RatingValue = 'up' | 'down' | null;

export type WatchedRecommendation = {
  id: string;
  movieId: number;
  title: string;
  year: string | number;
  poster: string;
  backdrop?: string;
  runtime?: string;
  mediaType?: 'movie' | 'tv';
  rating: RatingValue;
  ratedAt: any;
  llmReason: string;
};

export type RecommendationResult = {
  movieId: number;
  title: string;
  year: string | number;
  poster: string;
  backdrop?: string;
  runtime?: string;
  mediaType?: 'movie' | 'tv';
  reason: string;
};

// Configurable LLM prompt template
const RECOMMENDATION_PROMPT_TEMPLATE = `You are a movie recommendation expert. Recommend ONE movie the user has NOT already watched.

=== CRITICAL: MOVIES USER HAS ALREADY WATCHED (DO NOT RECOMMEND ANY OF THESE) ===
{excludeList}

=== USER'S WATCHLIST (movies they WANT to watch - consider these first!) ===
{watchlist}

=== USER'S TASTE PROFILE ===
LIKED movies/shows:
{likedMovies}

DISLIKED movies/shows:
{dislikedMovies}

=== RECOMMENDATION RULES ===
1. NEVER recommend any movie from the "already watched" list above - this is the most important rule
2. PREFER recommending from the user's watchlist if something there matches their taste
3. If recommending from watchlist, mention it's something they already wanted to see
4. Consider genres, directors, mood, pacing, and themes from liked movies
5. Avoid anything similar to disliked movies
6. The movie should be released (available to watch)
7. Only recommend a rewatch if you've exhausted all other options AND have a compelling reason

Return ONLY a JSON object with this exact format (no markdown, no backticks):
{"title": "Movie Title", "year": "YYYY", "fromWatchlist": true/false}`;

const REASON_PROMPT_TEMPLATE = `You're a sarcastic film buff friend. The user just got recommended "{movieTitle}" ({movieYear}).

Their recent watches: {recentWatches}
Their liked recommendations: {likedMovies}
Their disliked recommendations: {dislikedMovies}

CRITICAL RULES:
- ABSOLUTELY NO SPOILERS - do not reveal any plot points, twists, character fates, or story details
- Do not describe what happens in the movie
- Only reference the movie's vibe, genre, director's style, or general themes (e.g. "a slow-burn thriller" not "the twist ending where...")
- Focus on WHY it matches their taste, not WHAT happens in the film

In 1-2 punchy sentences, explain why this movie fits them. Be witty, slightly roast-y, but ultimately helpful. Reference specific movies they've watched to draw comparisons (without spoiling those either).`;

const TMDB_API_KEY =
  (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_TMDB_API_KEY) ||
  '087e509f6f93e629488a550f1451bb76';

const TMDB_BASE = 'https://api.themoviedb.org/3';

const searchTMDB = async (title: string, year?: string | number): Promise<any | null> => {
  try {
    const url = new URL(`${TMDB_BASE}/search/movie`);
    url.searchParams.set('api_key', TMDB_API_KEY);
    url.searchParams.set('query', title);
    if (year) url.searchParams.set('year', String(year));
    url.searchParams.set('language', 'en-US');

    const response = await fetch(url.toString());
    if (!response.ok) return null;

    const data = await response.json();
    return data.results?.[0] || null;
  } catch (error) {
    console.error('TMDB search failed:', error);
    return null;
  }
};

const getMovieDetails = async (movieId: number): Promise<any | null> => {
  try {
    const url = `${TMDB_BASE}/movie/${movieId}?api_key=${TMDB_API_KEY}&language=en-US`;
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('TMDB details fetch failed:', error);
    return null;
  }
};

const formatRuntime = (minutes?: number | null): string => {
  if (!minutes || minutes <= 0) return 'Feature';
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
};

const buildImageUrl = (path: string | null | undefined, size: 'w200' | 'w500' | 'w780' = 'w200') => {
  if (!path) return 'https://placehold.co/200x300?text=Movie';
  return `https://image.tmdb.org/t/p/${size}${path}`;
};

export function useRecommendation() {
  const { user } = useAuth();
  const { events } = useCalendarLogs();
  const [recommendation, setRecommendation] = useState<RecommendationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRatedRecommendations = useCallback(async (maxResults?: number): Promise<WatchedRecommendation[]> => {
    if (!user) return [];
    try {
      const watchedRef = collection(db, 'users', user.uid, 'watched_recommendations');
      // Fetch all documents without ordering to avoid index issues
      const snapshot = await getDocs(watchedRef);
      let results = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as WatchedRecommendation[];
      
      // Sort client-side by ratedAt (most recent first)
      results.sort((a, b) => {
        const aTime = a.ratedAt?.toMillis?.() || a.ratedAt?.seconds * 1000 || 0;
        const bTime = b.ratedAt?.toMillis?.() || b.ratedAt?.seconds * 1000 || 0;
        return bTime - aTime;
      });
      
      // Apply limit if specified
      if (maxResults && results.length > maxResults) {
        results = results.slice(0, maxResults);
      }
      
      return results;
    } catch (error) {
      console.error('Failed to fetch rated recommendations:', error);
      return [];
    }
  }, [user]);

  const generateRecommendation = useCallback(async (): Promise<RecommendationResult | null> => {
    if (!user) {
      setError('Not authenticated');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 1. Get ALL watched movies from calendar_logs
      const calendarTitles = events.map((e) => `${e.title} (${e.year || ''})`);
      
      // 2. Get ALL watched_recommendations (includes Letterboxd/IMDB imports + AI ratings)
      const allWatchedRecs = await fetchRatedRecommendations(); // No limit - get all
      const watchedRecTitles = allWatchedRecs.map((r) => `${r.title} (${r.year || ''})`);
      
      // 3. Get user's watchlist
      const watchlistRef = collection(db, 'users', user.uid, 'watchlist');
      const watchlistSnapshot = await getDocs(watchlistRef);
      const watchlistItems = watchlistSnapshot.docs.map((doc) => doc.data());
      const watchlistTitles = watchlistItems.map((w) => `${w.title} (${w.year || ''})`);
      
      // 4. Get skipped recommendations still in cooldown
      const skippedRef = collection(db, 'users', user.uid, 'skipped_recommendations');
      const skippedSnapshot = await getDocs(skippedRef);
      const now = Date.now();
      const skippedInCooldown: string[] = [];
      
      for (const docSnap of skippedSnapshot.docs) {
        const data = docSnap.data();
        const skippedAt = data.skippedAt?.toMillis?.() || data.skippedAt?.seconds * 1000 || 0;
        const daysSinceSkip = (now - skippedAt) / (1000 * 60 * 60 * 24);
        const recsSinceSkip = data.recommendationsSinceSkip || 0;
        const cooldownDays = data.cooldownDays || 3;
        const cooldownRecs = data.cooldownRecommendations || 5;
        
        // Movie is still in cooldown if BOTH conditions are not met
        // (needs 3+ days AND 5+ recommendations seen)
        const daysComplete = daysSinceSkip >= cooldownDays;
        const recsComplete = recsSinceSkip >= cooldownRecs;
        
        if (!daysComplete || !recsComplete) {
          // Still in cooldown - exclude from recommendations
          skippedInCooldown.push(`${data.title} (${data.year || ''})`);
        } else {
          // Cooldown complete - delete from skipped list so it can be recommended again
          try {
            const { deleteDoc, doc } = await import('firebase/firestore');
            await deleteDoc(doc(db, 'users', user.uid, 'skipped_recommendations', docSnap.id));
          } catch (e) {
            console.warn('Failed to clean up expired skip:', e);
          }
        }
      }
      
      // 5. Build complete exclusion list (watched + skipped in cooldown)
      const allWatchedSet = new Set([...calendarTitles, ...watchedRecTitles, ...skippedInCooldown]);
      const excludeList = allWatchedSet.size > 0 
        ? Array.from(allWatchedSet).join('\n')
        : 'None';
      
      // 6. Build watchlist text (excluding already watched)
      const watchlistText = watchlistTitles.length > 0
        ? watchlistTitles.filter(t => !allWatchedSet.has(t)).join('\n') || 'None (all watchlist items already watched)'
        : 'No watchlist';
      
      // 7. Build liked/disliked lists from all sources
      const likedFromCalendar = events.filter((e) => e.rating === 'up').map((e) => e.title);
      const likedFromRecs = allWatchedRecs.filter((r) => r.rating === 'up').map((r) => r.title);
      const allLiked = [...new Set([...likedFromCalendar, ...likedFromRecs])];
      
      const dislikedFromCalendar = events.filter((e) => e.rating === 'down').map((e) => e.title);
      const dislikedFromRecs = allWatchedRecs.filter((r) => r.rating === 'down').map((r) => r.title);
      const allDisliked = [...new Set([...dislikedFromCalendar, ...dislikedFromRecs])];
      
      const likedMovies = allLiked.length > 0 ? allLiked.join(', ') : 'None rated yet';
      const dislikedMovies = allDisliked.length > 0 ? allDisliked.join(', ') : 'None';

      // Build the recommendation prompt
      const prompt = RECOMMENDATION_PROMPT_TEMPLATE
        .replace('{excludeList}', excludeList)
        .replace('{watchlist}', watchlistText)
        .replace('{likedMovies}', likedMovies)
        .replace('{dislikedMovies}', dislikedMovies);

      // Get movie recommendation from LLM
      const llmResponse = await callGemini(prompt);
      if (!llmResponse) {
        setError('Failed to generate recommendation');
        return null;
      }

      // Parse the JSON response
      const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        setError('Invalid recommendation format');
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const { title, year } = parsed;

      if (!title) {
        setError('No movie title in recommendation');
        return null;
      }

      // Search TMDB for the movie
      const tmdbResult = await searchTMDB(title, year);
      if (!tmdbResult) {
        setError(`Couldn't find "${title}" on TMDB`);
        return null;
      }

      // Get full movie details
      const movieDetails = await getMovieDetails(tmdbResult.id);
      
      // Generate the "why this fits" reason
      const recentWatches = events.slice(0, 5).map((e) => e.title).join(', ') || 'nothing yet';
      // Use the already computed liked/disliked lists
      const likedForReason = allLiked.slice(0, 10).join(', ') || 'none';
      const dislikedForReason = allDisliked.slice(0, 10).join(', ') || 'none';

      const reasonPrompt = REASON_PROMPT_TEMPLATE
        .replace('{movieTitle}', title)
        .replace('{movieYear}', String(year || tmdbResult.release_date?.slice(0, 4) || ''))
        .replace('{recentWatches}', recentWatches)
        .replace('{likedMovies}', likedForReason)
        .replace('{dislikedMovies}', dislikedForReason);

      const reasonResponse = await callGemini(reasonPrompt);
      const reason = reasonResponse || "This one's got your name written all over it.";

      const result: RecommendationResult = {
        movieId: tmdbResult.id,
        title: tmdbResult.title || title,
        year: tmdbResult.release_date?.slice(0, 4) || year || '----',
        poster: buildImageUrl(tmdbResult.poster_path),
        backdrop: buildImageUrl(tmdbResult.backdrop_path, 'w780'),
        runtime: formatRuntime(movieDetails?.runtime),
        mediaType: 'movie',
        reason,
      };

      // Increment the "recommendations seen" counter for all skipped movies
      // This helps track cooldown progress
      try {
        const skippedRef = collection(db, 'users', user.uid, 'skipped_recommendations');
        const skippedDocs = await getDocs(skippedRef);
        const { updateDoc, doc } = await import('firebase/firestore');
        
        for (const docSnap of skippedDocs.docs) {
          const data = docSnap.data();
          await updateDoc(doc(db, 'users', user.uid, 'skipped_recommendations', docSnap.id), {
            recommendationsSinceSkip: (data.recommendationsSinceSkip || 0) + 1,
          });
        }
      } catch (e) {
        console.warn('Failed to increment skip counters:', e);
      }

      setRecommendation(result);
      return result;
    } catch (error) {
      console.error('Recommendation generation failed:', error);
      setError('Failed to generate recommendation');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [user, events, fetchRatedRecommendations]);

  const rateRecommendation = useCallback(
    async (rec: RecommendationResult, rating: 'up' | 'down'): Promise<void> => {
      if (!user) return;

      try {
        const watchedRef = collection(db, 'users', user.uid, 'watched_recommendations');
        await addDoc(watchedRef, {
          movieId: rec.movieId,
          title: rec.title,
          year: rec.year,
          poster: rec.poster,
          backdrop: rec.backdrop,
          runtime: rec.runtime,
          mediaType: rec.mediaType,
          rating,
          ratedAt: serverTimestamp(),
          llmReason: rec.reason,
        });

        // Clear current recommendation after rating
        setRecommendation(null);
      } catch (error) {
        console.error('Failed to save rating:', error);
      }
    },
    [user]
  );

  const refreshRecommendation = useCallback(async () => {
    setRecommendation(null);
    return generateRecommendation();
  }, [generateRecommendation]);

  // Skip recommendation temporarily - it will come back after cooldown period
  // Cooldown: 3 days AND 5 new recommendations seen
  const skipRecommendation = useCallback(
    async (rec: RecommendationResult): Promise<void> => {
      if (!user) return;

      try {
        // Save to skipped_recommendations (temporary buffer, not permanent exclusion)
        const skippedRef = collection(db, 'users', user.uid, 'skipped_recommendations');
        await addDoc(skippedRef, {
          movieId: rec.movieId,
          title: rec.title,
          year: rec.year,
          poster: rec.poster,
          backdrop: rec.backdrop,
          runtime: rec.runtime,
          mediaType: rec.mediaType,
          skippedAt: serverTimestamp(),
          // Cooldown tracking
          cooldownDays: 3, // Come back after 3 days
          recommendationsSinceSkip: 0, // Track how many recs user has seen since
          cooldownRecommendations: 5, // Come back after 5 new recommendations
          llmReason: rec.reason,
        });

        // Clear current recommendation
        setRecommendation(null);
      } catch (error) {
        console.error('Failed to skip recommendation:', error);
      }
    },
    [user]
  );

  return {
    recommendation,
    isLoading,
    error,
    generateRecommendation,
    rateRecommendation,
    refreshRecommendation,
    skipRecommendation,
    fetchRatedRecommendations,
  };
}

