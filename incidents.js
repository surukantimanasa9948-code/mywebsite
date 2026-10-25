/**
 * Security Incident Management Console
 * Authorized security dispatch, status updates, responder assignments, and audit logs.
 */

const CampusIncidents = {
  incidentsList: [],
  activeIncident: null,

  init() {
    this.setupFilters();
    this.setupModalControls();
  },

  setupFilters() {
    const floorFilter = document.getElementById('filterIncidentFloor');
    const typeFilter = document.getElementById('filterIncidentType');
    const statusFilter = document.getElementById('filterIncidentStatus');
    const searchFilter = document.getElementById('filterIncidentSearch');

    const triggerFilter = () => this.loadIncidents();

    if (floorFilter) floorFilter.addEventListener('change', triggerFilter);
    if (typeFilter) typeFilter.addEventListener('change', triggerFilter);
    if (statusFilter) statusFilter.addEventListener('change', triggerFilter);
    if (searchFilter) searchFilter.addEventListener('input', triggerFilter);

    const refreshBtn = document.getElementById('refreshIncidentsBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', () => this.loadIncidents());
  },

  async loadIncidents() {
    const floor = document.getElementById('filterIncidentFloor')?.value || '';
    const type = document.getElementById('filterIncidentType')?.value || '';
    const status = document.getElementById('filterIncidentStatus')?.value || '';
    const search = document.getElementById('filterIncidentSearch')?.value || '';

    const params = new URLSearchParams();
    if (floor) params.append('floor', floor);
    if (type) params.append('type', type);
    if (status) params.append('status', status);
    if (search) params.append('search', search);

    try {
      const res = await fetch(`/api/emergencies?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        this.incidentsList = data.reports || data.incidents || [];
        this.renderIncidentsTable();
      }
    } catch (err) {
      console.warn('Failed to load incidents', err);
    }
  },

  renderIncidentsTable() {
    const tbody = document.getElementById('incidentsTableBody');
    if (!tbody) return;

    if (this.incidentsList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:32px; color:var(--text-muted);">No incident reports match the active filters.</td></tr>`;
      return;
    }

    tbody.innerHTML = this.incidentsList.map(inc => {
      const isDemo = inc.is_demo_data ? `<span class="badge" style="background:#FEF3C7; color:#B45309; margin-left:6px; font-size:10px;">DEMO DATA</span>` : '';
      const sevClass = `badge-${inc.severity.toLowerCase()}`;
      const assigned = inc.assigned_to ? `<span style="font-weight:600; color:var(--navy-700);">${inc.assigned_to}</span>` : '<span style="color:var(--text-light);">Unassigned</span>';

      // Interactive Quick-Change Status Dropdown
      const statusSelectHtml = `
        <div class="status-select-wrapper">
          <select class="incident-status-select status-${inc.status.toLowerCase()}"
                  data-incident-id="${inc.id}"
                  data-prev-status="${inc.status}"
                  onchange="CampusIncidents.quickUpdateStatus(${inc.id}, this.value, this)"
                  title="Click to change status immediately">
            <option value="Reported" ${inc.status === 'Reported' ? 'selected' : ''}>⏳ Reported</option>
            <option value="Acknowledged" ${inc.status === 'Acknowledged' ? 'selected' : ''}>👁️ Acknowledged</option>
            <option value="Responding" ${inc.status === 'Responding' ? 'selected' : ''}>🚨 Responding</option>
            <option value="Resolved" ${inc.status === 'Resolved' ? 'selected' : ''}>✅ Resolved</option>
          </select>
        </div>
      `;

      // Smart Workflow Action Button
      let quickActionBtn = '';
      if (inc.status === 'Reported') {
        quickActionBtn = `<button class="btn-quick-action action-ack" onclick="CampusIncidents.quickUpdateStatus(${inc.id}, 'Acknowledged')" title="Quick advance to Acknowledged">Acknowledge</button>`;
      } else if (inc.status === 'Acknowledged') {
        quickActionBtn = `<button class="btn-quick-action action-dispatch" onclick="CampusIncidents.quickUpdateStatus(${inc.id}, 'Responding')" title="Quick advance to Responding">Dispatch</button>`;
      } else if (inc.status === 'Responding') {
        quickActionBtn = `<button class="btn-quick-action action-resolve" onclick="CampusIncidents.quickUpdateStatus(${inc.id}, 'Resolved')" title="Mark incident as Resolved">Resolve</button>`;
      } else if (inc.status === 'Resolved') {
        quickActionBtn = `<button class="btn-quick-action action-reopen" onclick="CampusIncidents.quickUpdateStatus(${inc.id}, 'Responding')" title="Reopen incident for follow-up">Reopen</button>`;
      }

      return `
        <tr id="incident-row-${inc.id}">
          <td>
            <strong>${inc.reference_no}</strong>
            ${isDemo}
            <div style="font-size:11px; color:var(--text-light); margin-top:2px;">${inc.reported_at ? inc.reported_at.slice(0, 16) : ''}</div>
          </td>
          <td><span class="badge ${sevClass}">${inc.severity}</span></td>
          <td><strong>${inc.emergency_type}</strong></td>
          <td>Floor ${inc.floor_number} • ${inc.room_code}</td>
          <td>${assigned}</td>
          <td>${statusSelectHtml}</td>
          <td>
            <div style="display:flex; align-items:center; gap:6px;">
              ${quickActionBtn}
              <button class="btn btn-secondary btn-sm" onclick="CampusIncidents.openIncidentModal(${inc.id})" title="View full history, notes, location and assign responder">
                Details & Log
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  async openIncidentModal(incidentId) {
    try {
      const res = await fetch(`/api/emergencies/${incidentId}`);
      const data = await res.json();
      if (res.ok) {
        this.activeIncident = data.report || data.incident;
        this.renderIncidentDetails(this.activeIncident, data.timeline || data.history);
        const modal = document.getElementById('incidentDetailModal');
        if (modal) modal.classList.add('active');
      } else {
        App.showToast(data.error || 'Failed to load details', 'error');
      }
    } catch (err) {
      console.error('Error fetching incident', err);
    }
  },

  async openIncidentByRef(refNo) {
    try {
      const res = await fetch(`/api/emergencies/${refNo}`);
      const data = await res.json();
      if (res.ok) {
        this.activeIncident = data.report || data.incident;
        this.renderIncidentDetails(this.activeIncident, data.timeline || data.history);
        const modal = document.getElementById('incidentDetailModal');
        if (modal) modal.classList.add('active');
      }
    } catch (err) {
      console.warn('Failed to load incident by ref', err);
    }
  },

  renderIncidentDetails(inc, timeline) {
    const titleEl = document.getElementById('incidentModalTitle');
    const badgeEl = document.getElementById('incidentModalStatusBadge');
    const sevEl = document.getElementById('incidentModalSeverityBadge');
    const descEl = document.getElementById('incidentModalDesc');
    const reporterEl = document.getElementById('incidentModalReporter');
    const locationEl = document.getElementById('incidentModalLocation');
    const photoContainer = document.getElementById('incidentModalPhotoContainer');
    const statusSelect = document.getElementById('incidentModalStatusSelect');
    const assignedInput = document.getElementById('incidentModalAssignedInput');
    const timelineEl = document.getElementById('incidentModalTimeline');

    if (titleEl) titleEl.textContent = `Incident ${inc.reference_no}`;
    if (badgeEl) {
      badgeEl.textContent = inc.status;
      badgeEl.className = `badge badge-${inc.status.toLowerCase()}`;
    }
    if (sevEl) {
      sevEl.textContent = `${inc.severity} Severity`;
      sevEl.className = `badge badge-${inc.severity.toLowerCase()}`;
    }
    if (descEl) descEl.textContent = inc.description;
    if (reporterEl) {
      reporterEl.textContent = `${inc.reporter_name} (${inc.reporter_role.toUpperCase()}) ${inc.reporter_phone ? '• Tel: ' + inc.reporter_phone : ''}`;
    }
    if (locationEl) {
      locationEl.textContent = `Floor ${inc.floor_number} • Room ${inc.room_code} ${inc.location_details ? '• ' + inc.location_details : ''}`;
    }

    if (photoContainer) {
      if (inc.photo_url) {
        photoContainer.innerHTML = `<img src="${inc.photo_url}" alt="Incident Attachment" style="max-height:220px; border-radius:8px; border:1px solid var(--border-color); cursor:pointer;" onclick="window.open('${inc.photo_url}', '_blank')">`;
        photoContainer.style.display = 'block';
      } else {
        photoContainer.innerHTML = '';
        photoContainer.style.display = 'none';
      }
    }

    if (statusSelect) statusSelect.value = inc.status;
    if (assignedInput) assignedInput.value = inc.assigned_to || '';

    // Render Timeline Logs
    if (timelineEl) {
      if (!timeline || timeline.length === 0) {
        timelineEl.innerHTML = '<p style="color:var(--text-light); font-size:12px;">No activity logs recorded yet.</p>';
      } else {
        timelineEl.innerHTML = timeline.map(log => `
          <div style="border-left:3px solid var(--navy-700); padding-left:14px; margin-bottom:12px; font-size:12px;">
            <div style="display:flex; justify-content:space-between; color:var(--text-muted); font-size:11px;">
              <strong>${log.action} (${log.performed_by})</strong>
              <span>${log.created_at ? log.created_at.slice(0, 19) : ''}</span>
            </div>
            <div style="margin-top:2px; color:var(--text-main);">${log.notes}</div>
          </div>
        `).join('');
      }
    }
  },

  setupModalControls() {
    const modal = document.getElementById('incidentDetailModal');
    const closeBtn = document.getElementById('closeIncidentModalBtn');

    if (closeBtn) closeBtn.addEventListener('click', () => {
      if (modal) modal.classList.remove('active');
    });

    // Update Status Action
    const updateStatusBtn = document.getElementById('updateIncidentStatusBtn');
    if (updateStatusBtn) {
      updateStatusBtn.addEventListener('click', async () => {
        if (!this.activeIncident) return;
        const newStatus = document.getElementById('incidentModalStatusSelect')?.value;
        const note = document.getElementById('incidentModalStatusNote')?.value || '';

        try {
          const res = await fetch(`/api/emergencies/${this.activeIncident.id}/status`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'X-Demo-Role': 'Security Staff'
            },
            body: JSON.stringify({ status: newStatus, notes: note })
          });
          const data = await res.json();
          if (res.ok) {
            App.showToast(`Status updated to ${newStatus}`, 'success');
            this.openIncidentModal(this.activeIncident.id);
            this.loadIncidents();
            App.loadDashboardData();
          } else {
            App.showToast(data.error || 'Status update failed', 'error');
          }
        } catch (err) {
          console.error(err);
        }
      });
    }

    // Assign Responder Action
    const assignBtn = document.getElementById('assignResponderBtn');
    if (assignBtn) {
      assignBtn.addEventListener('click', async () => {
        if (!this.activeIncident) return;
        const assignedTo = document.getElementById('incidentModalAssignedInput')?.value.trim();
        if (!assignedTo) {
          App.showToast('Enter responder name or team.', 'error');
          return;
        }

        try {
          const res = await fetch(`/api/emergencies/${this.activeIncident.id}/assign`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assigned_to: assignedTo, assigned_staff_name: assignedTo })
          });
          const data = await res.json();
          if (res.ok) {
            App.showToast(`Assigned to ${assignedTo}`, 'success');
            this.openIncidentModal(this.activeIncident.id);
            this.loadIncidents();
          } else {
            App.showToast(data.error || 'Assignment failed', 'error');
          }
        } catch (err) {
          console.error(err);
        }
      });
    }

    // Add Note Action
    const addNoteBtn = document.getElementById('addIncidentNoteBtn');
    if (addNoteBtn) {
      addNoteBtn.addEventListener('click', async () => {
        if (!this.activeIncident) return;
        const noteInput = document.getElementById('incidentModalNewNoteInput');
        const noteText = noteInput ? noteInput.value.trim() : '';

        if (!noteText) {
          App.showToast('Please type a response note.', 'error');
          return;
        }

        try {
          const res = await fetch(`/api/emergencies/${this.activeIncident.id}/notes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: noteText })
          });
          if (res.ok) {
            App.showToast('Note added to incident log', 'success');
            if (noteInput) noteInput.value = '';
            this.openIncidentModal(this.activeIncident.id);
          }
        } catch (err) {
          console.error(err);
        }
      });
    }

    // Flag Corridor as Blocked Action
    const blockBtn = document.getElementById('blockIncidentCorridorBtn');
    if (blockBtn) {
      blockBtn.addEventListener('click', async () => {
        if (!this.activeIncident) return;
        const inc = this.activeIncident;
        const reason = `Hazard containment from Incident ${inc.reference_no} (${inc.emergency_type})`;

        try {
          const res = await fetch('/api/routes/blocked', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              floor_number: inc.floor_number,
              node_or_corridor: `N_${inc.floor_number}_${inc.room_code}`,
              reason: reason
            })
          });
          const data = await res.json();
          if (res.ok) {
            App.showToast(`Corridor near ${inc.room_code} on Floor ${inc.floor_number} flagged as BLOCKED`, 'emergency');
            if (window.CampusMap) CampusMap.loadFloorData(inc.floor_number);
          } else {
            App.showToast(data.error || 'Failed to flag blockade', 'error');
          }
        } catch (err) {
          console.error(err);
        }
      });
    }
  },

  async quickUpdateStatus(incidentId, newStatus, selectElement = null) {
    const inc = this.incidentsList.find(i => i.id == incidentId);
    const prevStatus = inc ? inc.status : (selectElement ? selectElement.getAttribute('data-prev-status') : '');

    if (inc && inc.status === newStatus) return;

    // Provide visual feedback immediately
    if (selectElement) {
      selectElement.disabled = true;
      selectElement.style.opacity = '0.6';
    }

    try {
      const res = await fetch(`/api/emergencies/${incidentId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Demo-Role': 'Security Staff'
        },
        body: JSON.stringify({
          status: newStatus,
          notes: `Status changed to "${newStatus}" directly via Incident Console.`
        })
      });

      const data = await res.json();
      if (res.ok) {
        if (inc) {
          inc.status = newStatus;
          if (newStatus === 'Resolved' && !inc.resolved_at) {
            inc.resolved_at = new Date().toISOString();
          }
        }

        const refNo = inc ? inc.reference_no : `#${incidentId}`;
        App.showToast(`Incident ${refNo} status updated to ${newStatus}`, 'success');

        // Re-render table & update dashboard stats
        this.renderIncidentsTable();
        if (typeof App !== 'undefined' && App.loadDashboardData) {
          App.loadDashboardData();
        }

        // If modal is open for this incident, refresh modal
        if (this.activeIncident && this.activeIncident.id == incidentId) {
          this.openIncidentModal(incidentId);
        }
      } else {
        App.showToast(data.error || 'Failed to update status', 'error');
        if (selectElement && prevStatus) {
          selectElement.value = prevStatus;
        }
      }
    } catch (err) {
      console.error('quickUpdateStatus error', err);
      App.showToast('Network error while updating incident status', 'error');
      if (selectElement && prevStatus) {
        selectElement.value = prevStatus;
      }
    } finally {
      if (selectElement) {
        selectElement.disabled = false;
        selectElement.style.opacity = '1';
      }
    }
  },

  async setModalStatusAndApply(newStatus) {
    const select = document.getElementById('incidentModalStatusSelect');
    if (select) {
      select.value = newStatus;
    }
    const updateBtn = document.getElementById('updateIncidentStatusBtn');
    if (updateBtn) {
      updateBtn.click();
    }
  }
};

window.CampusIncidents = CampusIncidents;
