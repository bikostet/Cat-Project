<script lang="ts">
    import { onMount, onDestroy, tick } from 'svelte';
    import maplibregl from 'maplibre-gl';
    import 'maplibre-gl/dist/maplibre-gl.css';
    let cats: any[] = [];
    let loading = true;
    let searchQuery = '';

    let panelMode: null | 'new' | 'edit' | 'merge' = null;
    let selectedCat: any = null;
    let mergeSecondary: any = null;

    let confirmDeleteId: string | null = null;

    let saving = false;
    let feedback = '';

    let form = emptyForm();

    function emptyForm() {
        return {
            // cat
            name: '',
            sex: 'unknown',
            coat_colors: '',
            coat_description: '',
            eye_color: '',
            approximate_age: '',
            is_microchipped: null as boolean | null,
            chip_registered: null as boolean | null,
            is_neutered: null as boolean | null,
            is_neighborhood_roamer: null as boolean | null,
            current_status: 'stray',
            // sighting
            post_type: 'stray_sighting',
            location_raw: '',
            longitude: null as number | null,
            latitude: null as number | null,
            location_confidence: 0.5,
            reporter_contact: '',
            seen_at: new Date().toISOString().slice(0, 16),
            notes: ''
        };
    }

    function fillFormFromCat(cat: any) {
        form = {
            name: cat.name ?? '',
            sex: cat.sex ?? 'unknown',
            coat_colors: (cat.coat_colors ?? []).join(', '),
            coat_description: cat.coat_description ?? '',
            eye_color: cat.eye_color ?? '',
            approximate_age: cat.approximate_age ?? '',
            is_microchipped: cat.is_microchipped ?? null,
            chip_registered: cat.chip_registered ?? null,
            is_neutered: cat.is_neutered ?? null,
            is_neighborhood_roamer: cat.is_neighborhood_roamer ?? null,
            current_status: cat.current_status ?? 'stray',
            post_type: 'stray_sighting',
            location_raw: '',
            longitude: cat.location?.coordinates?.[0] ?? null,
            latitude: cat.location?.coordinates?.[1] ?? null,
            location_confidence: 0.5,
            reporter_contact: '',
            seen_at: cat.last_seen_at
                ? new Date(cat.last_seen_at).toISOString().slice(0, 16)
                : new Date().toISOString().slice(0, 16),
            notes: ''
        };
    }

    const statusColors: Record<string, string> = {
        stray:    '#ef4444',
        lost:     '#f97316',
        in_care:  '#22c55e',
        reunited: '#3b82f6',
        adopted:  '#8b5cf6'
    };
    const statusLabels: Record<string, string> = {
        stray: 'Stray', lost: 'Lost', in_care: 'In care',
        reunited: 'Reunited', adopted: 'Adopted'
    };
    const allStatuses = Object.keys(statusLabels);
    const postTypes = [
        { value: 'stray_sighting', label: 'Stray sighting' },
        { value: 'lost_report',    label: 'Lost report' },
        { value: 'found_report',   label: 'Found report' },
        { value: 'status_update',  label: 'Status update' }
    ];

    let geocodeQuery = '';
    let geocodeSuggestions: any[] = [];
    let geocodeTimer: ReturnType<typeof setTimeout>;
    let miniMap: maplibregl.Map;
    let miniMapContainer: HTMLDivElement;
    let pinMarker: maplibregl.Marker | undefined;
    

    function onGeocode() {
        clearTimeout(geocodeTimer);
        if (geocodeQuery.length < 3) { geocodeSuggestions = []; return; }
        geocodeTimer = setTimeout(async () => {
            const res = await fetch(`/api/geocode?q=${encodeURIComponent(geocodeQuery)}`);
            geocodeSuggestions = await res.json();
        }, 400);
    }

    function selectSuggestion(s: any) {
        form.longitude = s.lon;
        form.latitude = s.lat;
        form.location_raw = s.display_name;
        geocodeQuery = s.display_name;
        geocodeSuggestions = [];
        movePinTo(s.lon, s.lat);
    }

function movePinTo(lng: number, lat: number) {
    if (!miniMap) return;
    if (!miniMapReady) {
        miniMap.once('load', () => movePinTo(lng, lat));
        return;
    }
    if (pinMarker) {
        pinMarker.setLngLat([lng, lat]);
    } else {
        pinMarker = new maplibregl.Marker({ draggable: true, color: '#374151' })
            .setLngLat([lng, lat])
            .addTo(miniMap);
        pinMarker.on('dragend', () => {
            const lngLat = pinMarker!.getLngLat();
            form.longitude = lngLat.lng;
            form.latitude = lngLat.lat;
        });
    }
    miniMap.easeTo({ center: [lng, lat], zoom: 15 });
}

let miniMapReady = false;

function initMiniMap() {
    if (!miniMapContainer) return;
    if (miniMap) miniMap.remove();
    miniMapReady = false;
    if (pinMarker) pinMarker = undefined;

    miniMap = new maplibregl.Map({
        container: miniMapContainer,
        style: 'https://tiles.openfreemap.org/styles/liberty',
        center: [4.3524, 50.8468],
        zoom: 12
    });

    miniMap.on('load', () => {
        miniMapReady = true;
        if (form.longitude !== null && form.latitude !== null) {
            movePinTo(form.longitude, form.latitude);
        }
    });

    miniMap.on('click', (e) => {
        form.longitude = e.lngLat.lng;
        form.latitude = e.lngLat.lat;
        movePinTo(e.lngLat.lng, e.lngLat.lat);
    });
}

    async function loadCats() {
        loading = true;
        const res = await fetch('/api/cats');
        cats = await res.json();
        loading = false;
    }

    async function openNew() {
        panelMode = 'new';
        selectedCat = null;
        mergeSecondary = null;
        form = emptyForm();
        geocodeQuery = '';
        geocodeSuggestions = [];
        if (miniMap) { miniMap.remove(); miniMap = undefined as any; pinMarker = undefined; }        
        await tick();
        initMiniMap();
        photos = []
    }

    async function openEdit(cat: any) {
        if (selectedCat?.id === cat.id) return;
        panelMode = 'edit';
        selectedCat = cat;
        mergeSecondary = null;
        fillFormFromCat(cat);
        await loadPhotos(cat.id)
        geocodeQuery = '';
        geocodeSuggestions = [];
        if (miniMap) { miniMap.remove(); miniMap = undefined as any; pinMarker = undefined; }        
        await tick();
        initMiniMap();
    }

    function openMerge(cat: any) {
        panelMode = 'merge';
        selectedCat = cat;
        mergeSecondary = null;
    }

    function closePanel() {
        panelMode = null;
        selectedCat = null;
        mergeSecondary = null;
        if (miniMap) { miniMap.remove(); }
    }

    async function submitNew() {
        if (form.longitude === null || form.latitude === null) {
            feedback = 'Please set a location on the map.';
            return;
        }
        saving = true;
        feedback = '';
        const payload = {
            ...form,
            coat_colors: form.coat_colors.split(',').map(s => s.trim()).filter(Boolean)
        };
        const res = await fetch('/api/cats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        saving = false;
        if (res.ok) {
            feedback = 'Cat added successfully.';
            await loadCats();
        } else {
            feedback = 'Error saving cat.';
        }
    }

    async function submitEdit() {
        if (form.longitude === null || form.latitude === null) {
            feedback = 'Please set a location on the map.';
            return;
        }
        saving = true;
        feedback = '';
        const payload = {
            ...form,
            coat_colors: form.coat_colors.split(',').map(s => s.trim()).filter(Boolean)
        };
        const res = await fetch(`/api/cats/${selectedCat.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        saving = false;
        if (res.ok) {
            feedback = 'Cat updated.';
            await loadCats();
        } else {
            feedback = 'Error updating cat.';
        }
    }

    async function deleteCat(id: string) {
        const res = await fetch(`/api/cats/${id}`, { method: 'DELETE' });
        if (res.ok) {
            confirmDeleteId = null;
            if (selectedCat?.id === id) closePanel();
            await loadCats();
        }
    }

    async function submitMerge() {
        if (!selectedCat || !mergeSecondary) return;
        saving = true;
        const res = await fetch('/api/cats/merge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                primary_id: selectedCat.id,
                secondary_id: mergeSecondary.id
            })
        });
        saving = false;
        if (res.ok) {
            await loadCats();
            closePanel();
        }
    }

    $: filteredCats = cats.filter(cat => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (cat.name ?? 'unknown').toLowerCase().includes(q) ||
               cat.current_status.includes(q);
    });

    onMount(loadCats);
    onDestroy(() => { if (miniMap) miniMap.remove(); });


    let photos: any[] = [];
    let photoUploading = false;

    async function loadPhotos(catId: string) {
        const res = await fetch(`/api/cats/${catId}/photos`);
        photos = await res.json();
    }

    async function uploadPhoto(e: Event) {
        if (!selectedCat) return;
        const input = e.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;
        photoUploading = true;
        const fd = new FormData();
        fd.append('photo', file);
        fd.append('is_primary', photos.length === 0 ? 'true' : 'false');
        await fetch(`/api/cats/${selectedCat.id}/photos`, { method: 'POST', body: fd });
        await loadPhotos(selectedCat.id);
        photoUploading = false;
        input.value = '';
    }

    async function deletePhoto(photoId: string) {
        await fetch(`/api/cats/${selectedCat.id}/photos?photo_id=${photoId}`, { method: 'DELETE' });
        await loadPhotos(selectedCat.id);
    }

    async function setPrimary(photoId: string) {
        // Unset all, then set this one
        await fetch(`/api/cats/${selectedCat.id}/photos`, {
            method: 'POST',
            body: (() => { const fd = new FormData(); return fd; })()
        });
        // Simpler: just reload after a dedicated primary endpoint
        // For now, delete and re-upload isn't ideal — add a PATCH endpoint later
        // Quick workaround: update via direct query isn't exposed yet
        // So just mark visually and handle in a future PATCH /api/cats/[id]/photos/[photoId]
    }

    // Call loadPhotos when opening edit mode — add to openEdit():
    // if (cat.id) await loadPhotos(cat.id);
    // Also reset in openNew():
    // photos = [];

</script>

<div class="admin">

    <div class="sidebar">
        <div class="sidebar-header">
            <h1>Cat Map Admin</h1>
            <button class="btn-primary" on:click={openNew}>+ Add cat</button>
        </div>

        <input
            class="search-input"
            type="text"
            placeholder="Search cats..."
            bind:value={searchQuery}
        />

        {#if loading}
            <div class="empty">Loading...</div>
        {:else if filteredCats.length === 0}
            <div class="empty">No cats found.</div>
        {:else}
            <ul class="cat-list">
                {#each filteredCats as cat}
                    <li class="cat-row" class:selected={selectedCat?.id === cat.id} on:click={() => openEdit(cat)}>
                        <div class="cat-info">
                            <span class="cat-name">{cat.name ?? 'Unknown cat'}</span>
                            <span
                                class="status-dot"
                                style="background:{statusColors[cat.current_status] ?? '#6b7280'}"
                            ></span>
                            <span class="cat-status">{statusLabels[cat.current_status] ?? cat.current_status}</span>
                            <span class="cat-date">
                                {new Date(cat.last_seen_at).toLocaleDateString('fr-BE')}
                            </span>
                        </div>
                        <div class="cat-actions">
                            <button class="btn-icon" title="Edit" on:click={() => openEdit(cat)}>✎</button>
                            <button class="btn-icon" title="Merge" on:click={() => openMerge(cat)}>⇄</button>
                            <button
                                class="btn-icon danger"
                                title="Delete"
                                on:click|stopPropagation={() => confirmDeleteId = cat.id}
                            >✕</button>
                        </div>

                        {#if confirmDeleteId === cat.id}
                            <div class="confirm-delete">
                                Delete <strong>{cat.name ?? 'this cat'}</strong> and all its sightings?
                                <div class="confirm-btns">
                                    <button class="btn-danger" on:click={() => deleteCat(cat.id)}>Delete</button>
                                    <button class="btn-ghost" on:click={() => confirmDeleteId = null}>Cancel</button>
                                </div>
                            </div>
                        {/if}
                    </li>
                {/each}
            </ul>
        {/if}
    </div>

    {#if panelMode}
    <div class="panel">

        <div class="panel-header">
            <h2>
                {#if panelMode === 'new'}Add new cat
                {:else if panelMode === 'edit'}Edit — {selectedCat?.name ?? 'Unknown cat'}
                {:else if panelMode === 'merge'}Merge cats
                {/if}
            </h2>
            <button class="btn-icon" on:click={closePanel}>✕</button>
        </div>

        {#if panelMode === 'new' || panelMode === 'edit'}
        <div class="panel-body">

            <section class="form-section">
                <h3>Cat information</h3>

                <div class="field-row">
                    <div class="field">
                        <label>Name</label>
                        <input type="text" bind:value={form.name} placeholder="Leave blank if unknown" />
                    </div>
                    <div class="field">
                        <label>Sex</label>
                        <select bind:value={form.sex}>
                            <option value="unknown">Unknown</option>
                            <option value="male">Male</option>
                            <option value="female">Female</option>
                        </select>
                    </div>
                </div>

                <div class="field">
                    <label>Status</label>
                    <div class="chip-group">
                        {#each allStatuses as status}
                            <button
                                class="chip"
                                class:active={form.current_status === status}
                                style={form.current_status === status
                                    ? `background:${statusColors[status]};border-color:${statusColors[status]}`
                                    : ''}
                                on:click={() => form.current_status = status}
                            >{statusLabels[status]}</button>
                        {/each}
                    </div>
                </div>

                <div class="field-row">
                    <div class="field">
                        <label>Coat colors <span class="hint">(comma-separated)</span></label>
                        <input type="text" bind:value={form.coat_colors} placeholder="black, white" />
                    </div>
                    <div class="field">
                        <label>Eye color</label>
                        <input type="text" bind:value={form.eye_color} placeholder="green/yellow" />
                    </div>
                </div>

                <div class="field">
                    <label>Coat description</label>
                    <textarea bind:value={form.coat_description} rows="2" placeholder="Markings, pattern..."></textarea>
                </div>

                <div class="field">
                    <label>Approximate age</label>
                    <input type="text" bind:value={form.approximate_age} placeholder="Adult, kitten, ~2 years..." />
                </div>

                <div class="toggles">
                    <label class="toggle-label">
                        <select bind:value={form.is_microchipped}>
                            <option value={null}>Unknown</option>
                            <option value={true}>Yes</option>
                            <option value={false}>No</option>
                        </select>
                        Microchipped
                    </label>
                    <label class="toggle-label">
                        <select bind:value={form.chip_registered}>
                            <option value={null}>Unknown</option>
                            <option value={true}>Yes</option>
                            <option value={false}>No</option>
                        </select>
                        Chip registered
                    </label>
                    <label class="toggle-label">
                        <select bind:value={form.is_neutered}>
                            <option value={null}>Unknown</option>
                            <option value={true}>Yes</option>
                            <option value={false}>No</option>
                        </select>
                        Neutered
                    </label>
                    <label class="toggle-label">
                        <select bind:value={form.is_neighborhood_roamer}>
                            <option value={null}>Unknown</option>
                            <option value={true}>Yes</option>
                            <option value={false}>No</option>
                        </select>
                        Neighborhood roamer
                    </label>
                </div>
            </section>

            <section class="form-section">
                <div class="field">
                    <label>Last date seen</label>
                    <input type="datetime-local" bind:value={form.seen_at} />
                </div>
                <div class="field">
                    <label>Reporter contact</label>
                    <input type="text" bind:value={form.reporter_contact} placeholder="DM, phone..." />
                </div>
                <div class="field">
                    <label>Notes</label>
                    <textarea bind:value={form.notes} rows="2" placeholder="Any additional details..."></textarea>
                </div>
            
            {#if panelMode === 'new'}
                <h3> First sighting </h3>
                <div class="field-row">
                    <div class="field">
                        <label>Post type</label>
                        <select bind:value={form.post_type}>
                            {#each postTypes as pt}
                                <option value={pt.value}>{pt.label}</option>
                            {/each}
                        </select>
                    </div>
                    <div class="field">
                        <label>Date seen</label>
                        <input type="datetime-local" bind:value={form.seen_at} />
                    </div>
                </div>
            {/if}
            </section>
            
            <section class="form-section">
                <h3>Location</h3>
                <div class="field geocode-field">
                    <label>Search address</label>
                    <input
                        type="text"
                        bind:value={geocodeQuery}
                        on:input={onGeocode}
                        on:blur={() => setTimeout(() => geocodeSuggestions = [], 150)}
                        placeholder="Rue des Foulons, Bruxelles..."
                    />
                    {#if geocodeSuggestions.length > 0}
                        <ul class="suggestions">
                            {#each geocodeSuggestions as s}
                                <li on:click={() => selectSuggestion(s)}>{s.display_name}</li>
                            {/each}
                        </ul>
                    {/if}
                </div>

                <div bind:this={miniMapContainer} class="mini-map"></div>
                <p class="hint map-hint">Click the map to place or move the pin. Drag the pin to adjust.</p>

                {#if form.longitude !== null && form.latitude !== null}
                    <p class="coords">{form.latitude.toFixed(5)}, {form.longitude.toFixed(5)}</p>
                {/if}

                <div class="field-row">
                    <div class="field">
                        <label>Location confidence</label>
                        <input
                            type="range" min="0" max="1" step="0.05"
                            bind:value={form.location_confidence}
                        />
                        <span class="hint">{form.location_confidence}</span>
                    </div>
                    <div class="field">
                        <label>Raw location text</label>
                        <input type="text" bind:value={form.location_raw} placeholder="As written in the post" />
                    </div>
                </div>
            </section>

            <section class="form-section">
                <h3>Photos</h3>

                {#if panelMode === 'edit'}
                    <div class="photo-grid">
                        {#each photos as photo}
                            <div class="photo-thumb" class:primary={photo.is_primary}>
                                <img src={photo.storage_path} alt="Cat photo" />
                                {#if photo.is_primary}
                                    <span class="photo-badge">Primary</span>
                                {/if}
                                <button
                                    class="photo-delete"
                                    on:click={() => deletePhoto(photo.id)}
                                    title="Delete photo"
                                >✕</button>
                            </div>
                        {/each}

                        {#if photos.length === 0}
                            <p class="hint">No photos yet.</p>
                        {/if}
                    </div>

                    <label class="upload-btn">
                        {photoUploading ? 'Uploading...' : '+ Add photo'}
                        <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            style="display:none"
                            on:change={uploadPhoto}
                            disabled={photoUploading}
                        />
                    </label>
                    <p class="hint">First photo uploaded becomes the primary (shown on map). JPG, PNG, WebP accepted.</p>
                {:else}
                    <p class="hint">Save the cat first, then add photos in edit mode.</p>
                {/if}
            </section>

            {#if feedback}
                <p class="feedback">{feedback}</p>
            {/if}

            <div class="form-actions">
                <button class="btn-ghost" on:click={closePanel}>Cancel</button>
                <button
                    class="btn-primary"
                    disabled={saving}
                    on:click={panelMode === 'new' ? submitNew : submitEdit}
                >
                    {saving ? 'Saving...' : panelMode === 'new' ? 'Add cat' : 'Save changes'}
                </button>
            </div>

        </div>
        {/if}

        {#if panelMode === 'merge'}
        <div class="panel-body">
            <p class="merge-info">
                All sightings and photos from the <strong>secondary</strong> cat will be moved
                into the <strong>primary</strong> cat, then the secondary will be deleted.
            </p>

            <div class="merge-cols">
                <div class="merge-card primary">
                    <div class="merge-label">Primary (kept)</div>
                    <div class="merge-cat-name">{selectedCat?.name ?? 'Unknown cat'}</div>
                    <div class="merge-cat-status">
                        <span class="status-dot" style="background:{statusColors[selectedCat?.current_status]}"></span>
                        {statusLabels[selectedCat?.current_status] ?? selectedCat?.current_status}
                    </div>
                </div>

                <div class="merge-card secondary">
                    <div class="merge-label">Secondary (deleted)</div>
                    {#if mergeSecondary}
                        <div class="merge-cat-name">{mergeSecondary.name ?? 'Unknown cat'}</div>
                        <div class="merge-cat-status">
                            <span class="status-dot" style="background:{statusColors[mergeSecondary.current_status]}"></span>
                            {statusLabels[mergeSecondary.current_status] ?? mergeSecondary.current_status}
                        </div>
                        <button class="btn-ghost small" on:click={() => mergeSecondary = null}>Change</button>
                    {:else}
                        <p class="hint">Select a cat from the list below:</p>
                        <ul class="merge-pick-list">
                            {#each cats.filter(c => c.id !== selectedCat?.id) as cat}
                                <li on:click={() => mergeSecondary = cat}>
                                    {cat.name ?? 'Unknown cat'}
                                    <span class="status-dot" style="background:{statusColors[cat.current_status]}"></span>
                                </li>
                            {/each}
                        </ul>
                    {/if}
                </div>
            </div>

            <div class="form-actions">
                <button class="btn-ghost" on:click={closePanel}>Cancel</button>
                <button
                    class="btn-danger"
                    disabled={!mergeSecondary || saving}
                    on:click={submitMerge}
                >
                    {saving ? 'Merging...' : 'Merge cats'}
                </button>
            </div>
        </div>
        {/if}

    </div>
    {/if}
</div>

<style>
    .admin {
        display: flex;
        height: 100vh;
        font-family: system-ui, sans-serif;
        font-size: 0.875rem;
        color: #111;
        background: #f9fafb;
    }

    .sidebar {
        width: 340px;
        min-width: 280px;
        background: white;
        border-right: 1px solid #e5e7eb;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .sidebar-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px;
        border-bottom: 1px solid #e5e7eb;
    }

    .sidebar-header h1 {
        font-size: 1rem;
        font-weight: 700;
        margin: 0;
    }

    .search-input {
        margin: 10px 12px;
        padding: 7px 10px;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        font-size: 0.85rem;
        outline: none;
    }

    .search-input:focus { border-color: #9ca3af; }

    .empty {
        padding: 24px;
        color: #9ca3af;
        text-align: center;
    }

    .cat-list {
        list-style: none;
        margin: 0;
        padding: 0;
        overflow-y: auto;
        flex: 1;
    }

    .cat-row {
        padding: 10px 12px;
        border-bottom: 1px solid #f3f4f6;
        cursor: default;
    }

    .cat-row:hover { background: #f9fafb; }
    .cat-row.selected { background: #f0f9ff; }

    .cat-info {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 6px;
    }

    .cat-name { font-weight: 600; flex: 1; }

    .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
    }

    .cat-status { color: #6b7280; }

    .cat-date {
        margin-left: auto;
        color: #9ca3af;
        font-size: 0.78rem;
    }

    .cat-actions {
        display: flex;
        gap: 4px;
    }

    .confirm-delete {
        margin-top: 8px;
        padding: 8px;
        background: #fef2f2;
        border-radius: 6px;
        font-size: 0.82rem;
        color: #991b1b;
    }

    .confirm-btns {
        display: flex;
        gap: 6px;
        margin-top: 6px;
    }

    .panel {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        background: white;
    }

    .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid #e5e7eb;
    }

    .panel-header h2 {
        margin: 0;
        font-size: 1rem;
        font-weight: 700;
    }

    .panel-body {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 24px;
    }

    .form-section {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .form-section h3 {
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #6b7280;
        margin: 0;
        padding-bottom: 6px;
        border-bottom: 1px solid #e5e7eb;
    }

    .field {
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex: 1;
        position: relative;
    }

    .field-row {
        display: flex;
        gap: 12px;
    }

    label {
        font-size: 0.78rem;
        font-weight: 600;
        color: #374151;
    }

    input[type="text"],
    input[type="datetime-local"],
    input[type="date"],
    select,
    textarea {
        padding: 6px 8px;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        font-size: 0.85rem;
        outline: none;
        font-family: inherit;
        color: #111;
        background: white;
    }

    input:focus, select:focus, textarea:focus {
        border-color: #9ca3af;
    }

    textarea { resize: vertical; }

    .hint {
        font-size: 0.75rem;
        color: #9ca3af;
    }

    .toggles {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
    }

    .toggle-label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.82rem;
        font-weight: 400;
        color: #374151;
    }

    .toggle-label select {
        padding: 3px 5px;
        font-size: 0.8rem;
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
        padding: 3px 12px;
        font-size: 0.78rem;
        cursor: pointer;
        color: #374151;
        transition: all 0.15s ease;
    }

    .chip.active { color: white; }
    .chip:hover:not(.active) { border-color: #9ca3af; background: #f9fafb; }

    .geocode-field { position: relative; }

    .suggestions {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        list-style: none;
        margin: 2px 0 0;
        padding: 4px 0;
        z-index: 100;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        max-height: 200px;
        overflow-y: auto;
    }

    .suggestions li {
        padding: 7px 10px;
        cursor: pointer;
        font-size: 0.82rem;
        color: #374151;
    }

    .suggestions li:hover { background: #f3f4f6; }

    .mini-map {
        height: 220px;
        border-radius: 8px;
        overflow: hidden;
        border: 1px solid #e5e7eb;
    }

    .map-hint { margin: 2px 0 0; }

    .coords {
        font-size: 0.78rem;
        color: #6b7280;
        font-family: monospace;
        margin: 0;
    }

    .merge-info {
        color: #6b7280;
        margin: 0;
        line-height: 1.5;
    }

    .merge-cols {
        display: flex;
        gap: 12px;
    }

    .merge-card {
        flex: 1;
        border: 1.5px solid #e5e7eb;
        border-radius: 10px;
        padding: 14px;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .merge-card.primary { border-color: #3b82f6; background: #eff6ff; }
    .merge-card.secondary { border-color: #e5e7eb; }

    .merge-label {
        font-size: 0.72rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        font-weight: 700;
        color: #6b7280;
    }

    .merge-card.primary .merge-label { color: #3b82f6; }

    .merge-cat-name { font-weight: 600; font-size: 0.95rem; }

    .merge-cat-status {
        display: flex;
        align-items: center;
        gap: 5px;
        color: #6b7280;
        font-size: 0.82rem;
    }

    .merge-pick-list {
        list-style: none;
        padding: 0;
        margin: 0;
        max-height: 200px;
        overflow-y: auto;
    }

    .merge-pick-list li {
        padding: 6px 8px;
        border-radius: 6px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .merge-pick-list li:hover { background: #f3f4f6; }

    .form-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding-top: 8px;
        border-top: 1px solid #e5e7eb;
    }

    .feedback {
        font-size: 0.85rem;
        color: #16a34a;
        margin: 0;
    }

    .btn-primary {
        background: #111;
        color: white;
        border: none;
        border-radius: 6px;
        padding: 7px 14px;
        font-size: 0.85rem;
        cursor: pointer;
        font-weight: 600;
        transition: background 0.15s;
    }

    .btn-primary:hover { background: #374151; }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

    .btn-ghost {
        background: white;
        color: #374151;
        border: 1.5px solid #e5e7eb;
        border-radius: 6px;
        padding: 7px 14px;
        font-size: 0.85rem;
        cursor: pointer;
        transition: all 0.15s;
    }

    .btn-ghost:hover { background: #f9fafb; }
    .btn-ghost.small { padding: 3px 8px; font-size: 0.78rem; }

    .btn-danger {
        background: #ef4444;
        color: white;
        border: none;
        border-radius: 6px;
        padding: 7px 14px;
        font-size: 0.85rem;
        cursor: pointer;
        font-weight: 600;
        transition: background 0.15s;
    }

    .btn-danger:hover { background: #dc2626; }
    .btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }

    .btn-icon {
        background: none;
        border: 1px solid #e5e7eb;
        border-radius: 5px;
        width: 26px;
        height: 26px;
        cursor: pointer;
        font-size: 0.85rem;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #374151;
        transition: all 0.15s;
    }

    .btn-icon:hover { background: #f3f4f6; }
    .btn-icon.danger:hover { background: #fef2f2; color: #ef4444; border-color: #fca5a5; }

    .photo-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }

    .photo-thumb {
        position: relative;
        width: 80px;
        height: 80px;
        border-radius: 8px;
        overflow: hidden;
        border: 2px solid #e5e7eb;
    }

    .photo-thumb.primary {
        border-color: #3b82f6;
    }

    .photo-thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .photo-badge {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        background: rgba(59,130,246,0.85);
        color: white;
        font-size: 0.65rem;
        text-align: center;
        padding: 2px 0;
    }

    .photo-delete {
        position: absolute;
        top: 3px;
        right: 3px;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: rgba(0,0,0,0.5);
        border: none;
        color: white;
        font-size: 0.65rem;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.15s;
    }

    .photo-thumb:hover .photo-delete {
        opacity: 1;
    }

    .upload-btn {
        display: inline-block;
        padding: 6px 14px;
        background: white;
        border: 1.5px dashed #d1d5db;
        border-radius: 6px;
        font-size: 0.82rem;
        color: #6b7280;
        cursor: pointer;
        transition: all 0.15s;
        font-weight: 600;
    }

    .upload-btn:hover {
        border-color: #9ca3af;
        color: #374151;
    }
</style>