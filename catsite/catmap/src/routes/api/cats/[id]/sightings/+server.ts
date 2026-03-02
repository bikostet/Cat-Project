import { json } from '@sveltejs/kit';
import pool from '$lib/db';
import type { RequestHandler } from './$types';

// GET /api/cats/[id]/sightings
export const GET: RequestHandler = async ({ params }) => {
    const result = await pool.query(`
        SELECT
            s.id,
            s.post_type,
            s.fb_post_url,
            s.fb_post_text,
            s.location_raw,
            ST_AsGeoJSON(s.location)::json AS location,
            s.location_confidence,
            s.reporter_contact,
            s.seen_at,
            s.notes,
            s.created_at,
            COALESCE(
                json_agg(
                    json_build_object(
                        'id', p.id,
                        'storage_path', p.storage_path,
                        'is_primary', p.is_primary
                    )
                ) FILTER (WHERE p.id IS NOT NULL),
                '[]'
            ) AS photos
        FROM sightings s
        LEFT JOIN cat_photos p ON p.sighting_id = s.id
        WHERE s.cat_id = $1
        GROUP BY s.id
        ORDER BY s.seen_at DESC
    `, [params.id]);

    return json(result.rows);
};

// POST /api/cats/[id]/sightings — add a sighting to an existing cat
export const POST: RequestHandler = async ({ params, request }) => {
    const body = await request.json();
    const {
        post_type, fb_post_id, fb_post_url, fb_post_text,
        location_raw, longitude, latitude, location_confidence,
        reporter_contact, seen_at, notes
    } = body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Insert sighting
        const sightingResult = await client.query(`
            INSERT INTO sightings (
                cat_id, post_type, fb_post_id, fb_post_url, fb_post_text,
                location_raw, location, location_confidence,
                reporter_contact, seen_at, notes, created_at
            ) VALUES (
                $1, $2, $3, $4, $5,
                $6, ST_SetSRID(ST_MakePoint($7, $8), 4326), $9,
                $10, $11, $12, now()
            ) RETURNING id
        `, [
            params.id, post_type || 'stray_sighting',
            fb_post_id || null, fb_post_url || null, fb_post_text || null,
            location_raw || null, longitude, latitude,
            location_confidence ?? 0.5,
            reporter_contact || null,
            seen_at || new Date().toISOString(),
            notes || null
        ]);

        // Update cat's last_seen_at and location if this sighting is more recent
        await client.query(`
            UPDATE cats SET
                last_seen_at = GREATEST(last_seen_at, $1),
                last_known_location = CASE
                    WHEN $1 > last_seen_at
                    THEN ST_SetSRID(ST_MakePoint($2, $3), 4326)
                    ELSE last_known_location
                END,
                updated_at = now()
            WHERE id = $4
        `, [
            seen_at || new Date().toISOString(),
            longitude, latitude,
            params.id
        ]);

        await client.query('COMMIT');
        return json({ id: sightingResult.rows[0].id }, { status: 201 });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        return json({ error: 'Failed to add sighting' }, { status: 500 });
    } finally {
        client.release();
    }
};