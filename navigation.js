/**
 * Campus Navigation & Evacuation Path Planner
 */

const CampusNav = {
  activeRoute: null,

  init() {
    this.setupRouteForm();
    this.setupInspectDrawerActions();
  },

  setupRouteForm() {
    const findBtn = document.getElementById('findRouteBtn');
    const evacBtn = document.getElementById('evacuationRouteBtn');
    const clearBtn = document.getElementById('clearRouteBtn');

    if (findBtn) {
      findBtn.addEventListener('click', () => this.calculateRoute());
    }

    if (evacBtn) {
      evacBtn.addEventListener('click', () => this.calculateEvacuation());
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clearRoute());
    }
  },

  setupInspectDrawerActions() {
    const setStartBtn = document.getElementById('inspectSetStartBtn');
    const setDestBtn = document.getElementById('inspectSetDestBtn');
    const reportHereBtn = document.getElementById('inspectReportEmergencyBtn');
    const deselectBtn = document.getElementById('inspectDeselectBtn');
    const closeBtn = document.getElementById('closeInspectDrawerBtn');

    if (setStartBtn) {
      setStartBtn.addEventListener('click', () => {
        if (CampusMap.selectedRoom) {
          const input = document.getElementById('routeStartInput');
          if (input) input.value = CampusMap.selectedRoom.room_code;
          App.showToast(`Set starting location to ${CampusMap.selectedRoom.name} (${CampusMap.selectedRoom.room_code})`, 'info');
        }
      });
    }

    if (setDestBtn) {
      setDestBtn.addEventListener('click', () => {
        if (CampusMap.selectedRoom) {
          const startInput = document.getElementById('routeStartInput');
          const destInput = document.getElementById('routeDestinationInput');
          if (destInput) destInput.value = CampusMap.selectedRoom.room_code;

          // If no start point is entered, suggest or pick the floor's entrance/stairs
          if (startInput && !startInput.value.trim()) {
            startInput.value = CampusMap.currentFloor === 1 ? 'ENT-101' : `STAIR-W-${CampusMap.currentFloor}`;
          }

          App.showToast(`Routing to ${CampusMap.selectedRoom.name}...`, 'info');
          this.calculateRoute();
        }
      });
    }

    if (reportHereBtn) {
      reportHereBtn.addEventListener('click', () => {
        if (CampusMap.selectedRoom && window.CampusSOS) {
          CampusSOS.openModalWithPreload(CampusMap.selectedRoom);
        }
      });
    }

    if (deselectBtn) {
      deselectBtn.addEventListener('click', () => {
        if (window.CampusMap) CampusMap.closeInspectDrawer();
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        if (window.CampusMap) CampusMap.closeInspectDrawer();
      });
    }
  },

  async calculateRoute() {
    const startInput = document.getElementById('routeStartInput');
    const destInput = document.getElementById('routeDestinationInput');

    const start = startInput ? startInput.value.trim() : '';
    const destination = destInput ? destInput.value.trim() : '';

    if (!start || !destination) {
      App.showToast('Please enter both a starting location and a destination.', 'error');
      return;
    }

    try {
      const res = await fetch('/api/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: start,
          to: destination,
          start: start,
          destination: destination,
          floor: CampusMap.currentFloor
        })
      });

      const data = await res.json();
      if (res.ok) {
        this.activeRoute = data;
        this.renderRoutePath(data.coordinates, false);
        this.renderGuidance(data);

        if (data.is_rerouted) {
          App.showToast('Notice: Route dynamically recalculated to avoid active emergency blockades.', 'emergency');
        } else {
          App.showToast(`Route found: ${data.distance_meters}m (~${data.estimated_seconds} sec walk)`, 'success');
        }
      } else {
        App.showToast(data.error || 'Failed to find route', 'error');
      }
    } catch (err) {
      console.error('Route calculation error', err);
      App.showToast('Unable to calculate route. Verify network or locations.', 'error');
    }
  },

  async calculateEvacuation() {
    const startInput = document.getElementById('routeStartInput');
    let start = startInput ? startInput.value.trim() : '';

    // If no start room entered, use currently selected room or default to room on this floor
    if (!start) {
      if (CampusMap.selectedRoom) {
        start = CampusMap.selectedRoom.room_code;
      } else {
        start = `CR-${CampusMap.currentFloor}04`;
      }
      if (startInput) startInput.value = start;
    }

    try {
      const res = await fetch('/api/navigation/evacuate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start: start,
          floor: CampusMap.currentFloor
        })
      });

      const data = await res.json();
      if (res.ok) {
        this.activeRoute = data;
        this.renderRoutePath(data.coordinates, true);
        this.renderGuidance(data, true);

        // Sound emergency chime
        App.playAlertSound('alarm');
        App.showToast('EMERGENCY EVACUATION ROUTE ACTIVATED: Follow green highlighted pathway to safe exit.', 'emergency');
      } else {
        App.showToast(data.error || 'Evacuation route calculation failed', 'error');
      }
    } catch (err) {
      console.error('Evacuation route error', err);
      App.showToast('Network error during evacuation calculation.', 'error');
    }
  },

  renderRoutePath(coordinates, isEvacuation = false) {
    const navLayer = document.getElementById('svgNavLayer');
    if (!navLayer || !coordinates || coordinates.length < 2) return;

    navLayer.innerHTML = '';

    // Filter coordinates for the currently viewed floor
    const floorCoords = coordinates.filter(c => c.floor === CampusMap.currentFloor || c.id === 'N_ASSEMBLY_POINT');

    if (floorCoords.length < 2) {
      // Inter-floor transit notice
      App.showToast(`Path leads across floors. Navigate to Floor ${coordinates[0].floor} to view segment.`, 'info');
      return;
    }

    // Build SVG smooth path through waypoints
    let pathD = `M ${floorCoords[0].x} ${floorCoords[0].y}`;
    for (let i = 1; i < floorCoords.length; i++) {
      pathD += ` L ${floorCoords[i].x} ${floorCoords[i].y}`;
    }

    const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathEl.setAttribute('d', pathD);
    pathEl.setAttribute('class', `svg-nav-path ${isEvacuation ? 'evacuation' : ''}`);
    navLayer.appendChild(pathEl);

    // Add Start Dot
    const startDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    startDot.setAttribute('cx', floorCoords[0].x);
    startDot.setAttribute('cy', floorCoords[0].y);
    startDot.setAttribute('r', '8');
    startDot.setAttribute('fill', isEvacuation ? '#DC2626' : '#2563EB');
    startDot.setAttribute('stroke', '#FFFFFF');
    startDot.setAttribute('stroke-width', '2');
    navLayer.appendChild(startDot);

    // Add Destination Marker
    const last = floorCoords[floorCoords.length - 1];
    const destDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    destDot.setAttribute('cx', last.x);
    destDot.setAttribute('cy', last.y);
    destDot.setAttribute('r', '10');
    destDot.setAttribute('fill', isEvacuation ? '#16A34A' : '#EA580C');
    destDot.setAttribute('stroke', '#FFFFFF');
    destDot.setAttribute('stroke-width', '2.5');
    navLayer.appendChild(destDot);
  },

  renderGuidance(data, isEvacuation = false) {
    const box = document.getElementById('routeGuidanceBox');
    const distEl = document.getElementById('guidanceDistance');
    const timeEl = document.getElementById('guidanceTime');
    const dirList = document.getElementById('guidanceDirectionsList');

    if (!box) return;

    if (distEl) distEl.textContent = `${data.distance_meters} m`;
    if (timeEl) timeEl.textContent = `${Math.ceil(data.estimated_seconds / 60)} min`;

    if (dirList) {
      dirList.innerHTML = '';
      if (isEvacuation && data.instructions) {
        data.instructions.forEach(ins => {
          const li = document.createElement('li');
          li.style.color = '#B91C1C';
          li.style.fontWeight = '600';
          li.textContent = ins;
          dirList.appendChild(li);
        });
      }

      if (data.directions) {
        data.directions.forEach(dir => {
          const li = document.createElement('li');
          li.textContent = dir;
          dirList.appendChild(li);
        });
      }
    }

    box.classList.add('active');
  },

  renderCurrentFloorRoute() {
    if (!this.activeRoute || !this.activeRoute.coordinates) return;
    this.renderRoutePath(this.activeRoute.coordinates, !!this.activeRoute.is_evacuation);
  },

  clearRoute(silent = false) {
    this.activeRoute = null;
    const navLayer = document.getElementById('svgNavLayer');
    if (navLayer) navLayer.innerHTML = '';

    const box = document.getElementById('routeGuidanceBox');
    if (box) box.classList.remove('active');

    const startInput = document.getElementById('routeStartInput');
    const destInput = document.getElementById('routeDestinationInput');
    if (startInput) startInput.value = '';
    if (destInput) destInput.value = '';

    if (!silent) {
      App.showToast('Route cleared.', 'info');
    }
  }
};

window.CampusNav = CampusNav;
