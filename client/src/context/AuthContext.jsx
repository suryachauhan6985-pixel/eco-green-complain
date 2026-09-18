import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, setAuthToken, getAuthToken } from '../api/client';

const AuthContext = createContext();

export const DEMO_PROFILES = {
  admin: { email: 'admin@ecogreensolar.com', name: 'Admin Supervisor', role: 'admin' },
  staff: { email: 'staff@ecogreensolar.com', name: 'Pooja Sharma (Helpdesk)', role: 'staff' },
  technician: { email: 'rohit.tech@ecogreensolar.com', name: 'Rohit Kumar', role: 'technician' },
  customer: { email: 'customer@portal.local', name: 'Customer View', role: 'customer' }
};

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unreadSimulatedCount, setUnreadSimulatedCount] = useState(0);

  // Initialize from token or default to Admin profile on first load
  useEffect(() => {
    const initAuth = async () => {
      const token = getAuthToken();
      const hasLoggedOut = localStorage.getItem('egs_logged_out');

      if (token && !hasLoggedOut) {
        try {
          const data = await api.getMe();
          setCurrentUser(data.user);
        } catch {
          setAuthToken(null);
          setCurrentUser(null);
        }
      } else {
        setCurrentUser(null);
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const login = async (identifier, password) => {
    const data = await api.login(identifier, password);
    setAuthToken(data.token);
    setCurrentUser(data.user);
    localStorage.removeItem('egs_logged_out');
    return data.user;
  };

  const logout = () => {
    setAuthToken(null);
    setCurrentUser(null);
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
