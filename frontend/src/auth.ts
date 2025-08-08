import * as SecureStore from 'expo-secure-store';
import { jwtDecode } from 'jwt-decode';

const KEY = 'abouschedule_jwt';

export const saveToken   = (t: string) => SecureStore.setItemAsync(KEY, t);
export const getToken    = ()          => SecureStore.getItemAsync(KEY);
export const clearToken  = ()          => SecureStore.deleteItemAsync(KEY);

interface JwtPayload {
  sub: number;
  role: 'ADMIN' | 'EMPLOYEE';
}

export const getUserRole = async (): Promise<'ADMIN' | 'EMPLOYEE' | null> => {
  try {
    const token = await getToken();
    if (!token) return null;
    
    const decoded = jwtDecode<JwtPayload>(token);
    return decoded.role;
  } catch (error) {
    console.error('Error decoding JWT:', error);
    return null;
  }
};

export const getCurrentUserId = async (): Promise<number | null> => {
  try {
    const token = await getToken();
    if (!token) return null;
    
    const decoded = jwtDecode<JwtPayload>(token);
    return decoded.sub;
  } catch (error) {
    console.error('Error decoding JWT:', error);
    return null;
  }
};

export const isAdmin = async (): Promise<boolean> => {
  const role = await getUserRole();
  return role === 'ADMIN';
};

// Auth state management
type AuthListener = (isAuthenticated: boolean) => void;
const authListeners: AuthListener[] = [];

export const addAuthListener = (listener: AuthListener) => {
  authListeners.push(listener);
};

export const removeAuthListener = (listener: AuthListener) => {
  const index = authListeners.indexOf(listener);
  if (index > -1) {
    authListeners.splice(index, 1);
  }
};

export const notifyAuthListeners = async () => {
  const token = await getToken();
  const isAuthenticated = !!token;
  authListeners.forEach(listener => listener(isAuthenticated));
};

// Enhanced token functions that notify listeners
export const saveTokenAndNotify = async (token: string) => {
  await saveToken(token);
  await notifyAuthListeners();
};

export const clearTokenAndNotify = async () => {
  await clearToken();
  await notifyAuthListeners();
};
