import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { logUserSignedIn, logUserSignedUp } from '../lib/analytics';

type AuthState = {
  user: User | null;
  loading: boolean;
  isWhitelisted: boolean | null;
};

type AuthContextType = AuthState & {
  checkWhitelist: (email: string) => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    isWhitelisted: null,
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const whitelisted = await checkWhitelistInternal(user.email || '');
        setState({ user, loading: false, isWhitelisted: whitelisted });
      } else {
        setState({ user: null, loading: false, isWhitelisted: null });
      }
    });

    return unsubscribe;
  }, []);

  const checkWhitelistInternal = async (email: string): Promise<boolean> => {
    if (!email) return false;
    try {
      const normalizedEmail = email.toLowerCase().trim();
      const whitelistRef = doc(db, 'whitelist', normalizedEmail);
      const whitelistDoc = await getDoc(whitelistRef);
      return whitelistDoc.exists() && whitelistDoc.data()?.allowed === true;
    } catch (error) {
      console.error('Error checking whitelist:', error);
      return false;
    }
  };

  const checkWhitelist = async (email: string): Promise<boolean> => {
    const result = await checkWhitelistInternal(email);
    return result;
  };

  const createUserProfile = async (user: User) => {
    const userRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      await setDoc(userRef, {
        profile: {
          displayName: user.displayName || user.email?.split('@')[0] || 'User',
          email: user.email,
          joinDate: serverTimestamp(),
          profileImage: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`,
        },
      });
    }
  };

  const signIn = async (email: string, password: string) => {
    const result = await signInWithEmailAndPassword(auth, email, password);
    await logUserSignedIn('email');
    const whitelisted = await checkWhitelistInternal(result.user.email || '');
    setState((prev) => ({ ...prev, isWhitelisted: whitelisted }));
  };

  const signUp = async (email: string, password: string) => {
    const whitelisted = await checkWhitelistInternal(email);
    if (!whitelisted) {
      throw new Error('Email not whitelisted');
    }
    
    const result = await createUserWithEmailAndPassword(auth, email, password);
    await createUserProfile(result.user);
    await logUserSignedUp('email');
    setState((prev) => ({ ...prev, isWhitelisted: true }));
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    
    const whitelisted = await checkWhitelistInternal(result.user.email || '');
    if (!whitelisted) {
      await firebaseSignOut(auth);
      throw new Error('Email not whitelisted');
    }
    
    await createUserProfile(result.user);
    await logUserSignedIn('google');
    setState((prev) => ({ ...prev, isWhitelisted: true }));
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setState({ user: null, loading: false, isWhitelisted: null });
  };

  return (
    <AuthContext.Provider
      value={{
        ...state,
        checkWhitelist,
        signIn,
        signUp,
        signInWithGoogle,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

