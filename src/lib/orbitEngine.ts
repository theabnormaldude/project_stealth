import { callGemini } from './gemini';
import type { OrbitMovie, SwipeDirection } from '../stores/orbitStore';

const TMDB_API_KEY =
  (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_TMDB_API_KEY) ||
  '087e509f6f93e629488a550f1451bb76';

const TMDB_BASE = 'https://api.themoviedb.org/3';

// Response schema from Gemini
export interface OrbitResponse {
  next_movie_title: string;
  year: string;
  dominant_hex_color: string;
  connection_reason: string;
  similarity_score: number;
  tmdb_id?: number;
}

// Prompt templates for each navigation vector
const VIBE_PROMPT = `You are the Viewfinder Engine. Given a movie, recommend the single best "next movie" based on VIBE MATCH.

Current Movie: "{title}" ({year})
Genres: {genres}
Director: {director}

VIBE MATCH means: Match based on general similarity, genre, era, mood, and spiritual successor quality. Find a movie that "feels" the same.

CRITICAL RULES:
1. Output MUST be raw JSON only - no markdown, no backticks, no explanation
2. The "dominant_hex_color" MUST be extracted from the recommended movie's iconic theatrical poster
3. "connection_reason" MUST be max 10 words
4. DO NOT recommend the same movie or obvious sequels

Output this exact JSON structure:
{"next_movie_title": "Movie Title", "year": "YYYY", "dominant_hex_color": "#HEXCODE", "connection_reason": "Brief reason", "similarity_score": 85}`;

const AESTHETIC_PROMPT = `You are the Viewfinder Engine. Given a movie, recommend the single best "next movie" based on AESTHETIC MATCH.

Current Movie: "{title}" ({year})
Cinematographer: {cinematographer}
Known for: {visual_style}

AESTHETIC MATCH means: IGNORE PLOT ENTIRELY. Match based on:
- Color palette (neon, muted, saturated, monochrome)
- Lighting style (high contrast, soft, harsh shadows)
- Cinematography approach (long takes, handheld, symmetrical)
- Visual mood and texture

CRITICAL RULES:
1. Output MUST be raw JSON only - no markdown, no backticks, no explanation
2. The "dominant_hex_color" MUST accurately reflect the recommended movie's dominant poster color
3. "connection_reason" MUST reference visual elements specifically
4. DO NOT recommend the same movie

Output this exact JSON structure:
{"next_movie_title": "Movie Title", "year": "YYYY", "dominant_hex_color": "#HEXCODE", "connection_reason": "Same neon palette", "similarity_score": 85}`;

const AUTEUR_PROMPT = `You are the Viewfinder Engine. Given a movie, recommend the single best "next movie" based on AUTEUR MATCH.

Current Movie: "{title}" ({year})
Director: {director}
Writer: {writer}
Genre: {genres}

AUTEUR MATCH means: IGNORE GENRE. Match based on:
- Same director's other work
- Same screenwriter's signature style
- Similar narrative structure (nonlinear, ensemble, character study)
- Thematic DNA (existentialism, identity, power dynamics)

CRITICAL RULES:
1. Output MUST be raw JSON only - no markdown, no backticks, no explanation
2. The "dominant_hex_color" MUST be from the recommended movie's theatrical poster
3. "connection_reason" MUST mention the structural/authorial connection
4. DO NOT recommend the same movie or direct sequels

Output this exact JSON structure:
{"next_movie_title": "Movie Title", "year": "YYYY", "dominant_hex_color": "#HEXCODE", "connection_reason": "Same director's masterwork", "similarity_score": 85}`;

// Build prompt based on direction
const buildPrompt = (
  movie: OrbitMovie,
  direction: SwipeDirection,
  extraContext?: { cinematographer?: string; writer?: string; visualStyle?: string }
): string => {
  const genres = movie.genres?.join(', ') || 'Unknown';
  const director = movie.director || 'Unknown';
  
  let template: string;
  
  switch (direction) {
    case 'left':
      template = VIBE_PROMPT;
      break;
    case 'down':
      template = AESTHETIC_PROMPT;
      break;
    case 'up':
      template = AUTEUR_PROMPT;
      break;
    default:
      template = VIBE_PROMPT;
  }
  
  return template
    .replace('{title}', movie.title)
    .replace('{year}', movie.year)
    .replace('{genres}', genres)
    .replace('{director}', director)
    .replace('{cinematographer}', extraContext?.cinematographer || 'Unknown')
    .replace('{writer}', extraContext?.writer || 'Unknown')
    .replace('{visual_style}', extraContext?.visualStyle || 'distinctive visual style');
};

// Parse Gemini response to OrbitResponse
const parseOrbitResponse = (text: string): OrbitResponse | null => {
  try {
    // Try to extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    // Validate required fields
    if (!parsed.next_movie_title || !parsed.year || !parsed.dominant_hex_color) {
      console.error('Missing required fields in orbit response');
      return null;
    }
    
    // Ensure hex color is valid
    let hexColor = parsed.dominant_hex_color;
    if (!hexColor.startsWith('#')) {
      hexColor = '#' + hexColor;
    }
    
    return {
      next_movie_title: parsed.next_movie_title,
      year: parsed.year,
      dominant_hex_color: hexColor,
      connection_reason: parsed.connection_reason || 'Spiritual successor',
      similarity_score: parsed.similarity_score || 75,
      tmdb_id: parsed.tmdb_id,
    };
  } catch (error) {
    console.error('Failed to parse orbit response:', error);
    return null;
  }
};

// Search TMDB for movie details
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

// Get movie details from TMDB
const getMovieDetails = async (tmdbId: number): Promise<any | null> => {
  try {
    const url = `${TMDB_BASE}/movie/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=credits`;
    const response = await fetch(url);
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
};

// Hydrate OrbitResponse with TMDB data
const hydrateWithTMDB = async (orbitResponse: OrbitResponse): Promise<OrbitMovie | null> => {
  try {
    let tmdbData: any = null;
    
    // If we have a TMDB ID, use it directly
    if (orbitResponse.tmdb_id) {
      tmdbData = await getMovieDetails(orbitResponse.tmdb_id);
    }
    
    // Otherwise search for the movie
    if (!tmdbData) {
      const searchResult = await searchTMDB(orbitResponse.next_movie_title, orbitResponse.year);
      if (searchResult) {
        tmdbData = await getMovieDetails(searchResult.id);
      }
    }
    
    if (!tmdbData) {
      console.warn('Could not find movie on TMDB:', orbitResponse.next_movie_title);
      return null;
    }
    
    // Extract director from credits
    const director = tmdbData.credits?.crew?.find((c: any) => c.job === 'Director')?.name;
    const cinematographer = tmdbData.credits?.crew?.find((c: any) => c.job === 'Director of Photography')?.name;
    
    return {
      id: tmdbData.id,
      title: tmdbData.title,
      year: tmdbData.release_date?.slice(0, 4) || orbitResponse.year,
      posterPath: tmdbData.poster_path,
      backdropPath: tmdbData.backdrop_path,
      dominantHex: orbitResponse.dominant_hex_color,
      mediaType: 'movie',
      director,
      cinematographer,
      genres: tmdbData.genres?.map((g: any) => g.name) || [],
    };
  } catch (error) {
    console.error('Failed to hydrate with TMDB:', error);
    return null;
  }
};

// Main function to get next movie based on swipe direction
export const getNextMovie = async (
  currentMovie: OrbitMovie,
  direction: SwipeDirection,
  extraContext?: { cinematographer?: string; writer?: string; visualStyle?: string }
): Promise<{ movie: OrbitMovie; connectionReason: string; similarityScore: number } | null> => {
  // Don't process 'right' swipe - that's history navigation
  if (direction === 'right') return null;
  
  const prompt = buildPrompt(currentMovie, direction, extraContext);
  
  const response = await callGemini(prompt);
  if (!response) {
    console.error('Gemini returned no response');
    return null;
  }
  
  const orbitResponse = parseOrbitResponse(response);
  if (!orbitResponse) {
    console.error('Failed to parse Gemini response');
    return null;
  }
  
  const hydratedMovie = await hydrateWithTMDB(orbitResponse);
  if (!hydratedMovie) {
    return null;
  }
  
  return {
    movie: hydratedMovie,
    connectionReason: orbitResponse.connection_reason,
    similarityScore: orbitResponse.similarity_score,
  };
};

// Pre-fetch all possible next moves for a movie
export const prefetchNextMoves = async (
  currentMovie: OrbitMovie,
  extraContext?: { cinematographer?: string; writer?: string; visualStyle?: string }
): Promise<{
  vibe: { movie: OrbitMovie; connectionReason: string; similarityScore: number } | null;
  aesthetic: { movie: OrbitMovie; connectionReason: string; similarityScore: number } | null;
  auteur: { movie: OrbitMovie; connectionReason: string; similarityScore: number } | null;
}> => {
  // Fire all three requests in parallel
  const [vibe, aesthetic, auteur] = await Promise.all([
    getNextMovie(currentMovie, 'left', extraContext),
    getNextMovie(currentMovie, 'down', extraContext),
    getNextMovie(currentMovie, 'up', extraContext),
  ]);
  
  return { vibe, aesthetic, auteur };
};

// Get extra context for a movie (cinematographer, writer, etc.)
export const getMovieContext = async (tmdbId: number): Promise<{
  cinematographer?: string;
  writer?: string;
  visualStyle?: string;
} | null> => {
  try {
    const details = await getMovieDetails(tmdbId);
    if (!details) return null;
    
    const cinematographer = details.credits?.crew?.find((c: any) => c.job === 'Director of Photography')?.name;
    const writer = details.credits?.crew?.find((c: any) => c.job === 'Screenplay' || c.job === 'Writer')?.name;
    
    // Generate a visual style description based on genres
    const genres = details.genres?.map((g: any) => g.name) || [];
    let visualStyle = 'cinematic visuals';
    
    if (genres.includes('Science Fiction')) visualStyle = 'futuristic, high-tech visuals';
    else if (genres.includes('Horror')) visualStyle = 'dark, atmospheric tension';
    else if (genres.includes('Romance')) visualStyle = 'warm, intimate cinematography';
    else if (genres.includes('Action')) visualStyle = 'dynamic, high-energy visuals';
    else if (genres.includes('Drama')) visualStyle = 'naturalistic, character-focused framing';
    
    return { cinematographer, writer, visualStyle };
  } catch {
    return null;
  }
};

// Extract dominant color from poster (fallback if Gemini doesn't provide accurate hex)
export const extractDominantColor = async (imageUrl: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = imageUrl;
    
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const size = 32;
        canvas.width = size;
        canvas.height = size;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve('#1a1a2e');
          return;
        }
        
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        
        // Simple average color extraction
        let r = 0, g = 0, b = 0, count = 0;
        
        for (let i = 0; i < data.length; i += 4) {
          // Skip very dark and very light pixels
          const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
          if (brightness > 30 && brightness < 220) {
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
            count++;
          }
        }
        
        if (count === 0) {
          resolve('#1a1a2e');
          return;
        }
        
        r = Math.round(r / count);
        g = Math.round(g / count);
        b = Math.round(b / count);
        
        // Darken the color slightly for better background use
        r = Math.round(r * 0.7);
        g = Math.round(g * 0.7);
        b = Math.round(b * 0.7);
        
        const hex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
        resolve(hex);
      } catch {
        resolve('#1a1a2e');
      }
    };
    
    img.onerror = () => {
      resolve('#1a1a2e');
    };
  });
};

