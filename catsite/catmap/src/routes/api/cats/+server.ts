import { json } from '@sveltejs/kit';
import pool from '$lib/db';

export async function GET() {
    const result = await pool.query(`
        SELECT
            c.id,
            c.name,
            c.sex,
            c.coat_colors,
            c.coat_description,
            c.eye_color,
            c.approximate_age,
            c.is_microchipped,
            c.is_neutered,
            c.is_neighborhood_roamer,
            c.current_status,
            ST_AsGeoJSON(c.last_known_location)::json AS location,
            c.first_seen_at,
            c.last_seen_at,
            p.storage_path AS primary_photo
        FROM cats c
        LEFT JOIN cat_photos p ON p.cat_id = c.id AND p.is_primary = true
        ORDER BY c.last_seen_at DESC
    `);
    return json(result.rows);
}

export async function POST({ request }) {
    const body = await request.json();
    const {
        //cat fields
        name, sex, coat_colors, coat_description, eye_color,
        approximate_age, is_microchipped, chip_registered,
        is_neutered, is_neighborhood_roamer, current_status,
        //sighting fields
        post_type, location_raw, longitude, latitude,
        location_confidence, reporter_contact, seen_at, notes
    } = body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Insert cat
        const catResult = await client.query(`
            INSERT INTO cats (
                name, sex, coat_colors, coat_description, eye_color,
                approximate_age, is_microchipped, chip_registered,
                is_neutered, is_neighborhood_roamer, current_status,
                last_known_location, first_seen_at, last_seen_at,
                created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5,
                $6, $7, $8,
                $9, $10, $11,
                ST_SetSRID(ST_MakePoint($12, $13), 4326),
                $14, $14,
                now(), now()
            ) RETURNING id
        `, [
            name || null, sex || 'unknown', coat_colors || [],
            coat_description || null, eye_color || null,
            approximate_age || null, is_microchipped ?? null,
            chip_registered ?? null, is_neutered ?? null,
            is_neighborhood_roamer ?? null, current_status || 'stray',
            longitude, latitude, seen_at || new Date().toISOString()
        ]);

        const catId = catResult.rows[0].id;

        //first sighting
        await client.query(`
            INSERT INTO sightings (
                cat_id, post_type, location_raw, location,
                location_confidence, reporter_contact, seen_at, notes,
                created_at
            ) VALUES (
                $1, $2, $3,
                ST_SetSRID(ST_MakePoint($4, $5), 4326),
                $6, $7, $8, $9, now()
            )
        `, [
            catId, post_type || 'stray_sighting',
            location_raw || null, longitude, latitude,
            location_confidence ?? 0.5,
            reporter_contact || null,
            seen_at || new Date().toISOString(),
            notes || null
        ]);

        await client.query('COMMIT');
        return json({ id: catId }, { status: 201 });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        return json({ error: 'Failed to create cat' }, { status: 500 });
    } finally {
        client.release();
    }
}
