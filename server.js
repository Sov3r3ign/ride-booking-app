/*
require("dotenv").config();

const dns = require("node:dns");

dns.setServers(["8.8.8.8", "1.1.1.1"]);

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const Ride = require('./models/Ride');
const path = require("path");

const app = express();
// Mock user accounts (no real auth — for demo purposes only)
const USERS = [
  { username: 'rider1', password: 'ride123', role: 'rider', name: 'Alex Rider' },
  { username: 'driver1', password: 'drive123', role: 'driver', name: 'Sam Driver' }
];
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Ride Booking API is running."
  });
});
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = USERS.find(u => u.username === username && u.password === password);
  if (!user) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  // Never send the password back to the client
  const { password: _pw, ...safeUser } = user;
  res.json(safeUser);
});

async function startServer() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    app.post('/api/rides', async (req, res) => {
    try {
    const { pickup, dropoff } = req.body;
    const ride = new Ride({ pickup, dropoff });
    const savedRide = await ride.save();
    res.status(201).json(savedRide);
    } catch (err) {
    res.status(400).json({ error: err.message });
    }
    });

    app.get('/api/rides', async (req, res) => {
    try {
    const rides = await Ride.find().sort({ createdAt: -1 });
    res.json(rides);
    } catch (err) {
    res.status(500).json({ error: err.message });
    }
    });

    app.patch('/api/rides/:id', async (req, res) => {
    try {
    const { status } = req.body;
    const ride = await Ride.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true, runValidators: true }
    );
    if (!ride) {
    return res.status(404).json({ error: 'Ride not found' });
    }
    res.json(ride);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

    console.log("Connected to MongoDB successfully.");

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
    } catch (error) {
    console.error("MongoDB connection error:", error.message);
  }
}

startServer();*/

require("dotenv").config();

const dns = require("node:dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const Ride = require('./models/Ride');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// CORS CONFIGURATION
// ==========================================
// Allow requests from your Vercel frontend
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174',
  // Your Vercel deployments
  process.env.FRONTEND_URL || 'https://ridebook.vercel.app',
  // Allow any subdomain for development
  /\.vercel\.app$/,
  /localhost/
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.some(allowed => {
      if (allowed instanceof RegExp) {
        return allowed.test(origin);
      }
      return origin === allowed;
    })) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

// ==========================================
// MIDDLEWARE
// ==========================================

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, "public")));

// ==========================================
// DEMO USER DATA
// ========================================== 
// In production, this would be in a database with hashed passwords
const DEMO_USERS = [
  {
    username: 'rider1',
    password: 'ride123',
    role: 'rider',
    name: 'Alex Rider'
  },
  {
    username: 'driver1',
    password: 'drive123',
    role: 'driver',
    name: 'Sam Driver'
  }
];

// ==========================================
// HEALTH CHECK
// ==========================================

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "RideBook API is running",
    environment: process.env.NODE_ENV || 'development'
  });
});

// ==========================================
// AUTHENTICATION
// ==========================================

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  // Validation
  if (!username || !password) {
    return res.status(400).json({
      error: 'Username and password are required'
    });
  }

  // Find user
  const user = DEMO_USERS.find(
    u => u.username === username && u.password === password
  );

  if (!user) {
    return res.status(401).json({
      error: 'Invalid username or password'
    });
  }

  // Return user data (never send password)
  const { password: _pw, ...safeUser } = user;
  res.json(safeUser);
});

app.post('/api/logout', (req, res) => {
  // Client-side handles session removal
  res.json({ success: true, message: 'Logged out' });
});

// ==========================================
// RIDES ENDPOINTS
// ==========================================

async function startServer() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log(" Connected to MongoDB successfully");

    // Create a new ride
    app.post('/api/rides', async (req, res) => {
      try {
        const { pickup, dropoff } = req.body;

        // Validation
        if (!pickup || !dropoff) {
          return res.status(400).json({
            error: 'Pickup and dropoff locations are required'
          });
        }

        if (!pickup.lat || !pickup.lng || !dropoff.lat || !dropoff.lng) {
          return res.status(400).json({
            error: 'Invalid location coordinates'
          });
        }

        const ride = new Ride({ pickup, dropoff });
        const savedRide = await ride.save();

        res.status(201).json(savedRide);
      } catch (err) {
        console.error('Error creating ride:', err);
        res.status(400).json({ error: err.message });
      }
    });

    // Get all rides
    app.get('/api/rides', async (req, res) => {
      try {
        const rides = await Ride.find().sort({ createdAt: -1 }).limit(100);
        res.json(rides);
      } catch (err) {
        console.error('Error fetching rides:', err);
        res.status(500).json({ error: err.message });
      }
    });

    // Update a ride's status
    app.patch('/api/rides/:id', async (req, res) => {
      try {
        const { status } = req.body;

        // Validate status
        const validStatuses = ['pending', 'accepted', 'completed'];
        if (!status || !validStatuses.includes(status)) {
          return res.status(400).json({
            error: `Status must be one of: ${validStatuses.join(', ')}`
          });
        }

        const ride = await Ride.findByIdAndUpdate(
          req.params.id,
          { status },
          { new: true, runValidators: true }
        );

        if (!ride) {
          return res.status(404).json({ error: 'Ride not found' });
        }

        res.json(ride);
      } catch (err) {
        console.error('Error updating ride:', err);
        res.status(400).json({ error: err.message });
      }
    });

    // Delete a ride (for testing)
    app.delete('/api/rides/:id', async (req, res) => {
      try {
        const ride = await Ride.findByIdAndDelete(req.params.id);

        if (!ride) {
          return res.status(404).json({ error: 'Ride not found' });
        }

        res.json({ success: true, message: 'Ride deleted' });
      } catch (err) {
        console.error('Error deleting ride:', err);
        res.status(400).json({ error: err.message });
      }
    });

    // ==========================================
    // STATIC FILE ROUTES
    // ==========================================

    // Serve login page
    app.get('/login', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'login.html'));
    });

    app.get('/login.html', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'login.html'));
    });

    // Serve rider app
    app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    app.get('/index.html', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    // Serve driver dashboard
    app.get('/driver', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'driver.html'));
    });

    app.get('/driver.html', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'driver.html'));
    });

    // ==========================================
    // START SERVER
    // ==========================================

    app.listen(PORT, () => {
      console.log(`\n RideBook Server Running`);
      console.log(` URL: http://localhost:${PORT}`);
      console.log(` Login: http://localhost:${PORT}/login.html`);
      console.log(`\n Demo Credentials:`);
      console.log(`   Rider: rider1 / ride123`);
      console.log(`   Driver: driver1 / drive123\n`);
    });

  } catch (error) {
    console.error("MongoDB connection error:", error.message);
    process.exit(1);
  }
}

startServer();

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});