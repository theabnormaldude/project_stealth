import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { callGemini } from '../lib/gemini';

type ExploredMovie = {
  id: number;
  title: string;
  year: string;
  posterPath: string | null;
  backdropPath: string | null;
  genres: string[];
  mediaType: 'movie' | 'tv';
};

type ExplorationContextType = {
  clickedMovies: ExploredMovie[];
  addMovie: (movie: ExploredMovie) => void;
  resetSession: () => void;
  patternInsight: string | null;
  isAnalyzing: boolean;
  showMoreMovies: () => Promise<any[]>;
  showMoreResults: any[];
  isLoadingMore: boolean;
  saveVibe: () => Promise<boolean>;
  isSavingVibe: boolean;
  vibeSaved: boolean;
};

const ExplorationContext = createContext<ExplorationContextType | null>(null);

const TMDB_API_KEY =
  (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_TMDB_API_KEY) ||
  '087e509f6f93e629488a550f1451bb76';

const PATTERN_PROMPT = `You're a film-obsessed cinephile friend who's seen everything. The user has been browsing these movies/shows in their current session:

{movieList}

Analyze the pattern in their exploration. What vibe, theme, director style, era, or mood connects these picks? 

Write 1-2 punchy sentences in a playful, slightly sarcastic Reddit/Letterboxd voice. Be witty and specific - reference actual film movements, directors, or cultural moments if relevant. Don't be generic.

Examples of good tone:
- "Ah, the 'morally bankrupt men doing crimes with style' marathon. Guy Ritchie would be proud."
- "Someone's got a thing for slow-burn existential dread. Very A24 of you."
- "The 'I peaked in the 90s and I'm not sorry' starter pack. Respect."

DO NOT:
- Be generic ("you like action movies")
- Spoil any plots
- Be longer than 2 sentences`;

const SHOW_MORE_PROMPT = `Based on this detected viewing pattern:

Pattern: {pattern}

Movies explored: {movieList}

Suggest 10 movies that perfectly match this vibe. Focus on:
- Similar tone, style, and mood
- Same era or film movement if relevant
- Hidden gems the user might not know
- Mix of classics and recent films

Return ONLY a JSON array of objects with this format (no markdown, no explanation):
[{"title": "Movie Title", "year": "YYYY"}, ...]`;

const searchTMDB = async (title: string, year?: string): Promise<any | null> => {
  try {
    const url = new URL('https://api.themoviedb.org/3/search/movie');
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

export function ExplorationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [clickedMovies, setClickedMovies] = useState<ExploredMovie[]>([]);
  const [patternInsight, setPatternInsight] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSavingVibe, setIsSavingVibe] = useState(false);
  const [showMoreResults, setShowMoreResults] = useState<any[]>([]);
  const [vibeSaved, setVibeSaved] = useState(false);
  
  // Track which movie count we've already analyzed to prevent re-analysis
  const lastAnalyzedCountRef = useRef(0);

  const analyzePattern = useCallback(async (movies: ExploredMovie[]) => {
    if (movies.length < 3) return;
    
    // Only analyze if we have new movies since last analysis
    if (movies.length <= lastAnalyzedCountRef.current) return;
    lastAnalyzedCountRef.current = movies.length;

    setIsAnalyzing(true);
    try {
      const movieList = movies
        .map((m) => `- ${m.title} (${m.year}) [${m.genres.join(', ')}]`)
        .join('\n');

      const prompt = PATTERN_PROMPT.replace('{movieList}', movieList);
      const insight = await callGemini(prompt);
      
      if (insight) {
        setPatternInsight(insight.trim());
      }
    } catch (error) {
      console.error('Pattern analysis failed:', error);
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const addMovie = useCallback((movie: ExploredMovie) => {
    setClickedMovies((prev) => {
      // Don't add duplicates
      if (prev.some((m) => m.id === movie.id && m.mediaType === movie.mediaType)) {
        return prev;
      }
      
      const updated = [...prev, movie];
      
      // Trigger pattern analysis at 3+ movies (only if new)
      if (updated.length >= 3 && updated.length > lastAnalyzedCountRef.current) {
        analyzePattern(updated);
      }
      
      return updated;
    });
  }, [analyzePattern]);

  const resetSession = useCallback(() => {
    setClickedMovies([]);
    setPatternInsight(null);
    setShowMoreResults([]);
  }, []);

  const showMoreMovies = useCallback(async () => {
    if (!patternInsight || clickedMovies.length < 3) return [];

    setIsLoadingMore(true);
    try {
      const movieList = clickedMovies.map((m) => m.title).join(', ');
      const prompt = SHOW_MORE_PROMPT
        .replace('{pattern}', patternInsight)
        .replace('{movieList}', movieList);

      const response = await callGemini(prompt);
      if (!response) return [];

      // Parse JSON response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [];

      const suggestions = JSON.parse(jsonMatch[0]);
      
      // Fetch TMDB details for each suggestion
      const detailedResults = await Promise.all(
        suggestions.slice(0, 10).map(async (s: { title: string; year: string }) => {
          const tmdb = await searchTMDB(s.title, s.year);
          if (tmdb) {
            return {
              id: tmdb.id,
              title: tmdb.title,
              year: tmdb.release_date?.slice(0, 4) || s.year,
              posterPath: tmdb.poster_path,
              backdropPath: tmdb.backdrop_path,
              overview: tmdb.overview,
              voteAverage: tmdb.vote_average,
            };
          }
          return null;
        })
      );

      const validResults = detailedResults.filter(Boolean);
      setShowMoreResults(validResults);
      return validResults;
    } catch (error) {
      console.error('Show more failed:', error);
      return [];
    } finally {
      setIsLoadingMore(false);
    }
  }, [patternInsight, clickedMovies]);

  const saveVibe = useCallback(async (): Promise<boolean> => {
    if (!user || !patternInsight || clickedMovies.length < 3) return false;

    setIsSavingVibe(true);
    try {
      const vibesRef = collection(db, 'users', user.uid, 'saved_vibes');
      await addDoc(vibesRef, {
        pattern: patternInsight,
        movies: clickedMovies.map((m) => ({
          id: m.id,
          title: m.title,
          year: m.year,
          posterPath: m.posterPath,
          mediaType: m.mediaType,
        })),
        createdAt: serverTimestamp(),
      });
      setVibeSaved(true);
      return true;
    } catch (error) {
      console.error('Failed to save vibe:', error);
      return false;
    } finally {
      setIsSavingVibe(false);
    }
  }, [user, patternInsight, clickedMovies]);

  return (
    <ExplorationContext.Provider
      value={{
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
      }}
    >
      {children}
    </ExplorationContext.Provider>
  );
}

export function useExploration() {
  const context = useContext(ExplorationContext);
  if (!context) {
    throw new Error('useExploration must be used within an ExplorationProvider');
  }
  return context;
}

