# AbouSchedule

A comprehensive task management application built with React Native/Expo and a Node.js backend, featuring role-based access control, media management, and real-time notifications.

## Features

### Core Functionality
- **Task Management**: Create, edit, and organize tasks with priorities and status tracking
- **Role-Based Access**: Admin and Employee roles with different permissions
- **Media Management**: Upload and manage images and documents for tasks
- **Real-Time Notifications**: Push notifications for immediate tasks
- **Recurring Tasks**: Support for daily, weekly, monthly, and yearly recurring tasks
- **Task Status Tracking**: PENDING, ACTIVE, DONE status management

### Admin Features
- **User Management**: View, edit, and manage all users
- **Cross-User Task Management**: Create and manage tasks for any user
- **Media Overview**: View all media across all users
- **Role Toggle**: Change user roles with password verification

### User Features
- **Personal Task Dashboard**: View and manage your own tasks
- **Media Gallery**: Browse your uploaded images and documents
- **Task Filtering**: Sort by priority, status, and creation date
- **Bulk Actions**: Select and share multiple media items

## 🛠 Tech Stack

### Frontend
- **React Native** with Expo
- **TypeScript** for type safety
- **Expo Router** for navigation
- **React Native Image Viewing** for media display
- **Expo Notifications** for push notifications
- **Expo File System** for local file management

### Backend
- **Node.js** with Fastify
- **Prisma** ORM with PostgreSQL
- **JWT** authentication
- **AWS S3** for file storage
- **Railway** for deployment

### Database
- **PostgreSQL** with Prisma migrations
- **Task recurrence** support
- **Media metadata** tracking
- **User role** management

## Screenshots

### Admin Panel
![Admin Panel](screenshots/admin-panel.png)

The Admin Panel is the central hub for administrators to manage taskers and their tasks. This interface provides comprehensive user management capabilities with an intuitive design.

#### Key Features:

**Header Section:**
- **Admin Identification**: Displays "(Admin) [Username]" with a blue shield icon indicating admin privileges
- **Role Description**: "Manage taskers and their tasks" subtitle explains the panel's purpose

**Tasker Selection:**
- **User List**: Shows all available taskers with their role badges ("TASKER")
- **Visual Selection**: Selected tasker is highlighted with a blue left border and checkmark icon
- **User Icons**: Each tasker has a person icon for easy identification

**Task Management Actions:**
- **Add Task Button**: Green button with plus icon to create new tasks for the selected tasker
- **View/Edit Tasks Button**: Blue button with eye icon to manage existing tasks
- **Settings Gear**: Blue gear icon for advanced user management options

**Design Elements:**
- **Card-based Layout**: Clean white cards with rounded corners for organized content
- **Color-coded Actions**: Green for creation, blue for viewing/editing
- **Responsive Design**: Adapts to different screen sizes with proper spacing

This panel serves as the primary interface for administrators to oversee task distribution and user management across the entire system.

## API Endpoints

### Authentication
- `POST /auth/login` - User login
- `POST /auth/register` - User registration

### Tasks
- `GET /tasks` - Get user's tasks
- `POST /tasks` - Create new task
- `PATCH /tasks/:id` - Update task
- `DELETE /tasks/:id` - Delete task

### Admin
- `GET /admin/users` - Get all users
- `POST /admin/users/:id/toggle-role` - Toggle user role
- `GET /admin/all-tasks` - Get all tasks
- `GET /admin/users/:userId/tasks` - Get user's tasks

### Media
- `GET /tasks/media` - Get media files
- `POST /tasks/media` - Upload media

## Configuration

### Task Priorities
- `IMMEDIATE` - Highest priority with notifications
- `RECURRENT` - Recurring tasks
- `ONE`, `TWO`, `THREE` - Standard priorities
- `NONE` - No priority

### Task Status
- `PENDING` - Task is waiting
- `ACTIVE` - Task is in progress
- `DONE` - Task is completed

### Recurrence Types
- `NONE` - One-time task
- `DAILY` - Repeats daily
- `WEEKLY` - Repeats weekly
- `MONTHLY` - Repeats monthly
- `YEARLY` - Repeats yearly

## 🔐 Security Features

- **JWT Authentication** with role-based access
- **Password verification** for admin actions
- **File upload validation** and secure storage
- **CORS protection** and request validation
- **Environment-based** configuration

## 📊 Database Schema

The application uses Prisma with PostgreSQL, featuring:
- **User management** with roles
- **Task system** with priorities and status
- **Media storage** with metadata
- **Recurrence tracking** for recurring tasks
- **Audit trails** for task changes

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

### Key Directories

**Backend:**
- `prisma/` - Database schema and migrations
- `src/lib/` - Utility functions and helpers
- `src/server.ts` - Main server file

**Frontend:**
- `app/` - Expo Router screens and navigation
- `src/` - Core utilities and API integration
- `assets/` - App icons and images

---

**Built with ❤️ using React Native, Expo, and Node.js**
