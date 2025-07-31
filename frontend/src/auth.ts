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

export const isAdmin = async (): Promise<boolean> => {
  const role = await getUserRole();
  return role === 'ADMIN';
};
