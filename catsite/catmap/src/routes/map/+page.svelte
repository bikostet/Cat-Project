<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import maplibregl from 'maplibre-gl';
    import 'maplibre-gl/dist/maplibre-gl.css';

    let mapContainer: HTMLDivElement;
    let map: maplibregl.Map;

    let allCats: any[] = [];
    let availableColors: string[] = [];

    let filterName = '';
    let filterStatuses: string[] = [];
    let filterAfterDate = '';
    let filterBeforeDate = '';
    let filterColors: string[] = [];
    let filterRoamerOnly = false;

    let collapsed = false;

    const allStatuses = ['stray', 'lost', 'in_care', 'reunited', 'adopted'];

    let modalCat: any = null;
    let modalSightings: any[] = [];
    let modalLoading = false;

    const statusColors: Record<string, string> = {
        stray:    '#ef4444',
        lost:     '#f97316',
        in_care:  '#22c55e',
        reunited: '#3b82f6',
        adopted:  '#8b5cf6'
    };

    const statusLabels: Record<string, string> = {
        stray:    'Stray',
        lost:     'Lost',
        in_care:  'In care',
        reunited: 'Reunited',
        adopted:  'Adopted'
    };

    const postTypeLabels: Record<string, string> = {
        stray_sighting: 'Stray sighting',
        lost_report:    'Lost report',
        found_report:   'Found report',
        status_update:  'Status update'
    };

    function toFeatureCollection(cats: any[]) {
        return {
            type: 'FeatureCollection' as const,
            features: cats.map(cat => ({
                type: 'Feature' as const,
                geometry: cat.location,
                properties: {
                    id: cat.id,
                    name: cat.name ?? 'Unknown',
                    status: cat.current_status,
                    coat_colors: cat.coat_colors?.join(', ') ?? '—',
                    last_seen_at: cat.last_seen_at,
                    primary_photo: cat.primary_photo ?? null,
                    is_neighborhood_roamer: cat.is_neighborhood_roamer
                }
            }))
        };
    }

    function applyFilters() {
        const afterDate = filterAfterDate ? new Date(filterAfterDate) : null;
        const beforeDate = filterBeforeDate ? new Date(filterBeforeDate) : null;

        const filtered = allCats.filter(cat => {
            const matchesName = filterName.trim() === '' ||
                (cat.name ?? '').toLowerCase().includes(filterName.toLowerCase());

            const matchesStatus = filterStatuses.length === 0 ||
                filterStatuses.includes(cat.current_status);

            const matchesDate = (!afterDate || new Date(cat.last_seen_at) >= afterDate) && (!beforeDate || new Date(cat.last_seen_at) <= beforeDate);

            const matchesColor = filterColors.length === 0 ||
                (cat.coat_colors ?? []).some((c: string) => filterColors.includes(c));

            const matchesRoamer = !filterRoamerOnly || cat.is_neighborhood_roamer;

            return matchesName && matchesStatus && matchesDate && matchesColor && matchesRoamer;
        });

        const source = map.getSource('cats') as maplibregl.GeoJSONSource;
        source.setData(toFeatureCollection(filtered));
    }

    function toggleStatus(status: string) {
        filterStatuses = filterStatuses.includes(status)
            ? filterStatuses.filter(s => s !== status)
            : [...filterStatuses, status];
        applyFilters();
    }

    function toggleColor(color: string) {
        filterColors = filterColors.includes(color)
            ? filterColors.filter(c => c !== color)
            : [...filterColors, color];
        applyFilters();
    }

    function resetFilters() {
        filterName = '';
        filterStatuses = [];
        filterAfterDate = '';
        filterBeforeDate = '';
        filterColors = [];
        filterRoamerOnly = false;
        applyFilters();
    }

     async function openModal(catId: string) {
        // Find cat data from allCats
        modalCat = allCats.find(c => c.id === catId) ?? null;
        modalSightings = [];
        modalLoading = true;
        const res = await fetch(`/api/cats/${catId}/sightings`);
        modalSightings = await res.json();
        modalLoading = false;
    }

    function closeModal() {
        modalCat = null;
        modalSightings = [];
    }

    class HomeControl {
    onAdd(map: maplibregl.Map) {
        const btn = document.createElement('button');
        btn.className = 'maplibregl-ctrl-icon home-btn';
        btn.title = 'Reset view';
        btn.innerHTML = '🏠';
        btn.addEventListener('click', () => {
            map.easeTo({ center: [4.3524, 50.8468], zoom: 11 });
        });

        const container = document.createElement('div');
        container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
        container.appendChild(btn);
        return container;
    }
            onRemove() {}
    }

    onMount(async () => {
        (window as any).openCatModal = openModal;
        const response = await fetch('/api/cats');
        allCats = await response.json();

        const colorSet = new Set<string>();
        allCats.forEach(cat => {
            (cat.coat_colors ?? []).forEach((c: string) => colorSet.add(c));
        });
        availableColors = Array.from(colorSet).sort();

        map = new maplibregl.Map({
            container: mapContainer,
            style: 'https://tiles.openfreemap.org/styles/liberty',
            center: [4.3524, 50.8468],
            zoom: 11
        });

        map.addControl(new maplibregl.NavigationControl(), 'top-right');

        map.addControl(new HomeControl(), 'top-right');

        map.on('load', () => {
            map.addSource('cats', {
                type: 'geojson',
                data: toFeatureCollection(allCats),
                cluster: true,
                clusterMaxZoom: 14,
                clusterRadius: 50
            });

            map.addLayer({
                id: 'clusters',
                type: 'circle',
                source: 'cats',
                filter: ['has', 'point_count'],
                paint: {
                    'circle-color': '#374151',
                    'circle-radius': [
                        'step', ['get', 'point_count'],
                        16, 10, 20, 50, 26
                    ],
                    'circle-stroke-width': 3,
                    'circle-stroke-color': '#ffffff'
                }
            });

            map.addLayer({
                id: 'cluster-count',
                type: 'symbol',
                source: 'cats',
                filter: ['has', 'point_count'],
                layout: {
                    'text-field': '{point_count_abbreviated}',
                    'text-size': 13,
                    'text-font': ['Open Sans Bold']
                },
                paint: { 'text-color': '#ffffff' }
            });

            map.addLayer({
                id: 'cats-glow',
                type: 'circle',
                source: 'cats',
                paint: {
                    'circle-radius': 22,
                    'circle-color': [
                        'match', ['get', 'status'],
                        'stray',    '#ef4444',
                        'lost',     '#f97316',
                        'in_care',  '#22c55e',
                        'reunited', '#3b82f6',
                        'adopted',  '#8b5cf6',
                        '#6b7280'
                    ],
                    'circle-opacity': 0.15,
                    'circle-blur': 0.8
                }
            });

            map.addLayer({
                id: 'cats-layer',
                type: 'circle',
                source: 'cats',
                paint: {
                    'circle-radius': 5,
                    'circle-color': [
                        'match', ['get', 'status'],
                        'stray',    '#ef4444',
                        'lost',     '#f97316',
                        'in_care',  '#22c55e',
                        'reunited', '#3b82f6',
                        'adopted',  '#8b5cf6',
                        '#6b7280'
                    ],
                    'circle-stroke-width': 1,
                    'circle-stroke-color': '#ffffff'
                }
            });

            map.on('click', 'clusters', async (e) => {
                const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
                const clusterId = features[0].properties.clusterId;
                const zoom = await (map.getSource('cats') as maplibregl.GeoJSONSource)
                    .getClusterExpansionZoom(clusterId);
                map.easeTo({ center: (features[0].geometry as any).coordinates, zoom });
            });

            map.on('click', 'cats-layer', (e) => {
                const props = e.features![0].properties;
                const color = statusColors[props.status] ?? '#6b7280';
                const label = statusLabels[props.status] ?? props.status;
                const date = new Date(props.last_seen_at).toLocaleDateString('fr-BE', {
                    day: 'numeric', month: 'long', year: 'numeric'
                });
                const roamer = props.is_neighborhood_roamer
                    ? '<span class="badge">🏘 Neighborhood roamer</span>'
                    : '';
                const photo = props.primary_photo
                    ? `<img src="${props.primary_photo}" alt="Cat photo" />`
                    : `<div class="no-photo">🐱</div>`;

                const popup = new maplibregl.Popup({ maxWidth: '280px' })
                    .setLngLat(e.lngLat)
                    .setHTML(`
                        <div class="popup">
                            ${photo}
                            <div class="popup-body">
                                <div class="popup-header">
                                    <strong>${props.name}</strong>
                                    <span class="status-badge" style="background:${color}">${label}</span>
                                </div>
                                <div class="popup-row">Couleur: ${props.coat_colors}</div>
                                <div class="popup-row">Last seen: ${date}</div>
                                ${roamer}
                                <button class="history-btn" onclick="openCatModal('${props.id}')">View sighting history</button>
                            </div>
                        </div>
                    `)
                    .addTo(map);
            });
            
            map.on('mouseenter', 'cats-layer', () => {
                map.getCanvas().style.cursor = 'pointer';
            });
            map.on('mouseleave', 'cats-layer', () => {
                map.getCanvas().style.cursor = '';
            });
        });
    });

    onDestroy(() => {
        delete (window as any).openCatModal;
        map?.remove();
    });
</script>

<div bind:this={mapContainer} style="width: 100%; height: 100vh;" />

<div class="filter-panel">
    <div class="filter-title">
        Filters
        <button class="collapse-btn" on:click={() => collapsed = !collapsed}>
            {collapsed ? '▼' : '▲'}
        </button>
    </div>

    {#if !collapsed}
        <div class="filter-section">
                <label class="filter-label">Name</label>
                <input
                    class="filter-input"
                    type="text"
                    placeholder="Search by name..."
                    bind:value={filterName}
                    on:input={applyFilters}
                />
            </div>
        <div class="filter-section">
        <label class="filter-label">Status</label>
        <div class="chip-group">
            {#each allStatuses as status}
                <button
                    class="chip"
                    class:active={filterStatuses.includes(status)}
                    style={filterStatuses.includes(status)
                        ? `background:${statusColors[status]};border-color:${statusColors[status]}`
                        : ''}
                    on:click={() => toggleStatus(status)}
                >
                    {statusLabels[status]}
                </button>
            {/each}
        </div>
    </div>

        <div class="filter-section">
        <label class="filter-label">Last seen after</label>
        <input
            class="filter-input"
            type="date"
            bind:value={filterAfterDate}
            on:change={applyFilters}
        />
    </div>

    <div class="filter-section">
        <label class="filter-label">Last seen before</label>
        <input
            class="filter-input"
            type="date"
            bind:value={filterBeforeDate}
            on:change={applyFilters}
        />
    </div>

    {#if availableColors.length > 0}
    <div class="filter-section">
        <label class="filter-label">Coat color</label>
        <div class="chip-group">
            {#each availableColors as color}
                <button
                    class="chip"
                    class:active={filterColors.includes(color)}
                    on:click={() => toggleColor(color)}
                >
                    {color}
                </button>
            {/each}
        </div>
    </div>
    {/if}

    <div class="filter-section">
        <label class="filter-toggle">
            <input
                type="checkbox"
                bind:checked={filterRoamerOnly}
                on:change={applyFilters}
            />
            Neighborhood roamers only
        </label>
    </div>

    <button class="reset-btn" on:click={resetFilters}>Reset filters</button>
    {/if}
</div>

{#if modalCat}
<div class="modal-backdrop" on:click={closeModal}>
    <div class="modal" on:click|stopPropagation>

        <div class="modal-header">
            <div class="modal-title">
                <strong>{modalCat.name ?? 'Unknown cat'}</strong>
                <span
                    class="status-badge"
                    style="background:{statusColors[modalCat.current_status] ?? '#6b7280'}"
                >{statusLabels[modalCat.current_status] ?? modalCat.current_status}</span>
            </div>
            <button class="modal-close" on:click={closeModal}>✕</button>
        </div>

        <div class="modal-body">
            {#if modalLoading}
                <p class="modal-empty">Loading...</p>
            {:else if modalSightings.length === 0}
                <p class="modal-empty">No sightings recorded.</p>
            {:else}
                <ul class="sighting-list">
                    {#each modalSightings as sighting}
                        <li class="sighting-row">
                            <div class="sighting-meta">
                                <span class="sighting-type">
                                    {postTypeLabels[sighting.post_type] ?? sighting.post_type}
                                </span>
                                <span class="sighting-date">
                                    {new Date(sighting.seen_at).toLocaleDateString('fr-BE', {
                                        day: 'numeric', month: 'long', year: 'numeric'
                                    })}
                                </span>
                            </div>

                            {#if sighting.location_raw}
                                <div class="sighting-location">📍 {sighting.location_raw}</div>
                            {/if}

                            {#if sighting.notes}
                                <div class="sighting-notes">{sighting.notes}</div>
                            {/if}

                            {#if sighting.reporter_contact}
                                <div class="sighting-contact">📞 {sighting.reporter_contact}</div>
                            {/if}

                            {#if sighting.fb_post_url}
                                <a
                                    class="sighting-link"
                                    href={sighting.fb_post_url}
                                    target="_blank"
                                    rel="noopener"
                                >View Facebook post →</a>
                            {/if}

                            {#if sighting.photos?.length > 0}
                                <div class="sighting-photos">
                                    {#each sighting.photos as photo}
                                        <img src={photo.storage_path} alt="Sighting photo" />
                                    {/each}
                                </div>
                            {/if}
                        </li>
                    {/each}
                </ul>
            {/if}
        </div>
    </div>
</div>
{/if}

<style>
    .filter-panel {
        position: absolute;
        top: 16px;
        left: 16px;
        z-index: 10;
        background: white;
        border-radius: 12px;
        padding: 16px;
        width: 220px;
        box-shadow: 0 2px 12px rgba(0,0,0,0.15);
        font-family: system-ui, sans-serif;
        font-size: 0.85rem;
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .filter-title {
        font-weight: 700;
        font-size: 0.95rem;
        color: #111;
    }

    .filter-section {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .filter-label {
        font-weight: 600;
        color: #374151;
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .filter-input {
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        padding: 5px 8px;
        font-size: 0.85rem;
        outline: none;
        width: 100%;
        box-sizing: border-box;
        color: #111;
    }

    .filter-input:focus {
        border-color: #6b7280;
    }

    .chip-group {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
    }

    .chip {
        border: 1.5px solid #e5e7eb;
        background: white;
        border-radius: 999px;
        padding: 2px 10px;
        font-size: 0.78rem;
        cursor: pointer;
        color: #374151;
        transition: all 0.15s ease;
    }

    .chip.active {
        color: white;
    }

    .chip:hover:not(.active) {
        border-color: #9ca3af;
        background: #f9fafb;
    }

    .filter-toggle {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        color: #374151;
    }

    .filter-toggle input {
        accent-color: #374151;
    }

    .reset-btn {
        border: 1.5px solid #e5e7eb;
        background: white;
        border-radius: 6px;
        padding: 6px;
        font-size: 0.8rem;
        cursor: pointer;
        color: #6b7280;
        transition: all 0.15s ease;
    }

    .reset-btn:hover {
        background: #f9fafb;
        color: #374151;
    }

    :global(.maplibregl-popup-content) {
        padding: 0;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        font-family: system-ui, sans-serif;
    }

    :global(.popup) { width: 260px; }

    :global(.popup img) {
        width: 100%;
        height: 160px;
        object-fit: cover;
    }

    :global(.no-photo) {
        width: 100%;
        height: 100px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 3rem;
        background: #f3f4f6;
    }

    :global(.popup-body) { padding: 12px 14px; }

    :global(.popup-header) {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
    }

    :global(.popup-header strong) { font-size: 1rem; }

    :global(.status-badge) {
        font-size: 0.7rem;
        color: white;
        padding: 2px 8px;
        border-radius: 999px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    :global(.popup-row) {
        font-size: 0.85rem;
        color: #4b5563;
        margin-bottom: 4px;
    }

    :global(.badge) {
        display: inline-block;
        margin-top: 6px;
        font-size: 0.75rem;
        background: #f3f4f6;
        color: #374151;
        padding: 2px 8px;
        border-radius: 999px;
    }

    :global(.home-btn) {
    font-size: 1rem;
    line-height: 1;
    cursor: pointer;
    background: none;
    border: none;
    width: 29px;
    height: 29px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #333;
}

:global(.home-btn:hover) {
    background: #f0f0f0;
}

.filter-panel {
        position: absolute;
        top: 16px;
        left: 16px;
        z-index: 10;
        background: white;
        border-radius: 12px;
        padding: 16px;
        width: 220px;
        box-shadow: 0 2px 12px rgba(0,0,0,0.15);
        font-family: system-ui, sans-serif;
        font-size: 0.85rem;
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .filter-title {
        font-weight: 700;
        font-size: 0.95rem;
        color: #111;
        display: flex;
        align-items: center;
        justify-content: space-between;
    }

    .collapse-btn {
        background: none;
        border: none;
        cursor: pointer;
        color: #6b7280;
        font-size: 0.75rem;
        padding: 0;
        line-height: 1;
    }

    .collapse-btn:hover { color: #111; }

    .filter-section {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .filter-label {
        font-weight: 600;
        color: #374151;
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .filter-input {
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        padding: 5px 8px;
        font-size: 0.85rem;
        outline: none;
        width: 100%;
        box-sizing: border-box;
        color: #111;
    }

    .filter-input:focus { border-color: #6b7280; }

    .chip-group {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
    }

    .chip {
        border: 1.5px solid #e5e7eb;
        background: white;
        border-radius: 999px;
        padding: 2px 10px;
        font-size: 0.78rem;
        cursor: pointer;
        color: #374151;
        transition: all 0.15s ease;
    }

    .chip.active { color: white; }
    .chip:hover:not(.active) { border-color: #9ca3af; background: #f9fafb; }

    .filter-toggle {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        color: #374151;
    }

    .filter-toggle input { accent-color: #374151; }

    .reset-btn {
        border: 1.5px solid #e5e7eb;
        background: white;
        border-radius: 6px;
        padding: 6px;
        font-size: 0.8rem;
        cursor: pointer;
        color: #6b7280;
        transition: all 0.15s ease;
    }

    .reset-btn:hover { background: #f9fafb; color: #374151; }

    /* ── Modal ── */
    .modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.4);
        z-index: 100;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
    }

    .modal {
        background: white;
        border-radius: 14px;
        width: 100%;
        max-width: 520px;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 8px 40px rgba(0,0,0,0.2);
        font-family: system-ui, sans-serif;
    }

    .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid #e5e7eb;
        flex-shrink: 0;
    }

    .modal-title {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 1rem;
    }

    .modal-close {
        background: none;
        border: none;
        cursor: pointer;
        color: #9ca3af;
        font-size: 1rem;
        padding: 4px;
        line-height: 1;
    }

    .modal-close:hover { color: #111; }

    .modal-body {
        overflow-y: auto;
        flex: 1;
        padding: 16px 20px;
    }

    .modal-empty {
        color: #9ca3af;
        text-align: center;
        padding: 24px 0;
        font-size: 0.9rem;
    }

    .sighting-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .sighting-row {
        border: 1px solid #e5e7eb;
        border-radius: 10px;
        padding: 12px 14px;
        display: flex;
        flex-direction: column;
        gap: 5px;
    }

    .sighting-meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 2px;
    }

    .sighting-type {
        font-weight: 600;
        font-size: 0.85rem;
        color: #111;
    }

    .sighting-date {
        font-size: 0.78rem;
        color: #9ca3af;
    }

    .sighting-location {
        font-size: 0.82rem;
        color: #6b7280;
    }

    .sighting-notes {
        font-size: 0.85rem;
        color: #374151;
        line-height: 1.4;
    }

    .sighting-contact {
        font-size: 0.82rem;
        color: #6b7280;
    }

    .sighting-link {
        font-size: 0.82rem;
        color: #3b82f6;
        text-decoration: none;
    }

    .sighting-link:hover { text-decoration: underline; }

    .sighting-photos {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        margin-top: 4px;
    }

    .sighting-photos img {
        width: 72px;
        height: 72px;
        object-fit: cover;
        border-radius: 6px;
        border: 1px solid #e5e7eb;
    }

    /* ── MapLibre popup ── */
    :global(.maplibregl-popup-content) {
        padding: 0;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        font-family: system-ui, sans-serif;
    }

    :global(.popup) { width: 260px; }

    :global(.popup img) {
        width: 100%;
        height: 160px;
        object-fit: cover;
    }

    :global(.no-photo) {
        width: 100%;
        height: 100px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 3rem;
        background: #f3f4f6;
    }

    :global(.popup-body) { padding: 12px 14px; }

    :global(.popup-header) {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
    }

    :global(.popup-header strong) { font-size: 1rem; }

    :global(.status-badge) {
        font-size: 0.7rem;
        color: white;
        padding: 2px 8px;
        border-radius: 999px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    :global(.popup-row) {
        font-size: 0.85rem;
        color: #4b5563;
        margin-bottom: 4px;
    }

    :global(.badge) {
        display: inline-block;
        margin-top: 6px;
        font-size: 0.75rem;
        background: #f3f4f6;
        color: #374151;
        padding: 2px 8px;
        border-radius: 999px;
    }

    :global(.history-btn) {
        display: block;
        width: 100%;
        margin-top: 10px;
        padding: 7px 0;
        background: #f3f4f6;
        border: none;
        border-radius: 6px;
        font-size: 0.82rem;
        font-weight: 600;
        color: #374151;
        cursor: pointer;
        text-align: center;
        transition: background 0.15s;
    }

    :global(.history-btn:hover) { background: #e5e7eb; }

    :global(.home-btn) {
        font-size: 1rem;
        line-height: 1;
        cursor: pointer;
        background: none;
        border: none;
        width: 29px;
        height: 29px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #333;
    }

    :global(.home-btn:hover) { background: #f0f0f0; }
</style>