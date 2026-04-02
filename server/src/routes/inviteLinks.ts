import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { db, canAccessTrip, isOwner } from '../db/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = express.Router();

// ── Owner-facing CRUD ────────────────────────────────────────────────────────

// List all invite links for a trip (owner only)
router.get('/trips/:tripId/invite-links', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { tripId } = req.params;

  if (!isOwner(tripId, authReq.user.id))
    return res.status(403).json({ error: 'Only the trip owner can manage invite links' });

  const rows = db.prepare(
    'SELECT id, token, label, created_at FROM trip_invite_tokens WHERE trip_id = ? ORDER BY created_at ASC'
  ).all(tripId) as { id: number; token: string; label: string | null; created_at: string }[];

  res.json({ links: rows });
});

// Create a new invite link (owner only)
router.post('/trips/:tripId/invite-links', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { tripId } = req.params;

  if (!isOwner(tripId, authReq.user.id))
    return res.status(403).json({ error: 'Only the trip owner can create invite links' });

  const { label = null } = req.body || {};

  try {
    const token = crypto.randomBytes(24).toString('base64url');
    const result = db.prepare(
      'INSERT INTO trip_invite_tokens (trip_id, token, label, created_by) VALUES (?, ?, ?, ?)'
    ).run(tripId, token, label || null, authReq.user.id);

    const row = db.prepare('SELECT id, token, label, created_at FROM trip_invite_tokens WHERE id = ?')
      .get(result.lastInsertRowid) as { id: number; token: string; label: string | null; created_at: string };

    res.status(201).json({ link: row });
  } catch (err) {
    console.error('[inviteLinks] Failed to create invite link:', err);
    res.status(500).json({ error: 'Failed to create invite link' });
  }
});

// Update label for an invite link (owner only)
router.patch('/trips/:tripId/invite-links/:id', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { tripId, id } = req.params;

  if (!isOwner(tripId, authReq.user.id))
    return res.status(403).json({ error: 'Only the trip owner can update invite links' });

  const row = db.prepare('SELECT id FROM trip_invite_tokens WHERE id = ? AND trip_id = ?').get(id, tripId);
  if (!row) return res.status(404).json({ error: 'Invite link not found' });

  const { label } = req.body || {};
  db.prepare('UPDATE trip_invite_tokens SET label = ? WHERE id = ?').run(label || null, id);

  const updated = db.prepare('SELECT id, token, label, created_at FROM trip_invite_tokens WHERE id = ?').get(id) as any;
  res.json({ link: updated });
});

// Delete an invite link (owner only)
router.delete('/trips/:tripId/invite-links/:id', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { tripId, id } = req.params;

  if (!isOwner(tripId, authReq.user.id))
    return res.status(403).json({ error: 'Only the trip owner can delete invite links' });

  db.prepare('DELETE FROM trip_invite_tokens WHERE id = ? AND trip_id = ?').run(id, tripId);
  res.json({ success: true });
});

// ── Public join endpoints ────────────────────────────────────────────────────

// Preview trip info from an invite token (no auth required)
router.get('/join/:token', (req: Request, res: Response) => {
  const { token } = req.params;

  const row = db.prepare('SELECT * FROM trip_invite_tokens WHERE token = ?').get(token) as any;
  if (!row) return res.status(404).json({ error: 'Invalid or expired invite link' });

  const trip = db.prepare(
    'SELECT id, title, description, start_date, end_date, cover_image FROM trips WHERE id = ?'
  ).get(row.trip_id) as any;

  if (!trip) return res.status(404).json({ error: 'Trip not found' });

  res.json({ trip });
});

// Accept invite — adds the authenticated user as a trip member
router.post('/join/:token', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { token } = req.params;

  const row = db.prepare('SELECT * FROM trip_invite_tokens WHERE token = ?').get(token) as any;
  if (!row) return res.status(404).json({ error: 'Invalid or expired invite link' });

  const trip = db.prepare('SELECT id, user_id FROM trips WHERE id = ?').get(row.trip_id) as any;
  if (!trip) return res.status(404).json({ error: 'Trip not found' });

  // Owner is already part of the trip
  if (trip.user_id === authReq.user.id)
    return res.json({ trip_id: trip.id, already_member: true });

  // Already a member?
  const existing = db.prepare('SELECT id FROM trip_members WHERE trip_id = ? AND user_id = ?')
    .get(trip.id, authReq.user.id);

  if (existing) return res.json({ trip_id: trip.id, already_member: true });

  try {
    db.prepare('INSERT INTO trip_members (trip_id, user_id, invited_by) VALUES (?, ?, ?)')
      .run(trip.id, authReq.user.id, row.created_by);

    res.status(201).json({ trip_id: trip.id, already_member: false });
  } catch (err) {
    console.error('[inviteLinks] Failed to join trip:', err);
    res.status(500).json({ error: 'Failed to join trip' });
  }
});

export default router;
