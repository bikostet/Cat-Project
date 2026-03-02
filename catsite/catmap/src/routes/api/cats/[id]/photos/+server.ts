import { json } from '@sveltejs/kit';
import pool from '$lib/db';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request }) => {
    const formData = await request.formData();
    const file = formData.get('photo') as File;
    const isPrimary = formData.get('is_primary') === 'true';

    if (!file || file.size === 0) {
        return json({ error: 'No file provided' }, { status: 400 });
    }

    // Sanitize filename
    const ext = path.extname(file.name).toLowerCase();
    const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
    if (!allowed.includes(ext)) {
        return json({ error: 'Invalid file type' }, { status: 400 });
    }

    const filename = `${Date.now()}${ext}`;
    const uploadDir = path.join('static', 'uploads', params.id);
    const filePath = path.join(uploadDir, filename);
    const storagePath = `/uploads/${params.id}/${filename}`;

    // Create directory if needed
    if (!existsSync(uploadDir)) {
        await mkdir(uploadDir, { recursive: true });
    }

    // Write file
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // If this is primary, unset any existing primary
        if (isPrimary) {
            await client.query(
                'UPDATE cat_photos SET is_primary = false WHERE cat_id = $1',
                [params.id]
            );
        }

        // Insert photo record
        const result = await client.query(`
            INSERT INTO cat_photos (cat_id, storage_path, is_primary, created_at)
            VALUES ($1, $2, $3, now())
            RETURNING id, storage_path, is_primary
        `, [params.id, storagePath, isPrimary]);

        await client.query('COMMIT');
        return json(result.rows[0], { status: 201 });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        return json({ error: 'Failed to save photo record' }, { status: 500 });
    } finally {
        client.release();
    }
};

// GET /api/cats/[id]/photos
export const GET: RequestHandler = async ({ params }) => {
    const result = await pool.query(
        'SELECT id, storage_path, is_primary, created_at FROM cat_photos WHERE cat_id = $1 ORDER BY is_primary DESC, created_at DESC',
        [params.id]
    );
    return json(result.rows);
};

// DELETE /api/cats/[id]/photos?photo_id=xxx
export const DELETE: RequestHandler = async ({ params, url }) => {
    const photoId = url.searchParams.get('photo_id');
    if (!photoId) return json({ error: 'Missing photo_id' }, { status: 400 });

    const result = await pool.query(
        'DELETE FROM cat_photos WHERE id = $1 AND cat_id = $2 RETURNING storage_path',
        [photoId, params.id]
    );

    if (result.rows.length === 0) {
        return json({ error: 'Photo not found' }, { status: 404 });
    }

    // Optionally delete file from disk
    try {
        const filePath = path.join('static', result.rows[0].storage_path);
        const { unlink } = await import('fs/promises');
        await unlink(filePath);
    } catch {
        // File may not exist, not critical
    }

    return json({ deleted: photoId });
};