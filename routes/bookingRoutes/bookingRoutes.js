import express from 'express';
import {
  getCoachAvailability,
  bookTimeSlot,
  cancelBooking,
  getUserBookings,
  getCoachBookings,
  completeBooking
} from '../../Controller/bookingController/bookingController.js';

const router = express.Router();

router.get('/coach-availability/:coach_id', getCoachAvailability);
router.post('/book', bookTimeSlot);
router.put('/cancel/:booking_id', cancelBooking);
router.get('/my-bookings', getUserBookings);
router.get('/coach-bookings', getCoachBookings);
router.put('/complete/:booking_id', completeBooking);

export default router;