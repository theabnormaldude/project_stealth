import { useState, useCallback } from 'react';
import { collection, addDoc, serverTimestamp, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';

type IMDBMovie = {
  title: string;
  year: string;
  imdbId: string;
  rating?: number; // 1-10 scale for ratings
  dateRated?: string; // ISO date string YYYY-MM-DD (when the user rated/added it)
};

type ImportedMovie = {
  movieId: number;
  title: string;
  year: string | number;
  poster: string;
  backdrop?: string;
  runtime?: string;
  rating: 'up' | 'down' | null;
  imdbRating?: number;
  ratedAt: any;
  importedAt: any;
  source: 'imdb';
};

type WatchlistMovie = {
  movieId: number;
  title: string;
  year: string | number;
  poster: string;
  backdrop?: string;
  runtime?: string;
  addedAt: any;
  source: 'imdb';
};

type CalendarLogEntry = {
  movieId: number;
  title: string;
  year: string | number;
  poster: string;
  backdrop?: string;
  runtimeLabel?: string;
  mediaType: 'movie' | 'tv';
  date: string; // YYYY-MM-DD - the actual date the movie was watched/rated
  rating: 'up' | 'down' | null;
  inviteFriend: boolean;
  source: 'imdb';
  createdAt: any;
};

export type ImportType = 'imdb-ratings' | 'imdb-watchlist' | 'letterboxd' | 'unknown';

const TMDB_API_KEY =
  (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_TMDB_API_KEY) ||
  '087e509f6f93e629488a550f1451bb76';

const TMDB_BASE = 'https://api.themoviedb.org/3';

// CORS proxies - try multiple in case one fails
const CORS_PROXIES = [
  'https://corsproxy.io/?',
  'https://api.codetabs.com/v1/proxy?quest=',
];

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

// Search TMDB by IMDB ID - more reliable than title search
const findTMDBByIMDBId = async (imdbId: string): Promise<any | null> => {
  try {
    const url = `${TMDB_BASE}/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    // Check movie results first, then TV results
    if (data.movie_results?.length > 0) {
      return data.movie_results[0];
    }
    if (data.tv_results?.length > 0) {
      return data.tv_results[0];
    }
    return null;
  } catch (error) {
    console.error('TMDB find by IMDB ID failed:', error);
    return null;
  }
};

const buildImageUrl = (path: string | null | undefined, size: 'w200' | 'w500' | 'w780' = 'w200') => {
  if (!path) return 'https://placehold.co/200x300?text=Movie';
  return `https://image.tmdb.org/t/p/${size}${path}`;
};

// Detect import type from URL
export const detectImportType = (url: string): ImportType => {
  const trimmedUrl = url.trim().toLowerCase();
  
  if (trimmedUrl.includes('letterboxd.com')) {
    return 'letterboxd';
  }
  
  if (trimmedUrl.includes('imdb.com')) {
    if (trimmedUrl.includes('/ratings')) {
      return 'imdb-ratings';
    }
    if (trimmedUrl.includes('/watchlist')) {
      return 'imdb-watchlist';
    }
  }
  
  return 'unknown';
};

// Extract IMDB user ID from URL
const extractIMDBUserId = (url: string): string | null => {
  const match = url.match(/imdb\.com\/user\/(ur\d+)/i);
  return match ? match[1] : null;
};

// Clean up movie title - remove list numbers, extra whitespace, etc.
const cleanTitle = (title: string): string => {
  return title
    .replace(/^\d+\.\s*/, '') // Remove leading "1. ", "2. ", etc.
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
};

// Parse IMDB HTML to extract movies - handles multiple page structures
const parseIMDBPage = (html: string, _isWatchlist: boolean): IMDBMovie[] => {
  const movies: IMDBMovie[] = [];
  const processedIds = new Set<string>();
  
  // Method 1: Look for JSON-LD structured data (most reliable)
  const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
  if (jsonLdMatch) {
    for (const match of jsonLdMatch) {
      try {
        const jsonContent = match.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');
        const data = JSON.parse(jsonContent);
        if (data['@type'] === 'ItemList' && data.itemListElement) {
          for (const item of data.itemListElement) {
            const url = item.url || '';
            const imdbIdMatch = url.match(/\/title\/(tt\d+)/);
            if (imdbIdMatch && item.item?.name) {
              const imdbId = imdbIdMatch[1];
              if (!processedIds.has(imdbId)) {
                processedIds.add(imdbId);
                movies.push({
                  title: cleanTitle(item.item.name),
                  year: '',
                  imdbId,
                  rating: undefined,
                });
              }
            }
          }
        }
      } catch (e) {
        // Continue to next method
      }
    }
  }
  
  if (movies.length > 0) {
    console.log(`Found ${movies.length} movies via JSON-LD`);
    return movies;
  }
  
  // Method 2: Parse the lister-item structure (older IMDB layout)
  const listerItemPattern = /class="lister-item[^"]*"[\s\S]*?href="\/title\/(tt\d+)[^"]*"[^>]*>([^<]+)<[\s\S]*?class="lister-item-year[^"]*"[^>]*>\((\d{4})\)/gi;
  let match;
  
  while ((match = listerItemPattern.exec(html)) !== null) {
    const imdbId = match[1];
    const title = cleanTitle(match[2]);
    const year = match[3];
    
    if (!processedIds.has(imdbId) && title.length > 1) {
      processedIds.add(imdbId);
      movies.push({ title, year, imdbId, rating: undefined });
    }
  }
  
  if (movies.length > 0) {
    console.log(`Found ${movies.length} movies via lister-item pattern`);
    return movies;
  }
  
  // Method 3: Look for ipc-metadata-list items (newer IMDB layout)
  const ipcPattern = /href="\/title\/(tt\d+)\/[^"]*"[^>]*>[\s\S]*?<h3[^>]*>([^<]+)<\/h3>/gi;
  
  while ((match = ipcPattern.exec(html)) !== null) {
    const imdbId = match[1];
    const title = cleanTitle(match[2]);
    
    if (!processedIds.has(imdbId) && title.length > 1) {
      processedIds.add(imdbId);
      
      // Try to find year nearby
      const contextEnd = Math.min(html.length, match.index + 500);
      const context = html.slice(match.index, contextEnd);
      const yearMatch = context.match(/(\d{4})/);
      
      movies.push({
        title,
        year: yearMatch ? yearMatch[1] : '',
        imdbId,
        rating: undefined,
      });
    }
  }
  
  if (movies.length > 0) {
    console.log(`Found ${movies.length} movies via ipc pattern`);
    return movies;
  }
  
  // Method 4: Generic title link extraction (fallback)
  const genericPattern = /href="\/title\/(tt\d+)[^"]*"[^>]*>([^<]{2,80})</gi;
  
  while ((match = genericPattern.exec(html)) !== null) {
    const imdbId = match[1];
    let title = cleanTitle(match[2]);
    
    // Skip navigation/UI elements
    if (title.toLowerCase().includes('imdb') || 
        title.toLowerCase().includes('menu') ||
        title.toLowerCase().includes('sign') ||
        title.toLowerCase().includes('watch') ||
        title.length < 2) {
      continue;
    }
    
    if (!processedIds.has(imdbId)) {
      processedIds.add(imdbId);
      
      // Try to find year in surrounding context
      const contextStart = Math.max(0, match.index - 100);
      const contextEnd = Math.min(html.length, match.index + 300);
      const context = html.slice(contextStart, contextEnd);
      const yearMatch = context.match(/\((\d{4})\)/);
      
      movies.push({
        title,
        year: yearMatch ? yearMatch[1] : '',
        imdbId,
        rating: undefined,
      });
    }
  }
  
  console.log(`Found ${movies.length} movies via generic pattern`);
  return movies;
};

// Alternative: Try to use IMDB's export API endpoint
const fetchIMDBExport = async (userId: string, isWatchlist: boolean): Promise<IMDBMovie[]> => {
  // IMDB has an export endpoint that returns CSV
  const exportUrl = isWatchlist
    ? `https://www.imdb.com/list/export?list_id=watchlist&author_id=${userId}`
    : `https://www.imdb.com/user/${userId}/ratings/export`;
  
  for (const proxy of CORS_PROXIES) {
    try {
      const proxyUrl = `${proxy}${encodeURIComponent(exportUrl)}`;
      const response = await fetch(proxyUrl);
      
      if (response.ok) {
        const csvText = await response.text();
        
        // Check if it's actually CSV data
        if (csvText.includes('Const,') || csvText.includes('Position,') || csvText.includes('Title,')) {
          return parseIMDBCSV(csvText, isWatchlist);
        }
      }
    } catch (error) {
      console.warn(`Export fetch failed with ${proxy}:`, error);
    }
  }
  
  return [];
};

// Parse IMDB CSV export format
const parseIMDBCSV = (csv: string, _isWatchlist: boolean): IMDBMovie[] => {
  const movies: IMDBMovie[] = [];
  const lines = csv.split('\n');
  
  if (lines.length < 2) return movies;
  
  // Parse header to find column indices
  const header = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());
  const constIdx = header.findIndex(h => h === 'const' || h === 'imdb id');
  const titleIdx = header.findIndex(h => h === 'title' || h === 'name');
  const yearIdx = header.findIndex(h => h === 'year' || h === 'release date');
  const ratingIdx = header.findIndex(h => h === 'your rating' || h === 'rating');
  // Date Rated column - this is when the user rated/watched the movie
  const dateRatedIdx = header.findIndex(h => h === 'date rated' || h === 'created' || h === 'date added');
  
  console.log('CSV Headers:', header);
  console.log('Column indices:', { constIdx, titleIdx, yearIdx, ratingIdx, dateRatedIdx });
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Parse CSV line (handling quoted values)
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    
    const imdbId = constIdx >= 0 ? values[constIdx]?.replace(/"/g, '') : '';
    const title = titleIdx >= 0 ? values[titleIdx]?.replace(/"/g, '') : '';
    const year = yearIdx >= 0 ? values[yearIdx]?.replace(/"/g, '').slice(0, 4) : '';
    const ratingStr = ratingIdx >= 0 ? values[ratingIdx]?.replace(/"/g, '') : '';
    const rating = ratingStr ? parseInt(ratingStr, 10) : undefined;
    
    // Parse date rated - IMDB uses format like "2024-11-15" or "15 Nov 2024"
    let dateRated: string | undefined;
    if (dateRatedIdx >= 0) {
      const dateStr = values[dateRatedIdx]?.replace(/"/g, '').trim();
      if (dateStr) {
        // Try to parse various date formats
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
          dateRated = parsed.toISOString().split('T')[0]; // YYYY-MM-DD
        }
      }
    }
    
    if (imdbId && title && imdbId.startsWith('tt')) {
      movies.push({ 
        title, 
        year, 
        imdbId, 
        rating: isNaN(rating!) ? undefined : rating,
        dateRated,
      });
    }
  }
  
  console.log(`Parsed ${movies.length} movies from CSV`);
  return movies;
};

async function fetchWithProxy(url: string): Promise<string | null> {
  for (const proxy of CORS_PROXIES) {
    try {
      const proxyUrl = `${proxy}${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl);
      if (response.ok) {
        return await response.text();
      }
    } catch (error) {
      console.warn(`Proxy ${proxy} failed:`, error);
    }
  }
  return null;
}

export function useIMDBImport() {
  const { user } = useAuth();
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState(0);

  // Import from CSV file (most reliable method)
  const importFromCSV = useCallback(async (csvContent: string, type: 'imdb-ratings' | 'imdb-watchlist'): Promise<number> => {
    if (!user) {
      setError('Not authenticated');
      return 0;
    }

    setIsImporting(true);
    setError(null);
    setProgress({ current: 0, total: 0 });
    setImportedCount(0);

    const isWatchlist = type === 'imdb-watchlist';

    try {
      const movies = parseIMDBCSV(csvContent, isWatchlist);

      if (movies.length === 0) {
        setError('No movies found in CSV. Make sure it\'s a valid IMDB export file.');
        return 0;
      }

      console.log(`Found ${movies.length} movies from CSV`);
      setProgress({ current: 0, total: movies.length });

      // Get existing entries to avoid duplicates
      const targetCollection = isWatchlist ? 'watchlist' : 'watched_recommendations';
      const targetRef = collection(db, 'users', user.uid, targetCollection);
      
      let existingTitles = new Set<string>();
      try {
        const existingDocs = await getDocs(targetRef);
        existingTitles = new Set(
          existingDocs.docs
            .filter((doc) => doc.data().source === 'imdb')
            .map((doc) => doc.data().title?.toLowerCase())
        );
      } catch (queryErr) {
        console.warn('Could not check for duplicates:', queryErr);
      }

      // For ratings, also check calendar to avoid duplicate entries
      const calendarRef = !isWatchlist ? collection(db, 'users', user.uid, 'calendar_logs') : null;
      let existingCalendarEntries = new Set<string>();
      
      if (calendarRef) {
        try {
          const calendarDocs = await getDocs(calendarRef);
          // Create set of "title|date" to check for duplicates
          existingCalendarEntries = new Set(
            calendarDocs.docs.map((doc) => {
              const data = doc.data();
              return `${data.title?.toLowerCase()}|${data.date}`;
            })
          );
        } catch (queryErr) {
          console.warn('Could not check calendar duplicates:', queryErr);
        }
      }

      let imported = 0;
      let calendarAdded = 0;
      let skipped = 0;
      let failed = 0;

      for (let i = 0; i < movies.length; i++) {
        const movie = movies[i];
        setProgress({ current: i + 1, total: movies.length });

        if (existingTitles.has(movie.title.toLowerCase())) {
          skipped++;
          continue;
        }

        try {
          // Try to find on TMDB - first by IMDB ID (most reliable), then by title
          let tmdbResult = null;
          
          if (movie.imdbId) {
            tmdbResult = await findTMDBByIMDBId(movie.imdbId);
          }
          
          if (!tmdbResult) {
            tmdbResult = await searchTMDB(movie.title, movie.year);
          }

          if (tmdbResult) {
            const movieTitle = tmdbResult.title || tmdbResult.name || movie.title;
            const movieYear = tmdbResult.release_date?.slice(0, 4) || tmdbResult.first_air_date?.slice(0, 4) || movie.year;
            const poster = buildImageUrl(tmdbResult.poster_path);
            const backdrop = buildImageUrl(tmdbResult.backdrop_path, 'w780');

            if (isWatchlist) {
              const watchlistData: WatchlistMovie = {
                movieId: tmdbResult.id,
                title: movieTitle,
                year: movieYear,
                poster,
                backdrop,
                addedAt: serverTimestamp(),
                source: 'imdb',
              };

              await addDoc(targetRef, watchlistData);
              imported++;
              setImportedCount(imported);
            } else {
              let rating: 'up' | 'down' | null = null;
              if (movie.rating !== undefined) {
                rating = movie.rating >= 6 ? 'up' : 'down';
              }

              const movieData: ImportedMovie = {
                movieId: tmdbResult.id,
                title: movieTitle,
                year: movieYear,
                poster,
                backdrop,
                rating,
                imdbRating: movie.rating,
                ratedAt: serverTimestamp(),
                importedAt: serverTimestamp(),
                source: 'imdb',
              };

              await addDoc(targetRef, movieData);
              imported++;
              setImportedCount(imported);
              
              // Add to calendar ONLY if we have a valid date from the CSV
              // This uses the "Date Rated" column which is when the user rated/watched it
              if (calendarRef && movie.dateRated) {
                const calendarKey = `${movieTitle.toLowerCase()}|${movie.dateRated}`;
                
                if (!existingCalendarEntries.has(calendarKey)) {
                  const calendarEntry: CalendarLogEntry = {
                    movieId: tmdbResult.id,
                    title: movieTitle,
                    year: movieYear,
                    poster,
                    backdrop,
                    runtimeLabel: 'Feature',
                    mediaType: 'movie',
                    date: movie.dateRated,
                    rating,
                    inviteFriend: false,
                    source: 'imdb',
                    createdAt: Timestamp.fromDate(new Date(movie.dateRated)),
                  };

                  await addDoc(calendarRef, calendarEntry);
                  calendarAdded++;
                  existingCalendarEntries.add(calendarKey);
                }
              }
            }
          } else {
            console.warn(`Could not find "${movie.title}" (${movie.year}) on TMDB`);
            failed++;
          }
        } catch (movieErr) {
          console.error(`Error importing "${movie.title}":`, movieErr);
          failed++;
        }

        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      console.log(`CSV import complete: ${imported} to watched, ${calendarAdded} to calendar, ${skipped} skipped, ${failed} failed`);
      return imported;
    } catch (err) {
      console.error('CSV import failed:', err);
      setError('Import failed. Please try again.');
      return 0;
    } finally {
      setIsImporting(false);
    }
  }, [user]);

  const importFromIMDB = useCallback(async (url: string, type: 'imdb-ratings' | 'imdb-watchlist'): Promise<number> => {
    if (!user) {
      setError('Not authenticated');
      return 0;
    }

    const userId = extractIMDBUserId(url);
    if (!userId) {
      setError('Invalid IMDB URL. Please use a URL like: imdb.com/user/ur123456/ratings/');
      return 0;
    }

    setIsImporting(true);
    setError(null);
    setProgress({ current: 0, total: 0 });
    setImportedCount(0);

    const isWatchlist = type === 'imdb-watchlist';

    try {
      console.log(`Fetching IMDB ${isWatchlist ? 'watchlist' : 'ratings'} for user ${userId}`);

      let movies: IMDBMovie[] = [];

      // Method 1: Try the CSV export endpoint first (most reliable)
      console.log('Trying CSV export endpoint...');
      movies = await fetchIMDBExport(userId, isWatchlist);
      
      // Method 2: If CSV export failed, try scraping the HTML page
      // Note: IMDB pages are JavaScript-rendered, so we can only get what's in the initial HTML
      // The pagination doesn't work via URL parameters anymore
      if (movies.length === 0) {
        console.log('CSV export failed, trying HTML scraping...');
        
        const imdbUrl = isWatchlist
          ? `https://www.imdb.com/user/${userId}/watchlist/`
          : `https://www.imdb.com/user/${userId}/ratings/`;

        const html = await fetchWithProxy(imdbUrl);
        
        if (html) {
          console.log(`Got HTML response (${html.length} chars)`);
          movies = parseIMDBPage(html, isWatchlist);
          
          // IMDB only loads ~25 items initially, the rest require JavaScript
          // If we got some movies but less than expected, warn the user
          if (movies.length > 0 && movies.length < 50) {
            console.log(`Note: IMDB only loaded ${movies.length} movies. For full import, use CSV export.`);
          }
        }
      }

      if (movies.length === 0) {
        setError('No movies found. IMDB pages require JavaScript. Please use CSV upload instead.');
        return 0;
      }
      
      // Warn if we likely didn't get all movies
      if (movies.length === 25) {
        console.warn('Only got 25 movies - IMDB limits initial page load. Use CSV export for full list.');
      }

      console.log(`Found ${movies.length} movies from IMDB`);
      setProgress({ current: 0, total: movies.length });

      // Get existing entries to avoid duplicates
      const targetCollection = isWatchlist ? 'watchlist' : 'watched_recommendations';
      const targetRef = collection(db, 'users', user.uid, targetCollection);
      
      let existingTitles = new Set<string>();
      try {
        const existingDocs = await getDocs(targetRef);
        existingTitles = new Set(
          existingDocs.docs
            .filter((doc) => doc.data().source === 'imdb')
            .map((doc) => doc.data().title?.toLowerCase())
        );
      } catch (queryErr) {
        console.warn('Could not check for duplicates:', queryErr);
      }

      let imported = 0;
      let skipped = 0;
      let failed = 0;

      for (let i = 0; i < movies.length; i++) {
        const movie = movies[i];
        setProgress({ current: i + 1, total: movies.length });

        // Skip if already imported
        if (existingTitles.has(movie.title.toLowerCase())) {
          skipped++;
          continue;
        }

        try {
          // Try to find on TMDB - first by IMDB ID (most reliable), then by title
          let tmdbResult = null;
          
          if (movie.imdbId) {
            tmdbResult = await findTMDBByIMDBId(movie.imdbId);
          }
          
          if (!tmdbResult) {
            tmdbResult = await searchTMDB(movie.title, movie.year);
          }

          if (tmdbResult) {
            const movieTitle = tmdbResult.title || tmdbResult.name || movie.title;
            const movieYear = tmdbResult.release_date?.slice(0, 4) || tmdbResult.first_air_date?.slice(0, 4) || movie.year;
            const poster = buildImageUrl(tmdbResult.poster_path);
            const backdrop = buildImageUrl(tmdbResult.backdrop_path, 'w780');

            if (isWatchlist) {
              // Add to watchlist
              const watchlistData: WatchlistMovie = {
                movieId: tmdbResult.id,
                title: movieTitle,
                year: movieYear,
                poster,
                backdrop,
                addedAt: serverTimestamp(),
                source: 'imdb',
              };

              await addDoc(targetRef, watchlistData);
              imported++;
              setImportedCount(imported);
            } else {
              // Add to watched recommendations
              // Convert IMDB 10-point scale: 6+ = up, below 6 = down
              let rating: 'up' | 'down' | null = null;
              if (movie.rating !== undefined) {
                rating = movie.rating >= 6 ? 'up' : 'down';
              }

              const movieData: ImportedMovie = {
                movieId: tmdbResult.id,
                title: movieTitle,
                year: movieYear,
                poster,
                backdrop,
                rating,
                imdbRating: movie.rating,
                ratedAt: serverTimestamp(),
                importedAt: serverTimestamp(),
                source: 'imdb',
              };

              await addDoc(targetRef, movieData);
              imported++;
              setImportedCount(imported);
              
              // Note: We intentionally do NOT add to calendar here
              // IMDB ratings don't have watch dates, so they only go to Watched section
            }
          } else {
            console.warn(`Could not find "${movie.title}" (${movie.year}) on TMDB`);
            failed++;
          }
        } catch (movieErr) {
          console.error(`Error importing "${movie.title}":`, movieErr);
          failed++;
        }

        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      console.log(`IMDB import complete: ${imported} imported, ${skipped} skipped, ${failed} failed`);
      return imported;
    } catch (err) {
      console.error('IMDB import failed:', err);
      setError('Import failed. Please try again.');
      return 0;
    } finally {
      setIsImporting(false);
    }
  }, [user]);

  return {
    importFromIMDB,
    importFromCSV,
    isImporting,
    progress,
    error,
    importedCount,
    detectImportType,
  };
}

