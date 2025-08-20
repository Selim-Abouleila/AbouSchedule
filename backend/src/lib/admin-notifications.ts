// admin-notifications.ts
import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { differenceInHours } from 'date-fns';
import admin from '../firebase-admin.js';

const prisma = new PrismaClient();

// Helper function to detect token type
function isExpoToken(token: string): boolean {
  return token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[');
}

// Helper function to detect Firebase token
function isFirebaseToken(token: string): boolean {
  return token.length > 100 && !isExpoToken(token);
}

// Send priority bypass notification to admins
export async function sendPriorityBypassNotification(task: any, taskerName: string, firstTask: any) {
  try {
    // Get all admin users' push tokens
    const adminUsers = await prisma.user.findMany({
      where: { role: 'ADMIN' },
      include: { pushTokens: true }
    });

    const adminPushTokens = adminUsers.flatMap(user => user.pushTokens);
    const expoTokens = adminPushTokens
      .filter(pt => pt.token.startsWith('ExponentPushToken[') || pt.token.startsWith('ExpoPushToken['))
      .map(pt => pt.token);

    if (expoTokens.length > 0) {
      const expoMessages = expoTokens.map(token => ({
        to: token,
        sound: 'default',
        channelId: 'default',
        title: '⚠️ Priority Bypass Alert',
        body: `Tasker ${taskerName} attempted to complete "${task.title}" out of priority order`,
        data: {
          taskId: task.id.toString(),
          userId: task.userId.toString(),
          type: 'priority_bypass',
          taskerName: taskerName,
          attemptedTask: task.title,
          firstTask: firstTask.title,
          timestamp: Date.now().toString()
        }
      }));

      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(expoMessages)
      });

      console.log(`🚨 Priority bypass alert sent for task ${task.id} by ${taskerName}`);
    }
  } catch (error) {
    console.error('Failed to send priority bypass notification:', error);
  }
}

export function startAdminNotificationChecker() {
  // "*/10 * * * *" = every 10 minutes
  cron.schedule(
    '*/10 * * * *',
    async () => {
      const now = new Date();
      console.log('🔔 [Admin Notifications] Checking for unread immediate tasks...');

      try {
        // Find all immediate tasks that haven't been read by the user
        const unreadImmediateTasks = await prisma.task.findMany({
          where: {
            priority: 'IMMEDIATE',
            readByUser: false,
            wasAddedByAdmin: true,
            status: { not: 'DONE' }, // Only active tasks
            runNotification: true // Only tasks where notifications are enabled
          },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                email: true
              }
            }
          }
        });

        console.log(`📋 Found ${unreadImmediateTasks.length} unread immediate tasks`);

        for (const task of unreadImmediateTasks) {
          const minutesElapsed = Math.floor((now.getTime() - task.createdAt.getTime()) / (1000 * 60));
          
          // Only send notification if at least 10 minutes have passed AND run_notification is TRUE
          if (minutesElapsed >= 10 && task.runNotification === true) {
            console.log(`⏰ Task ${task.id} has been unread for ${minutesElapsed} minutes and notifications are enabled`);
            
            let adminUsers;
            let notificationTarget;
            
            // Check if task has a specific admin who issued it
            if (task.issuedBy) {
              console.log(`🎯 Task ${task.id} was issued by admin ${task.issuedBy} - sending notification only to this admin`);
              notificationTarget = `specific admin (ID: ${task.issuedBy})`;
              
              // Get only the admin who issued the task
              adminUsers = await prisma.user.findMany({
                where: {
                  id: task.issuedBy,
                  role: 'ADMIN'
                },
                include: {
                  pushTokens: true
                }
              });
            } else {
              console.log(`📢 Task ${task.id} has no specific issuer - sending notification to all admins`);
              notificationTarget = 'all admins';
              
              // Get all admin users' push tokens (fallback behavior)
              adminUsers = await prisma.user.findMany({
                where: {
                  role: 'ADMIN'
                },
                include: {
                  pushTokens: true
                }
              });
            }

            // Collect admin push tokens
            const adminPushTokens = adminUsers.flatMap(user => user.pushTokens);

            if (adminPushTokens.length > 0) {
              const taskerName = task.user?.username || task.user?.email || 'Unknown Tasker';
              
              // Separate tokens by type
              const expoTokens = adminPushTokens.filter(pt => isExpoToken(pt.token)).map(pt => pt.token);
              const firebaseTokens = adminPushTokens.filter(pt => isFirebaseToken(pt.token)).map(pt => pt.token);

              console.log(`📱 Sending to ${notificationTarget}: ${expoTokens.length} Expo tokens and ${firebaseTokens.length} Firebase tokens`);

              // Send Expo notifications
              if (expoTokens.length > 0) {
                await sendExpoNotifications(expoTokens, task, taskerName, minutesElapsed);
              }

              // Send Firebase notifications
              if (firebaseTokens.length > 0) {
                await sendFirebaseNotifications(firebaseTokens, task, taskerName, minutesElapsed);
              }
            } else {
              console.log(`⚠️ No push tokens found for ${notificationTarget} - skipping notification`);
            }
          } else {
            if (minutesElapsed < 10) {
              console.log(`⏳ Task ${task.id} has only been unread for ${minutesElapsed} minutes - not enough time elapsed`);
            } else if (task.runNotification !== true) {
              console.log(`🔕 Task ${task.id} has notifications disabled (runNotification: ${task.runNotification})`);
            }
          }
        }

        console.log(`🔔 [Admin Notifications] Check completed at ${now.toISOString()}`);
      } catch (error) {
        console.error('❌ Error in admin notification checker:', error);
      }
    },
    { timezone: 'Africa/Cairo' }
  );

  console.log('🔔 Admin notification checker scheduled to run every 10 minutes');
}

// Send notifications via Expo push service
async function sendExpoNotifications(tokens: string[], task: any, taskerName: string, minutesElapsed: number) {
  try {
    const expoMessages = tokens.map(token => ({
      to: token,
      sound: 'alarm.wav',
      channelId: 'immediate_task_alert',
      title: '🚨 IMMEDIATE TASK ALERT 🚨',
      body: `TASKER ${taskerName.toUpperCase()} HAS NOT READ THE IMMEDIATE TASK\n\n💡 Tap to mute future notifications for this task`,
      data: {
        taskId: task.id.toString(),
        userId: (task.user?.id ?? (task as any).userId)?.toString?.() ?? String((task as any).userId),
        type: 'unread_immediate_task',
        taskerName: taskerName,
        minutesElapsed: minutesElapsed.toString(),
        timestamp: Date.now().toString()
      },
      _displayInForeground: true,
      categoryId: 'immediate_task_alert',
      _actions: [
        {
          identifier: 'ignore',
          buttonTitle: 'Ignore',
          options: {
            isDestructive: true,
            isAuthenticationRequired: false
          }
        },
        {
          identifier: 'view',
          buttonTitle: 'View Task',
          options: {
            isDestructive: false,
            isAuthenticationRequired: false
          }
        }
      ]
    }));

    console.log(`📤 Sending Expo notifications to ${tokens.length} devices...`);

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(expoMessages)
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log(`✅ Expo notifications sent successfully for task ${task.id}`);
    } else {
      console.error(`❌ Failed to send Expo notifications for task ${task.id}:`, result);
    }
  } catch (error) {
    console.error(`❌ Error sending Expo notifications for task ${task.id}:`, error);
  }
}

// Send notifications via Firebase Admin SDK
async function sendFirebaseNotifications(tokens: string[], task: any, taskerName: string, minutesElapsed: number) {
  try {
    const message = {
      notification: {
        title: '🚨 IMMEDIATE TASK ALERT 🚨',
        body: `TASKER ${taskerName.toUpperCase()} HAS NOT READ THE IMMEDIATE TASK`
      },
      data: {
        taskId: task.id.toString(),
        userId: (task.user?.id ?? (task as any).userId)?.toString?.() ?? String((task as any).userId),
        type: 'unread_immediate_task',
        taskerName: taskerName,
        minutesElapsed: minutesElapsed.toString(),
        timestamp: Date.now().toString()
      },
      android: {
        notification: {
          channelId: 'immediate_task_alert',
          sound: 'alarm.wav',
          priority: 'high' as 'high',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK'
        }
      },
      apns: {
        payload: {
          aps: {
            sound: 'alarm.wav',
            category: 'immediate_task_alert',
            'mutable-content': 1
          }
        }
      }
    };

    console.log(`📤 Sending Firebase notifications to ${tokens.length} devices...`);

    let successCount = 0;
    let failureCount = 0;

    for (const token of tokens) {
      try {
        await admin.messaging().send({
          token: token,
          notification: message.notification,
          data: message.data,
          android: message.android,
          apns: message.apns
        });
        successCount++;
      } catch (error) {
        console.error(`❌ Failed to send to Firebase token ${token}:`, error);
        failureCount++;
      }
    }
    
    console.log(`✅ Firebase notifications sent successfully for task ${task.id}`);
    console.log(`📊 Success count: ${successCount}, Failure count: ${failureCount}`);
  } catch (error) {
    console.error(`❌ Error sending Firebase notifications for task ${task.id}:`, error);
  }
}
