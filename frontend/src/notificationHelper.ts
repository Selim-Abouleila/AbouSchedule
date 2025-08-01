import { Alert } from 'react-native';
import { getToken } from './auth';
import { API_BASE } from './api';

interface Task {
  id: number;
  title: string;
  description?: string;
  immediate: boolean;
  createdAt: string;
}

let lastCheckTime: string | null = null;
let isChecking = false;

export const checkForNewImmediateTasks = async (): Promise<void> => {
  if (isChecking) return; // Prevent multiple simultaneous checks
  
  try {
    isChecking = true;
    const token = await getToken();
    if (!token) return;

    // Get current time for this check
    const now = new Date().toISOString();
    
    // Fetch tasks created since last check
    const response = await fetch(`${API_BASE}/tasks?since=${lastCheckTime || ''}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (response.ok) {
      const tasks: Task[] = await response.json();
      
      // Filter for immediate tasks created since last check
      const newImmediateTasks = tasks.filter(task => 
        task.immediate && 
        (!lastCheckTime || new Date(task.createdAt) > new Date(lastCheckTime))
      );

      // Show notifications for new immediate tasks
      newImmediateTasks.forEach(task => {
        Alert.alert(
          'New Immediate Task',
          `You have a new immediate task: "${task.title}"${task.description ? `\n\n${task.description}` : ''}`,
          [
            { text: 'View Later', style: 'cancel' },
            { 
              text: 'View Now', 
              style: 'default',
              onPress: () => {
                // Navigate to tasks page
                // You can add navigation logic here
              }
            }
          ]
        );
      });
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

// Manual check (can be called when app comes to foreground)
export const manualCheckForNewTasks = async (): Promise<void> => {
  await checkForNewImmediateTasks();
}; 