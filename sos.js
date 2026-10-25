/**
 * Campus Emergency SOS System
 * Prominent Emergency Reporting, Validation, and Offline Queuing
 * Features:
 * - One-Touch Emergency SOS Triggering Across All Views
 * - Live Rule-Based Severity Protocol Classification
 * - Instant Room & Common Area Location Preloading
 * - Audio Alert Synthesis & Success Confirmation
 * - Offline Storage & Local Synchronization Queue
 */

const CampusSOS = {
  selectedType: 'Fire',
  selectedFloor: 1,
  selectedRoom: '',

  init() {
    console.log('[CampusSOS] Initializing Emergency SOS System...');
    this.setupModalControls();
    this.setupTypeSelector();
    this.setupFloorRoomSync();
    this.setupFormSubmit();
    this.bindAllSosButtons();
  },

  bindAllSosButtons() {
    // Attach listener to every SOS button across sidebar, navigation, mobile, and modals
    document.querySelectorAll('.open-sos-btn, #sosSidebarBtn, .mobile-floating-sos').forEach(btn => {
      // Remove any duplicate listeners and re-attach
      btn.onclick = (e) => {
        e.preventDefault();
        this.openModal();
      };
    });

    const inspectSosBtn = document.getElementById('inspectReportEmergencyBtn');
    if (inspectSosBtn) {
      inspectSosBtn.onclick = (e) => {
        e.preventDefault();
        if (window.CampusMap && CampusMap.selectedRoom) {
          this.openModalWithPreload(CampusMap.selectedRoom);
        } else {
          this.openModal();
        }
      };
    }
  },

  setupModalControls() {
    const modal = document.getElementById('sosModal');
    const closeBtn = document.getElementById('closeSosModalBtn');
    const cancelBtn = document.getElementById('cancelSosBtn');

    if (closeBtn) {
      closeBtn.onclick = () => this.closeModal();
    }
    if (cancelBtn) {
      cancelBtn.onclick = () => this.closeModal();
    }

    // Close on backdrop click
    if (modal) {
      modal.onclick = (e) => {
        if (e.target === modal) this.closeModal();
      };
    }

    // Success modal close and console redirect
    const successClose = document.getElementById('closeSosSuccessBtn');
    if (successClose) {
      successClose.onclick = () => {
        const sm = document.getElementById('sosSuccessModal');
        if (sm) sm.classList.remove('active');
        if (window.App && typeof App.switchTab === 'function') {
          App.switchTab('incidents');
        }
      };
    }
  },

  openModal() {
    const modal = document.getElementById('sosModal');
    if (!modal) return;

    // Determine default floor from active map floor or default to 1
    const activeFloor = (window.CampusMap && CampusMap.currentFloor) ? CampusMap.currentFloor : 1;
    const floorSelect = document.getElementById('sosFloorSelect');
    if (floorSelect) {
      floorSelect.value = activeFloor;
    }

    // Pre-populate rooms for this floor
    this.populateRoomsForFloor(activeFloor);

    // Default emergency type to Fire if none active
    if (!this.selectedType) {
      this.selectedType = 'Fire';
    }
    this.updateSeverityPreview(this.selectedType);

    // Make sure confirm checkbox is checked by default for swift reporting
    const confirmCheck = document.getElementById('sosConfirmCheck');
    if (confirmCheck) {
      confirmCheck.checked = true;
    }

    modal.classList.add('active');

    // Auto-focus the description input
    setTimeout(() => {
      const descInput = document.getElementById('sosDescriptionInput');
      if (descInput) descInput.focus();
    }, 150);
  },

  openModalWithPreload(room) {
    this.openModal();
    if (!room) return;

    const floorNum = room.floor_number || (window.CampusMap && CampusMap.currentFloor) || 1;
    const floorSelect = document.getElementById('sosFloorSelect');
    if (floorSelect) {
      floorSelect.value = floorNum;
    }

    this.populateRoomsForFloor(floorNum, room.room_code);

    const locationDetailsInput = document.getElementById('sosLocationDetailsInput');
    if (locationDetailsInput) {
      locationDetailsInput.value = `${room.name} (${room.room_code}), ${room.wing || 'Center'} Wing`;
    }
  },

  closeModal() {
    const modal = document.getElementById('sosModal');
    if (modal) modal.classList.remove('active');
  },

  setupTypeSelector() {
    document.querySelectorAll('.type-select-card').forEach(card => {
      card.addEventListener('click', (e) => {
        document.querySelectorAll('.type-select-card').forEach(c => c.classList.remove('selected'));
        const target = e.currentTarget;
        target.classList.add('selected');
        this.selectedType = target.dataset.type || 'Fire';
        this.updateSeverityPreview(this.selectedType);
      });
    });
  },

  updateSeverityPreview(emergencyType) {
    const badge = document.getElementById('sosSeverityPreviewBadge');
    const desc = document.getElementById('sosSeverityDesc');
    if (!badge || !desc) return;

    if (emergencyType === 'Fire') {
      badge.textContent = 'Critical (Rule-based Protocol)';
      badge.className = 'badge badge-critical';
      desc.textContent = 'High-priority life safety: Immediate building evacuation & fire response dispatch.';
    } else if (emergencyType === 'Electrical Hazard' || emergencyType === 'Accident') {
      badge.textContent = 'High (Rule-based Protocol)';
      badge.className = 'badge badge-high';
      desc.textContent = 'Rapid containment protocol: Immediate safety warden deployment & area isolation.';
    } else if (emergencyType === 'Medical' || emergencyType === 'Security Issue') {
      badge.textContent = 'Medium (Rule-based Protocol)';
      badge.className = 'badge badge-medium';
      desc.textContent = 'Urgent campus response: Medical first-aid unit and security officer alert.';
    } else {
      badge.textContent = 'Low (Rule-based Protocol)';
      badge.className = 'badge badge-low';
      desc.textContent = 'Standard safety incident: Routine campus patrol inspection and logging.';
    }
  },

  setupFloorRoomSync() {
    const floorSelect = document.getElementById('sosFloorSelect');
    if (floorSelect) {
      floorSelect.addEventListener('change', (e) => {
        const floor = parseInt(e.target.value, 10);
        this.populateRoomsForFloor(floor);
      });
    }
  },

  async populateRoomsForFloor(floorNum, preselectedCode = null) {
    const roomSelect = document.getElementById('sosRoomSelect');
    if (!roomSelect) return;

    roomSelect.innerHTML = '<option value="">Loading campus locations...</option>';

    try {
      let rooms = [];
      if (window.CampusMap && CampusMap.roomsByFloor && CampusMap.roomsByFloor[floorNum]) {
        rooms = CampusMap.roomsByFloor[floorNum];
      } else {
        const res = await fetch(`/api/rooms?floor=${floorNum}`);
        const data = await res.json();
        rooms = data.rooms || [];
      }

      roomSelect.innerHTML = '';

      // Default common area options
      const commonGroup = document.createElement('optgroup');
      commonGroup.label = 'Common & Transit Areas';

      const corridorOpt = document.createElement('option');
      corridorOpt.value = `CORRIDOR-F${floorNum}`;
      corridorOpt.textContent = `Central Semi-Circular Corridor (Floor ${floorNum})`;
      commonGroup.appendChild(corridorOpt);

      const westStairsOpt = document.createElement('option');
      westStairsOpt.value = `STAIR-W-${floorNum}`;
      westStairsOpt.textContent = `West Emergency Staircase (Floor ${floorNum})`;
      commonGroup.appendChild(westStairsOpt);

      const eastStairsOpt = document.createElement('option');
      eastStairsOpt.value = `STAIR-E-${floorNum}`;
      eastStairsOpt.textContent = `East Emergency Staircase (Floor ${floorNum})`;
      commonGroup.appendChild(eastStairsOpt);

      const elevatorOpt = document.createElement('option');
      elevatorOpt.value = `ELEV-${floorNum}01`;
      elevatorOpt.textContent = `Central Elevator Lobby (Floor ${floorNum})`;
      commonGroup.appendChild(elevatorOpt);

      roomSelect.appendChild(commonGroup);

      // Classrooms & Labs
      const roomGroup = document.createElement('optgroup');
      roomGroup.label = `Floor ${floorNum} Classrooms, Labs & Halls`;

      rooms.forEach(r => {
        if (r.room_code === 'ASM-001') return;
        const opt = document.createElement('option');
        opt.value = r.room_code;
        opt.textContent = `${r.room_code} - ${r.name} (${r.wing || 'Center'} Wing)`;
        if (preselectedCode && r.room_code === preselectedCode) {
          opt.selected = true;
        }
        roomGroup.appendChild(opt);
      });

      roomSelect.appendChild(roomGroup);

      // If preselected, select it
      if (preselectedCode) {
        roomSelect.value = preselectedCode;
      }
    } catch (err) {
      console.warn('[CampusSOS] Failed to load rooms for floor, providing fallback', err);
      roomSelect.innerHTML = `
        <option value="CORRIDOR-F${floorNum}">Central Corridor (Floor ${floorNum})</option>
        <option value="STAIRS-F${floorNum}">Stairwell / Exit Area (Floor ${floorNum})</option>
      `;
    }
  },

  setupFormSubmit() {
    const form = document.getElementById('sosReportForm');
    if (!form) return;

    form.onsubmit = async (e) => {
      e.preventDefault();

      const floorSelect = document.getElementById('sosFloorSelect');
      const roomSelect = document.getElementById('sosRoomSelect');
      const descInput = document.getElementById('sosDescriptionInput');
      const locationDetailsInput = document.getElementById('sosLocationDetailsInput');
      const phoneInput = document.getElementById('sosPhoneInput');
      const photoInput = document.getElementById('sosPhotoInput');
      const confirmCheck = document.getElementById('sosConfirmCheck');

      const floor = parseInt(floorSelect ? floorSelect.value : 1, 10);
      let room = roomSelect ? roomSelect.value.trim() : '';
      const description = descInput ? descInput.value.trim() : '';
      const locationDetails = locationDetailsInput ? locationDetailsInput.value.trim() : '';
      const phone = phoneInput ? phoneInput.value.trim() : '';

      // Default room if not selected
      if (!room) {
        room = `CORRIDOR-F${floor}`;
      }

      // Validation
      if (!this.selectedType) {
        this.selectedType = 'Fire';
      }

      if (!description) {
        App.showToast('Please provide a brief description of the emergency.', 'error');
        if (descInput) descInput.focus();
        return;
      }

      if (confirmCheck && !confirmCheck.checked) {
        confirmCheck.checked = true;
      }

      // Check if user is offline
      if (!navigator.onLine) {
        this.handleOfflineSubmission({
          emergency_type: this.selectedType,
          floor_number: floor,
          floor_id: floor,
          room_code: room,
          description: description,
          location_details: locationDetails,
          reporter_phone: phone
        });
        return;
      }

      // Generate client idempotency key
      const idempotencyKey = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : `sos-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const formData = new FormData();
      formData.append('idempotency_key', idempotencyKey);
      formData.append('emergency_type', this.selectedType);
      formData.append('floor_number', floor);
      formData.append('floor_id', floor);
      formData.append('room_code', room);
      formData.append('description', description);
      formData.append('location_details', locationDetails);
      formData.append('reporter_phone', phone);

      if (photoInput && photoInput.files && photoInput.files[0]) {
        formData.append('photo', photoInput.files[0]);
      }

      const submitBtn = document.getElementById('submitSosBtn');
      try {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = 'Transmitting Report to Security...';
        }

        const res = await fetch('/api/emergencies', {
          method: 'POST',
          body: formData
        });

        const data = await res.json();
        if (res.ok) {
          // Play emergency audio alarm sound
          if (window.App && typeof App.playAlertSound === 'function') {
            App.playAlertSound('alarm');
          }

          this.closeModal();
          this.showSuccessModal(data.report || data.incident);

          // Reset form
          form.reset();

          // Refresh dashboard data & incident lists
          if (window.App && typeof App.loadDashboardData === 'function') {
            App.loadDashboardData();
          }
          if (window.CampusIncidents && typeof CampusIncidents.loadIncidents === 'function') {
            CampusIncidents.loadIncidents();
          }

          App.showToast(`EMERGENCY BROADCAST SENT: Reference ${data.reference_no}`, 'emergency');
        } else {
          App.showToast(data.error || 'Failed to transmit report. Please try again.', 'error');
        }
      } catch (err) {
        console.warn('[CampusSOS] Network transmission issue, queuing in offline storage', err);
        this.handleOfflineSubmission({
          emergency_type: this.selectedType,
          floor_number: floor,
          floor_id: floor,
          room_code: room,
          description: description,
          location_details: locationDetails,
          reporter_phone: phone
        });
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = 'Transmit Emergency Report';
        }
      }
    };
  },

  handleOfflineSubmission(reportData) {
    const offlineRef = `OFFLINE-${Date.now().toString().slice(-6)}`;
    const offlineItem = {
      ...reportData,
      reference_no: offlineRef,
      status: 'Pending Sync (Offline)',
      reported_at: new Date().toISOString(),
      reporter_name: (window.App && App.currentUser) ? App.currentUser.name : 'Offline Reporter',
      reporter_role: (window.App && App.currentUser) ? App.currentUser.role : 'Student'
    };

    const queue = JSON.parse(localStorage.getItem('campus_offline_incidents') || '[]');
    queue.push(offlineItem);
    localStorage.setItem('campus_offline_incidents', JSON.stringify(queue));

    this.closeModal();
    if (window.App && typeof App.playAlertSound === 'function') {
      App.playAlertSound('alarm');
    }
    this.showSuccessModal(offlineItem, true);

    if (window.CampusOffline && typeof CampusOffline.updateSyncBadge === 'function') {
      CampusOffline.updateSyncBadge();
    }

    App.showToast(`Saved to Offline Emergency Buffer: ${offlineRef}`, 'emergency');
  },

  showSuccessModal(incident, isOffline = false) {
    const modal = document.getElementById('sosSuccessModal');
    const refEl = document.getElementById('sosSuccessRef');
    const statusEl = document.getElementById('sosSuccessStatus');
    const noteEl = document.getElementById('sosSuccessNotice');

    if (!modal) return;

    if (refEl) refEl.textContent = incident.reference_no || 'EMG-SUBMITTED';
    if (statusEl) {
      statusEl.textContent = incident.status || 'Reported';
      statusEl.className = isOffline ? 'badge badge-high' : 'badge badge-reported';
    }
    if (noteEl) {
      if (isOffline) {
        noteEl.innerHTML = '<strong>OFFLINE BUFFER ACTIVE:</strong> Your report is safely stored on this device. It will automatically synchronize with Campus Security Operations the moment network connection is restored.';
        noteEl.style.color = '#B45309';
      } else {
        noteEl.innerHTML = '<strong>SECURITY DISPATCH NOTIFIED:</strong> Campus Safety Operations and emergency responders have received this transmission with highest priority.';
        noteEl.style.color = '#15803D';
      }
    }

    modal.classList.add('active');
  }
};

window.CampusSOS = CampusSOS;
