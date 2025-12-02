import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';

export type WatchlistItem = {
  id: string;
  movieId: number;
  title: string;
  year: string | number;
  poster: string;
  backdrop?: string;
  runtime?: string;
  addedAt: any;
  source?: 'imdb' | 'manual';
};

export function useWatchlist() {
  const { user } = useAuth();
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch watchlist items
  const fetchWatchlist = useCallback(async () => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }

    try {
      const watchlistRef = collection(db, 'users', user.uid, 'watchlist');
      const snapshot = await getDocs(watchlistRef);
      
      const watchlistItems = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as WatchlistItem[];

      // Sort by addedAt (most recent first)
      watchlistItems.sort((a, b) => {
        const aTime = a.addedAt?.toMillis?.() || a.addedAt?.seconds * 1000 || 0;
        const bTime = b.addedAt?.toMillis?.() || b.addedAt?.seconds * 1000 || 0;
        return bTime - aTime;
      });

      setItems(watchlistItems);
    } catch (error) {
      console.error('Failed to fetch watchlist:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Load watchlist on mount and when user changes
  useEffect(() => {
    fetchWatchlist();
  }, [fetchWatchlist]);

  // Add movie to watchlist
  const addToWatchlist = useCallback(
    async (movie: {
      movieId: number;
      title: string;
      year: string | number;
      poster: string;
      backdrop?: string;
      runtime?: string;
    }): Promise<string | null> => {
      if (!user) return null;

      try {
        const watchlistRef = collection(db, 'users', user.uid, 'watchlist');
        
        // Check if already exists
        const existing = items.find((item) => item.movieId === movie.movieId);
        if (existing) {
          console.log('Movie already in watchlist');
          return existing.id;
        }

        const docRef = await addDoc(watchlistRef, {
          ...movie,
          addedAt: serverTimestamp(),
          source: 'manual',
        });

        // Refresh the list
        await fetchWatchlist();
        
        return docRef.id;
      } catch (error) {
        console.error('Failed to add to watchlist:', error);
        return null;
      }
    },
    [user, items, fetchWatchlist]
  );

  // Remove movie from watchlist
  const removeFromWatchlist = useCallback(
    async (itemId: string): Promise<boolean> => {
      if (!user) return false;

      try {
        const docRef = doc(db, 'users', user.uid, 'watchlist', itemId);
        await deleteDoc(docRef);

        // Update local state
        setItems((prev) => prev.filter((item) => item.id !== itemId));
        
        return true;
      } catch (error) {
        console.error('Failed to remove from watchlist:', error);
        return false;
      }
    },
    [user]
  );

  // Check if a movie is in the watchlist
  const isInWatchlist = useCallback(
    (movieId: number): boolean => {
      return items.some((item) => item.movieId === movieId);
    },
    [items]
  );

  // Get watchlist item by movie ID
  const getWatchlistItem = useCallback(
    (movieId: number): WatchlistItem | undefined => {
      return items.find((item) => item.movieId === movieId);
    },
    [items]
  );

  return {
    items,
    loading,
    addToWatchlist,
    removeFromWatchlist,
    isInWatchlist,
    getWatchlistItem,
    refreshWatchlist: fetchWatchlist,
  };
}

