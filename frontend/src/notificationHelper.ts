import { Alert } from 'react-native';
import { getToken } from './auth';
import { API_BASE } from './api';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

interface Task {
  id: number;
  title: string;
  description?: string;
  priority: 'NONE' | 'ONE' | 'TWO' | 'THREE' | 'IMMEDIATE' | 'RECURRENT';
  createdAt: string;
}

let lastCheckTime: string | null = null;
let isChecking = false;

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Request notification permissions
export const requestNotificationPermissions = async () => {
  if (Device.isDevice) {
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
        console.log('Sending push notification for task:', task.title);
        
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'New Immediate Task',
            body: `You have a new immediate task: "${task.title}"${task.description ? `\n\n${task.description}` : ''}`,
            data: { taskId: task.id },
          },
          trigger: null, // Send immediately
        });
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

 