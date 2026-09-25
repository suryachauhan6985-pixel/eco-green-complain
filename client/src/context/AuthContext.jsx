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
      const hasLoggedOut = sessionStorage.getItem('egs_tab_logged_out') || 
        (localStorage.getItem('egs_logged_out') && !sessionStorage.getItem('egs_token'));
      if (token && !hasLoggedOut) {
        const cached = sessionStorage.getItem('egs_cached_user') || localStorage.getItem('egs_cached_user');
        if (cached) {
          sessionStorage.setItem('egs_cached_user', cached);
          return JSON.parse(cached);
        }
      }
    } catch (_) {}
    return null;
  });

  const [loading, setLoading] = useState(() => {
    try {
      const token = getAuthToken();
      const hasLoggedOut = sessionStorage.getItem('egs_tab_logged_out') || 
        (localStorage.getItem('egs_logged_out') && !sessionStorage.getItem('egs_token'));
      if (!token || hasLoggedOut) return false;
      const cached = sessionStorage.getItem('egs_cached_user') || localStorage.getItem('egs_cached_user');
      return !cached;
    } catch (_) {
      return false;
    }
  });
  const [unreadSimulatedCount, setUnreadSimulatedCount] = useState(0);

  // Initialize from token or verify active session
  useEffect(() => {
    const initAuth = async () => {
      const token = getAuthToken();
      const hasLoggedOut = sessionStorage.getItem('egs_tab_logged_out') || 
        (localStorage.getItem('egs_logged_out') && !sessionStorage.getItem('egs_token'));

      if (token && !hasLoggedOut) {
        try {
          // Fast verification with fallback to preserve offline/intermittent session
          const data = await api.getMe();
          if (data?.user) {
            setCurrentUser(data.user);
            try {
              sessionStorage.setItem('egs_cached_user', JSON.stringify(data.user));
            } catch (_) {}
          }
        } catch (err) {
          // Only invalidate token if server explicitly rejected auth (401/403)
          if (err.status === 401 || err.status === 403) {
            setAuthToken(null);
            setCurrentUser(null);
            try {
              sessionStorage.removeItem('egs_cached_user');
            } catch (_) {}
          }
        }
      } else {
        setCurrentUser(null);
        try {
          sessionStorage.removeItem('egs_cached_user');
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
      sessionStorage.setItem('egs_cached_user', JSON.stringify(data.user));
      sessionStorage.removeItem('egs_tab_logged_out');
      localStorage.setItem('egs_cached_user', JSON.stringify(data.user));
    } catch (_) {}
    localStorage.removeItem('egs_logged_out');
    
    // Check if there is a pending deep link redirect
    const urlParams = new URLSearchParams(window.location.search);
    const redirectTarget = urlParams.get('redirect');
    if (redirectTarget) {
      try {
        window.history.pushState(null, '', redirectTarget);
      } catch (_) {}
      return data.user;
    }

    const targetTab = data.user.role === 'technician' ? 'technician' : 'complaints';
    localStorage.setItem('egs_active_tab', targetTab);
    sessionStorage.setItem('egs_active_tab', targetTab);
    try {
      window.history.pushState(null, '', `/${targetTab}`);
    } catch (_) {}
    return data.user;
  };

  const logout = () => {
    setAuthToken(null);
    setCurrentUser(null);
    try {
      sessionStorage.removeItem('egs_cached_user');
      sessionStorage.setItem('egs_tab_logged_out', 'true');
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
