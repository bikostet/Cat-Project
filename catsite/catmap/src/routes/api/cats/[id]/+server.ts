import { json } from '@sveltejs/kit';
import pool from '$lib/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
    const result = await pool.query(`
        SELECT
            c.*,
            ST_AsGeoJSON(c.last_known_location)::json AS location
        FROM cats c
        WHERE c.id = $1
    `, [params.id]);

    if (result.rows.length === 0) {
        return json({ error: 'Cat not found' }, { status: 404 });
    }
    return json(result.rows[0]);
};

export const PUT: RequestHandler = async ({ params, request }) => {
    const body = await request.json();
    const {
        name, sex, coat_colors, coat_description, eye_color,
        approximate_age, is_microchipped, chip_registered,
        is_neutered, is_neighborhood_roamer, current_status,
        longitude, latitude, last_seen_at
    } = body;

    const result = await pool.query(`
        UPDATE cats SET
            name = $1,
            sex = $2,
            coat_colors = $3,
            coat_description = $4,
            eye_color = $5,
            approximate_age = $6,
            is_microchipped = $7,
            chip_registered = $8,
            is_neutered = $9,
            is_neighborhood_roamer = $10,
            current_status = $11,
            last_known_location = ST_SetSRID(ST_MakePoint($12, $13), 4326),
            last_seen_at = $14,
            updated_at = now()
        WHERE id = $15
        RETURNING id
    `, [
        name || null, sex || 'unknown', coat_colors || [],
        coat_description || null, eye_color || null,
        approximate_age || null, is_microchipped ?? null,
        chip_registered ?? null, is_neutered ?? null,
        is_neighborhood_roamer ?? null, current_status || 'stray',
        longitude, latitude,
        last_seen_at || new Date().toISOString(),
        params.id
    ]);

    if (result.rows.length === 0) {
        return json({ error: 'Cat not found' }, { status: 404 });
    }
    return json({ id: result.rows[0].id });
};

export const DELETE: RequestHandler = async ({ params }) => {
    const result = await pool.query(
        'DELETE FROM cats WHERE id = $1 RETURNING id',
        [params.id]
    );

    if (result.rows.length === 0) {
        return json({ error: 'Cat not found' }, { status: 404 });
    }
    return json({ deleted: result.rows[0].id });
};