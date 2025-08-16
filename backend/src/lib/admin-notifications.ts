// admin-notifications.ts
import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { differenceInHours } from 'date-fns';

const prisma = new PrismaClient();

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
            
            // Get all admin users' push tokens
            const adminUsers = await prisma.user.findMany({
              where: {
                role: 'ADMIN'
              },
              include: {
                pushTokens: true
              }
            });

            // Collect all admin push tokens
            const adminPushTokens = adminUsers.flatMap(user => user.pushTokens);

            if (adminPushTokens.length > 0) {
              const taskerName = task.user?.username || task.user?.email || 'Unknown Tasker';
              
                             // Send notification to all admins
               const expoMessages = adminPushTokens.map(pt => ({
                 to: pt.token,
                 sound: 'alarm.wav', // Aggressive alarm sound
                 title: '🚨 IMMEDIATE TASK ALERT 🚨',
                 body: `TASKER ${taskerName.toUpperCase()} HAS NOT READ THE IMMEDIATE TASK`,
                 data: {
                   taskId: task.id.toString(),
                   type: 'unread_immediate_task',
                   taskerName: taskerName,
                   minutesElapsed: minutesElapsed.toString()
                 },
                 // Add action buttons for the notification
                 _displayInForeground: true,
                 categoryId: 'immediate_task_alert',
                 // Add action buttons
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

              console.log(`📤 Sending notifications to ${adminPushTokens.length} admin devices...`);

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
                console.log(`✅ Admin notifications sent successfully for task ${task.id}`);
                console.log(`📱 Notified ${adminPushTokens.length} admin devices`);
              } else {
                console.error(`❌ Failed to send admin notifications for task ${task.id}:`, result);
              }
            } else {
              console.log('⚠️ No admin push tokens found - skipping notification');
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
