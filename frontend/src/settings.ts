import * as SecureStore from 'expo-secure-store';

const SETTINGS_KEY = 'abouschedule_settings';
const USER_SETTINGS_KEY = 'abouschedule_user_settings';

interface AppSettings {
  defaultLabelDone: boolean;
}

interface UserSettings {
  [userId: number]: AppSettings;
}

const defaultSettings: AppSettings = {
  defaultLabelDone: true,
};

export const saveSettings = async (settings: Partial<AppSettings>, userId?: number) => {
  try {
    if (userId) {
      // Save per-user settings
      const currentUserSettings = await getUserSettings();
      const currentUserSetting = currentUserSettings[userId] || {};
      const newUserSetting = { ...currentUserSetting, ...settings };
      currentUserSettings[userId] = newUserSetting;
      await SecureStore.setItemAsync(USER_SETTINGS_KEY, JSON.stringify(currentUserSettings));
    } else {
      // Save global settings
      const currentSettings = await getSettings();
      const newSettings = { ...currentSettings, ...settings };
      await SecureStore.setItemAsync(SETTINGS_KEY, JSON.stringify(newSettings));
    }
  } catch (error) {
    console.error('Error saving settings:', error);
  }
};

export const getSettings = async (): Promise<AppSettings> => {
  try {
    const settingsJson = await SecureStore.getItemAsync(SETTINGS_KEY);
    if (settingsJson) {
      const settings = JSON.parse(settingsJson);
      return { ...defaultSettings, ...settings };
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
  return defaultSettings;
};

export const getUserSettings = async (): Promise<UserSettings> => {
  try {
    const settingsJson = await SecureStore.getItemAsync(USER_SETTINGS_KEY);
    if (settingsJson) {
      return JSON.parse(settingsJson);
    }
  } catch (error) {
    console.error('Error loading user settings:', error);
  }
  return {};
};

export const getSettingsForUser = async (userId?: number): Promise<AppSettings> => {
  if (userId) {
    // Get per-user settings
    const userSettings = await getUserSettings();
    const userSetting = userSettings[userId];
    if (userSetting && Object.keys(userSetting).length > 0) {
      // User has specific settings, merge with defaults
      return { ...defaultSettings, ...userSetting };
    }
  }
  // Fall back to global settings
  return await getSettings();
};

export const getDefaultLabelDone = async (userId?: number): Promise<boolean> => {
  const settings = await getSettingsForUser(userId);
  return settings.defaultLabelDone;
};

export const deleteUserSettings = async (userId: number) => {
  try {
    const userSettings = await getUserSettings();
    delete userSettings[userId];
    await SecureStore.setItemAsync(USER_SETTINGS_KEY, JSON.stringify(userSettings));
  } catch (error) {
    console.error('Error deleting user settings:', error);
  }
};

 