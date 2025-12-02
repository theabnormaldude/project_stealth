import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Users,
  Plus,
  ChevronLeft,
  ChevronRight,
  Check,
  Trash2,
  Edit2,
  Ticket,
  Sparkles,
  Loader2,
  Repeat,
  ThumbsUp,
  ThumbsDown,
  User as UserIcon,
} from 'lucide-react';
import { useCalendarLogs, type CalendarEvent } from '../hooks/useCalendarLogs';
import { useUserProfile } from '../hooks/useUserProfile';
import { logMovieAdded } from '../lib/analytics';
import RecommendationCard from '../components/RecommendationCard';
import ProfileDropdown from '../components/ProfileDropdown';
import type { RecommendationResult } from '../hooks/useRecommendation';

type RatingValue = 'up' | 'down' | null;

type Movie = {
  id: number;
  title: string;
  year: number | string;
  runtime: string;
  poster: string;
  backdrop?: string;
  mediaType?: 'movie' | 'tv';
  popularity?: number;
  accentStart?: string;
  accentEnd?: string;
  accentText?: string;
};

declare const __gemini_api_key: string | undefined;
declare const __tmdb_api_key: string | undefined;

const TRENDING_CACHE_KEY = 'movielove_trending_cache_v1';
const TRENDING_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// --- Gemini API Setup ---
const DEFAULT_GEMINI_KEY = 'AIzaSyBV_BWOe45qANJvA9Ajie9kb07GziJNV8I';
const GEMINI_API_KEY =
  (typeof __gemini_api_key !== 'undefined' && __gemini_api_key) ||
  (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_GEMINI_API_KEY) ||
  DEFAULT_GEMINI_KEY;
const TMDB_API_KEY =
  (typeof __tmdb_api_key !== 'undefined' && __tmdb_api_key) ||
  (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_TMDB_API_KEY) ||
  '087e509f6f93e629488a550f1451bb76';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_POSTER_PLACEHOLDER = 'https://placehold.co/200x300?text=Movie';
const TMDB_BACKDROP_PLACEHOLDER = 'https://placehold.co/600x400?text=Backdrop';

type TrendingCachePayload = {
  timestamp: number;
  items: Movie[];
};

type AccentColors = {
  start: string;
  end: string;
  text: string;
};

const buildImageUrl = (path: string | null | undefined, size: 'w200' | 'w500' | 'w780' = 'w200') => {
  if (!path) {
    return size === 'w200' ? TMDB_POSTER_PLACEHOLDER : TMDB_BACKDROP_PLACEHOLDER;
  }
  return `https://image.tmdb.org/t/p/${size}${path}`;
};

const rgbToHsl = (r: number, g: number, b: number): [number, number, number] => {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return [h * 360, s, l];
};

const hslToHex = (h: number, s: number, l: number): string => {
  const _h = ((h % 360) + 360) % 360;
  const _s = Math.min(1, Math.max(0, s / 100));
  const _l = Math.min(1, Math.max(0, l / 100));

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  let r: number;
  let g: number;
  let b: number;

  if (_s === 0) {
    r = g = b = _l;
  } else {
    const q = _l < 0.5 ? _l * (1 + _s) : _l + _s - _l * _s;
    const p = 2 * _l - q;
    r = hue2rgb(p, q, _h / 360 + 1 / 3);
    g = hue2rgb(p, q, _h / 360);
    b = hue2rgb(p, q, _h / 360 - 1 / 3);
  }

  const toHex = (value: number) => {
    const hex = Math.round(value * 255).toString(16);
    return hex.length === 1 ? `0${hex}` : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const getTextColorFromRGB = (r: number, g: number, b: number) => {
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#050505' : '#f8fafc';
};

const shiftLightness = (h: number, s: number, l: number, delta: number) => {
  return hslToHex(h, s * 100, Math.min(100, Math.max(0, l * 100 + delta)));
};

const DEFAULT_ACCENT: AccentColors = {
  start: '#201c3a',
  end: '#0d1531',
  text: '#f8fafc',
};

const generateFallbackAccent = (seed: string): AccentColors => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash % 360);
  const start = hslToHex(h, 85, 65);
  const end = hslToHex((h + 40) % 360, 90, 35);
  
  return { start, end, text: '#f8fafc' };
};

const fetchLLMColors = async (movieTitle: string, year?: string | number): Promise<AccentColors | null> => {
  const movieLabel = year ? `${movieTitle} (${year})` : movieTitle;
  console.log(`[fetchLLMColors] Starting for: "${movieLabel}"`);
  
  if (!GEMINI_API_KEY) {
    console.warn('[fetchLLMColors] No GEMINI_API_KEY found');
    return null;
  }

  const prompt = `Reference the official theatrical release poster for the movie "${movieLabel}".

Identify the two most dominant, iconic colors specifically from that poster's color grading.
- Do not analyze the general movie scenes; focus strictly on the poster art.
- Capture the specific hue and saturation used in the marketing materials (e.g., if the poster uses a distinct neon gradient or a monochromatic blue filter, extract those exact shades).

Return ONLY a JSON object with this exact format (no markdown, no backticks):
{"start": "#HEX1", "end": "#HEX2", "text": "#HEX3"}
- "start": The primary dominant color from the poster (e.g., the main background wash).
- "end": The secondary accent color from the poster that creates the iconic gradient or contrast.
- "text": A legible text color (strictly #f8fafc for dark backgrounds or #050505 for light backgrounds) that ensures high readability on top of these colors.`;

  try {
    console.log(`[fetchLLMColors] Calling Gemini API...`);
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      },
    );

    if (!response.ok) {
      console.error(`[fetchLLMColors] API Error: ${response.status} ${response.statusText}`);
      const errText = await response.text();
      console.error(`[fetchLLMColors] Error details:`, errText);
      throw new Error('Gemini API failed');
    }

    const data = await response.json();
    console.log('[fetchLLMColors] Raw API Response:', data);
    
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log('[fetchLLMColors] Extracted text:', text);
    
    if (!text) return null;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log('[fetchLLMColors] Parsed JSON:', parsed);
      if (parsed.start && parsed.end) {
        return {
            start: parsed.start,
            end: parsed.end,
            text: parsed.text || '#f8fafc'
        };
      }
    } else {
      console.warn('[fetchLLMColors] No JSON found in response');
    }
    return null;
  } catch (error) {
    console.warn('[fetchLLMColors] Failed:', error);
    return null;
  }
};

const extractAccentFromImage = async (imageUrl?: string | null): Promise<AccentColors> => {
  if (!imageUrl || typeof window === 'undefined') {
    return DEFAULT_ACCENT;
  }

  const fallback = generateFallbackAccent(imageUrl);

  const samplePixel = (data: Uint8ClampedArray, width: number, x: number, y: number) => {
    const idx = (y * width + x) * 4;
    const alpha = data[idx + 3];
    if (alpha < 180) return null;
    return {
      r: data[idx],
      g: data[idx + 1],
      b: data[idx + 2],
    };
  };

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = imageUrl;

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const size = 64;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('No context');
        
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);

        const samples: Array<{
          r: number;
          g: number;
          b: number;
          h: number;
          s: number;
          l: number;
          score: number;
        }> = [];
        const step = 4;
        for (let y = 0; y < size; y += step) {
          for (let x = 0; x < size; x += step) {
            const pixel = samplePixel(data, size, x, y);
            if (!pixel) continue;
            const [h, s, l] = rgbToHsl(pixel.r, pixel.g, pixel.b);
            const brightness = Math.max(pixel.r, pixel.g, pixel.b) / 255;
            const density = s;
            const score = brightness * 0.7 + density * 0.3;
            samples.push({
              r: pixel.r,
              g: pixel.g,
              b: pixel.b,
              h,
              s,
              l,
              score,
            });
          }
        }

        if (!samples.length) {
          resolve(fallback);
          return;
        }

        samples.sort((a, b) => b.score - a.score);
        const primary = samples[0];
        let secondary = samples.find((sample) => Math.abs(sample.h - primary.h) > 60);
        if (!secondary) {
          const darker = { ...primary, l: Math.max(0, primary.l - 0.25) };
          secondary = darker;
        }

        const start = shiftLightness(primary.h, primary.s, primary.l, 10);
        const end =
          secondary === primary
            ? shiftLightness(primary.h, primary.s, primary.l, -35)
            : shiftLightness(secondary.h, secondary.s, secondary.l, -15);

        const text = getTextColorFromRGB(primary.r, primary.g, primary.b);

        resolve({ start, end, text });
      } catch (error) {
        console.warn('Accent extraction failed, using fallback', error);
        resolve(fallback);
      }
    };

    img.onerror = () => {
      console.warn('Image load failed, using fallback');
      resolve(fallback);
    };
  });
};


const normalizeTmdbResult = (item: any): Movie => {
  const mediaType: 'movie' | 'tv' = item.media_type === 'tv' || item.first_air_date ? 'tv' : 'movie';
  const title = item.title || item.name || 'Untitled';
  const yearSource = item.release_date || item.first_air_date;
  const year = yearSource ? yearSource.slice(0, 4) : '----';
  const runtime = mediaType === 'tv' ? 'Series' : 'Feature';

  return {
    id: item.id,
    title,
    year,
    runtime,
    poster: buildImageUrl(item.poster_path),
    backdrop: buildImageUrl(item.backdrop_path, 'w780'),
    mediaType,
    popularity: item.popularity ?? 0,
  };
};

const formatRuntime = (minutes?: number | null): string => {
  if (!minutes || minutes <= 0) return 'Feature';
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
};

const readTrendingCache = (): TrendingCachePayload | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(TRENDING_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.timestamp || !parsed?.items) return null;
    if (Date.now() - parsed.timestamp > TRENDING_CACHE_TTL_MS) return null;
    return parsed as TrendingCachePayload;
  } catch (error) {
    console.warn('Failed to read trending cache', error);
    return null;
  }
};

const writeTrendingCache = (movies: Movie[]) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      TRENDING_CACHE_KEY,
      JSON.stringify({
        timestamp: Date.now(),
        items: movies,
      }),
    );
  } catch (error) {
    console.warn('Failed to write trending cache', error);
  }
};

const normalizeDetailResult = (data: any, mediaType: 'movie' | 'tv'): Movie => {
  const title = data?.title || data?.name || 'Untitled';
  const yearSource = data?.release_date || data?.first_air_date;
  const year = yearSource ? yearSource.slice(0, 4) : '----';
  return {
    id: data?.id,
    title,
    year,
    runtime: mediaType === 'movie' ? formatRuntime(data?.runtime) : 'Series',
    poster: buildImageUrl(data?.poster_path),
    backdrop: buildImageUrl(data?.backdrop_path, 'w780'),
    mediaType,
    popularity: data?.popularity ?? 0,
  };
};

const generateMovieInsight = async (movieTitle: string, otherMovies: Array<{ title: string }>, rating?: RatingValue) => {
  if (!GEMINI_API_KEY) {
    console.warn('Missing Gemini API key');
    return 'Add a Gemini key to unlock Vibe Check.';
  }

  try {
    const historyContext =
      otherMovies && otherMovies.length > 0 ? ` Recently watched: ${otherMovies.map((m) => m.title).join(', ')}.` : '';
    
    const spoilerWarning = `\n\nCRITICAL: ABSOLUTELY NO SPOILERS. Do not reveal ANY plot points, twists, character deaths, endings, or story details. Only reference the movie's vibe, genre, reputation, or director's style. Never describe what happens in the film.`;
    
    let prompt = '';

    if (rating === 'up') {
      prompt = `I watched "${movieTitle}" and I Liked it.${historyContext}\nRoast me sarcastically for having this specific taste. Tell me why I'm basic or pretentious for liking it.\nKeep it extremely brief—strictly under two short sentences.${spoilerWarning}`;
    } else if (rating === 'down') {
      prompt = `I watched "${movieTitle}" and I Hated it.${historyContext}\nRoast the movie mercilessly for wasting my time. Validate my hatred with sarcasm. Focus on the movie's reputation or style, not plot details.\nKeep it extremely brief—strictly under two short sentences.${spoilerWarning}`;
    } else {
      prompt = `I am planning to watch "${movieTitle}".${historyContext}\nGive me an oversimplified, sarcastic take on this movie's reputation or vibe.\nRoast the movie or the fact that I'm watching it.\nKeep it extremely brief—strictly under two short sentences.${spoilerWarning}`;
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      },
    );

    if (!response.ok) throw new Error('Gemini API failed');
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Enjoy the show!';
  } catch (error) {
    console.error('AI Error:', error);
    return 'Ready for a great movie night!';
  }
};

// --- Expanded Mock Movie Data ---
const MOCK_DB: Movie[] = [
  { id: 1, title: 'Interstellar', year: 2014, runtime: '2h 49m', poster: 'https://image.tmdb.org/t/p/w200/gEU2QniL6C8zEfVIuM8nEyh09ny.jpg', backdrop: 'https://image.tmdb.org/t/p/w500/rAiYTfKGqDCRIIqo664sY9XZIvQ.jpg' },
  { id: 2, title: 'The Grand Budapest Hotel', year: 2014, runtime: '1h 39m', poster: 'https://image.tmdb.org/t/p/w200/eWdyYQreja6JGCzqHWXpWHDrrPo.jpg', backdrop: 'https://image.tmdb.org/t/p/w500/nX5XotM9yprCKarRH4BNhmNLh0H.jpg' },
  { id: 3, title: 'Dune: Part Two', year: 2024, runtime: '2h 46m', poster: 'https://image.tmdb.org/t/p/w200/1pdfLvkbY9ohJlCjQH2GBAsJbge.jpg', backdrop: 'https://image.tmdb.org/t/p/w500/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg' },
  { id: 4, title: 'Past Lives', year: 2023, runtime: '1h 45m', poster: 'https://image.tmdb.org/t/p/w200/k3waqVXSnvCZWfJYNtdamTgTtTA.jpg', backdrop: 'https://image.tmdb.org/t/p/w500/x2IqsMlpbOhS8z09dbOQ0aZUXuR.jpg' },
  { id: 5, title: 'Oppenheimer', year: 2023, runtime: '3h 00m', poster: 'https://image.tmdb.org/t/p/w200/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg', backdrop: 'https://image.tmdb.org/t/p/w500/fm6KqXpk3M2HVveHwCrBSSBaO0V.jpg' },
  { id: 6, title: 'Heat', year: 1995, runtime: '2h 50m', poster: 'https://image.tmdb.org/t/p/w200/rrBuGu0PjqhY2LoXi4rd3E2i1F.jpg', backdrop: 'https://image.tmdb.org/t/p/w500/lh5lbisD4o7TwNrfbt8ztPLcRqE.jpg' },
  { id: 7, title: 'Spider-Man: Into the Spider-Verse', year: 2018, runtime: '1h 57m', poster: 'https://image.tmdb.org/t/p/w200/xnopI5Xtky18MPhK40cZAGAOveV.jpg', backdrop: 'https://image.tmdb.org/t/p/w500/qHybrid7k2yUl8ivpgyr5He5x9.jpg' },
  { id: 8, title: 'The Dark Knight', year: 2008, runtime: '2h 32m', poster: 'https://image.tmdb.org/t/p/w200/qJ2tW6WMUDux911r6m7haRef0WH.jpg', backdrop: 'https://image.tmdb.org/t/p/w500/hkBaDkMWbLaf8B1lsWsKX7Ew3Xq.jpg' },
];

export default function MovieCalendarApp() {
  const navigate = useNavigate();
  const { events, loading: eventsLoading, addEvent, updateEvent, deleteEvent, getEventsForDate } = useCalendarLogs();
  const { profileImage, updateProfileImage } = useUserProfile();
  
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [inviteFriend, setInviteFriend] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'search' | 'details' | 'confirm' | 'events'>('search');
  const [dayEvents, setDayEvents] = useState<CalendarEvent[]>([]);
  const [rating, setRating] = useState<RatingValue>(null);
  const [aiInsight, setAiInsight] = useState('');
  const [isGeneratingInsight, setIsGeneratingInsight] = useState(false);
  const [searchResults, setSearchResults] = useState<Movie[]>([]);
  const [isSearchingMovies, setIsSearchingMovies] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState(profileImage);
  const [avatarError, setAvatarError] = useState('');
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [movieLogoUrl, setMovieLogoUrl] = useState<string | null>(null);
  const [movieHeroUrl, setMovieHeroUrl] = useState<string | null>(null);
  const [isLoadingLogo, setIsLoadingLogo] = useState(false);
  const [featuredMovies, setFeaturedMovies] = useState<Movie[]>([]);
  const [isLoadingFeatured, setIsLoadingFeatured] = useState(false);
  const [selectedAccent, setSelectedAccent] = useState<AccentColors>(DEFAULT_ACCENT);
  const [isSaving, setIsSaving] = useState(false);

  // Sync avatar preview when profile image changes
  useEffect(() => {
    setAvatarPreview(profileImage);
  }, [profileImage]);

  useEffect(() => {
    let cancelled = false;

    const fetchFeatured = async () => {
      if (!TMDB_API_KEY) {
        setFeaturedMovies(MOCK_DB.slice(0, 8));
        return;
      }
      try {
        setIsLoadingFeatured(true);
        const trendingRes = await fetch(
          `${TMDB_BASE}/trending/all/week?api_key=${TMDB_API_KEY}&language=en-US`,
        );
        if (!trendingRes.ok) throw new Error('TMDB trending fetch failed');
        const trendingData = await trendingRes.json();
        const items: any[] = (trendingData?.results ?? [])
          .filter((item: any) => item && (item.media_type === 'movie' || item.media_type === 'tv'))
          .slice(0, 12);

        const results = await Promise.all(
          items.map(async (item: any) => {
            const mediaType: 'movie' | 'tv' = item.media_type === 'tv' ? 'tv' : 'movie';
            try {
              const url = `${TMDB_BASE}/${mediaType}/${item.id}?api_key=${TMDB_API_KEY}&language=en-US`;
              const response = await fetch(url);
              if (!response.ok) throw new Error('TMDB detail fetch failed');
              const data = await response.json();
              return normalizeDetailResult(data, mediaType);
            } catch (error) {
              console.warn('Unable to load featured movie', item.id, error);
              return normalizeTmdbResult(item);
            }
          }),
        );

        if (!cancelled) {
          const filtered = results
            .filter((movie): movie is Movie => Boolean(movie))
            .slice(0, 10);
          const finalList = filtered.length > 0 ? filtered : MOCK_DB.slice(0, 8);
          setFeaturedMovies(finalList);
          if (filtered.length > 0) writeTrendingCache(finalList);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('Unable to load trending list', error);
          setFeaturedMovies(MOCK_DB.slice(0, 8));
        }
      } finally {
        if (!cancelled) setIsLoadingFeatured(false);
      }
    };

    const cached = readTrendingCache();
    if (cached && cached.items.length > 0) {
      setFeaturedMovies(cached.items);
      return () => {
        cancelled = true;
      };
    }

    fetchFeatured();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const trimmedQuery = searchQuery.trim();

    if (!trimmedQuery) {
      setSearchResults([]);
      setSearchError('');
      setIsSearchingMovies(false);
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    const timeout = setTimeout(async () => {
      try {
        setIsSearchingMovies(true);
        setSearchError('');

        const endpoint = `${TMDB_BASE}/search/multi`;
        const url = new URL(endpoint);
        url.searchParams.set('api_key', TMDB_API_KEY);
        url.searchParams.set('language', 'en-US');
        url.searchParams.set('page', '1');
        url.searchParams.set('query', trimmedQuery);
        url.searchParams.set('include_adult', 'false');

        const response = await fetch(url.toString(), { signal: controller.signal });
        if (!response.ok) throw new Error('TMDB request failed');

        const data = await response.json();
        if (cancelled) return;

        const normalized = (data.results ?? [])
          .filter((item: any) => item && (item.media_type === 'movie' || item.media_type === 'tv'))
          .map((item: any) => normalizeTmdbResult(item))
          .filter((movie: Movie, index: number, arr: Movie[]) => movie.title && arr.findIndex((m) => m.id === movie.id) === index)
          .slice(0, 20);

        const queryLower = trimmedQuery.toLowerCase();
        type RankedMovie = {
          movie: Movie;
          matchRank: number;
          popularity: number;
        };

        const ranked = normalized
          .map((movie: Movie): RankedMovie => {
            const titleLower = movie.title.toLowerCase();
            const cleanTitle = titleLower.replace(/^(the|a|an)\s+/i, '');

            const isPriority =
              titleLower === queryLower ||
              cleanTitle === queryLower ||
              titleLower.startsWith(queryLower) ||
              cleanTitle.startsWith(queryLower);

            const containsMatch = titleLower.includes(queryLower) || cleanTitle.includes(queryLower);

            const matchRank = isPriority ? 0 : containsMatch ? 1 : 2;

            return {
              movie,
              matchRank,
              popularity: movie.popularity ?? 0,
            };
          })
          .sort((a: RankedMovie, b: RankedMovie) => {
            if (b.popularity !== a.popularity) return b.popularity - a.popularity;
            if (a.matchRank !== b.matchRank) return a.matchRank - b.matchRank;
            return a.movie.title.localeCompare(b.movie.title);
          })
          .map((entry: RankedMovie) => entry.movie);

        setSearchResults(ranked);
        if (ranked.length === 0) {
          setSearchError('No matches on TMDB. Try another title.');
        }
      } catch (error) {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === 'AbortError') return;
        console.error('TMDB fetch error:', error);
        setSearchError('Unable to reach TMDB right now.');
        setSearchResults([]);
      } finally {
        if (!cancelled) setIsSearchingMovies(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [searchQuery]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedMovie) {
      setSelectedAccent(DEFAULT_ACCENT);
      return;
    }
    if (
      selectedMovie.accentStart &&
      selectedMovie.accentEnd &&
      selectedMovie.accentText
    ) {
      setSelectedAccent({
        start: selectedMovie.accentStart,
        end: selectedMovie.accentEnd,
        text: selectedMovie.accentText,
      });
      return;
    }
    if (!selectedMovie.backdrop) {
      setSelectedAccent(DEFAULT_ACCENT);
      return;
    }

    const getColors = async () => {
      if (selectedMovie.title) {
        const llmColors = await fetchLLMColors(selectedMovie.title, selectedMovie.year);
        if (llmColors) return llmColors;
      }
      return extractAccentFromImage(selectedMovie.backdrop);
    };

    getColors().then((colors) => {
      if (cancelled) return;
      setSelectedAccent(colors);
      setSelectedMovie((prev) => {
        if (!prev || prev.id !== selectedMovie.id) return prev;
        if (prev.accentStart && prev.accentEnd && prev.accentText) return prev;
        return {
          ...prev,
          accentStart: colors.start,
          accentEnd: colors.end,
          accentText: colors.text,
        };
      });
    });

    return () => {
      cancelled = true;
    };
  }, [
    selectedMovie?.id,
    selectedMovie?.backdrop,
    selectedMovie?.accentStart,
    selectedMovie?.accentEnd,
    selectedMovie?.accentText,
  ]);

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay();

    const days: Array<Date | null> = [];
    for (let i = 0; i < firstDayOfMonth; i += 1) days.push(null);
    for (let i = 1; i <= daysInMonth; i += 1) days.push(new Date(year, month, i));
    return days;
  };

  const isPastDate = (date: Date | null) => {
    if (!date) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(date);
    target.setHours(0, 0, 0, 0);
    return target < today;
  };

  const days = getDaysInMonth(currentDate);

  const handleDayClick = (date: Date | null, existingEvents?: CalendarEvent[]) => {
    if (!date) return;
    
    // If there are existing events, show them in modal
    if (existingEvents && existingEvents.length > 0) {
      setSelectedDate(date);
      resetModalState();
      setDayEvents(existingEvents);
      setViewMode('events');
      setIsModalOpen(true);
    } else {
      // No events - redirect to Discovery with date pre-selected
      const dateStr = date.toISOString().split('T')[0];
      navigate(`/discover?date=${dateStr}`);
    }
  };

  const resetModalState = () => {
    setSelectedMovie(null);
    setSearchQuery('');
    setInviteFriend(false);
    setEditingEventId(null);
    setRating(null);
    setAiInsight('');
    setIsGeneratingInsight(false);
    setMovieLogoUrl(null);
    setMovieHeroUrl(null);
    setSelectedAccent(DEFAULT_ACCENT);
  };

  const handleSaveEvent = async () => {
    if (!selectedMovie || !selectedDate) return;

    if (isPastDate(selectedDate) && !rating) {
      return;
    }

    setIsSaving(true);

    const eventData = {
      movieId: selectedMovie.id,
      title: selectedMovie.title,
      poster: selectedMovie.poster,
      date: selectedDate.toISOString(),
      inviteFriend,
      rating: isPastDate(selectedDate) ? rating : null,
      backdrop: selectedMovie.backdrop,
      mediaType: selectedMovie.mediaType,
      year: selectedMovie.year,
      runtimeLabel: selectedMovie.runtime,
      accentStart: selectedAccent.start,
      accentEnd: selectedAccent.end,
      accentText: selectedAccent.text,
    };

    try {
      if (editingEventId) {
        await updateEvent(editingEventId, eventData);
      } else {
        await addEvent(eventData);
        // Log analytics event
        await logMovieAdded(selectedMovie.mediaType || 'movie', selectedDate.toISOString());
      }
      setIsModalOpen(false);
    } catch (error) {
      console.error('Failed to save event:', error);
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    // Immediately clear previous movie assets to prevent flash
    setMovieLogoUrl(null);
    setMovieHeroUrl(null);
    
    if (!selectedMovie || !selectedMovie.id) {
      return;
    }
    if (!TMDB_API_KEY) {
      setMovieHeroUrl(selectedMovie.backdrop ?? null);
      return;
    }

    const controller = new AbortController();
    const loadAssets = async () => {
      try {
        setIsLoadingLogo(true);
        const mediaType = selectedMovie.mediaType === 'tv' ? 'tv' : 'movie';
        const url = new URL(`${TMDB_BASE}/${mediaType}/${selectedMovie.id}/images`);
        url.searchParams.set('api_key', TMDB_API_KEY);
        url.searchParams.set('include_image_language', 'en,null');
        url.searchParams.set('language', 'en-US');

        const res = await fetch(url.toString(), { signal: controller.signal });
        if (!res.ok) throw new Error('TMDB images fetch failed');
        const data = await res.json();

        const logos = data?.logos ?? [];
        if (logos.length > 0) {
          const preferred = logos.find((logo: any) => logo.iso_639_1 === 'en') || logos[0];
          setMovieLogoUrl(preferred?.file_path ? buildImageUrl(preferred.file_path, 'w500') : null);
        } else {
          setMovieLogoUrl(null);
        }

        const stillPath =
          (data?.stills && data.stills.length > 0 && data.stills[0]?.file_path) || null;
        if (stillPath) {
          setMovieHeroUrl(buildImageUrl(stillPath, 'w780'));
        } else if (data?.backdrops && data.backdrops.length > 0 && data.backdrops[0]?.file_path) {
          setMovieHeroUrl(buildImageUrl(data.backdrops[0].file_path, 'w780'));
        } else {
          setMovieHeroUrl(selectedMovie.backdrop ?? null);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        console.warn('Unable to load TMDB assets', error);
        setMovieLogoUrl(null);
        setMovieHeroUrl(selectedMovie.backdrop ?? null);
      } finally {
        setIsLoadingLogo(false);
      }
    };

    loadAssets();
    return () => controller.abort();
  }, [selectedMovie]);

  const handleDeleteEvent = async () => {
    if (!editingEventId) return;
    try {
      await deleteEvent(editingEventId);
      setIsModalOpen(false);
    } catch (error) {
      console.error('Failed to delete event:', error);
    }
  };

  const handleGenerateInsight = async () => {
    if (!selectedMovie) return;
    setIsGeneratingInsight(true);
    const recentMovies = events.slice(0, 3).map((e) => ({ title: e.title }));
    const text = await generateMovieInsight(selectedMovie.title, recentMovies, rating);
    setAiInsight(text);
    setIsGeneratingInsight(false);
  };

  const changeMonth = (offset: number) => {
    const newDate = new Date(currentDate.setMonth(currentDate.getMonth() + offset));
    setCurrentDate(new Date(newDate));
  };

  const hasQuery = searchQuery.trim().length > 0;
  const fallbackMovies = featuredMovies.length > 0 ? featuredMovies : MOCK_DB.slice(0, 8);
  const filteredMovies = hasQuery ? searchResults : fallbackMovies;
  const noMatches = hasQuery && !isSearchingMovies && searchResults.length === 0;

  const [isSavingAvatar, setIsSavingAvatar] = useState(false);
  
  const handleAvatarSave = async () => {
    if (!avatarPreview) {
      setAvatarError('Choose a photo to continue.');
      return;
    }
    setIsSavingAvatar(true);
    try {
      await updateProfileImage(avatarPreview);
      setAvatarError('');
      setIsAvatarModalOpen(false);
    } catch (error) {
      console.error('Failed to save profile image:', error);
      setAvatarError('Failed to save profile image. ' + (error as Error).message);
    } finally {
      setIsSavingAvatar(false);
    }
  };

  const handleAvatarFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setAvatarError('Please pick an image file.');
      return;
    }

    // Compress and resize image to avoid Firestore size limits
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string | null;
      if (result) {
        // Create an image element to resize
        const img = new Image();
        img.onload = () => {
          // Create canvas for resizing
          const canvas = document.createElement('canvas');
          const maxSize = 200; // Max width/height for avatar
          let width = img.width;
          let height = img.height;
          
          // Scale down if needed
          if (width > height) {
            if (width > maxSize) {
              height = Math.round((height * maxSize) / width);
              width = maxSize;
            }
          } else {
            if (height > maxSize) {
              width = Math.round((width * maxSize) / height);
              height = maxSize;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            // Convert to compressed JPEG
            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
            setAvatarPreview(compressedDataUrl);
            setAvatarError('');
          } else {
            setAvatarPreview(result);
            setAvatarError('');
          }
        };
        img.onerror = () => {
          setAvatarError('Could not process that image. Try another one.');
        };
        img.src = result;
      } else {
        setAvatarError('Could not read that file. Try another image.');
      }
    };
    reader.readAsDataURL(file);
  };


  if (eventsLoading) return <div className="h-screen w-full flex items-center justify-center bg-black text-gray-500">Loading Cinema...</div>;

  const isPast = isPastDate(selectedDate);

  return (
    <div className="min-h-screen bg-[#09090b] font-sans text-gray-100 flex flex-col max-w-md mx-auto shadow-2xl overflow-hidden border-x border-gray-800">
      <div className="bg-[#09090b]/90 backdrop-blur-md px-6 py-6 flex items-center justify-between sticky top-0 z-10 border-b border-gray-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">ViewFindr</h1>
          <p className="text-xs text-gray-500 uppercase tracking-wider mt-1 font-semibold">Your Cinema Journal</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/discover')}
            className="p-2.5 hover:bg-gray-800 rounded-full transition-colors text-gray-400 hover:text-white"
            title="Discover movies"
          >
            <Search size={20} />
          </button>
          <ProfileDropdown
            profileImage={profileImage}
            onOpenAvatarModal={() => {
              setAvatarPreview(profileImage);
              setAvatarError('');
              setIsAvatarModalOpen(true);
            }}
          />
        </div>
      </div>

      <div className="px-6 py-4 flex items-center justify-between bg-[#09090b]">
        <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-gray-800 rounded-full transition-colors text-gray-400 hover:text-white">
          <ChevronLeft size={20} />
        </button>
        <span className="text-lg font-semibold text-gray-200">{currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
        <button onClick={() => changeMonth(1)} className="p-2 hover:bg-gray-800 rounded-full transition-colors text-gray-400 hover:text-white">
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="flex-1 px-4 pb-20 overflow-y-auto scrollbar-hide">
        <div className="grid grid-cols-7 mb-2">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <div key={d + i} className="text-center text-xs font-bold text-gray-500 py-2">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2 auto-rows-fr">
          {days.map((date, index) => {
            if (!date) return <div key={`empty-${index}`} className="aspect-square" />;

            const dayEvents = getEventsForDate(date);
            const primaryEvent = dayEvents[0];
            const hasEvent = Boolean(primaryEvent);
            const isToday = new Date().toDateString() === date.toDateString();
            const accentStart = primaryEvent?.accentStart || DEFAULT_ACCENT.start;
            const accentEnd = primaryEvent?.accentEnd || DEFAULT_ACCENT.end;
            const accentText = primaryEvent?.accentText || DEFAULT_ACCENT.text;

            const cellStyle = hasEvent
              ? {
                  backgroundImage: `radial-gradient(circle at top right, ${accentStart}, ${accentEnd})`,
                  color: accentText,
                }
              : undefined;

            const baseClasses = hasEvent
              ? 'border border-transparent shadow-[0_0_20px_rgba(5,5,5,0.45)]'
              : isToday
                ? 'bg-blue-900/20 border border-blue-500/50 text-blue-400'
                : 'bg-[#18181b] hover:bg-gray-800 border border-transparent text-gray-400';

            const eventCount = dayEvents.length;
            const hasMultipleEvents = eventCount > 1;

            return (
              <div
                key={date.toISOString()}
                onClick={() => handleDayClick(date, dayEvents.length > 0 ? dayEvents : undefined)}
                className={`aspect-square rounded-xl relative flex flex-col items-start justify-start p-2 cursor-pointer transition-all duration-200 overflow-hidden ${baseClasses}`}
                style={cellStyle}
              >
                <span
                  className="text-sm font-bold z-10 drop-shadow-sm"
                  style={{ color: hasEvent ? accentText : isToday ? '#60a5fa' : '#9ca3af' }}
                >
                  {date.getDate()}
                </span>
                {hasMultipleEvents && (
                  <span 
                    className="absolute bottom-1 right-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/20 backdrop-blur-sm z-10"
                    style={{ color: accentText }}
                  >
                    +{eventCount - 1}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* AI Recommendation Card */}
        <RecommendationCard
          onAddToCalendar={(movie: RecommendationResult) => {
            // Pre-fill the movie and open the modal to pick a date
            const hydratedMovie: Movie = {
              id: movie.movieId,
              title: movie.title,
              year: movie.year,
              runtime: movie.runtime || 'Feature',
              poster: movie.poster,
              backdrop: movie.backdrop,
              mediaType: movie.mediaType,
            };
            setSelectedMovie(hydratedMovie);
            setSelectedDate(new Date()); // Default to today
            setViewMode('confirm');
            setIsModalOpen(true);
          }}
        />
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />

          <div className="bg-[#18181b] w-full max-w-md rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl z-50 relative animate-in slide-in-from-bottom-full duration-300 border border-gray-800 overflow-hidden">
            {viewMode !== 'details' && viewMode !== 'events' && (
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-white">{editingEventId ? 'Edit Log' : isPast ? 'Log Watched Movie' : 'Plan a Movie'}</h2>
                  <p className="text-sm text-gray-500">{selectedDate?.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</p>
                </div>
              </div>
            )}

            {viewMode === 'events' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h2 className="text-xl font-bold text-white">Movies on this day</h2>
                    <p className="text-sm text-gray-500">{selectedDate?.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</p>
                  </div>
                </div>
                
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {dayEvents.map((event) => (
                    <div
                      key={event.id}
                      onClick={() => {
                        const fallbackDetails = MOCK_DB.find((m) => m.id === event.movieId);
                        const hydratedMovie: Movie = {
                          id: event.movieId,
                          title: event.title || fallbackDetails?.title || 'Untitled',
                          poster: event.poster || fallbackDetails?.poster || TMDB_POSTER_PLACEHOLDER,
                          year: event.year ?? fallbackDetails?.year ?? '----',
                          runtime: event.runtimeLabel ?? fallbackDetails?.runtime ?? 'Unknown',
                          backdrop: event.backdrop ?? fallbackDetails?.backdrop,
                          mediaType: event.mediaType ?? fallbackDetails?.mediaType,
                          accentStart: event.accentStart,
                          accentEnd: event.accentEnd,
                          accentText: event.accentText,
                        };
                        setSelectedMovie(hydratedMovie);
                        setInviteFriend(event.inviteFriend);
                        setEditingEventId(event.id);
                        setRating(event.rating || null);
                        setViewMode('details');
                        if (event.accentStart && event.accentEnd && event.accentText) {
                          setSelectedAccent({
                            start: event.accentStart,
                            end: event.accentEnd,
                            text: event.accentText,
                          });
                        }
                      }}
                      className="flex gap-3 p-3 rounded-xl bg-gray-900 hover:bg-gray-800 cursor-pointer transition-colors border border-gray-800"
                    >
                      <img src={event.poster} className="w-12 h-16 object-cover rounded-lg" alt={event.title} />
                      <div className="flex flex-col justify-center flex-1">
                        <span className="font-semibold text-gray-200">{event.title}</span>
                        <span className="text-xs text-gray-500">{event.year} • {event.runtimeLabel}</span>
                      </div>
                      {event.rating && (
                        <div className={`self-center px-2 py-1 rounded-full text-xs font-bold ${
                          event.rating === 'up' ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'
                        }`}>
                          {event.rating === 'up' ? '👍' : '👎'}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => {
                    resetModalState();
                    setViewMode('search');
                  }}
                  className="w-full py-4 rounded-xl font-bold text-lg bg-white hover:bg-gray-200 text-black flex items-center justify-center gap-2 transition-all"
                >
                  <Plus size={20} />
                  Add Another Movie
                </button>
              </div>
            )}

            {viewMode === 'search' && (
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-3 text-gray-500" size={20} />
                  <input
                    type="text"
                    placeholder={isPast ? 'What did you watch?' : 'Search for a movie...'}
                    className="w-full bg-gray-900 rounded-xl py-3 pl-10 pr-4 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all border border-gray-800"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoFocus
                  />
                </div>

                {searchError && (
                  <p className="text-xs text-red-400 px-1">{searchError}</p>
                )}

                <div className="max-h-80 overflow-y-auto space-y-2 scrollbar-thin scrollbar-thumb-gray-700">
                  {hasQuery ? (
                    isSearchingMovies ? (
                      <div className="flex items-center gap-2 text-gray-500 text-sm p-4">
                        <Loader2 size={16} className="animate-spin" />
                        Searching TMDB...
                      </div>
                    ) : noMatches ? (
                      <div className="text-sm text-gray-500 p-4">
                        No matches for "{searchQuery}". Try another title.
                      </div>
                    ) : (
                      filteredMovies.map((movie: Movie) => (
                        <div
                          key={`${movie.mediaType ?? 'movie'}-${movie.id}`}
                          onClick={() => {
                            setSelectedMovie(movie);
                            setMovieLogoUrl(null);
                            setMovieHeroUrl(null);
                            setViewMode('confirm');
                          }}
                          className="flex gap-3 p-2 rounded-xl hover:bg-gray-800 cursor-pointer group transition-colors border border-transparent hover:border-gray-700"
                        >
                          <img src={movie.poster} className="w-12 h-16 object-cover rounded-lg shadow-sm" alt={movie.title} />
                          <div className="flex flex-col justify-center">
                            <span className="font-semibold text-gray-200 group-hover:text-blue-400">{movie.title}</span>
                            <span className="text-xs text-gray-500">
                              {movie.year} • {movie.runtime}
                            </span>
                          </div>
                        </div>
                      ))
                    )
                  ) : isLoadingFeatured ? (
                    <div className="flex items-center gap-2 text-gray-500 text-sm p-4">
                      <Loader2 size={16} className="animate-spin" />
                      Loading trending...
                    </div>
                  ) : (
                    filteredMovies.map((movie: Movie) => (
                      <div
                        key={`${movie.mediaType ?? 'movie'}-${movie.id}`}
                        onClick={() => {
                          setSelectedMovie(movie);
                          setMovieLogoUrl(null);
                          setMovieHeroUrl(null);
                          setViewMode('confirm');
                        }}
                        className="flex gap-3 p-2 rounded-xl hover:bg-gray-800 cursor-pointer group transition-colors border border-transparent hover:border-gray-700"
                      >
                        <img src={movie.poster} className="w-12 h-16 object-cover rounded-lg shadow-sm" alt={movie.title} />
                        <div className="flex flex-col justify-center">
                          <span className="font-semibold text-gray-200 group-hover:text-blue-400">{movie.title}</span>
                          <span className="text-xs text-gray-500">
                            {movie.year} • {movie.runtime}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {viewMode === 'confirm' && selectedMovie && (
              <div className="space-y-6">
                <div className="relative rounded-2xl overflow-hidden border border-gray-800 bg-gray-900">
                  {(movieHeroUrl || selectedMovie.backdrop) && (
                    <img
                      src={movieHeroUrl ?? selectedMovie.backdrop}
                      alt={selectedMovie.title}
                      className="absolute inset-0 w-full h-full object-cover opacity-60"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-tr from-[#0b0b0f] via-black/60 to-transparent" />
                  <div className="relative p-4 flex gap-4 items-center">
                    <img src={selectedMovie.poster} className="w-20 rounded-xl border border-white/10 shadow-lg" alt="Selected" />
                    <div className="flex-1">
                      {movieLogoUrl ? (
                        <img
                          src={movieLogoUrl}
                          alt={selectedMovie.title}
                          className="max-h-10 object-contain mb-1"
                        />
                      ) : (
                        <h3 className="font-bold text-white text-lg leading-tight">{selectedMovie.title}</h3>
                      )}
                      <p className="text-sm text-gray-200">
                        {selectedMovie.year} • {selectedMovie.runtime}
                        {isLoadingLogo && (
                          <span className="text-[10px] text-blue-200/70 ml-2 uppercase tracking-wide">
                            Fetching title art...
                          </span>
                        )}
                      </p>
                      <button
                        onClick={() => {
                          setViewMode('search');
                          setSearchQuery('');
                        }}
                        className="inline-flex items-center gap-1 text-xs text-blue-300 font-medium mt-3 hover:text-white transition-colors"
                      >
                        Change Movie
                      </button>
                    </div>
                  </div>
                </div>

                {isPast ? (
                  <div>
                    <label className="text-sm font-bold text-gray-400 mb-3 block">How was it?</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setRating('up')}
                        className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
                          rating === 'up'
                            ? 'border-green-500 bg-green-900/20 text-green-400'
                            : 'border-gray-800 bg-gray-900 text-gray-500 hover:bg-gray-800'
                        }`}
                      >
                        <ThumbsUp size={32} className={rating === 'up' ? 'fill-current' : ''} />
                        <span className="mt-2 font-bold text-sm">Loved it</span>
                      </button>
                      <button
                        onClick={() => setRating('down')}
                        className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
                          rating === 'down'
                            ? 'border-red-500 bg-red-900/20 text-red-400'
                            : 'border-gray-800 bg-gray-900 text-gray-500 hover:bg-gray-800'
                        }`}
                      >
                        <ThumbsDown size={32} className={rating === 'down' ? 'fill-current' : ''} />
                        <span className="mt-2 font-bold text-sm">Not for me</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="text-sm font-bold text-gray-400 mb-3 block">Who is watching?</label>
                    <div className="flex flex-col gap-3">
                      <div
                        className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${
                          !inviteFriend ? 'border-blue-600 bg-blue-900/10' : 'border-gray-800 bg-gray-900'
                        }`}
                        onClick={() => setInviteFriend(false)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="bg-gray-800 p-2 rounded-full text-gray-300">
                            <UserIcon size={18} />
                          </div>
                          <span className="font-medium text-gray-200">Just Me</span>
                        </div>
                        {!inviteFriend && <Check size={20} className="text-blue-500" />}
                      </div>

                      <div
                        className={`p-4 rounded-xl border-2 transition-all ${
                          inviteFriend ? 'border-purple-600 bg-purple-900/10' : 'border-gray-800 bg-gray-900'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div
                            className="flex items-center gap-3 cursor-pointer"
                            onClick={() => setInviteFriend(true)}
                          >
                            <div className="bg-gray-800 p-2 rounded-full text-purple-400">
                              <Users size={18} />
                            </div>
                            <div className="flex flex-col">
                              <span className="font-medium text-gray-200">Watch with a friend</span>
                              <span className="text-xs text-gray-500">Send an invite</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setInviteFriend(true)}
                            className="text-xs font-semibold px-3 py-1 rounded-full border border-purple-500 text-purple-300 hover:bg-purple-500/20 transition-colors"
                          >
                            Invite
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <button
                  onClick={handleSaveEvent}
                  disabled={(isPast && !rating) || isSaving}
                  className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg transform transition-transform active:scale-95 flex items-center justify-center gap-2 ${
                    (isPast && !rating) || isSaving ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 'bg-white hover:bg-gray-200 text-black'
                  }`}
                >
                  {isSaving ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : editingEventId ? (
                    <Edit2 size={20} />
                  ) : (
                    <Plus size={20} />
                  )}
                  {isSaving ? 'Saving...' : editingEventId ? 'Update Log' : isPast ? 'Log to History' : 'Add to Calendar'}
                </button>
              </div>
            )}

            {viewMode === 'details' && selectedMovie && (
              <div className="space-y-6">
                <div className="absolute top-4 right-4 z-20 flex gap-3">
                  <button
                    onClick={() => setViewMode('search')}
                    className="w-10 h-10 bg-amber-400 text-black rounded-full flex items-center justify-center shadow-lg hover:bg-amber-300 hover:scale-105 transition-all border border-amber-500/20"
                    title="Swap Movie"
                  >
                    <Repeat size={18} strokeWidth={2.5} />
                  </button>
                  <button
                    onClick={handleDeleteEvent}
                    className="w-10 h-10 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-red-600 hover:scale-105 transition-all"
                    title="Delete Event"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>

                <div className="relative rounded-2xl overflow-hidden aspect-video bg-gray-900 group">
                  {(movieHeroUrl || selectedMovie.backdrop) && (
                    <img
                      src={movieHeroUrl ?? selectedMovie.backdrop}
                      className="absolute inset-0 w-full h-full object-cover opacity-60"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#18181b] to-transparent" />

                  <div className="absolute bottom-0 left-0 p-4 flex gap-3 items-end w-full">
                    <img src={selectedMovie.poster} className="w-20 rounded-lg border-2 border-white/10 shadow-xl" />
                    <div className="mb-1 flex-1">
                        {movieLogoUrl ? (
                          <img
                            src={movieLogoUrl}
                            alt={selectedMovie.title}
                            className="max-h-10 object-contain mb-1"
                          />
                        ) : (
                          <h3 className="font-bold text-white text-xl leading-none mb-1">
                            {selectedMovie.title}
                          </h3>
                        )}
                        <p className="text-gray-300 text-xs">
                          {selectedMovie.runtime}
                          {isLoadingLogo && (
                            <span className="text-[10px] text-gray-500 ml-2 uppercase tracking-wide">
                              Fetching title art...
                            </span>
                          )}
                        </p>
                    </div>

                      <div className="relative w-12 h-12">
                        <div className="w-12 h-12 rounded-full border-2 border-white/30 overflow-hidden shadow-lg bg-white">
                          <img src={profileImage} alt="Profile" className="w-full h-full object-cover" />
                        </div>
                        <div
                          className={`absolute -top-1 -right-1 w-6 h-6 rounded-full border-2 border-white flex items-center justify-center shadow ${
                            rating
                              ? rating === 'up'
                                ? 'bg-green-500 text-white'
                                : 'bg-red-500 text-white'
                              : 'bg-amber-400 text-amber-900'
                          }`}
                        >
                          {rating ? (
                            rating === 'up' ? (
                              <ThumbsUp size={12} className="fill-current" />
                            ) : (
                              <ThumbsDown size={12} className="fill-current" />
                            )
                          ) : (
                            <Ticket size={12} className="text-amber-900" />
                          )}
                        </div>
                      </div>
                  </div>
                </div>

                <div className="bg-gray-900 p-5 rounded-xl border border-gray-800 relative overflow-hidden">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-2">
                      <Sparkles size={14} />
                      Vibe Check
                    </h4>
                    {!aiInsight && !isGeneratingInsight && (
                      <button onClick={handleGenerateInsight} className="text-xs bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 px-3 py-1.5 rounded-full font-medium transition-colors">
                        Generate
                      </button>
                    )}
                  </div>

                  <div className="min-h-[40px] flex items-center">
                    {isGeneratingInsight ? (
                      <div className="flex items-center gap-2 text-gray-500 text-sm animate-pulse">
                        <Loader2 size={16} className="animate-spin" />
                        Analyzing cinematic patterns...
                      </div>
                    ) : aiInsight ? (
                      <p className="text-sm text-gray-300 leading-relaxed animate-in fade-in">"{aiInsight}"</p>
                    ) : (
                      <p className="text-sm text-gray-600 italic">Tap generate to see why this movie fits your taste...</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {isAvatarModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsAvatarModalOpen(false)} />
          <div className="bg-[#18181b] w-full max-w-sm rounded-2xl p-6 border border-gray-800 relative z-10 space-y-4">
            <h3 className="text-lg font-semibold text-white">Update Profile Picture</h3>
            <p className="text-sm text-gray-500">Upload any image file (square looks best).</p>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full overflow-hidden border border-gray-700">
                <img src={avatarPreview} alt="Preview" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1">
                <button
                  onClick={() => avatarInputRef.current?.click()}
                  className="w-full py-2 rounded-xl border border-gray-700 text-sm text-gray-200 hover:border-gray-500 hover:text-white transition-colors"
                >
                  Choose Photo
                </button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarFileChange}
                />
              </div>
            </div>
            {avatarError && <p className="text-xs text-red-400">{avatarError}</p>}
            <div className="flex gap-3">
              <button
                onClick={() => setIsAvatarModalOpen(false)}
                className="flex-1 py-3 rounded-xl border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAvatarSave}
                disabled={isSavingAvatar}
                className={`flex-1 py-3 rounded-xl text-white font-semibold transition-colors ${
                  isSavingAvatar 
                    ? 'bg-gray-600 cursor-not-allowed' 
                    : 'bg-blue-500 hover:bg-blue-400'
                }`}
              >
                {isSavingAvatar ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
