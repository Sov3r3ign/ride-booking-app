const mongoose = require('mongoose');

const rideSchema = new mongoose.Schema({

  riderUsername: {
    type: String,
    required: true,
    index: true
  },
  pickup: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  dropoff: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'completed','cancelled'],
    default: 'pending'
  },
  
  rideType: {
    type: String,
    enum: ['ride', 'rideL', 'rideXL'],
    default: 'ride'
  },
  seats: {
    type: Number,
    default: 2
  },

  distance: {
    type: Number,
  },
  fare: {
    type: Number,
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Ride', rideSchema);