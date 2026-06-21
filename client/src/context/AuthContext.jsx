import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '../config/firebase';
import toast from 'react-hot-toast';
import api from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);        // MongoDB user profile
  const [firebaseUser, setFirebaseUser] = useState(null); // Firebase auth user
  const [loading, setLoading] = useState(true);

  // When Firebase auth state changes, sync with our backend.
  // We flip `loading` back to true during the sync so route guards show a
  // spinner instead of bouncing the user to /login while the MongoDB profile
  // is still loading.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);

      if (fbUser) {
        setLoading(true);
        try {
          const token = await fbUser.getIdToken();
          const { data } = await api.post('/auth/firebase-sync', {
            token,
            name: fbUser.displayName || fbUser.email?.split('@')[0] || 'User',
            avatar: fbUser.photoURL || '',
          });
          setUser(data.user);
        } catch (err) {
          console.error('Auth sync error:', err);
          const status = err.response?.status;
          if (status === 401 || status === 403) {
            setUser(null);
            signOut(auth).catch(console.error);
            toast.error('Session expired. Please login again.');
          } else {
            // Network/server error. Keep previous profile to prevent logout on WiFi switch.
            setUser((prev) => {
              if (prev) {
                toast.error('Network connection error. Running in offline mode.');
                return prev;
              }
              toast.error('Unable to connect to server. Please check your network.');
              return null;
            });
          }
        }
      } else {
        setUser(null);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = useCallback(async () => {
    try {
      await signOut(auth);
      setUser(null);
      setFirebaseUser(null);
    } catch (err) {
      console.error('Logout error:', err);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, firebaseUser, loading, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
