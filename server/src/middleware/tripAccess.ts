import { Request, Response, NextFunction } from 'express';
import { canAccessTrip, isOwner } from '../db/database';
import { AuthRequest } from '../types';

/** Middleware: verifies the authenticated user is an owner or member of the trip, then attaches trip to req. */
function requireTripAccess(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthRequest;
  const tripId = req.params.tripId || req.params.id;
  if (!tripId) {
    res.status(400).json({ error: 'Trip ID required' });
    return;
  }
  const trip = canAccessTrip(tripId, authReq.user.id);
  if (!trip) {
    res.status(404).json({ error: 'Trip not found' });
    return;
  }
  authReq.trip = trip;
  // Resolve UUID to numeric ID so downstream SQL queries work correctly.
  // Only update the param that holds the trip identifier; if req.params.tripId exists,
  // req.params.id belongs to a different entity (place, day, assignment, …) and must not be touched.
  if (req.params.tripId) {
    req.params.tripId = String(trip.id);
  } else if (req.params.id) {
    req.params.id = String(trip.id);
  }
  next();
}

/** Middleware: verifies the authenticated user is the trip owner (not just a member). */
function requireTripOwner(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthRequest;
  const tripId = req.params.tripId || req.params.id;
  if (!tripId) {
    res.status(400).json({ error: 'Trip ID required' });
    return;
  }
  if (!isOwner(tripId, authReq.user.id)) {
    res.status(403).json({ error: 'Only the trip owner can do this' });
    return;
  }
  // Resolve UUID to numeric ID for downstream SQL queries (same logic as above).
  const trip = canAccessTrip(tripId, authReq.user.id);
  if (trip) {
    if (req.params.tripId) {
      req.params.tripId = String(trip.id);
    } else if (req.params.id) {
      req.params.id = String(trip.id);
    }
  }
  next();
}

export { requireTripAccess, requireTripOwner };
