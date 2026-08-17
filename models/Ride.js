const mongoose = require('mongoose');

const rideSchema = new mongoose.Schema({
  pickup: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  dropoff: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  distance: {
    type: Number,
  },
  fare: {
    type: Number,
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'completed'],
    default: 'pending'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Ride', rideSchema);