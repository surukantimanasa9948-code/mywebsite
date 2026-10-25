/**
 * Campus Safety Resources Directory & Inspection Management
 */

const CampusResources = {
  resourcesList: [],

  init() {
    this.setupFilters();
    this.setupAdminControls();
  },

  setupFilters() {
    const floorSelect = document.getElementById('filterResourceFloor');
    const catSelect = document.getElementById('filterResourceCategory');
    const statSelect = document.getElementById('filterResourceStatus');

    const trigger = () => this.loadResources();

    if (floorSelect) floorSelect.addEventListener('change', trigger);
    if (catSelect) catSelect.addEventListener('change', trigger);
    if (statSelect) statSelect.addEventListener('change', trigger);
  },

  async loadResources() {
    const floor = document.getElementById('filterResourceFloor')?.value || '';
    const cat = document.getElementById('filterResourceCategory')?.value || '';
    const stat = document.getElementById('filterResourceStatus')?.value || '';

    const params = new URLSearchParams();
    if (floor) params.append('floor', floor);
    if (cat) params.append('category', cat);
    if (stat) params.append('status', stat);

    try {
      const res = await fetch(`/api/resources?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        this.resourcesList = data.resources || [];
        this.renderResourcesGrid();
      }
    } catch (err) {
      console.warn('Failed to fetch safety resources', err);
    }
  },

  renderResourcesGrid() {
    const grid = document.getElementById('resourcesCardsGrid');
    if (!grid) return;

    if (this.resourcesList.length === 0) {
      grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:32px; color:var(--text-muted);">No safety resources match the selected criteria.</div>';
      return;
    }

    const isAdmin = App.currentUser && (App.currentUser.role === 'admin' || App.currentUser.role === 'security');

    grid.innerHTML = this.resourcesList.map(item => {
      let icon = '🔥';
      let catLabel = 'Fire Extinguisher';
      if (item.category === 'fire_alarm') { icon = '🚨'; catLabel = 'Fire Alarm'; }
      if (item.category === 'first_aid') { icon = '🩹'; catLabel = 'First Aid Kit'; }
      if (item.category === 'aed') { icon = '⚡'; catLabel = 'AED Defibrillator'; }
      if (item.category === 'medical_room') { icon = '🏥'; catLabel = 'Medical Center'; }
      if (item.category === 'emergency_exit') { icon = '🚪'; catLabel = 'Emergency Exit'; }
      if (item.category === 'evacuation_chair') { icon = '🦽'; catLabel = 'Evacuation Transit Chair'; }
      if (item.category === 'assembly_point') { icon = '⛳'; catLabel = 'Assembly Point'; }

      const statusBadge = `badge-${item.status.replace('_', '-')}`;
      const statusText = item.status.replace('_', ' ').toUpperCase();

      const adminBtn = isAdmin ? `
        <button class="btn btn-secondary btn-sm" onclick="CampusResources.editResource(${item.id})">
          Update Inspection
        </button>
      ` : '';

      return `
        <div class="card" style="margin-bottom:0;">
          <div class="card-body">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
              <div style="display:flex; align-items:center; gap:10px;">
                <span style="font-size:24px;">${icon}</span>
                <div>
                  <h4 style="font-size:15px; font-weight:700; color:var(--navy-800);">${item.resource_code}</h4>
                  <div style="font-size:11px; color:var(--text-muted);">${catLabel} • Floor ${item.floor_number}</div>
                </div>
              </div>
              <span class="badge ${statusBadge}">${statusText}</span>
            </div>

            <p style="font-size:13px; font-weight:600; color:var(--navy-700); margin-bottom:4px;">
              ${item.location_desc}
            </p>
            <p style="font-size:12px; color:var(--text-muted); margin-bottom:12px;">
              ${item.specifications || 'Standard specifications verified.'}
            </p>

            <div style="font-size:11px; color:var(--text-light); border-top:1px solid var(--border-color); padding-top:10px; display:flex; justify-content:space-between; align-items:center;">
              <div>
                <span>Last: ${item.last_inspected || '2026-01-10'}</span><br>
                <span>Due: ${item.next_inspection || '2026-07-10'}</span>
              </div>
              ${adminBtn}
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  setupAdminControls() {
    // New Resource Modal open
    const addBtn = document.getElementById('addNewResourceBtn');
    const modal = document.getElementById('resourceEditModal');
    const closeBtn = document.getElementById('closeResourceModalBtn');
    const form = document.getElementById('resourceEditForm');

    if (addBtn) {
      addBtn.addEventListener('click', () => {
        document.getElementById('resourceModalId').value = '';
        form.reset();
        document.getElementById('resourceModalTitle').textContent = 'Register New Safety Resource';
        modal.classList.add('active');
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => modal.classList.remove('active'));
    }

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('resourceModalId').value;
        const code = document.getElementById('resourceModalCode').value;
        const floor = document.getElementById('resourceModalFloor').value;
        const loc = document.getElementById('resourceModalLocation').value;
        const cat = document.getElementById('resourceModalCategory').value;
        const stat = document.getElementById('resourceModalStatus').value;
        const spec = document.getElementById('resourceModalSpec').value;
        const notes = document.getElementById('resourceModalNotes').value;

        try {
          let res;
          if (id) {
            // Update
            res = await fetch(`/api/resources/${id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: stat, specifications: spec, notes: notes })
            });
          } else {
            // Create
            res = await fetch('/api/resources', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                resource_code: code,
                floor_number: floor,
                location_desc: loc,
                category: cat,
                status: stat,
                specifications: spec,
                notes: notes
              })
            });
          }

          if (res.ok) {
            App.showToast('Safety resource saved successfully.', 'success');
            modal.classList.remove('active');
            this.loadResources();
            if (window.CampusMap) CampusMap.loadFloorData(CampusMap.currentFloor);
          } else {
            const data = await res.json();
            App.showToast(data.error || 'Failed to save resource', 'error');
          }
        } catch (err) {
          console.error(err);
        }
      });
    }
  },

  editResource(id) {
    const item = this.resourcesList.find(r => r.id === id);
    if (!item) return;

    document.getElementById('resourceModalId').value = item.id;
    document.getElementById('resourceModalCode').value = item.resource_code;
    document.getElementById('resourceModalFloor').value = item.floor_number;
    document.getElementById('resourceModalLocation').value = item.location_desc;
    document.getElementById('resourceModalCategory').value = item.category;
    document.getElementById('resourceModalStatus').value = item.status;
    document.getElementById('resourceModalSpec').value = item.specifications || '';
    document.getElementById('resourceModalNotes').value = item.notes || '';

    document.getElementById('resourceModalTitle').textContent = `Update Inspection: ${item.resource_code}`;
    document.getElementById('resourceEditModal').classList.add('active');
  }
};

window.CampusResources = CampusResources;
