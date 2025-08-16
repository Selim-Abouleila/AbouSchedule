import { getToken } from './auth';
import { endpoints } from './api';
import { router } from 'expo-router';

// Handle notification actions
export const handleNotificationAction = async (action: string, data: any) => {
  console.log('🔔 Handling notification action:', action, data);

  try {
    switch (action) {
      case 'ignore':
        await handleIgnoreAction(data);
        break;
      case 'view':
        await handleViewAction(data);
        break;
      default:
        console.log('Unknown notification action:', action);
    }
  } catch (error) {
    console.error('Error handling notification action:', error);
  }
};

// Handle ignore action - disable notifications for the task
const handleIgnoreAction = async (data: any) => {
  try {
    const { taskId } = data;
    if (!taskId) {
      console.error('No taskId provided for ignore action');
      return;
    }

    const authToken = await getToken();
    if (!authToken) {
      console.error('No auth token available for ignore action');
      return;
    }

    console.log(`🔕 Ignoring notifications for task ${taskId}`);

    const response = await fetch(endpoints.admin.ignoreTaskNotifications(taskId), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Successfully ignored notifications for task:', result);
    } else {
      console.error('❌ Failed to ignore notifications for task:', response.status);
    }
  } catch (error) {
    console.error('Error in handleIgnoreAction:', error);
  }
};

// Handle view action - navigate to the task
const handleViewAction = async (data: any) => {
  try {
    const { taskId } = data;
    if (!taskId) {
      console.error('No taskId provided for view action');
      return;
    }

    console.log(`👁️ Navigating to task ${taskId}`);
    
    // Navigate to the task detail page
    router.push(`/tasks/${taskId}`);
  } catch (error) {
    console.error('Error in handleViewAction:', error);
  }
};

// Setup notification action handlers
export const setupNotificationActionHandlers = () => {
  // This will be called when the app receives a notification response
  // We'll need to integrate this with expo-notifications
  console.log('🔔 Setting up notification action handlers');
};
