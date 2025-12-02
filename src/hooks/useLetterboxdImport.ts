import { useState, useCallback } from 'react';
import { collection, addDoc, serverTimestamp, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';

type LetterboxdFilm = {
  title: string;
  year: string;
  letterboxdUrl: string;
  watchedDate?: string; // ISO date string YYYY-MM-DD
  rating?: number;
};

type ImportedMovie = {
  movieId: number;
  title: string;
  year: string | number;
  poster: string;
  backdrop?: string;
  runtime?: string;
  rating: 'up' | 'down' | null;
  letterboxdRating?: number;
  ratedAt: any;
  importedAt: any;
  source: 'letterboxd';
};

type CalendarLogEntry = {
  movieId: number;
  title: string;
  year: string | number;
  poster: string;
  backdrop?: string;
  runtimeLabel?: string;
  mediaType: 'movie' | 'tv';
  date: string; // YYYY-MM-DD
  rating: 'up' | 'down' | null;
  inviteFriend: boolean;
  accentStart?: string;
  accentEnd?: string;
  accentText?: string;
  source: 'letterboxd';
  createdAt: any;
};

const TMDB_API_KEY =
  (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_TMDB_API_KEY) ||
  '087e509f6f93e629488a550f1451bb76';

const TMDB_BASE = 'https://api.themoviedb.org/3';

// CORS proxy for fetching Letterboxd RSS (needed in browser)
// Using corsproxy.io as it's more reliable
const CORS_PROXY = 'https://corsproxy.io/?';

const searchTMDB = async (title: string, year?: string): Promise<any | null> => {
  try {
    const url = new URL(`${TMDB_BASE}/search/movie`);
    url.searchParams.set('api_key', TMDB_API_KEY);
    url.searchParams.set('query', title);
    if (year) url.searchParams.set('year', year);
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

const buildImageUrl = (path: string | null | undefined, size: 'w200' | 'w500' | 'w780' = 'w200') => {
  if (!path) return 'https://placehold.co/200x300?text=Movie';
  return `https://image.tmdb.org/t/p/${size}${path}`;
};

const parseLetterboxdRSS = (xmlText: string): LetterboxdFilm[] => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const items = doc.querySelectorAll('item');
  const films: LetterboxdFilm[] = [];

  items.forEach((item) => {
    const title = item.querySelector('title')?.textContent || '';
    const link = item.querySelector('link')?.textContent || '';
    const pubDate = item.querySelector('pubDate')?.textContent || '';
    
    // Parse title format: "Movie Title, Year - ★★★★" or just "Movie Title, Year"
    const titleMatch = title.match(/^(.+),\s*(\d{4})\s*(?:-\s*(.+))?$/);
    
    if (titleMatch) {
      const filmTitle = titleMatch[1].trim();
      const year = titleMatch[2];
      const ratingStars = titleMatch[3]?.trim() || '';
      
      // Convert star rating to number (★ = 1, ½ = 0.5)
      let rating: number | undefined;
      if (ratingStars) {
        const fullStars = (ratingStars.match(/★/g) || []).length;
        const halfStar = ratingStars.includes('½') ? 0.5 : 0;
        rating = fullStars + halfStar;
      }

      films.push({
        title: filmTitle,
        year,
        letterboxdUrl: link,
        watchedDate: pubDate ? new Date(pubDate).toISOString().split('T')[0] : undefined,
        rating,
      });
    }
  });

  return films;
};

export function useLetterboxdImport() {
  const { user } = useAuth();
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState(0);

  const importFromLetterboxd = useCallback(async (username: string): Promise<number> => {
    if (!user) {
      setError('Not authenticated');
      return 0;
    }

    setIsImporting(true);
    setError(null);
    setProgress({ current: 0, total: 0 });
    setImportedCount(0);

    try {
      // Fetch Letterboxd RSS feed
      const rssUrl = `https://letterboxd.com/${username.trim()}/rss/`;
      const proxyUrl = `${CORS_PROXY}${encodeURIComponent(rssUrl)}`;
      
      let response: Response;
      let xmlText: string;
      
      try {
        response = await fetch(proxyUrl);
        if (!response.ok) {
          // Try alternative proxy
          const altProxyUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(rssUrl)}`;
          response = await fetch(altProxyUrl);
        }
        
        if (!response.ok) {
          if (response.status === 404) {
            setError(`User "${username}" not found on Letterboxd`);
          } else {
            setError('Failed to fetch Letterboxd data. Please try again.');
          }
          return 0;
        }
        
        xmlText = await response.text();
      } catch (fetchError) {
        console.error('Fetch error:', fetchError);
        setError('Network error. Please check your connection and try again.');
        return 0;
      }
      
      // Check if it's valid RSS
      if (!xmlText.includes('<rss') && !xmlText.includes('<channel')) {
        setError(`User "${username}" not found or has no public diary`);
        return 0;
      }

      const films = parseLetterboxdRSS(xmlText);
      
      if (films.length === 0) {
        setError('No films found in diary. Make sure the profile is public.');
        return 0;
      }

      console.log(`Found ${films.length} films in Letterboxd diary`);
      setProgress({ current: 0, total: films.length });

      // Get ALL existing watched recommendations to avoid duplicates
      const watchedRef = collection(db, 'users', user.uid, 'watched_recommendations');
      let existingTitles = new Set<string>();
      
      try {
        const existingDocs = await getDocs(watchedRef);
        existingTitles = new Set(
          existingDocs.docs
            .filter((doc) => doc.data().source === 'letterboxd')
            .map((doc) => doc.data().title?.toLowerCase())
        );
        console.log(`Found ${existingTitles.size} existing Letterboxd imports`);
      } catch (queryErr) {
        console.warn('Could not check for duplicates:', queryErr);
        // Continue anyway - might create some duplicates but won't fail
      }

      // Also check existing calendar logs to avoid duplicate calendar entries
      const calendarRef = collection(db, 'users', user.uid, 'calendar_logs');
      let existingCalendarDates = new Set<string>();
      
      try {
        const calendarDocs = await getDocs(calendarRef);
        // Create set of "title|date" to check for duplicates
        existingCalendarDates = new Set(
          calendarDocs.docs.map((doc) => {
            const data = doc.data();
            return `${data.title?.toLowerCase()}|${data.date}`;
          })
        );
        console.log(`Found ${calendarDocs.size} existing calendar entries`);
      } catch (queryErr) {
        console.warn('Could not check calendar duplicates:', queryErr);
      }

      let imported = 0;
      let calendarAdded = 0;
      let skipped = 0;
      let failed = 0;

      // Process films
      for (let i = 0; i < films.length; i++) {
        const film = films[i];
        setProgress({ current: i + 1, total: films.length });

        // Skip watched list if already imported
        const alreadyInWatched = existingTitles.has(film.title.toLowerCase());

        try {
          // Search TMDB for the movie
          const tmdbResult = await searchTMDB(film.title, film.year);
          
          if (tmdbResult) {
            // Convert Letterboxd rating (0.5-5) to up/down
            // 3+ stars = up, below 3 = down, no rating = null
            let rating: 'up' | 'down' | null = null;
            if (film.rating !== undefined) {
              rating = film.rating >= 3 ? 'up' : 'down';
            }

            const movieTitle = tmdbResult.title || film.title;
            const movieYear = tmdbResult.release_date?.slice(0, 4) || film.year;
            const poster = buildImageUrl(tmdbResult.poster_path);
            const backdrop = buildImageUrl(tmdbResult.backdrop_path, 'w780');

            // Add to watched recommendations if not already there
            if (!alreadyInWatched) {
              const movieData: ImportedMovie = {
                movieId: tmdbResult.id,
                title: movieTitle,
                year: movieYear,
                poster,
                backdrop,
                rating,
                letterboxdRating: film.rating,
                ratedAt: serverTimestamp(),
                importedAt: serverTimestamp(),
                source: 'letterboxd',
              };

              await addDoc(watchedRef, movieData);
              imported++;
              setImportedCount(imported);
            } else {
              skipped++;
            }

            // Add to calendar if we have a watched date and it's not already there
            if (film.watchedDate) {
              const calendarKey = `${movieTitle.toLowerCase()}|${film.watchedDate}`;
              
              if (!existingCalendarDates.has(calendarKey)) {
                const calendarEntry: CalendarLogEntry = {
                  movieId: tmdbResult.id,
                  title: movieTitle,
                  year: movieYear,
                  poster,
                  backdrop,
                  runtimeLabel: 'Feature',
                  mediaType: 'movie',
                  date: film.watchedDate,
                  rating,
                  inviteFriend: false,
                  source: 'letterboxd',
                  createdAt: Timestamp.fromDate(new Date(film.watchedDate)),
                };

                await addDoc(calendarRef, calendarEntry);
                calendarAdded++;
                // Add to set to prevent duplicates within same import
                existingCalendarDates.add(calendarKey);
              }
            }
          } else {
            console.warn(`Could not find "${film.title}" (${film.year}) on TMDB`);
            failed++;
          }
        } catch (filmErr) {
          console.error(`Error importing "${film.title}":`, filmErr);
          failed++;
        }

        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      console.log(`Import complete: ${imported} to watched, ${calendarAdded} to calendar, ${skipped} skipped, ${failed} failed`);

      return imported;
    } catch (err) {
      console.error('Letterboxd import failed:', err);
      setError('Import failed. Please try again.');
      return 0;
    } finally {
      setIsImporting(false);
    }
  }, [user]);

  return {
    importFromLetterboxd,
    isImporting,
    progress,
    error,
    importedCount,
  };
}

