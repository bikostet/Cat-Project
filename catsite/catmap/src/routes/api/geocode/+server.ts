import { json } from '@sveltejs/kit';

// GET /api/geocode?q=Rue+des+Foulons+Bruxelles
export async function GET({ url }) {
    const q = url.searchParams.get('q');
    if (!q) return json({ error: 'Missing query' }, { status: 400 });

    const params = new URLSearchParams({
        q,
        format: 'json',
        limit: '5',
        countrycodes: 'be'
    });

    const response = await fetch(
        `https://nominatim.openstreetmap.org/search?${params}`,
        {
            headers: {
                'User-Agent': 'CatMap/1.0 (local dev)'
            }
        }
    );

    const results = await response.json();


    const simplified = results.map((r: any) => ({
        display_name: r.display_name,
        lat: parseFloat(r.lat),
        lon: parseFloat(r.lon)
    }));

    return json(simplified);
}