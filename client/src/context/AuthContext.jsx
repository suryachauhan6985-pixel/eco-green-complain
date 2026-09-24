import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, setAuthToken, getAuthToken } from '../api/client';

const AuthContext = createContext();

export const DEMO_PROFILES = {
  admin: { email: 'admin@ecogreensolar.com', username: 'admin', phone: '6352454247', name: 'Admin Supervisor', role: 'admin' },
  customer: { email: 'customer@portal.local', name: 'Customer View', role: 'customer' }
};

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const token = getAuthToken();
      const hasLoggedOut = localStorage.getItem('egs_logged_out');
      if (token && !hasLoggedOut) {
        const cached = localStorage.getItem('egs_cached_user');
        return cached ? JSON.parse(cached) : null;
      }
    } catch (_) {}
    return null;
  });

  const [loading, setLoading] = useState(() => {
    try {
      const token = getAuthToken();
      const hasLoggedOut = localStorage.getItem('egs_logged_out');
      if (!token || hasLoggedOut) return false;
      const cached = localStorage.getItem('egs_cached_user');
      return !cached; // 0ms load if cached user exists
    } catch (_) {
      return false;
    }
  });
  const [unreadSimulatedCount, setUnreadSimulatedCount] = useState(0);

  // Initialize from token or default to Admin profile on first load
  useEffect(() => {
    const initAuth = async () => {
      const token = getAuthToken();
      const hasLoggedOut = localStorage.getItem('egs_logged_out');

      if (token && !hasLoggedOut) {
        try {
          // Fast verification with fallback to preserve offline/intermittent session
          const data = await api.getMe();
          if (data?.user) {
            setCurrentUser(data.user);
            try {
              localStorage.setItem('egs_cached_user', JSON.stringify(data.user));
            } catch (_) {}
          }
        } catch (err) {
          // Only invalidate token if server explicitly rejected auth (401/403)
          if (err.status === 401 || err.status === 403) {
            setAuthToken(null);
            setCurrentUser(null);
            try {
              localStorage.removeItem('egs_cached_user');
            } catch (_) {}
          }
        }
      } else {
        setCurrentUser(null);
        try {
          localStorage.removeItem('egs_cached_user');
        } catch (_) {}
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const login = async (identifier, password) => {
    const data = await api.login(identifier, password);
    setAuthToken(data.token);
    setCurrentUser(data.user);
    try {
      localStorage.setItem('egs_cached_user', JSON.stringify(data.user));
    } catch (_) {}
    localStorage.removeItem('egs_logged_out');
    localStorage.setItem('egs_active_tab', 'complaints');
    try {
      window.history.pushState(null, '', '/complaints');
    } catch (_) {}
    return data.user;
  };

  const logout = () => {
    setAuthToken(null);
    setCurrentUser(null);
    try {
      localStorage.removeItem('egs_cached_user');
    } catch (_) {}
    localStorage.setItem('egs_logged_out', 'true');
  };

  const switchRole = (role) => {
    if (role === 'customer') {
      setCurrentUser({
        id: 0,
        name: 'Public Customer Portal',
        role: 'customer',
        email: 'customer@portal.local'
      });
      return;
    }
    const profile = DEMO_PROFILES[role];
    if (profile) {
      setCurrentUser({
        id: profile.role === 'admin' ? 1 : profile.role === 'staff' ? 2 : 3,
        ...profile
      });
    }
  };

  return (
    <AuthContext.Provider value={{
      currentUser,
      setCurrentUser,
      loading,
      login,
      logout,
      switchRole,
      unreadSimulatedCount,
      setUnreadSimulatedCount
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
