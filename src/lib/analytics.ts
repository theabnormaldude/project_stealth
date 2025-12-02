import { logEvent } from 'firebase/analytics';
import { analyticsPromise } from './firebase';

export const logMovieAdded = async (genre: string, date: string) => {
  const analytics = await analyticsPromise;
  if (analytics) {
    logEvent(analytics, 'movie_added', { genre, date });
  }
};

export const logRecommendationGenerated = async (latencyMs: number, tokenCount: number) => {
  const analytics = await analyticsPromise;
  if (analytics) {
    logEvent(analytics, 'recommendation_generated', {
      latency_ms: latencyMs,
      token_count: tokenCount,
    });
  }
};

export const logUserSignedIn = async (method: 'email' | 'google') => {
  const analytics = await analyticsPromise;
  if (analytics) {
    logEvent(analytics, 'login', { method });
  }
};

export const logUserSignedUp = async (method: 'email' | 'google') => {
  const analytics = await analyticsPromise;
  if (analytics) {
    logEvent(analytics, 'sign_up', { method });
  }
};

export const logFeedbackSubmitted = async () => {
  const analytics = await analyticsPromise;
  if (analytics) {
    logEvent(analytics, 'feedback_submitted');
  }
};

// Discovery flow analytics
export const logDiscoveryOpened = async () => {
  const analytics = await analyticsPromise;
  if (analytics) {
    logEvent(analytics, 'discovery_opened');
  }
};

export const logMovieDetailViewed = async (movieId: number, title: string) => {
  const analytics = await analyticsPromise;
  if (analytics) {
    logEvent(analytics, 'movie_detail_viewed', { movie_id: movieId, title });
  }
};

export const logPatternTriggered = async (movieCount: number) => {
  const analytics = await analyticsPromise;
  if (analytics) {
    logEvent(analytics, 'pattern_triggered', { movie_count: movieCount });
  }
};

export const logShowMoreTapped = async () => {
  const analytics = await analyticsPromise;
  if (analytics) {
    logEvent(analytics, 'show_more_tapped');
  }
};

export const logVibeSaved = async (movieCount: number) => {
  const analytics = await analyticsPromise;
  if (analytics) {
    logEvent(analytics, 'vibe_saved', { movie_count: movieCount });
  }
};

export const logMovieAddedFromDiscovery = async (movieId: number, action: 'calendar' | 'watchlist' | 'seen') => {
  const analytics = await analyticsPromise;
  if (analytics) {
    logEvent(analytics, 'movie_added_discovery', { movie_id: movieId, action });
  }
};

