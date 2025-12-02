const GEMINI_API_KEY =
  (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_GEMINI_API_KEY) ||
  'AIzaSyBfGOJNCq4-Jj8bc0DiRfEwEOkjDwzgVDU';

// Persistent cache using localStorage for longer-term storage
const CACHE_PREFIX = 'gemini_cache_';
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

// In-memory cache for current session (faster lookups)
const memoryCache = new Map<string, { value: string; timestamp: number }>();

// Rate limiting for paid tier (much more generous)
let lastCallTime = 0;
const MIN_CALL_INTERVAL = 100; // 100ms between calls (paid tier can handle 1000+/min)

const hashPrompt = (prompt: string): string => {
  let hash = 0;
  for (let i = 0; i < prompt.length; i++) {
    const char = prompt.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString();
};

// Try to get from localStorage
const getFromStorage = (key: string): string | null => {
  try {
    const stored = localStorage.getItem(CACHE_PREFIX + key);
    if (stored) {
      const { value, timestamp } = JSON.parse(stored);
      if (Date.now() - timestamp < CACHE_TTL) {
        return value;
      }
      // Expired, remove it
      localStorage.removeItem(CACHE_PREFIX + key);
    }
  } catch {
    // localStorage not available or parse error
  }
  return null;
};

// Save to localStorage
const saveToStorage = (key: string, value: string): void => {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({
      value,
      timestamp: Date.now(),
    }));
  } catch {
    // localStorage full or not available - that's okay
  }
};

// Clean up old cache entries periodically
const cleanupOldCache = (): void => {
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX));
    keys.forEach(key => {
      const stored = localStorage.getItem(key);
      if (stored) {
        try {
          const { timestamp } = JSON.parse(stored);
          if (Date.now() - timestamp > CACHE_TTL) {
            localStorage.removeItem(key);
          }
        } catch {
          localStorage.removeItem(key);
        }
      }
    });
  } catch {
    // Ignore errors
  }
};

// Run cleanup on load
cleanupOldCache();

export const callGemini = async (prompt: string): Promise<string | null> => {
  const cacheKey = hashPrompt(prompt);
  
  // Check memory cache first (fastest)
  const memoryCached = memoryCache.get(cacheKey);
  if (memoryCached && Date.now() - memoryCached.timestamp < CACHE_TTL) {
    console.log('Gemini: memory cache hit');
    return memoryCached.value;
  }
  
  // Check localStorage cache (persists across sessions)
  const storageCached = getFromStorage(cacheKey);
  if (storageCached) {
    console.log('Gemini: storage cache hit');
    // Also add to memory cache for faster future lookups
    memoryCache.set(cacheKey, { value: storageCached, timestamp: Date.now() });
    return storageCached;
  }

  // Rate limiting (light touch for paid tier)
  const now = Date.now();
  const timeSinceLastCall = now - lastCallTime;
  if (timeSinceLastCall < MIN_CALL_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_CALL_INTERVAL - timeSinceLastCall));
  }
  lastCallTime = Date.now();

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 500,
          }
        }),
      }
    );

    if (!response.ok) {
      console.error('Gemini API error:', response.status);
      return null;
    }

    const data = await response.json();
    const result = data.candidates?.[0]?.content?.parts?.[0]?.text || null;
    
    // Cache successful responses in both memory and storage
    if (result) {
      memoryCache.set(cacheKey, { value: result, timestamp: Date.now() });
      saveToStorage(cacheKey, result);
    }
    
    return result;
  } catch (error) {
    console.error('Gemini API call failed:', error);
    return null;
  }
};

// Batch multiple prompts into a single context for efficiency
export const callGeminiBatch = async (prompts: { id: string; prompt: string }[]): Promise<Map<string, string | null>> => {
  const results = new Map<string, string | null>();
  
  // Check cache for each prompt first
  const uncachedPrompts: { id: string; prompt: string }[] = [];
  
  for (const { id, prompt } of prompts) {
    const cacheKey = hashPrompt(prompt);
    const memoryCached = memoryCache.get(cacheKey);
    if (memoryCached && Date.now() - memoryCached.timestamp < CACHE_TTL) {
      results.set(id, memoryCached.value);
      continue;
    }
    const storageCached = getFromStorage(cacheKey);
    if (storageCached) {
      memoryCache.set(cacheKey, { value: storageCached, timestamp: Date.now() });
      results.set(id, storageCached);
      continue;
    }
    uncachedPrompts.push({ id, prompt });
  }
  
  // If all cached, return early
  if (uncachedPrompts.length === 0) {
    console.log('Gemini batch: all from cache');
    return results;
  }
  
  // For uncached prompts, make individual calls (Gemini doesn't support true batching)
  // But we can run them in parallel with a small concurrency limit
  const CONCURRENCY = 3;
  
  for (let i = 0; i < uncachedPrompts.length; i += CONCURRENCY) {
    const batch = uncachedPrompts.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async ({ id, prompt }) => {
        const result = await callGemini(prompt);
        return { id, result };
      })
    );
    
    batchResults.forEach(({ id, result }) => {
      results.set(id, result);
    });
  }
  
  return results;
};

// Pre-warm cache for a movie (call in background)
export const preWarmMovieCache = async (movieTitle: string, movieYear: string, genres: string[]): Promise<void> => {
  const vibePrompt = `You're a witty film critic. Describe the VIBE of "${movieTitle}" (${movieYear}) in 1-2 sentences.
Genres: ${genres.join(', ')}
Focus on mood, style, and tone - NOT plot. Be playful and specific.
DO NOT spoil anything. Keep it under 2 sentences.`;
  
  // Fire and forget - don't await
  callGemini(vibePrompt).catch(() => {});
};
