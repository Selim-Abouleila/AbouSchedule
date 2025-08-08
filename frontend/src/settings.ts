import { endpoints } from './api';
import { getToken } from './auth';

interface AppSettings {
  defaultLabelDone: boolean;
}

const defaultSettings: AppSettings = {
  defaultLabelDone: true,
};

export const saveSettings = async (settings: Partial<AppSettings>, userId?: number) => {
  try {
    const token = await getToken();
    if (!token) {
      throw new Error('No authentication token');
    }

    if (userId) {
      // Save per-user settings (admin only)
      const response = await fetch(`${endpoints.admin.settings(userId)}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        throw new Error(`Failed to save user settings: ${response.status}`);
      }
    } else {
      // Save current user's settings
      const response = await fetch(`${endpoints.base}/settings`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        throw new Error(`Failed to save settings: ${response.status}`);
      }
    }
  } catch (error) {
    console.error('Error saving settings:', error);
    throw error;
  }
};

export const getSettings = async (): Promise<AppSettings> => {
  try {
    const token = await getToken();
    if (!token) {
      throw new Error('No authentication token');
    }

    const response = await fetch(`${endpoints.base}/settings`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get settings: ${response.status}`);
    }

    const settings = await response.json();
    return { ...defaultSettings, ...settings };
  } catch (error) {
    console.error('Error loading settings:', error);
    return defaultSettings;
  }
};

export const getUserSettings = async (): Promise<{ [userId: number]: AppSettings }> => {
  // This function is no longer needed as we use direct API calls
  // Keeping for backward compatibility but it's deprecated
  console.warn('getUserSettings is deprecated, use getSettingsForUser instead');
  return {};
};

export const getSettingsForUser = async (userId?: number): Promise<AppSettings> => {
  try {
    const token = await getToken();
    if (!token) {
      throw new Error('No authentication token');
    }

    if (userId) {
      // Get per-user settings (admin only)
      const response = await fetch(`${endpoints.admin.settings(userId)}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get user settings: ${response.status}`);
      }

      const settings = await response.json();
      return { ...defaultSettings, ...settings };
    } else {
      // Get current user's settings
      return await getSettings();
    }
  } catch (error) {
    console.error('Error loading user settings:', error);
    return defaultSettings;
  }
};

export const getDefaultLabelDone = async (userId?: number): Promise<boolean> => {
  const settings = await getSettingsForUser(userId);
  return settings.defaultLabelDone;
};

export const deleteUserSettings = async (userId: number) => {
  try {
    const token = await getToken();
    if (!token) {
      throw new Error('No authentication token');
    }

    // For now, we'll set the user's settings back to global defaults
    // In the future, we could add a DELETE endpoint to the backend
    const globalSettings = await getSettings();
    await saveSettings(globalSettings, userId);
  } catch (error) {
    console.error('Error deleting user settings:', error);
    throw error;
  }
};

 