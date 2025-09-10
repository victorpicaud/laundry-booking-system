# Laundry Booking System

A web-based laundry booking system for shared washing machine facilities in apartment buildings.

## Features

✅ **Authentication with Community Security**
- User registration and login system
- Special security question to verify community membership
- Secure password hashing with bcrypt
- JWT token-based authentication

✅ **24/7 Calendar Booking System**
- 15-minute time slot intervals
- Never-closing booking times (available 24/7)
- Single washing machine management
- Conflict prevention for overlapping bookings
- Multiple duration options (30min, 45min, 1hr, 1.5hr, 2hr)

✅ **Overtime Notification System**
- Report overtime for any booking
- Automatic email notifications to next user
- Overtime tracking and reporting

## Technical Stack

- **Backend**: Node.js with Express.js
- **Database**: SQLite for lightweight data storage
- **Authentication**: JWT tokens with bcrypt password hashing
- **Email**: Nodemailer for overtime notifications
- **Frontend**: Vanilla HTML/CSS/JavaScript with responsive design

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   Copy `.env.example` to `.env` and update the values:
   ```bash
   cp .env.example .env
   ```
   
   Key configuration:
   - `SECURITY_ANSWER`: Set to your street number × number of floors (including roof)
   - Email settings (optional, for overtime notifications)

3. **Start the Application**
   ```bash
   npm start
   ```
   
   Or for development with auto-reload:
   ```bash
   npm run dev
   ```

4. **Access the System**
   Open your browser to `http://localhost:3000`

## Configuration

### Security Question
The security question requires users to know:
**Street number × Number of floors (including roof)**

Example: Street number 42, building has 6 floors including roof = 42 × 6 = 252

Update the `SECURITY_ANSWER` in your `.env` file with the correct answer.

### Email Notifications (Optional)
To enable overtime email notifications, configure these environment variables:
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

## API Endpoints

### Authentication
- `POST /api/register` - Register new user with security question
- `POST /api/login` - User login

### Bookings
- `GET /api/availability/:date` - Get available time slots for a date
- `POST /api/bookings` - Create a new booking
- `GET /api/my-bookings` - Get current user's bookings
- `GET /api/all-bookings` - Get all bookings (for overtime reporting)

### Overtime
- `POST /api/report-overtime` - Report overtime and notify next user

## Database Schema

### Users Table
- `id` - Primary key
- `username` - Unique username
- `email` - User email address
- `password` - Hashed password
- `created_at` - Registration timestamp

### Bookings Table
- `id` - Primary key
- `user_id` - Foreign key to users
- `start_time` - Booking start time
- `end_time` - Booking end time
- `status` - Booking status (active/cancelled)
- `created_at` - Booking creation timestamp

### Overtime Reports Table
- `id` - Primary key
- `booking_id` - Foreign key to bookings
- `reported_by` - User who reported overtime
- `overtime_minutes` - Duration of overtime
- `reported_at` - Report timestamp

## Usage

1. **Register**: New users must provide the correct security answer
2. **Login**: Use your credentials to access the system
3. **Book Time**: Select a date, choose duration, and pick an available time slot
4. **View Bookings**: Check your current bookings in "My Bookings" tab
5. **Report Overtime**: If someone runs over time, report it to notify the next user

## Security Features

- Password hashing with bcrypt
- JWT token authentication
- Community-specific security question
- Input validation and sanitization
- SQL injection prevention

## Development

The system uses:
- SQLite database (automatically created)
- Express.js for API endpoints
- Static file serving for frontend
- CORS enabled for development

Database and logs are automatically created in the project directory.

## Production Deployment

For production deployment:
1. Update JWT_SECRET to a strong, unique value
2. Configure proper email settings for notifications
3. Set appropriate SECURITY_ANSWER for your building
4. Consider using a more robust database (PostgreSQL/MySQL)
5. Add HTTPS and proper security headers
6. Set up proper logging and monitoring
