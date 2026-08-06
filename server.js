
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

startServer();