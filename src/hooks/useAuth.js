import { useState, useEffect } from 'react';
import { auth, googleProvider } from '../firebase-config';
import { signInWithPopup, onAuthStateChanged, signOut } from 'firebase/auth';
import { ALLOWED_EMAILS } from '../constants';

export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u && ALLOWED_EMAILS.includes(u.email)) {
        setUser(u);
      } else if (u) {
        signOut(auth);
        setUser(null);
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const login = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error('Login failed:', err);
    }
  };

  const logout = () => signOut(auth);

  return { user, loading, login, logout };
};
