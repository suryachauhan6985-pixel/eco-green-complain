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
      } else if (!hasLoggedOut) {
        await quickLogin('admin@ecogreensolar.com', 'admin123');
      } else {
        setCurrentUser(null);
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const quickLogin = async (email, password) => {
    try {
      const data = await api.login(email, password);
      setAuthToken(data.token);
      setCurrentUser(data.user);
      localStorage.removeItem('egs_logged_out');
      return data.user;
    } catch (err) {
      console.error('Quick login failed:', err);
    }
  };

  const switchRole = async (targetRole) => {
    setLoading(true);
    try {
      if (targetRole === 'customer') {
        setAuthToken(null);
        setCurrentUser({ id: null, name: 'Customer (Public Portal)', role: 'customer', email: 'guest@portal' });
      } else if (targetRole === 'admin') {
        await quickLogin('admin@ecogreensolar.com', 'admin123');
      } else if (targetRole === 'staff') {
        await quickLogin('staff@ecogreensolar.com', 'staff123');
      } else if (targetRole === 'technician') {
        await quickLogin('rohit.tech@ecogreensolar.com', 'tech123');
      }
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    const data = await api.login(email, password);
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
