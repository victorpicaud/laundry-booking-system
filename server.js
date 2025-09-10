const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const SECURITY_ANSWER = process.env.SECURITY_ANSWER || '42'; // street number * floors

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Database setup
const db = new sqlite3.Database('./laundry_booking.db');

// Initialize database tables
db.serialize(() => {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Bookings table
  db.run(`CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  // Overtime reports table
  db.run(`CREATE TABLE IF NOT EXISTS overtime_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL,
    reported_by INTEGER NOT NULL,
    overtime_minutes INTEGER NOT NULL,
    reported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id) REFERENCES bookings (id),
    FOREIGN KEY (reported_by) REFERENCES users (id)
  )`);
});

// Email configuration
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Routes

// Home page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// User registration
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password, securityAnswer } = req.body;

    // Verify security question
    if (securityAnswer !== SECURITY_ANSWER) {
      return res.status(400).json({ message: 'Incorrect security answer. You must be from our community.' });
    }

    // Check if user already exists
    db.get('SELECT * FROM users WHERE username = ? OR email = ?', [username, email], async (err, row) => {
      if (err) {
        return res.status(500).json({ message: 'Database error' });
      }
      
      if (row) {
        return res.status(400).json({ message: 'Username or email already exists' });
      }

      // Hash password and create user
      const hashedPassword = await bcrypt.hash(password, 10);
      
      db.run('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', 
        [username, email, hashedPassword], function(err) {
        if (err) {
          return res.status(500).json({ message: 'Error creating user' });
        }
        
        res.status(201).json({ message: 'User created successfully', userId: this.lastID });
      });
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// User login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err) {
      return res.status(500).json({ message: 'Database error' });
    }
    
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
  });
});

// Get available time slots for a specific date
app.get('/api/availability/:date', authenticateToken, (req, res) => {
  const date = req.params.date;
  const startOfDay = `${date} 00:00:00`;
  const endOfDay = `${date} 23:59:59`;

  db.all(`SELECT start_time, end_time FROM bookings 
          WHERE start_time BETWEEN ? AND ? AND status = 'active'`, 
    [startOfDay, endOfDay], (err, bookedSlots) => {
    if (err) {
      return res.status(500).json({ message: 'Database error' });
    }

    // Generate all 15-minute slots for the day
    const allSlots = [];
    const startTime = new Date(`${date}T00:00:00`);
    const endTime = new Date(`${date}T23:45:00`);

    for (let time = new Date(startTime); time <= endTime; time.setMinutes(time.getMinutes() + 15)) {
      allSlots.push(time.toTimeString().slice(0, 5));
    }

    // Filter out booked slots
    const bookedTimes = bookedSlots.map(slot => {
      const start = new Date(slot.start_time);
      const end = new Date(slot.end_time);
      const slots = [];
      
      for (let time = new Date(start); time < end; time.setMinutes(time.getMinutes() + 15)) {
        slots.push(time.toTimeString().slice(0, 5));
      }
      return slots;
    }).flat();

    const availableSlots = allSlots.filter(slot => !bookedTimes.includes(slot));
    
    res.json({ availableSlots, bookedSlots: bookedTimes });
  });
});

// Create a new booking
app.post('/api/bookings', authenticateToken, (req, res) => {
  const { date, startTime, duration } = req.body;
  const userId = req.user.id;

  const startDateTime = `${date} ${startTime}:00`;
  const start = new Date(startDateTime);
  const end = new Date(start.getTime() + duration * 60000); // duration in minutes
  const endDateTime = end.toISOString().slice(0, 19).replace('T', ' ');

  // Check for conflicts
  db.get(`SELECT * FROM bookings 
          WHERE (start_time < ? AND end_time > ?) 
          OR (start_time < ? AND end_time > ?)
          AND status = 'active'`, 
    [endDateTime, startDateTime, startDateTime, endDateTime], (err, conflict) => {
    if (err) {
      return res.status(500).json({ message: 'Database error' });
    }
    
    if (conflict) {
      return res.status(400).json({ message: 'Time slot already booked' });
    }

    // Create booking
    db.run('INSERT INTO bookings (user_id, start_time, end_time) VALUES (?, ?, ?)', 
      [userId, startDateTime, endDateTime], function(err) {
      if (err) {
        return res.status(500).json({ message: 'Error creating booking' });
      }
      
      res.status(201).json({ 
        message: 'Booking created successfully', 
        bookingId: this.lastID,
        startTime: startDateTime,
        endTime: endDateTime
      });
    });
  });
});

// Get user's bookings
app.get('/api/my-bookings', authenticateToken, (req, res) => {
  const userId = req.user.id;

  db.all(`SELECT b.*, u.username 
          FROM bookings b 
          JOIN users u ON b.user_id = u.id 
          WHERE b.user_id = ? AND b.status = 'active'
          ORDER BY b.start_time`, [userId], (err, bookings) => {
    if (err) {
      return res.status(500).json({ message: 'Database error' });
    }
    
    res.json(bookings);
  });
});

// Report overtime
app.post('/api/report-overtime', authenticateToken, (req, res) => {
  const { bookingId, overtimeMinutes } = req.body;
  const reportedBy = req.user.id;

  // First, get the booking details and find the next booking
  db.get('SELECT * FROM bookings WHERE id = ?', [bookingId], (err, booking) => {
    if (err || !booking) {
      return res.status(400).json({ message: 'Booking not found' });
    }

    // Find the next booking after this one
    db.get(`SELECT b.*, u.email, u.username 
            FROM bookings b 
            JOIN users u ON b.user_id = u.id 
            WHERE b.start_time > ? AND b.status = 'active'
            ORDER BY b.start_time 
            LIMIT 1`, [booking.end_time], (err, nextBooking) => {
      
      // Record the overtime report
      db.run('INSERT INTO overtime_reports (booking_id, reported_by, overtime_minutes) VALUES (?, ?, ?)', 
        [bookingId, reportedBy, overtimeMinutes], function(err) {
        if (err) {
          return res.status(500).json({ message: 'Error recording overtime report' });
        }

        // Send email notification to next user if there is one
        if (nextBooking && process.env.SMTP_USER) {
          const mailOptions = {
            from: process.env.SMTP_USER,
            to: nextBooking.email,
            subject: 'Laundry Overtime Alert',
            text: `Hello ${nextBooking.username},
            
There has been an overtime report for the washing machine. The previous user ran ${overtimeMinutes} minutes over their scheduled time.

Your booking starts at: ${new Date(nextBooking.start_time).toLocaleString()}

Please plan accordingly.

Best regards,
Laundry Booking System`
          };

          transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
              console.log('Email error:', error);
            }
          });
        }

        res.json({ 
          message: 'Overtime reported successfully',
          nextUserNotified: !!nextBooking
        });
      });
    });
  });
});

// Get all bookings (for admin view)
app.get('/api/all-bookings', authenticateToken, (req, res) => {
  db.all(`SELECT b.*, u.username 
          FROM bookings b 
          JOIN users u ON b.user_id = u.id 
          WHERE b.status = 'active'
          ORDER BY b.start_time`, (err, bookings) => {
    if (err) {
      return res.status(500).json({ message: 'Database error' });
    }
    
    res.json(bookings);
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Security answer required: ${SECURITY_ANSWER}`);
});