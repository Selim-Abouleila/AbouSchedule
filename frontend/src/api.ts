export const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ??
  'https://abouschedule-production.up.railway.app';

export const endpoints = {
  base:     API_BASE,
  login:    `${API_BASE}/auth/login`,
  register: `${API_BASE}/auth/register`,
  tasks:    `${API_BASE}/tasks`,
  media:    `${API_BASE}/tasks/media`,   // ← endpoint under /tasks prefix
  admin: {
    users: `${API_BASE}/admin/users`,
    allTasks: `${API_BASE}/admin/all-tasks`,
    userTasks: (userId: number) => `${API_BASE}/admin/users/${userId}/tasks`,
    userTask: (userId: number, taskId: number) => `${API_BASE}/admin/users/${userId}/tasks/${taskId}`,
    settings: (userId: number) => `${API_BASE}/admin/settings/${userId}`,
    globalSettings: `${API_BASE}/admin/settings/global`,
  },
};
