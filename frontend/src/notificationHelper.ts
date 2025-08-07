import { Alert } from 'react-native';
import { getToken } from './auth';
import { API_BASE } from './api';
import * as Device from 'expo-device';

// Conditionally import notifications to avoid warnings in Expo Go
let Notifications: any = null;
let notificationsSupported = false;

try {
  // Only import and configure notifications if they're supported
  Notifications = require('expo-notifications');
  notificationsSupported = true;
  
  // Configure notification behavior only if supported
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  
  console.log('Notifications are supported and configured');
} catch (error) {
  console.log('Notifications not supported in this environment (likely Expo Go)');
  notificationsSupported = false;
}

interface Task {
  id: number;
  title: string;
  description?: string;
  priority: 'NONE' | 'ONE' | 'TWO' | 'THREE' | 'IMMEDIATE' | 'RECURRENT';
  createdAt: string;
}

let lastCheckTime: string | null = null;
let isChecking = false;

// Request notification permissions
export const requestNotificationPermissions = async () => {
  if (!notificationsSupported) {
    console.log('Notifications not supported in this environment - skipping permission request');
    return false;
  }

  if (Device.isDevice) {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        console.log('Failed to get push token for push notification!');
        return false;
      }
      
      return true;
    } catch (error) {
      console.log('Error requesting notification permissions:', error);
      return false;
    }
  } else {
    console.log('Must use physical device for Push Notifications');
    return false;
  }
};

export const checkForNewImmediateTasks = async (): Promise<void> => {
  if (isChecking) return; // Prevent multiple simultaneous checks
  
  try {
    isChecking = true;
    const token = await getToken();
    if (!token) {
      console.log('No token found, skipping notification check');
      return;
    }

    // Get current time for this check
    const now = new Date().toISOString();
    console.log('Checking for new tasks since:', lastCheckTime || 'beginning of time');
    
    // Fetch tasks created since last check
    const response = await fetch(`${API_BASE}/tasks?since=${lastCheckTime || ''}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    console.log('API response status:', response.status);

    if (response.ok) {
      const data = await response.json();
      const tasks: Task[] = data.tasks || [];
      console.log('Found', tasks.length, 'total tasks');
      
      // Filter for immediate tasks created since last check
      const newImmediateTasks = tasks.filter(task => 
        task.priority === 'IMMEDIATE' && 
        (!lastCheckTime || new Date(task.createdAt) > new Date(lastCheckTime))
      );

      console.log('Found', newImmediateTasks.length, 'new immediate tasks');

      // Send push notifications for new immediate tasks
      for (const task of newImmediateTasks) {
        console.log('Found new immediate task:', task.title);
        
        if (notificationsSupported) {
          try {
            console.log('Sending push notification for task:', task.title);
            await Notifications.scheduleNotificationAsync({
              content: {
                title: 'New Immediate Task',
                body: `You have a new immediate task: "${task.title}"${task.description ? `\n\n${task.description}` : ''}`,
                data: { taskId: task.id },
              },
              trigger: null, // Send immediately
            });
          } catch (error) {
            console.log('Failed to send notification:', error);
          }
        } else {
          console.log('Notifications not supported - would have notified about:', task.title);
        }
      }
    } else {
      console.log('API request failed with status:', response.status);
    }

    // Update last check time
    lastCheckTime = now;
  } catch (error) {
    console.error('Error checking for new tasks:', error);
  } finally {
    isChecking = false;
  }
};

// Start periodic checking (every 30 seconds)
export const startTaskChecking = (): (() => void) => {
  const interval = setInterval(checkForNewImmediateTasks, 30000); // 30 seconds
  
  // Return cleanup function
  return () => clearInterval(interval);
};

 