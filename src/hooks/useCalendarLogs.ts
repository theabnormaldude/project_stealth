import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';

type RatingValue = 'up' | 'down' | null;

export type CalendarEvent = {
  id: string;
  movieId: number;
  title: string;
  poster: string;
  date: string;
  inviteFriend: boolean;
  rating?: RatingValue;
  backdrop?: string;
  mediaType?: 'movie' | 'tv';
  year?: number | string;
  runtimeLabel?: string;
  accentStart?: string;
  accentEnd?: string;
  accentText?: string;
  createdAt?: any;
  updatedAt?: any;
};

export type CalendarEventInput = Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'>;

export function useCalendarLogs() {
  const { user } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setEvents([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const logsRef = collection(db, 'users', user.uid, 'calendar_logs');
    const logsQuery = query(logsRef, orderBy('date', 'desc'));

    const unsubscribe = onSnapshot(
      logsQuery,
      (snapshot) => {
        const logs: CalendarEvent[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as CalendarEvent[];
        setEvents(logs);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('Error fetching calendar logs:', err);
        setError('Failed to load your movie logs');
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [user]);

  const addEvent = useCallback(
    async (eventData: CalendarEventInput): Promise<string> => {
      if (!user) throw new Error('Not authenticated');

      const logsRef = collection(db, 'users', user.uid, 'calendar_logs');
      const docRef = await addDoc(logsRef, {
        ...eventData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return docRef.id;
    },
    [user]
  );

  const updateEvent = useCallback(
    async (eventId: string, eventData: Partial<CalendarEventInput>): Promise<void> => {
      if (!user) throw new Error('Not authenticated');

      const eventRef = doc(db, 'users', user.uid, 'calendar_logs', eventId);
      await updateDoc(eventRef, {
        ...eventData,
        updatedAt: serverTimestamp(),
      });
    },
    [user]
  );

  const deleteEvent = useCallback(
    async (eventId: string): Promise<void> => {
      if (!user) throw new Error('Not authenticated');

      const eventRef = doc(db, 'users', user.uid, 'calendar_logs', eventId);
      await deleteDoc(eventRef);
    },
    [user]
  );

  const getEventsForDate = useCallback(
    (date: Date | null): CalendarEvent[] => {
      if (!date) return [];
      return events.filter((event) => {
        const eventDate = new Date(event.date);
        return (
          eventDate.getDate() === date.getDate() &&
          eventDate.getMonth() === date.getMonth() &&
          eventDate.getFullYear() === date.getFullYear()
        );
      });
    },
    [events]
  );

  // Delete all events from a specific source (e.g., 'imdb', 'letterboxd')
  const deleteEventsBySource = useCallback(
    async (source: string): Promise<number> => {
      if (!user) throw new Error('Not authenticated');

      const eventsToDelete = events.filter((event: any) => event.source === source);
      let deleted = 0;

      for (const event of eventsToDelete) {
        try {
          const eventRef = doc(db, 'users', user.uid, 'calendar_logs', event.id);
          await deleteDoc(eventRef);
          deleted++;
        } catch (err) {
          console.error(`Failed to delete event ${event.id}:`, err);
        }
      }

      return deleted;
    },
    [user, events]
  );

  // Delete events for a specific date that match a source
  const deleteEventsByDateAndSource = useCallback(
    async (date: string, source: string): Promise<number> => {
      if (!user) throw new Error('Not authenticated');

      const eventsToDelete = events.filter((event: any) => 
        event.date === date && event.source === source
      );
      let deleted = 0;

      for (const event of eventsToDelete) {
        try {
          const eventRef = doc(db, 'users', user.uid, 'calendar_logs', event.id);
          await deleteDoc(eventRef);
          deleted++;
        } catch (err) {
          console.error(`Failed to delete event ${event.id}:`, err);
        }
      }

      return deleted;
    },
    [user, events]
  );

  return {
    events,
    loading,
    error,
    addEvent,
    updateEvent,
    deleteEvent,
    getEventsForDate,
    deleteEventsBySource,
    deleteEventsByDateAndSource,
  };
}

