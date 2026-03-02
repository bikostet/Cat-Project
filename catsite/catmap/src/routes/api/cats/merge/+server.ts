import { json } from '@sveltejs/kit';
import pool from '$lib/db';

// Moves all sightings and photos from secondary → primary, then deletes secondary.
export async function POST({ request }) {
    const { primary_id, secondary_id } = await request.json();

    if (!primary_id || !secondary_id || primary_id === secondary_id) {
        return json({ error: 'Invalid merge request' }, { status: 400 });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(
            'UPDATE sightings SET cat_id = $1 WHERE cat_id = $2',
            [primary_id, secondary_id]
        );

        await client.query(
            'UPDATE cat_photos SET cat_id = $1 WHERE cat_id = $2',
            [primary_id, secondary_id]
        );

        await client.query(`
            UPDATE cats SET
                last_seen_at = GREATEST(
                    (SELECT last_seen_at FROM cats WHERE id = $1),
                    (SELECT last_seen_at FROM cats WHERE id = $2)
                ),
                updated_at = now()
            WHERE id = $1
        `, [primary_id, secondary_id]);

        await client.query('DELETE FROM cats WHERE id = $1', [secondary_id]);

        await client.query('COMMIT');
        return json({ merged_into: primary_id });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        return json({ error: 'Merge failed' }, { status: 500 });
    } finally {
        client.release();
    }
}