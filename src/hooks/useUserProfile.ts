import { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';

export type UserProfile = {
  displayName: string;
  email: string;
  joinDate: any;
  profileImage: string;
};

export function useUserProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const userRef = doc(db, 'users', user.uid);

    const unsubscribe = onSnapshot(
      userRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setProfile(data.profile as UserProfile);
        } else {
          setProfile(null);
        }
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('Error fetching user profile:', err);
        setError('Failed to load profile');
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [user]);

  const updateProfile = useCallback(
    async (updates: Partial<UserProfile>): Promise<void> => {
      if (!user) throw new Error('Not authenticated');

      const userRef = doc(db, 'users', user.uid);
      const profileUpdates: Record<string, any> = {
        profile: {
          ...profile,
          ...updates,
          updatedAt: serverTimestamp(),
        },
      };
      
      // Use setDoc with merge to create doc if it doesn't exist
      await setDoc(userRef, profileUpdates, { merge: true });
    },
    [user, profile]
  );

  const updateProfileImage = useCallback(
    async (imageUrl: string): Promise<void> => {
      await updateProfile({ profileImage: imageUrl });
    },
    [updateProfile]
  );

  return {
    profile,
    loading,
    error,
    updateProfile,
    updateProfileImage,
    profileImage: profile?.profileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.uid || 'default'}`,
  };
}

