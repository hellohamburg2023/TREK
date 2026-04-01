import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { db, canAccessTrip } from '../db/database';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { loadTagsByPlaceIds } from '../services/queryHelpers';

const router = express.Router();

// List all share links for a trip
router.get('/trips/:tripId/share-link', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { tripId } = req.params;
  if (!canAccessTrip(tripId, authReq.user.id)) return res.status(404).json({ error: 'Trip not found' });

  const rows = db.prepare('SELECT * FROM share_tokens WHERE trip_id = ? ORDER BY created_at ASC').all(tripId) as any[];
  const links = rows.map(row => ({
    id: row.id,
    token: row.token,
    label: row.label || null,
    created_at: row.created_at,
    share_map: !!row.share_map,
    share_bookings: !!row.share_bookings,
    share_packing: !!row.share_packing,
    share_budget: !!row.share_budget,
    share_collab: !!row.share_collab,
    share_kosten: !!row.share_kosten,
  }));
  res.json({ links });
});

// Create a new share link for a trip
router.post('/trips/:tripId/share-link', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { tripId } = req.params;
  if (!canAccessTrip(tripId, authReq.user.id)) return res.status(404).json({ error: 'Trip not found' });

  const { share_map = true, share_bookings = true, share_packing = false, share_budget = false, share_collab = false, share_kosten = false, label = null } = req.body || {};

  try {
    const token = crypto.randomBytes(24).toString('base64url');
    const result = db.prepare('INSERT INTO share_tokens (trip_id, token, created_by, share_map, share_bookings, share_packing, share_budget, share_collab, share_kosten, label) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(tripId, token, authReq.user.id, share_map ? 1 : 0, share_bookings ? 1 : 0, share_packing ? 1 : 0, share_budget ? 1 : 0, share_collab ? 1 : 0, share_kosten ? 1 : 0, label || null);
    const row = db.prepare('SELECT * FROM share_tokens WHERE id = ?').get(result.lastInsertRowid) as any;
    res.status(201).json({ link: { id: row.id, token: row.token, label: row.label || null, created_at: row.created_at, share_map: !!row.share_map, share_bookings: !!row.share_bookings, share_packing: !!row.share_packing, share_budget: !!row.share_budget, share_collab: !!row.share_collab, share_kosten: !!row.share_kosten } });
  } catch (err: any) {
    console.error('[share] Failed to create share link:', err);
    res.status(500).json({ error: 'Failed to create share link' });
  }
});

// Update permissions/label of a specific share link
router.put('/trips/:tripId/share-link/:id', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { tripId, id } = req.params;
  if (!canAccessTrip(tripId, authReq.user.id)) return res.status(404).json({ error: 'Trip not found' });

  const row = db.prepare('SELECT * FROM share_tokens WHERE id = ? AND trip_id = ?').get(id, tripId) as any;
  if (!row) return res.status(404).json({ error: 'Link not found' });

  const { share_map, share_bookings, share_packing, share_budget, share_collab, share_kosten, label } = req.body || {};
  try {
    db.prepare('UPDATE share_tokens SET share_map = ?, share_bookings = ?, share_packing = ?, share_budget = ?, share_collab = ?, share_kosten = ?, label = ? WHERE id = ?')
      .run(
        share_map !== undefined ? (share_map ? 1 : 0) : row.share_map,
        share_bookings !== undefined ? (share_bookings ? 1 : 0) : row.share_bookings,
        share_packing !== undefined ? (share_packing ? 1 : 0) : row.share_packing,
        share_budget !== undefined ? (share_budget ? 1 : 0) : row.share_budget,
        share_collab !== undefined ? (share_collab ? 1 : 0) : row.share_collab,
        share_kosten !== undefined ? (share_kosten ? 1 : 0) : row.share_kosten,
        label !== undefined ? (label || null) : row.label,
        id
      );
    const updated = db.prepare('SELECT * FROM share_tokens WHERE id = ?').get(id) as any;
    res.json({ link: { id: updated.id, token: updated.token, label: updated.label || null, created_at: updated.created_at, share_map: !!updated.share_map, share_bookings: !!updated.share_bookings, share_packing: !!updated.share_packing, share_budget: !!updated.share_budget, share_collab: !!updated.share_collab, share_kosten: !!updated.share_kosten } });
  } catch (err: any) {
    console.error('[share] Failed to update share link:', err);
    res.status(500).json({ error: 'Failed to update share link' });
  }
});

// Delete a specific share link by ID
router.delete('/trips/:tripId/share-link/:id', authenticate, (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { tripId, id } = req.params;
  if (!canAccessTrip(tripId, authReq.user.id)) return res.status(404).json({ error: 'Trip not found' });

  db.prepare('DELETE FROM share_tokens WHERE id = ? AND trip_id = ?').run(id, tripId);
  res.json({ success: true });
});

// Public read-only trip data (no auth required)
router.get('/shared/:token', (req: Request, res: Response) => {
  const { token } = req.params;
  try {
    const shareRow = db.prepare('SELECT * FROM share_tokens WHERE token = ?').get(token) as any;
    if (!shareRow) return res.status(404).json({ error: 'Invalid or expired link' });

    const tripId = shareRow.trip_id;
    const permissions = {
      share_map: !!shareRow.share_map,
      share_bookings: !!shareRow.share_bookings,
      share_packing: !!shareRow.share_packing,
      share_budget: !!shareRow.share_budget,
      share_collab: !!shareRow.share_collab,
      share_kosten: !!shareRow.share_kosten,
    };

    // Trip
    const trip = db.prepare('SELECT id, title, description, start_date, end_date, cover_image, currency FROM trips WHERE id = ?').get(tripId);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    // Days, assignments, places — only if map/plan is shared
    let days: any[] = [];
    let assignments: Record<number, any[]> = {};
    let dayNotes: Record<number, any[]> = {};
    let places: any[] = [];
    let categories: any[] = [];

    if (permissions.share_map) {
      days = db.prepare('SELECT * FROM days WHERE trip_id = ? ORDER BY day_number ASC').all(tripId) as any[];
      const dayIds = days.map((d: any) => d.id);

      if (dayIds.length > 0) {
        const ph = dayIds.map(() => '?').join(',');
        const allAssignments = db.prepare(`
          SELECT da.*, p.id as place_id, p.name as place_name, p.description as place_description,
            p.lat, p.lng, p.address, p.category_id, p.price, p.currency as place_currency,
            COALESCE(da.assignment_time, p.place_time) as place_time,
            COALESCE(da.assignment_end_time, p.end_time) as end_time,
            p.duration_minutes, p.notes as place_notes, p.image_url, p.transport_mode,
            c.name as category_name, c.color as category_color, c.icon as category_icon
          FROM day_assignments da
          JOIN places p ON da.place_id = p.id
          LEFT JOIN categories c ON p.category_id = c.id
          WHERE da.day_id IN (${ph})
          ORDER BY da.order_index ASC
        `).all(...dayIds);

        const placeIds = [...new Set(allAssignments.map((a: any) => a.place_id))];
        const tagsByPlace = loadTagsByPlaceIds(placeIds, { compact: true });

        const byDay: Record<number, any[]> = {};
        for (const a of allAssignments as any[]) {
          if (!byDay[a.day_id]) byDay[a.day_id] = [];
          byDay[a.day_id].push({
            id: a.id, day_id: a.day_id, order_index: a.order_index, notes: a.notes,
            place: {
              id: a.place_id, name: a.place_name, description: a.place_description,
              lat: a.lat, lng: a.lng, address: a.address, category_id: a.category_id,
              price: a.price, place_time: a.place_time, end_time: a.end_time,
              image_url: a.image_url, transport_mode: a.transport_mode,
              category: a.category_id ? { id: a.category_id, name: a.category_name, color: a.category_color, icon: a.category_icon } : null,
              tags: tagsByPlace[a.place_id] || [],
            }
          });
        }
        assignments = byDay;

        const allNotes = db.prepare(`SELECT * FROM day_notes WHERE day_id IN (${ph}) ORDER BY sort_order ASC`).all(...dayIds);
        const notesByDay: Record<number, any[]> = {};
        for (const n of allNotes as any[]) {
          if (!notesByDay[n.day_id]) notesByDay[n.day_id] = [];
          notesByDay[n.day_id].push(n);
        }
        dayNotes = notesByDay;
      }

      places = db.prepare(`
        SELECT p.*, c.name as category_name, c.color as category_color, c.icon as category_icon
        FROM places p LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.trip_id = ? ORDER BY p.created_at DESC
      `).all(tripId) as any[];

      categories = db.prepare('SELECT * FROM categories').all() as any[];
    }

    // Reservations + accommodations — only if bookings are shared
    const reservations = permissions.share_bookings
      ? db.prepare('SELECT * FROM reservations WHERE trip_id = ? ORDER BY reservation_time ASC').all(tripId)
      : [];
    const accommodations = permissions.share_bookings
      ? db.prepare(`
          SELECT a.*, p.name as place_name, p.address as place_address, p.lat as place_lat, p.lng as place_lng
          FROM day_accommodations a JOIN places p ON a.place_id = p.id
          WHERE a.trip_id = ?
        `).all(tripId)
      : [];

    // Packing
    const packing = permissions.share_packing
      ? db.prepare('SELECT * FROM packing_items WHERE trip_id = ? ORDER BY sort_order ASC').all(tripId)
      : [];

    // Budget
    const budget = permissions.share_budget
      ? db.prepare('SELECT * FROM budget_items WHERE trip_id = ? ORDER BY category ASC').all(tripId)
      : [];

    // Kosten
    let kosten = null;
    if (permissions.share_kosten) {
      const kostenExpenses = db.prepare('SELECT * FROM kosten_expenses WHERE trip_id = ? ORDER BY expense_date ASC, created_at ASC').all(tripId) as any[];
      const kostenShares = kostenExpenses.length > 0
        ? db.prepare(`SELECT * FROM kosten_shares WHERE expense_id IN (${kostenExpenses.map(() => '?').join(',')})`).all(...kostenExpenses.map((e: any) => e.id))
        : [];
      const kostenUsers = db.prepare('SELECT DISTINCT u.id, u.username FROM users u JOIN kosten_expenses e ON u.id = e.paid_by WHERE e.trip_id = ?').all(tripId);
      kosten = { expenses: kostenExpenses, shares: kostenShares, users: kostenUsers };
    }

    // Collab chat
    const collab = permissions.share_collab
      ? db.prepare('SELECT m.*, u.username, u.avatar FROM collab_messages m JOIN users u ON m.user_id = u.id WHERE m.trip_id = ? ORDER BY m.created_at ASC').all(tripId)
      : [];

    res.json({
      trip, days, assignments, dayNotes, places, categories, permissions,
      reservations, accommodations, packing, budget, kosten, collab,
    });
  } catch (err: any) {
    console.error('[share] Failed to load shared trip:', err);
    res.status(500).json({ error: 'Failed to load shared trip' });
  }
});

export default router;
