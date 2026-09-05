require("dotenv").config();

const dns = require("node:dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");
const Ride = require('./models/Ride');

const app = express();
const PORT = process.env.PORT || 3000;

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

  // Case-insensitive on username (same rule signup/forgot-password already
  // use for lookups) so how a user happened to capitalize it at signup
  // doesn't lock them out later. Password stays case-sensitive.
  const user = DEMO_USERS.find(
    u => u.username.toLowerCase() === username.toLowerCase() && u.password === password
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
// SIGN UP
// ==========================================
app.post('/api/signup', (req, res) => {
  const { username, password, name, role } = req.body;
 
  if (!username || !password || !name || !role) {
    return res.status(400).json({
      error: 'Name, username, password, and role are all required'
    });
  }
 
  if (role !== 'rider' && role !== 'driver') {
    return res.status(400).json({ error: 'Role must be either "rider" or "driver"' });
  }
 
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
 
  const usernameTaken = DEMO_USERS.some(
    u => u.username.toLowerCase() === username.toLowerCase()
  );
 
  if (usernameTaken) {
    return res.status(409).json({ error: 'That username is already taken' });
  }
 
  // NOTE: DEMO_USERS is an in-memory array (see comment above), so new
  // accounts live only as long as this server process -- same limitation
  // the existing demo users already have. In production this would be a
  // database insert with a hashed password.
  const newUser = { username, password, role, name };
  DEMO_USERS.push(newUser);
 
  const { password: _pw, ...safeUser } = newUser;
  res.status(201).json(safeUser);
});
 
// ==========================================
// FORGOT / RESET PASSWORD
// ==========================================
// In-memory token store: token -> { username, expiresAt }. Like
// DEMO_USERS, this resets whenever the server restarts -- fine for a demo,
// but a real deployment would persist this (and hash the tokens) in a
// database instead.
const passwordResetTokens = new Map();
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes
 
app.post('/api/forgot-password', (req, res) => {
  const { username } = req.body;
 
  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }
 
  const user = DEMO_USERS.find(
    u => u.username.toLowerCase() === username.toLowerCase()
  );
 
  // Always return a generic success response whether or not the account
  // exists, so this endpoint can't be used to enumerate valid usernames.
  const genericResponse = {
    success: true,
    message: 'If an account with that username exists, a password reset link has been generated.'
  };
 
  if (!user) {
    return res.json(genericResponse);
  }
 
  const token = crypto.randomBytes(32).toString('hex');
  passwordResetTokens.set(token, {
    username: user.username,
    expiresAt: Date.now() + RESET_TOKEN_TTL_MS
  });
 
  // There's no email service wired up in this demo, so the reset link is
  // handed back directly in the response (and logged server-side) instead
  // of being emailed. In production, NEVER return the token in the API
  // response -- send it only to the user's verified email address.
  const resetUrl = `/reset-password.html?token=${token}`;
  console.log(`[password reset] ${user.username} -> ${resetUrl} (expires in 15 min)`);
 
  res.json({ ...genericResponse, devResetUrl: resetUrl });
});
 
app.post('/api/reset-password', (req, res) => {
  const { token, newPassword } = req.body;
 
  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token and new password are required' });
  }
 
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
 
  const entry = passwordResetTokens.get(token);
 
  if (!entry || entry.expiresAt < Date.now()) {
    passwordResetTokens.delete(token);
    return res.status(400).json({ error: 'This reset link is invalid or has expired' });
  }
 
  const user = DEMO_USERS.find(u => u.username === entry.username);
  if (!user) {
    passwordResetTokens.delete(token);
    return res.status(404).json({ error: 'Account no longer exists' });
  }
 
  user.password = newPassword;
  passwordResetTokens.delete(token);
 
  res.json({ success: true, message: 'Password updated. You can now log in.' });
});

// Nominatim requires a descriptive User-Agent, which browser fetch() calls
// cannot set, and only allows ~1 request/second per client. Proxying through
// our own server fixes both: we set the header here, and every user/tab
// shares a single queue + cache instead of each hammering Nominatim directly.
const geocodeCache = new Map();
let geocodeQueue = Promise.resolve();
const GEOCODE_DELAY_MS = 1100;

function queueNominatimRequest(lat, lng) {
  const task = geocodeQueue.then(() => fetchFromNominatim(lat, lng));

  // Keep the queue moving (even after a failure) with a pause before the next request
  geocodeQueue = task
    .catch(() => {})
    .then(() => new Promise(resolve => setTimeout(resolve, GEOCODE_DELAY_MS)));

  return task;
}

async function fetchFromNominatim(lat, lng) {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`,
    {
      headers: {
        // Nominatim's usage policy requires a way to identify the app/contact
        'User-Agent': 'RideBookApp/1.0 (demo project)'
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Nominatim error: ${response.status}`);
  }

  return response.json();
}

app.get('/api/geocode', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return res.status(400).json({ error: 'lat and lng query params are required' });
  }

  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;

  if (geocodeCache.has(key)) {
    return res.json({ name: geocodeCache.get(key) });
  }

  try {
    const data = await queueNominatimRequest(lat, lng);
    const address = data.address || {};

    const parts = [
      address.road || address.pedestrian || address.neighbourhood,
      address.suburb || address.city_district,
      address.city || address.town || address.village
    ].filter(Boolean);

    const name = parts.length > 0
      ? parts.slice(0, 2).join(', ')
      : (data.display_name
          ? data.display_name.split(',').slice(0, 2).join(',').trim()
          : `${lat.toFixed(4)}, ${lng.toFixed(4)}`);

    geocodeCache.set(key, name);
    res.json({ name });

  } catch (err) {
    console.error('Reverse geocoding error:', err.message);
    // Don't cache the failure — a later request for the same spot should retry
    res.json({ name: `${lat.toFixed(4)}, ${lng.toFixed(4)}` });
  }
});

const BASE_FARE = 25;      // flat starting fare (Rand)
const RATE_PER_KM = 8;     // Rand per kilometer

// Ride size options the rider can choose from. Server is the source of
// truth for seats/multiplier — the client only sends which key was picked,
// so a tampered request can't set its own price.
const RIDE_TYPES = {
  ride:   { label: 'Ride',   seats: 2, multiplier: 1 },
  rideL:  { label: 'RideL',  seats: 4, multiplier: 1.4 },
  rideXL: { label: 'RideXL', seats: 6, multiplier: 1.8 }
};

function calculateDistanceKm(pickup, dropoff) {
  const R = 6371; // Earth's radius in km
  const dLat = (dropoff.lat - pickup.lat) * Math.PI / 180;
  const dLng = (dropoff.lng - pickup.lng) * Math.PI / 180;
  const lat1 = pickup.lat * Math.PI / 180;
  const lat2 = dropoff.lat * Math.PI / 180;

  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Real driving-road distance from OSRM, so the fare reflects actual roads
// rather than a straight line through whatever is in between. Falls back
// to the straight-line distance if the routing service is unreachable so
// ride requests never hard-fail just because OSRM is briefly down.
async function calculateRouteDistanceKm(pickup, dropoff) {
  const url = `https://router.project-osrm.org/route/v1/driving/` +
    `${pickup.lng},${pickup.lat};${dropoff.lng},${dropoff.lat}` +
    `?overview=false`;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`OSRM responded ${response.status}`);
    const data = await response.json();
    const route = data.routes && data.routes[0];
    if (!route) throw new Error('No route found');
    return route.distance / 1000;
  } catch (err) {
    console.error('OSRM routing failed, falling back to straight-line distance:', err.message);
    return calculateDistanceKm(pickup, dropoff);
  }
}

function calculateFare(distanceKm, rideType = 'ride') {
  const multiplier = RIDE_TYPES[rideType]?.multiplier ?? 1;
  return Math.round((BASE_FARE + distanceKm * RATE_PER_KM) * multiplier * 100) / 100;
}

async function startServer() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log(" Connected to MongoDB successfully");

    // Ride size options (labels, seats, multipliers) — single source of
    // truth so the frontend doesn't hardcode a second copy that could drift.
    app.get('/api/ride-types', (req, res) => {
      res.json(RIDE_TYPES);
    });

    // Create a new ride
    app.post('/api/rides', async (req, res) => {
      try {
        const { pickup, dropoff, rideType, riderUsername } = req.body;

        // Validation
        if (!riderUsername) {
          return res.status(400).json({
            error: 'riderUsername is required'
          });
        }

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

        // A rider can only have one ride in flight at a time. They can
        // request again once this one is cancelled or completed.
        const existingActiveRide = await Ride.findOne({
          riderUsername,
          status: { $in: ['pending', 'accepted'] }
        });

        if (existingActiveRide) {
          return res.status(409).json({
            error: 'You already have an active ride request. Cancel it or wait for it to finish before requesting another.',
            activeRide: existingActiveRide
          });
        }

        const selectedType = rideType && RIDE_TYPES[rideType] ? rideType : 'ride';
        const seats = RIDE_TYPES[selectedType].seats;

        const distance = await calculateRouteDistanceKm(pickup, dropoff);
        const fare = calculateFare(distance, selectedType);

        const ride = new Ride({ pickup, dropoff, distance, fare, rideType: selectedType, seats, riderUsername });
        const savedRide = await ride.save();

        res.status(201).json(savedRide);
      } catch (err) {
        console.error('Error creating ride:', err);
        res.status(400).json({ error: err.message });
      }
    });

    // Get rides. Drivers need to see every pending/accepted ride on the
    // platform, so this stays unfiltered by default — but a rider's own
    // history page should only ever see their own rides, so an optional
    // ?riderUsername= filter narrows the query to just that rider.
    app.get('/api/rides', async (req, res) => {
      try {
        const { riderUsername } = req.query;
        const query = riderUsername ? { riderUsername } : {};
        const rides = await Ride.find(query).sort({ createdAt: -1 }).limit(100);
        res.json(rides);
      } catch (err) {
        console.error('Error fetching rides:', err);
        res.status(500).json({ error: err.message });
      }
    });

    // Get a rider's current active (pending or accepted) ride, if any.
    // Used by the client to restore/lock the booking UI on page load, so
    // refreshing the page can't be used to sneak past the one-active-ride
    // rule enforced in POST /api/rides above.
    // NOTE: this route must be declared before GET /api/rides/:id below,
    // otherwise Express would match "active" as an :id.
    app.get('/api/rides/active/:username', async (req, res) => {
      try {
        const ride = await Ride.findOne({
          riderUsername: req.params.username,
          status: { $in: ['pending', 'accepted'] }
        }).sort({ createdAt: -1 });

        res.json(ride || null);
      } catch (err) {
        console.error('Error fetching active ride:', err);
        res.status(500).json({ error: err.message });
      }
    });

    // Get a single ride by id (used for polling an in-progress ride's status)
    app.get('/api/rides/:id', async (req, res) => {
      try {
        const ride = await Ride.findById(req.params.id);

        if (!ride) {
          return res.status(404).json({ error: 'Ride not found' });
        }

        res.json(ride);
      } catch (err) {
        console.error('Error fetching ride:', err);
        res.status(400).json({ error: err.message });
      }
    });

    // Update a ride's status
    app.patch('/api/rides/:id', async (req, res) => {
      try {
        const { status } = req.body;

        // Validate status
        const validStatuses = ['pending', 'accepted', 'completed', 'cancelled'];
        if (!status || !validStatuses.includes(status)) {
          return res.status(400).json({
            error: `Status must be one of: ${validStatuses.join(', ')}`
          });
        }

        const ride = await Ride.findById(req.params.id);

        if (!ride) {
          return res.status(404).json({ error: 'Ride not found' });
        }

        // A rider can only cancel a ride that's still pending — once a
        // driver has accepted it (or it's finished/already cancelled),
        // cancelling would silently pull the ride out from under them.
        if (status === 'cancelled' && ride.status !== 'pending') {
          return res.status(400).json({
            error: `Cannot cancel a ride that is already ${ride.status}`
          });
        }

        ride.status = status;
        await ride.save();

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
 
    // Serve sign up page
    app.get('/signup', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'signup.html'));
    });
 
    app.get('/signup.html', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'signup.html'));
    });
 
    // Serve forgot / reset password pages
    app.get('/forgot-password', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'forgot-password.html'));
    });
 
    app.get('/forgot-password.html', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'forgot-password.html'));
    });
 
    app.get('/reset-password', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'reset-password.html'));
    });
 
    app.get('/reset-password.html', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'reset-password.html'));
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

    // Serve ride history page
    app.get('/history', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'history.html'));
    });

    app.get('/history.html', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'history.html'));
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