/**
 * Campus Interactive Map & SVG Floor Plan Renderer
 * Represents the 5-Floor Semi-Circular Academic Block
 * Features:
 * - Fluid Semi-Circular Arch Geometry (80 Classrooms, Labs, Washrooms, Seminar Halls, Exits)
 * - Complete Interactive Safety Equipment Directory with Live SVG Status Badges
 * - Safety Resource Inspection Drawer with Quick Status Modification (PATCH API)
 * - 1-Click "Find Nearest Safety Asset" Dijkstra Pathfinding
 * - Smooth Drag & Pan Engine + Mouse Wheel Zoom
 * - Instant Floor Switching with In-Memory Caching
 * - Complete Map Reset / Clear View Control
 * - Cross-Floor Search with Auto-Floor Detection
 */

const CampusMap = {
  currentFloor: 1,
  floorsData: {},
  roomsByFloor: {},
  resourcesByFloor: {},
  blockedByFloor: {},
  selectedRoom: null,
  selectedResource: null,
  activeFilter: 'all',
  visibleResourceCats: new Set(['fire_extinguisher', 'fire_alarm', 'first_aid', 'aed', 'evacuation_chair', 'medical_room']),

  // Moving & Placement Mode State
  isMovingEquipment: false,
  isPlacingNewEquipment: false,
  movingResource: null,

  // Pan & Zoom State
  zoomLevel: 1,
  panX: 0,
  panY: 0,

  async init() {
    console.log('[CampusMap] Initializing Map & Safety Equipment Engine...');
    this.setupFloorButtons();
    this.setupSearch();
    this.setupToggles();
    this.setupEquipmentControls();
    this.setupZoomControls();
    this.setupPanAndZoom();
    this.setupDrawerClose();

    // Pre-load all 5 floors in background for instant switching
    this.preloadAllFloors();

    await this.loadFloorData(this.currentFloor);
  },

  onTabActivated() {
    this.renderCurrentFloor();
    if (window.CampusNav && CampusNav.activeRoute) {
      CampusNav.renderCurrentFloorRoute();
    }
  },

  async preloadAllFloors() {
    for (let f = 1; f <= 5; f++) {
      if (f === this.currentFloor) continue;
      fetch(`/api/floors/${f}`)
        .then(res => res.json())
        .then(data => {
          if (data && data.floor) {
            this.floorsData[f] = data.floor;
            this.roomsByFloor[f] = data.rooms;
            this.resourcesByFloor[f] = data.resources;
            this.blockedByFloor[f] = data.blocked_routes;
          }
        })
        .catch(() => {});
    }
  },

  setupFloorButtons() {
    document.querySelectorAll('.floor-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const floor = parseInt(e.currentTarget.dataset.floor, 10);
        this.selectFloor(floor);
      });
    });
  },

  setupDrawerClose() {
    const closeBtn = document.getElementById('closeInspectDrawerBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeInspectDrawer());
    }

    const deselectBtn = document.getElementById('inspectDeselectBtn');
    if (deselectBtn) {
      deselectBtn.addEventListener('click', () => this.closeInspectDrawer());
    }

    const closeEquipBtn = document.getElementById('closeEquipDrawerBtn');
    if (closeEquipBtn) {
      closeEquipBtn.addEventListener('click', () => this.closeEquipmentDrawer());
    }

    const deselectEquipBtn = document.getElementById('equipDeselectBtn');
    if (deselectEquipBtn) {
      deselectEquipBtn.addEventListener('click', () => this.closeEquipmentDrawer());
    }
  },

  async selectFloor(floorNum) {
    if (isNaN(floorNum) || floorNum < 1 || floorNum > 5) return;
    this.currentFloor = floorNum;

    // Deselect room and equipment from previous floor
    this.deselectRoom();
    this.closeEquipmentDrawer();

    // Update button active state
    document.querySelectorAll('.floor-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.floor, 10) === floorNum);
    });

    const labelEl = document.getElementById('mapCurrentFloorTitle');
    if (labelEl) labelEl.textContent = `Floor ${floorNum} - Semi-Circular Academic Block`;

    // Instant render if cached in memory
    if (this.roomsByFloor[floorNum] && this.floorsData[floorNum]) {
      this.renderCurrentFloor();
      this.updateFloorSummaryCard(this.floorsData[floorNum]);
      if (window.CampusNav && CampusNav.activeRoute) {
        CampusNav.renderCurrentFloorRoute();
      }
    }

    // Refresh from backend
    await this.loadFloorData(floorNum);
  },

  async loadFloorData(floorNum) {
    try {
      const res = await fetch(`/api/floors/${floorNum}`);
      const data = await res.json();
      if (res.ok && data.floor) {
        this.floorsData[floorNum] = data.floor;
        this.roomsByFloor[floorNum] = data.rooms;
        this.resourcesByFloor[floorNum] = data.resources;
        this.blockedByFloor[floorNum] = data.blocked_routes;

        this.renderCurrentFloor();
        this.updateFloorSummaryCard(data.floor);

        if (window.CampusNav && CampusNav.activeRoute) {
          CampusNav.renderCurrentFloorRoute();
        }
      }
    } catch (err) {
      console.warn(`[CampusMap] Failed to fetch floor ${floorNum}`, err);
    }
  },

  updateFloorSummaryCard(floor) {
    if (!floor) return;
    const descEl = document.getElementById('floorPlanDescription');
    const evacEl = document.getElementById('floorEvacuationSummary');
    if (descEl) descEl.textContent = floor.description || '';
    if (evacEl) evacEl.textContent = floor.evacuation_plan_summary || '';
  },

  updateEquipmentCounts() {
    const resources = this.resourcesByFloor[this.currentFloor] || [];
    const counts = {
      fire_extinguisher: 0,
      fire_alarm: 0,
      first_aid: 0,
      aed: 0,
      evacuation_chair: 0
    };

    resources.forEach(r => {
      if (counts[r.category] !== undefined) {
        counts[r.category]++;
      }
    });

    Object.keys(counts).forEach(cat => {
      const el = document.getElementById(`count-${cat}`);
      if (el) el.textContent = counts[cat];
    });
  },

  renderCurrentFloor() {
    const svg = document.getElementById('campusMapSvg');
    if (!svg) return;

    const rooms = this.roomsByFloor[this.currentFloor] || [];
    const resources = this.resourcesByFloor[this.currentFloor] || [];
    const blocked = this.blockedByFloor[this.currentFloor] || [];

    // Clear existing contents
    svg.innerHTML = '';

    // Create Base Building Semi-Circular Geometry
    const cx = 500, cy = 480;
    const rOuter = 440, rCorridor = 340, rInner = 240;

    // Defs for filters and patterns
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
      <filter id="glowEffect" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="4" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
      <filter id="equipShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#0B2545" flood-opacity="0.25" />
      </filter>
      <pattern id="hazardPattern" width="10" height="10" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
        <line x1="0" y1="0" x2="0" y2="10" stroke="#DC2626" stroke-width="3" />
        <line x1="5" y1="0" x2="5" y2="10" stroke="#FEE2E2" stroke-width="3" />
      </pattern>
    `;
    svg.appendChild(defs);

    // Master Transformation Group for Pan and Zoom
    const viewportGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    viewportGroup.id = 'svgViewportGroup';
    viewportGroup.setAttribute('transform', `translate(${this.panX}, ${this.panY}) scale(${this.zoomLevel})`);

    // 1. Base Building Footprint Layer
    const baseGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    baseGroup.id = 'svgBaseBuilding';

    const arcPath = `
      M ${cx - rOuter} ${cy}
      A ${rOuter} ${rOuter} 0 0 1 ${cx + rOuter} ${cy}
      L ${cx + rInner} ${cy}
      A ${rInner} ${rInner} 0 0 0 ${cx - rInner} ${cy}
      Z
    `;
    const footprint = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    footprint.setAttribute('d', arcPath);
    footprint.setAttribute('class', 'svg-building-arc');
    baseGroup.appendChild(footprint);

    // Central Semi-Circular Corridor
    const corridorPath = `
      M ${cx - rCorridor + 10} ${cy - 5}
      A ${rCorridor} ${rCorridor} 0 0 1 ${cx + rCorridor - 10} ${cy - 5}
    `;
    const corridor = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    corridor.setAttribute('d', corridorPath);
    corridor.setAttribute('class', 'svg-corridor-arc');
    baseGroup.appendChild(corridor);

    // Dashed Corridor Guideline
    const guideline = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    guideline.setAttribute('d', corridorPath);
    guideline.setAttribute('class', 'svg-corridor-guideline');
    baseGroup.appendChild(guideline);

    // Outdoor Courtyard Lawn / Assembly Area
    const courtyardCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    courtyardCircle.setAttribute('cx', cx);
    courtyardCircle.setAttribute('cy', cy + 90);
    courtyardCircle.setAttribute('r', '75');
    courtyardCircle.setAttribute('fill', '#F0FDF4');
    courtyardCircle.setAttribute('stroke', '#86EFAC');
    courtyardCircle.setAttribute('stroke-width', '2');
    baseGroup.appendChild(courtyardCircle);

    const courtyardText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    courtyardText.setAttribute('x', cx);
    courtyardText.setAttribute('y', cy + 86);
    courtyardText.setAttribute('text-anchor', 'middle');
    courtyardText.setAttribute('font-size', '11');
    courtyardText.setAttribute('font-weight', '700');
    courtyardText.setAttribute('fill', '#166534');
    courtyardText.textContent = 'SAFETY ASSEMBLY LAWN';
    baseGroup.appendChild(courtyardText);

    const courtyardSub = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    courtyardSub.setAttribute('x', cx);
    courtyardSub.setAttribute('y', cy + 104);
    courtyardSub.setAttribute('text-anchor', 'middle');
    courtyardSub.setAttribute('font-size', '9');
    courtyardSub.setAttribute('font-weight', '600');
    courtyardSub.setAttribute('fill', '#15803D');
    courtyardSub.textContent = 'Ground Egress Assembly Point (ASM-001)';
    baseGroup.appendChild(courtyardSub);

    viewportGroup.appendChild(baseGroup);

    // 2. Classrooms & Rooms Layer
    const roomsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    roomsGroup.id = 'svgRoomsLayer';

    rooms.forEach(room => {
      if (room.room_code === 'ASM-001') return;
      const roomEl = this.createRoomElement(room);
      roomsGroup.appendChild(roomEl);
    });
    viewportGroup.appendChild(roomsGroup);

    // 3. Navigation Route Path Layer
    const navGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    navGroup.id = 'svgNavLayer';
    viewportGroup.appendChild(navGroup);

    // 4. Blocked Route Barricades Layer
    const blockedGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    blockedGroup.id = 'svgBlockedLayer';
    blocked.forEach(b => {
      const el = this.createBlockedMarker(b);
      if (el) blockedGroup.appendChild(el);
    });
    viewportGroup.appendChild(blockedGroup);

    // 5. Safety Resources Layer (Interactive Equipment Markers)
    const resGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    resGroup.id = 'svgSafetyLayer';
    resources.forEach(res => {
      if (this.visibleResourceCats.has(res.category)) {
        const el = this.createSafetyResourceMarker(res);
        if (el) resGroup.appendChild(el);
      }
    });
    viewportGroup.appendChild(resGroup);

    svg.appendChild(viewportGroup);

    // Update equipment counter chips
    this.updateEquipmentCounts();
  },

  createRoomElement(room) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'room-group');
    g.dataset.roomCode = room.room_code;

    let cat = (room.category || 'classroom').toLowerCase();
    if (cat === 'stairs' || cat === 'staircase') cat = 'staircase';
    g.dataset.category = cat;

    const x = room.svg_x;
    const y = room.svg_y;

    // Dimensions based on room category
    let width = 38, height = 34;
    if (cat === 'seminar_hall') {
      width = 90;
      height = 54;
    } else if (cat === 'laboratory') {
      width = 54;
      height = 42;
    } else if (cat === 'medical') {
      width = 52;
      height = 40;
    } else if (cat === 'staircase' || cat === 'stairs' || cat === 'elevator' || cat === 'exit') {
      width = 46;
      height = 36;
    }

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', x - width / 2);
    rect.setAttribute('y', y - height / 2);
    rect.setAttribute('width', width);
    rect.setAttribute('height', height);
    rect.setAttribute('rx', '6');
    rect.setAttribute('ry', '6');
    rect.setAttribute('class', `svg-room category-${cat}`);
    rect.id = `room-rect-${room.room_code}`;

    if (this.selectedRoom && this.selectedRoom.room_code === room.room_code) {
      rect.classList.add('selected');
    }

    // Label inside room
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', x);
    label.setAttribute('y', y);
    label.setAttribute('class', 'svg-room-label');

    let displayCode = room.room_code.replace('CR-', '');
    if (cat === 'laboratory') displayCode = room.room_code.replace('LAB-', 'L');
    if (cat === 'washroom') displayCode = room.room_code.replace('WR-', '');
    if (cat === 'seminar_hall') displayCode = 'HALL';
    if (cat === 'medical') displayCode = 'MED';
    if (cat === 'staircase' || cat === 'stairs' || cat === 'exit') displayCode = 'EXIT';
    if (cat === 'elevator') displayCode = 'ELEV';

    label.textContent = displayCode;

    g.appendChild(rect);
    g.appendChild(label);

    g.addEventListener('click', (e) => {
      e.stopPropagation();
      this.inspectRoom(room);
    });

    g.addEventListener('mouseenter', (e) => {
      this.showTooltip(e, room);
    });

    g.addEventListener('mousemove', (e) => {
      this.showTooltip(e, room);
    });

    g.addEventListener('mouseleave', () => {
      this.hideTooltip();
    });

    return g;
  },

  createSafetyResourceMarker(res) {
    if (!res.svg_x || !res.svg_y) return null;

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'svg-safety-marker');
    g.setAttribute('transform', `translate(${res.svg_x}, ${res.svg_y})`);
    g.id = `res-marker-${res.resource_code}`;

    // Selected state
    if (this.selectedResource && this.selectedResource.resource_code === res.resource_code) {
      g.classList.add('selected');
    }

    // Visual indicator for equipment needing maintenance (steady display, non-blinking)
    if (res.status === 'maintenance_needed') {
      g.classList.add('warning-pulse');
    }

    // Outer status ring
    const statusRing = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    statusRing.setAttribute('r', '13');
    statusRing.setAttribute('fill', 'none');

    if (res.status === 'maintenance_needed') {
      statusRing.setAttribute('stroke', '#DC2626');
      statusRing.setAttribute('stroke-width', '2');
      statusRing.setAttribute('stroke-dasharray', '3 2');
      g.appendChild(statusRing);
    } else if (res.status === 'under_inspection') {
      statusRing.setAttribute('stroke', '#D97706');
      statusRing.setAttribute('stroke-width', '1.5');
      statusRing.setAttribute('stroke-dasharray', '2 2');
      g.appendChild(statusRing);
    }

    // Main Badge Circle
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('r', '10.5');
    circle.setAttribute('filter', 'url(#equipShadow)');

    let fill = '#DC2626';
    let iconLabel = 'FE';
    let fontSize = '8';

    if (res.category === 'fire_extinguisher') {
      fill = '#DC2626';
      iconLabel = '🔥';
      fontSize = '10';
    } else if (res.category === 'fire_alarm') {
      fill = '#EF4444';
      iconLabel = '🚨';
      fontSize = '10';
    } else if (res.category === 'first_aid') {
      fill = '#16A34A';
      iconLabel = '+';
      fontSize = '14';
    } else if (res.category === 'aed') {
      fill = '#2563EB';
      iconLabel = '⚡';
      fontSize = '11';
    } else if (res.category === 'evacuation_chair') {
      fill = '#7C3AED';
      iconLabel = '♿';
      fontSize = '11';
    } else if (res.category === 'medical_room') {
      fill = '#0D9488';
      iconLabel = '🏥';
      fontSize = '11';
    }

    circle.setAttribute('fill', fill);
    circle.setAttribute('stroke', '#FFFFFF');
    circle.setAttribute('stroke-width', '2');

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');
    text.setAttribute('fill', '#FFFFFF');
    text.setAttribute('font-size', fontSize);
    text.setAttribute('font-weight', '800');
    text.textContent = iconLabel;

    g.appendChild(circle);
    g.appendChild(text);

    // Event Listeners
    g.addEventListener('click', (e) => {
      e.stopPropagation();
      this.inspectSafetyResource(res);
    });

    g.addEventListener('mouseenter', (e) => {
      this.showEquipmentTooltip(e, res);
    });

    g.addEventListener('mousemove', (e) => {
      this.showEquipmentTooltip(e, res);
    });

    g.addEventListener('mouseleave', () => {
      this.hideTooltip();
    });

    return g;
  },

  showEquipmentTooltip(e, res) {
    const tip = document.getElementById('mapTooltip');
    const viewport = document.getElementById('svgViewport');
    if (!tip || !viewport) return;

    let icon = '🔥';
    let catName = 'Fire Extinguisher';
    if (res.category === 'fire_alarm') { icon = '🚨'; catName = 'Fire Alarm Station'; }
    if (res.category === 'first_aid') { icon = '🩹'; catName = 'First Aid Kit'; }
    if (res.category === 'aed') { icon = '⚡'; catName = 'Automated External Defibrillator'; }
    if (res.category === 'evacuation_chair') { icon = '♿'; catName = 'Evacuation Transit Chair'; }

    const statusBadge = res.status === 'operational'
      ? '<span style="color:#86EFAC;">● OPERATIONAL</span>'
      : (res.status === 'under_inspection' ? '<span style="color:#FDE047;">● INSPECTING</span>' : '<span style="color:#FCA5A5;">● MAINTENANCE NEEDED</span>');

    tip.innerHTML = `
      <div class="title" style="display:flex; align-items:center; gap:6px;">
        <span>${icon}</span>
        <span>${res.resource_name || res.resource_code}</span>
      </div>
      <div class="sub" style="margin-top:2px;">${catName} &nbsp;•&nbsp; ${statusBadge}</div>
      <div style="font-size:11px; color:#E2E8F0; margin-top:4px;">📍 ${res.location_desc}</div>
      <div style="font-size:10px; color:#94A3B8; margin-top:2px;">Click to inspect, route path, or update status</div>
    `;
    tip.style.display = 'block';

    const rect = viewport.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - rect.left + 15, 10), rect.width - 240);
    const y = Math.min(Math.max(e.clientY - rect.top - 25, 10), rect.height - 80);

    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  },

  inspectSafetyResource(res) {
    this.selectedResource = res;

    // Deselect room so drawer doesn't conflict
    this.deselectRoom();

    // Highlight marker on SVG
    document.querySelectorAll('.svg-safety-marker').forEach(m => m.classList.remove('selected'));
    const marker = document.getElementById(`res-marker-${res.resource_code}`);
    if (marker) marker.classList.add('selected');

    // Populate Equipment Drawer
    const drawer = document.getElementById('equipmentInspectDrawer');
    if (!drawer) return;

    const iconEl = document.getElementById('inspectEquipIcon');
    const titleEl = document.getElementById('inspectEquipTitle');
    const codeEl = document.getElementById('inspectEquipCode');
    const statusBadge = document.getElementById('inspectEquipStatusBadge');
    const nextDateEl = document.getElementById('inspectEquipNextDate');
    const locText = document.getElementById('inspectEquipLocText');
    const specText = document.getElementById('inspectEquipSpecText');

    let icon = '🔥';
    if (res.category === 'fire_alarm') icon = '🚨';
    if (res.category === 'first_aid') icon = '🩹';
    if (res.category === 'aed') icon = '⚡';
    if (res.category === 'evacuation_chair') icon = '♿';
    if (res.category === 'medical_room') icon = '🏥';

    if (iconEl) iconEl.textContent = icon;
    if (titleEl) titleEl.textContent = res.resource_name || res.resource_code;
    if (codeEl) codeEl.textContent = `Asset Code: ${res.resource_code} • Floor ${res.floor_number || this.currentFloor} • Node ${res.corridor_node || 'Central'}`;

    if (statusBadge) {
      statusBadge.className = `badge badge-${res.status.toLowerCase()}`;
      statusBadge.textContent = res.status.toUpperCase();
    }

    if (nextDateEl) {
      nextDateEl.textContent = res.next_inspection || 'Scheduled in 6 months';
    }

    if (locText) locText.textContent = res.location_desc || 'Corridor Safety Station';
    if (specText) specText.textContent = res.specifications || 'Standard university safety compliance equipment.';
    const notesText = document.getElementById('inspectEquipNotesText');
    if (notesText) notesText.textContent = res.notes || 'Pressure verified and equipment operational.';

    drawer.classList.add('active');

    App.showToast(`Selected Safety Asset: ${res.resource_code} (${res.location_desc})`, 'info');
  },

  closeEquipmentDrawer() {
    const drawer = document.getElementById('equipmentInspectDrawer');
    if (drawer) drawer.classList.remove('active');
    document.querySelectorAll('.svg-safety-marker').forEach(m => m.classList.remove('selected'));
    this.selectedResource = null;
  },

  setupEquipmentControls() {
    // 1. Quick status change buttons
    const setOpBtn = document.getElementById('equipSetOperationalBtn');
    const setInspBtn = document.getElementById('equipSetInspectionBtn');
    const setMaintBtn = document.getElementById('equipSetMaintenanceBtn');

    if (setOpBtn) {
      setOpBtn.onclick = () => this.updateResourceStatus(this.selectedResource, 'operational');
    }
    if (setInspBtn) {
      setInspBtn.onclick = () => this.updateResourceStatus(this.selectedResource, 'under_inspection');
    }
    if (setMaintBtn) {
      setMaintBtn.onclick = () => this.updateResourceStatus(this.selectedResource, 'maintenance_needed');
    }

    // 2. Route to Equipment button
    const routeToBtn = document.getElementById('equipNavigateHereBtn');
    if (routeToBtn) {
      routeToBtn.onclick = () => {
        if (!this.selectedResource) return;
        const startInput = document.getElementById('routeStartInput');
        const destInput = document.getElementById('routeDestinationInput');

        if (destInput) {
          destInput.value = this.selectedResource.resource_code;
        }

        if (startInput && !startInput.value.trim()) {
          startInput.value = this.currentFloor === 1 ? 'ENT-101' : `STAIR-W-${this.currentFloor}`;
        }

        App.showToast(`Navigating to ${this.selectedResource.resource_code}...`, 'info');
        if (window.CampusNav && typeof CampusNav.calculateRoute === 'function') {
          CampusNav.calculateRoute();
        }
      };
    }

    // 3. Modify Details Modal button
    const editBtn = document.getElementById('equipEditDetailsBtn');
    if (editBtn) {
      editBtn.onclick = () => this.openModifyEquipmentModal(this.selectedResource);
    }

    // 4. Move on Map button
    const moveBtn = document.getElementById('equipMovePositionBtn');
    if (moveBtn) {
      moveBtn.onclick = () => this.startMovingEquipment(this.selectedResource);
    }

    // 5. Delete Equipment button
    const deleteBtn = document.getElementById('equipDeleteBtn');
    if (deleteBtn) {
      deleteBtn.onclick = () => this.deleteSafetyResource(this.selectedResource);
    }

    // 6. Cancel Move Banner button
    const cancelMoveBtn = document.getElementById('cancelMoveEquipBtn');
    if (cancelMoveBtn) {
      cancelMoveBtn.onclick = () => this.cancelMovingEquipment();
    }

    // 7. Report SOS for this equipment
    const reportSosBtn = document.getElementById('equipReportSosBtn');
    if (reportSosBtn) {
      reportSosBtn.onclick = () => {
        if (this.selectedResource && window.CampusSOS) {
          CampusSOS.openModal();
          const descInput = document.getElementById('sosDescriptionInput');
          const locInput = document.getElementById('sosLocationDetailsInput');
          if (descInput) {
            descInput.value = `Issue reported regarding Safety Resource ${this.selectedResource.resource_code} (${this.selectedResource.resource_name}). Status: ${this.selectedResource.status}.`;
          }
          if (locInput) {
            locInput.value = this.selectedResource.location_desc;
          }
        }
      };
    }

    // 8. Add Safety Asset button & Modal wiring
    const addAssetBtn = document.getElementById('addSafetyEquipBtn');
    if (addAssetBtn) {
      addAssetBtn.onclick = () => this.openAddEquipmentModal();
    }

    const closeAddModalBtn = document.getElementById('closeAddEquipModalBtn');
    const cancelAddModalBtn = document.getElementById('cancelAddEquipBtn');
    if (closeAddModalBtn) closeAddModalBtn.onclick = () => this.closeAddEquipmentModal();
    if (cancelAddModalBtn) cancelAddModalBtn.onclick = () => this.closeAddEquipmentModal();

    const addForm = document.getElementById('addEquipmentForm');
    if (addForm) {
      addForm.onsubmit = (e) => this.createSafetyResource(e);
    }

    const addCategorySelect = document.getElementById('addEquipCategory');
    const addFloorSelect = document.getElementById('addEquipFloor');
    if (addCategorySelect) {
      addCategorySelect.onchange = () => this.updateSuggestedNewCode();
    }
    if (addFloorSelect) {
      addFloorSelect.onchange = () => this.updateSuggestedNewCode();
    }

    const pickPlacementBtn = document.getElementById('addEquipPickFromMapBtn');
    if (pickPlacementBtn) {
      pickPlacementBtn.onclick = () => this.startPickingPlacementLocation();
    }

    // 9. Modify Equipment Modal wiring
    const closeModModalBtn = document.getElementById('closeModifyEquipModalBtn');
    const cancelModModalBtn = document.getElementById('cancelModifyEquipBtn');
    if (closeModModalBtn) closeModModalBtn.onclick = () => this.closeModifyEquipmentModal();
    if (cancelModModalBtn) cancelModModalBtn.onclick = () => this.closeModifyEquipmentModal();

    const modForm = document.getElementById('modifyEquipmentForm');
    if (modForm) {
      modForm.onsubmit = (e) => this.saveResourceModifications(e);
    }

    const modRepositionBtn = document.getElementById('modifyEquipRepositionBtn');
    if (modRepositionBtn) {
      modRepositionBtn.onclick = () => this.startPickingPlacementLocation();
    }

    // 10. Toggle All Equipment button
    const toggleAllBtn = document.getElementById('toggleAllEquipmentBtn');
    if (toggleAllBtn) {
      toggleAllBtn.onclick = () => {
        const allCats = ['fire_extinguisher', 'fire_alarm', 'first_aid', 'aed', 'evacuation_chair', 'medical_room'];
        if (this.visibleResourceCats.size > 0) {
          this.visibleResourceCats.clear();
          toggleAllBtn.textContent = 'All Off';
          document.querySelectorAll('.toggle-chip').forEach(c => c.classList.remove('active'));
        } else {
          allCats.forEach(cat => this.visibleResourceCats.add(cat));
          toggleAllBtn.textContent = 'All On';
          document.querySelectorAll('.toggle-chip').forEach(c => c.classList.add('active'));
        }
        this.renderCurrentFloor();
      };
    }

    // 11. Quick Find Nearest Asset buttons
    const findFe = document.getElementById('quickFindExtinguisherBtn');
    const findFa = document.getElementById('quickFindFirstAidBtn');
    const findAed = document.getElementById('quickFindAedBtn');
    const findEc = document.getElementById('quickFindEvacChairBtn');

    if (findFe) findFe.onclick = () => this.findNearestAsset('fire_extinguisher');
    if (findFa) findFa.onclick = () => this.findNearestAsset('first_aid');
    if (findAed) findAed.onclick = () => this.findNearestAsset('aed');
    if (findEc) findEc.onclick = () => this.findNearestAsset('evacuation_chair');
  },

  async updateResourceStatus(resource, newStatus) {
    if (!resource) return;

    try {
      const res = await fetch(`/api/resources/${resource.id || resource.resource_id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Demo-Role': 'Administrator'
        },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus })
      });

      const data = await res.json();
      if (res.ok) {
        resource.status = newStatus;
        if (data.resource) {
          Object.assign(resource, data.resource);
        }

        // Update badge in drawer
        const statusBadge = document.getElementById('inspectEquipStatusBadge');
        if (statusBadge) {
          statusBadge.className = `badge badge-${newStatus.toLowerCase()}`;
          statusBadge.textContent = newStatus.toUpperCase();
        }

        // Re-render markers on map
        this.renderCurrentFloor();

        // Refresh resources tab if loaded
        if (window.CampusResources && typeof CampusResources.loadResources === 'function') {
          CampusResources.loadResources();
        }

        App.showToast(`Updated [${resource.resource_code}] status to ${newStatus.toUpperCase()}`, 'success');
      } else {
        App.showToast(data.error || 'Failed to update status', 'error');
      }
    } catch (err) {
      console.error('Failed to patch resource status', err);
      resource.status = newStatus;
      this.renderCurrentFloor();
      App.showToast(`Updated [${resource.resource_code}] to ${newStatus.toUpperCase()} (Client-side)`, 'info');
    }
  },

  openModifyEquipmentModal(resource) {
    if (!resource) {
      App.showToast('Please select a safety asset on the map first.', 'info');
      return;
    }

    const modal = document.getElementById('modifyEquipmentModal');
    if (!modal) return;

    let icon = '🔥';
    const cat = resource.category || resource.resource_type;
    if (cat === 'fire_alarm') icon = '🚨';
    if (cat === 'first_aid') icon = '🩹';
    if (cat === 'aed') icon = '⚡';
    if (cat === 'evacuation_chair') icon = '♿';
    if (cat === 'medical_room') icon = '🏥';

    const iconEl = document.getElementById('modifyModalIcon');
    if (iconEl) iconEl.textContent = icon;

    const titleEl = document.getElementById('modifyModalTitle');
    if (titleEl) titleEl.textContent = `Modify Equipment: ${resource.resource_code}`;

    document.getElementById('modifyEquipId').value = resource.id || resource.resource_id;
    document.getElementById('modifyEquipCode').value = resource.resource_code;
    document.getElementById('modifyEquipName').value = resource.resource_name || resource.name || resource.resource_code;
    document.getElementById('modifyEquipCategory').value = cat || 'fire_extinguisher';
    document.getElementById('modifyEquipStatus').value = resource.status || 'operational';
    document.getElementById('modifyEquipFloor').value = resource.floor_number || resource.floor_id || this.currentFloor;
    document.getElementById('modifyEquipLocation').value = resource.location_desc || '';
    document.getElementById('modifyEquipNextDate').value = resource.next_inspection ? resource.next_inspection.slice(0, 10) : '';
    document.getElementById('modifyEquipNode').value = resource.corridor_node || '';
    document.getElementById('modifyEquipX').value = resource.svg_x || '';
    document.getElementById('modifyEquipY').value = resource.svg_y || '';
    document.getElementById('modifyEquipSpec').value = resource.specifications || '';
    document.getElementById('modifyEquipNotes').value = resource.notes || '';

    modal.classList.add('active');
  },

  closeModifyEquipmentModal() {
    const modal = document.getElementById('modifyEquipmentModal');
    if (modal) modal.classList.remove('active');
  },

  async saveResourceModifications(e) {
    if (e && e.preventDefault) e.preventDefault();

    const id = document.getElementById('modifyEquipId').value;
    if (!id) return;

    const code = document.getElementById('modifyEquipCode').value;
    const name = document.getElementById('modifyEquipName').value.trim();
    const category = document.getElementById('modifyEquipCategory').value;
    const status = document.getElementById('modifyEquipStatus').value;
    const floor = parseInt(document.getElementById('modifyEquipFloor').value, 10) || this.currentFloor;
    const location = document.getElementById('modifyEquipLocation').value.trim();
    const nextDate = document.getElementById('modifyEquipNextDate').value;
    const node = document.getElementById('modifyEquipNode').value.trim();
    const svgX = parseFloat(document.getElementById('modifyEquipX').value) || null;
    const svgY = parseFloat(document.getElementById('modifyEquipY').value) || null;
    const spec = document.getElementById('modifyEquipSpec').value.trim();
    const notes = document.getElementById('modifyEquipNotes').value.trim();

    const payload = {
      resource_name: name,
      category: category,
      resource_type: category,
      status: status,
      floor_id: floor,
      location_desc: location,
      next_inspection: nextDate,
      corridor_node: node,
      svg_x: svgX,
      svg_y: svgY,
      specifications: spec,
      notes: notes
    };

    try {
      const res = await fetch(`/api/resources/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Demo-Role': 'Administrator'
        },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok) {
        const updated = data.resource || payload;
        updated.id = parseInt(id, 10);
        updated.resource_code = code;
        updated.category = category;
        updated.floor_number = floor;

        // Update local floor caches
        for (let f = 1; f <= 5; f++) {
          if (this.resourcesByFloor[f]) {
            this.resourcesByFloor[f] = this.resourcesByFloor[f].filter(r => (r.id !== updated.id && r.resource_code !== code));
          }
        }
        if (!this.resourcesByFloor[floor]) this.resourcesByFloor[floor] = [];
        this.resourcesByFloor[floor].push(updated);

        this.closeModifyEquipmentModal();

        if (floor === this.currentFloor) {
          this.renderCurrentFloor();
          this.inspectSafetyResource(updated);
        } else {
          this.selectFloor(floor);
          this.inspectSafetyResource(updated);
        }

        if (window.CampusResources && typeof CampusResources.loadResources === 'function') {
          CampusResources.loadResources();
        }

        App.showToast(`✓ Safety Equipment ${code} modified successfully.`, 'success');
      } else {
        App.showToast(data.error || 'Failed to save modifications', 'error');
      }
    } catch (err) {
      console.error('Save modifications error', err);
      App.showToast('Error saving modifications. Please retry.', 'error');
    }
  },

  openAddEquipmentModal() {
    const modal = document.getElementById('addEquipmentModal');
    if (!modal) return;

    const floorSelect = document.getElementById('addEquipFloor');
    if (floorSelect) floorSelect.value = this.currentFloor;

    this.updateSuggestedNewCode();

    const xInput = document.getElementById('addEquipX');
    const yInput = document.getElementById('addEquipY');
    if (xInput && (!xInput.value || xInput.value === '500')) xInput.value = '500.0';
    if (yInput && (!yInput.value || yInput.value === '240')) yInput.value = '240.0';

    modal.classList.add('active');
  },

  updateSuggestedNewCode() {
    const cat = document.getElementById('addEquipCategory')?.value || 'fire_extinguisher';
    const floor = document.getElementById('addEquipFloor')?.value || this.currentFloor;

    let prefix = 'FE';
    if (cat === 'fire_alarm') prefix = 'FA';
    if (cat === 'first_aid') prefix = 'FAK';
    if (cat === 'aed') prefix = 'AED';
    if (cat === 'evacuation_chair') prefix = 'EC';
    if (cat === 'medical_room') prefix = 'MED';

    const floorRes = this.resourcesByFloor[floor] || [];
    const count = floorRes.filter(r => (r.category || r.resource_type) === cat).length + 1;
    const code = `${prefix}-${floor}0${count}`;

    const codeInput = document.getElementById('addEquipCode');
    if (codeInput) codeInput.value = code;

    const nameInput = document.getElementById('addEquipName');
    let catTitle = 'Fire Extinguisher';
    if (cat === 'fire_alarm') catTitle = 'Fire Alarm Pull Station';
    if (cat === 'first_aid') catTitle = 'Emergency First Aid Kit';
    if (cat === 'aed') catTitle = 'Automated External Defibrillator';
    if (cat === 'evacuation_chair') catTitle = 'Stair Evacuation Chair';
    if (cat === 'medical_room') catTitle = 'First Care Medical Clinic';

    if (nameInput) nameInput.value = `${catTitle} ${code}`;
  },

  closeAddEquipmentModal() {
    const modal = document.getElementById('addEquipmentModal');
    if (modal) modal.classList.remove('active');
  },

  async createSafetyResource(e) {
    if (e && e.preventDefault) e.preventDefault();

    const code = document.getElementById('addEquipCode').value.trim();
    const name = document.getElementById('addEquipName').value.trim();
    const category = document.getElementById('addEquipCategory').value;
    const floor = parseInt(document.getElementById('addEquipFloor').value, 10) || this.currentFloor;
    const status = document.getElementById('addEquipStatus').value;
    const location = document.getElementById('addEquipLocation').value.trim();
    const svgX = parseFloat(document.getElementById('addEquipX').value) || 500.0;
    const svgY = parseFloat(document.getElementById('addEquipY').value) || 240.0;
    const spec = document.getElementById('addEquipSpec').value.trim();
    const notes = document.getElementById('addEquipNotes').value.trim();

    const closestNode = this.getClosestCorridorNode(svgX, svgY, floor);

    const payload = {
      resource_code: code,
      resource_name: name,
      category: category,
      resource_type: category,
      floor_id: floor,
      floor_number: floor,
      status: status,
      location_desc: location,
      svg_x: svgX,
      svg_y: svgY,
      corridor_node: closestNode,
      specifications: spec,
      notes: notes
    };

    try {
      const res = await fetch('/api/resources', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Demo-Role': 'Administrator'
        },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok) {
        const created = data.resource || payload;
        if (!this.resourcesByFloor[floor]) this.resourcesByFloor[floor] = [];
        this.resourcesByFloor[floor].push(created);

        this.closeAddEquipmentModal();

        if (floor === this.currentFloor) {
          this.renderCurrentFloor();
          this.inspectSafetyResource(created);
        } else {
          this.selectFloor(floor);
          this.inspectSafetyResource(created);
        }

        if (window.CampusResources && typeof CampusResources.loadResources === 'function') {
          CampusResources.loadResources();
        }

        App.showToast(`✓ Stationed new safety equipment [${code}] on Floor ${floor}`, 'success');
      } else {
        App.showToast(data.error || 'Failed to create resource', 'error');
      }
    } catch (err) {
      console.error('Create resource error', err);
      App.showToast('Failed to create resource. Please retry.', 'error');
    }
  },

  async deleteSafetyResource(resource) {
    if (!resource) return;

    const confirmed = window.confirm(
      `Are you sure you want to remove safety asset [${resource.resource_code}] (${resource.resource_name || 'Safety Equipment'}) from Floor ${resource.floor_number || this.currentFloor}?`
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/resources/${resource.id || resource.resource_id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'X-Demo-Role': 'Administrator'
        },
        credentials: 'include'
      });

      const data = await res.json();
      if (res.ok) {
        const floor = resource.floor_number || this.currentFloor;
        if (this.resourcesByFloor[floor]) {
          this.resourcesByFloor[floor] = this.resourcesByFloor[floor].filter(
            r => r.resource_code !== resource.resource_code && r.id !== (resource.id || resource.resource_id)
          );
        }

        this.closeEquipmentDrawer();
        this.renderCurrentFloor();

        if (window.CampusResources && typeof CampusResources.loadResources === 'function') {
          CampusResources.loadResources();
        }

        App.showToast(`✓ Safety equipment [${resource.resource_code}] removed from map.`, 'info');
      } else {
        App.showToast(data.error || 'Failed to delete resource', 'error');
      }
    } catch (err) {
      console.error('Delete resource error', err);
      App.showToast('Failed to delete resource', 'error');
    }
  },

  startMovingEquipment(resource) {
    if (!resource) return;
    this.isMovingEquipment = true;
    this.isPlacingNewEquipment = false;
    this.movingResource = resource;

    const banner = document.getElementById('equipMoveBanner');
    const textEl = document.getElementById('moveEquipCodeText');
    if (textEl) textEl.textContent = `${resource.resource_code} (${resource.resource_name || 'Equipment'})`;
    if (banner) banner.style.display = 'flex';

    const viewport = document.getElementById('svgViewport');
    if (viewport) viewport.classList.add('moving-mode');

    // Minimize drawer while moving
    const drawer = document.getElementById('equipmentInspectDrawer');
    if (drawer) drawer.classList.remove('active');

    App.showToast(`Move Mode Active: Click anywhere on the corridor to station ${resource.resource_code}`, 'info');
  },

  startPickingPlacementLocation() {
    this.isPlacingNewEquipment = true;
    this.isMovingEquipment = false;

    // Minimize modal
    this.closeAddEquipmentModal();
    this.closeModifyEquipmentModal();

    const banner = document.getElementById('equipMoveBanner');
    const textEl = document.getElementById('moveEquipCodeText');
    if (textEl) textEl.textContent = 'New Equipment Station';
    if (banner) banner.style.display = 'flex';

    const viewport = document.getElementById('svgViewport');
    if (viewport) viewport.classList.add('moving-mode');

    App.showToast('Click anywhere on the map corridor to set equipment coordinates.', 'info');
  },

  cancelMovingEquipment() {
    this.isMovingEquipment = false;
    this.isPlacingNewEquipment = false;
    this.movingResource = null;

    const banner = document.getElementById('equipMoveBanner');
    if (banner) banner.style.display = 'none';

    const viewport = document.getElementById('svgViewport');
    if (viewport) viewport.classList.remove('moving-mode');

    if (this.selectedResource) {
      const drawer = document.getElementById('equipmentInspectDrawer');
      if (drawer) drawer.classList.add('active');
    }
  },

  async applyEquipmentReposition(resource, x, y) {
    if (!resource) return;

    const floor = resource.floor_number || this.currentFloor;
    const closestNode = this.getClosestCorridorNode(x, y, floor);

    resource.svg_x = x;
    resource.svg_y = y;
    resource.corridor_node = closestNode;

    try {
      const res = await fetch(`/api/resources/${resource.id || resource.resource_id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Demo-Role': 'Administrator'
        },
        credentials: 'include',
        body: JSON.stringify({
          svg_x: x,
          svg_y: y,
          corridor_node: closestNode
        })
      });

      if (res.ok) {
        App.showToast(`✓ Repositioned ${resource.resource_code} to coordinates (${x}, ${y})`, 'success');
      }
    } catch (err) {
      console.warn('Network patch failed, saved locally', err);
    }

    this.cancelMovingEquipment();
    this.renderCurrentFloor();
    this.inspectSafetyResource(resource);
  },

  applyEquipmentPlacement(x, y) {
    const addX = document.getElementById('addEquipX');
    const addY = document.getElementById('addEquipY');
    const modX = document.getElementById('modifyEquipX');
    const modY = document.getElementById('modifyEquipY');

    if (addX) addX.value = x;
    if (addY) addY.value = y;
    if (modX) modX.value = x;
    if (modY) modY.value = y;

    this.cancelMovingEquipment();

    const modModal = document.getElementById('modifyEquipmentModal');
    if (modModal && document.getElementById('modifyEquipId').value) {
      modModal.classList.add('active');
    } else {
      const addModal = document.getElementById('addEquipmentModal');
      if (addModal) addModal.classList.add('active');
    }

    App.showToast(`Location captured: X=${x}, Y=${y}`, 'info');
  },

  getClosestCorridorNode(x, y, floor) {
    const cx = 500, cy = 480;
    const dx = x - cx;
    const dy = cy - y;
    let deg = Math.atan2(dy, dx) * 180 / Math.PI;
    if (deg < 0) deg += 360;

    if (deg >= 135) return `N_${floor}_W_CORRIDOR`;
    if (deg >= 75 && deg < 135) return `N_${floor}_CENTER`;
    return `N_${floor}_E_CORRIDOR`;
  },

  getSVGCoordinates(e) {
    const svg = document.getElementById('campusMapSvg');
    const viewportGroup = document.getElementById('svgViewportGroup');
    if (!svg || !viewportGroup) return null;

    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = viewportGroup.getScreenCTM();
    if (!ctm) return null;
    const svgPt = pt.matrixTransform(ctm.inverse());
    return {
      x: Math.round(svgPt.x * 10) / 10,
      y: Math.round(svgPt.y * 10) / 10
    };
  },


  findNearestAsset(category) {
    const resources = this.resourcesByFloor[this.currentFloor] || [];
    const matching = resources.filter(r => r.category === category);

    if (matching.length === 0) {
      App.showToast(`No ${category.replace('_', ' ')} units stationed on Floor ${this.currentFloor}. Check adjacent floors.`, 'info');
      return;
    }

    // Default to the first operational or matching asset
    const operational = matching.find(r => r.status === 'operational') || matching[0];

    // Open its drawer and highlight
    this.inspectSafetyResource(operational);

    // Setup route
    const startInput = document.getElementById('routeStartInput');
    const destInput = document.getElementById('routeDestinationInput');
    if (destInput) destInput.value = operational.resource_code;

    if (startInput && !startInput.value.trim()) {
      startInput.value = this.currentFloor === 1 ? 'ENT-101' : `STAIR-W-${this.currentFloor}`;
    }

    if (window.CampusNav && typeof CampusNav.calculateRoute === 'function') {
      CampusNav.calculateRoute();
    }

    let catName = 'Extinguisher';
    if (category === 'first_aid') catName = 'First Aid Kit';
    if (category === 'aed') catName = 'AED Unit';
    if (category === 'evacuation_chair') catName = 'Evac Chair';

    App.showToast(`Nearest ${catName} found: [${operational.resource_code}] in ${operational.location_desc}`, 'emergency');
  },

  createBlockedMarker(blockedItem) {
    const nodes = this.getNodeCoordinates(blockedItem.node_or_corridor, blockedItem.floor_number);
    if (!nodes) return null;

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'svg-blocked-barricade');
    g.setAttribute('transform', `translate(${nodes.x}, ${nodes.y})`);

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', '-16');
    rect.setAttribute('y', '-16');
    rect.setAttribute('width', '32');
    rect.setAttribute('height', '32');
    rect.setAttribute('rx', '4');
    rect.setAttribute('fill', 'url(#hazardPattern)');
    rect.setAttribute('stroke', '#DC2626');
    rect.setAttribute('stroke-width', '2');

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('dominant-baseline', 'central');
    label.setAttribute('fill', '#FFFFFF');
    label.setAttribute('font-size', '11');
    label.setAttribute('font-weight', '900');
    label.textContent = '✖';

    g.appendChild(rect);
    g.appendChild(label);

    g.addEventListener('click', (e) => {
      e.stopPropagation();
      App.showToast(`BLOCKED CORRIDOR: ${blockedItem.reason} (Reported by: ${blockedItem.reported_by})`, 'emergency');
    });

    return g;
  },

  getNodeCoordinates(nodeId, floorNum) {
    const cx = 500, cy = 480, r = 340;
    if (nodeId.includes('W_EXIT')) {
      const rad = 170 * Math.PI / 180;
      return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
    }
    if (nodeId.includes('E_EXIT')) {
      const rad = 10 * Math.PI / 180;
      return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
    }
    if (nodeId.includes('CENTER')) {
      return { x: 500, y: cy - (r - 40) };
    }
    const match = nodeId.match(/N_\d+_(\d+)/);
    if (match) {
      const i = parseInt(match[1], 10);
      const angle = 160 - (i - 1) * (140.0 / 15.0);
      const rad = angle * Math.PI / 180;
      return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
    }
    return null;
  },

  inspectRoom(room) {
    this.selectedRoom = room;

    // Deselect safety equipment so drawers don't conflict
    this.closeEquipmentDrawer();

    // Highlight rect
    document.querySelectorAll('.svg-room').forEach(el => el.classList.remove('selected'));
    const rect = document.getElementById(`room-rect-${room.room_code}`);
    if (rect) rect.classList.add('selected');

    // Populate inspect drawer
    const drawer = document.getElementById('roomInspectDrawer');
    const title = document.getElementById('inspectRoomTitle');
    const desc = document.getElementById('inspectRoomDesc');
    const meta = document.getElementById('inspectRoomMeta');

    const catName = (room.category || 'Classroom').replace('_', ' ').toUpperCase();

    if (title) title.textContent = `${room.name} (${room.room_code})`;
    if (desc) desc.textContent = room.description || 'Designated campus space with standard emergency safety compliance.';
    if (meta) {
      meta.innerHTML = `
        <strong>Wing:</strong> ${room.wing || 'Center'} &nbsp;|&nbsp;
        <strong>Category:</strong> ${catName} &nbsp;|&nbsp;
        <strong>Capacity:</strong> ${room.capacity || 40} &nbsp;|&nbsp;
        <strong>Floor:</strong> ${room.floor_number || this.currentFloor}
      `;
    }

    if (drawer) drawer.classList.add('active');

    // Pre-populate route destination input if empty
    const destInput = document.getElementById('routeDestinationInput');
    if (destInput && !destInput.value) {
      destInput.value = room.room_code;
    }
  },

  deselectRoom() {
    this.selectedRoom = null;
    document.querySelectorAll('.svg-room').forEach(el => el.classList.remove('selected'));
    this.closeInspectDrawer();
  },

  closeInspectDrawer() {
    const drawer = document.getElementById('roomInspectDrawer');
    if (drawer) drawer.classList.remove('active');
    document.querySelectorAll('.svg-room').forEach(el => el.classList.remove('selected'));
    this.selectedRoom = null;
  },

  showTooltip(e, room) {
    const tip = document.getElementById('mapTooltip');
    const viewport = document.getElementById('svgViewport');
    if (!tip || !viewport) return;

    const catName = (room.category || 'Classroom').replace('_', ' ').toUpperCase();

    tip.innerHTML = `
      <div class="title">${room.name}</div>
      <div class="sub">${room.room_code} • ${catName} • ${room.wing || 'Center'} Wing</div>
    `;
    tip.style.display = 'block';

    const rect = viewport.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - rect.left + 15, 10), rect.width - 230);
    const y = Math.min(Math.max(e.clientY - rect.top - 25, 10), rect.height - 65);

    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  },

  hideTooltip() {
    const tip = document.getElementById('mapTooltip');
    if (tip) tip.style.display = 'none';
  },

  setupSearch() {
    const searchInput = document.getElementById('mapSearchInput');
    const clearBtn = document.getElementById('mapSearchClearBtn');
    const hintEl = document.getElementById('mapSearchResultHint');
    if (!searchInput) return;

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearBtn.style.display = 'none';
        if (hintEl) hintEl.style.display = 'none';
        document.querySelectorAll('.svg-room').forEach(el => {
          el.style.opacity = '1';
          el.style.stroke = '';
          el.style.strokeWidth = '';
          el.classList.remove('search-match');
        });
      });
    }

    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim().toLowerCase();
      if (clearBtn) clearBtn.style.display = query ? 'block' : 'none';

      if (!query) {
        if (hintEl) hintEl.style.display = 'none';
        document.querySelectorAll('.svg-room').forEach(el => {
          el.style.opacity = '1';
          el.style.stroke = '';
          el.style.strokeWidth = '';
          el.classList.remove('search-match');
        });
        return;
      }

      const rooms = this.roomsByFloor[this.currentFloor] || [];
      const matchedCodes = new Set();

      rooms.forEach(r => {
        if (
          r.room_code.toLowerCase().includes(query) ||
          (r.name && r.name.toLowerCase().includes(query)) ||
          (r.category && r.category.toLowerCase().includes(query)) ||
          (r.wing && r.wing.toLowerCase().includes(query))
        ) {
          matchedCodes.add(r.room_code);
        }
      });

      document.querySelectorAll('.svg-room').forEach(el => {
        const code = el.id.replace('room-rect-', '');
        if (matchedCodes.has(code)) {
          el.style.opacity = '1';
          el.classList.add('search-match');
        } else {
          el.style.opacity = matchedCodes.size > 0 ? '0.2' : '0.5';
          el.classList.remove('search-match');
        }
      });

      // Auto-detect if room exists on another floor
      if (matchedCodes.size === 0 && hintEl) {
        let matchedOtherFloor = null;
        const floorMatch = query.match(/(?:cr|lab|sem|wr|floor)[ -]?([1-5])/i);
        if (floorMatch) {
          matchedOtherFloor = parseInt(floorMatch[1], 10);
        } else {
          for (let f = 1; f <= 5; f++) {
            if (f === this.currentFloor) continue;
            const otherRooms = this.roomsByFloor[f] || [];
            if (otherRooms.some(r => r.room_code.toLowerCase().includes(query) || (r.name && r.name.toLowerCase().includes(query)))) {
              matchedOtherFloor = f;
              break;
            }
          }
        }

        if (matchedOtherFloor && matchedOtherFloor !== this.currentFloor) {
          hintEl.innerHTML = `
            <span>Match found on Floor ${matchedOtherFloor}</span>
            <button type="button" onclick="CampusMap.selectFloor(${matchedOtherFloor})">Go to Floor ${matchedOtherFloor}</button>
          `;
          hintEl.style.display = 'flex';
        } else {
          hintEl.style.display = 'none';
        }
      } else if (hintEl) {
        hintEl.style.display = 'none';
      }
    });
  },

  setupToggles() {
    document.querySelectorAll('.toggle-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        const cat = e.currentTarget.dataset.cat;
        if (this.visibleResourceCats.has(cat)) {
          this.visibleResourceCats.delete(cat);
          e.currentTarget.classList.remove('active');
        } else {
          this.visibleResourceCats.add(cat);
          e.currentTarget.classList.add('active');
        }
        this.renderCurrentFloor();
        if (window.CampusNav && CampusNav.activeRoute) {
          CampusNav.renderCurrentFloorRoute();
        }
      });
    });
  },

  setupPanAndZoom() {
    const viewport = document.getElementById('svgViewport');
    const svg = document.getElementById('campusMapSvg');
    if (!viewport || !svg) return;

    let isPointerDown = false;
    let startX = 0, startY = 0;
    let initialPanX = 0, initialPanY = 0;
    let hasDragged = false;

    const onStart = (clientX, clientY, target) => {
      // Ignore clicks on drawers or tooltips
      if (target.closest('.room-inspect-drawer') || target.closest('.map-tooltip')) return;

      isPointerDown = true;
      hasDragged = false;
      startX = clientX;
      startY = clientY;
      initialPanX = this.panX;
      initialPanY = this.panY;
      viewport.classList.add('is-dragging');
    };

    const onMove = (clientX, clientY) => {
      if (!isPointerDown) return;
      const dx = clientX - startX;
      const dy = clientY - startY;

      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        hasDragged = true;
      }

      this.panX = initialPanX + dx;
      this.panY = initialPanY + dy;
      this.updateTransform(false);
    };

    const onEnd = () => {
      if (!isPointerDown) return;
      isPointerDown = false;
      viewport.classList.remove('is-dragging');
    };

    viewport.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      onStart(e.clientX, e.clientY, e.target);
    });

    window.addEventListener('mousemove', (e) => {
      onMove(e.clientX, e.clientY);
    });

    window.addEventListener('mouseup', onEnd);

    // Touch support
    viewport.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        onStart(e.touches[0].clientX, e.touches[0].clientY, e.target);
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1 && isPointerDown) {
        onMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    window.addEventListener('touchend', onEnd);

    // Smooth Mouse Wheel Zoom
    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
      const newZoom = Math.min(Math.max(this.zoomLevel * zoomFactor, 0.65), 3.0);

      const rect = viewport.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - rect.width / 2;
      const mouseY = e.clientY - rect.top - rect.height / 2;

      this.panX = mouseX - (mouseX - this.panX) * (newZoom / this.zoomLevel);
      this.panY = mouseY - (mouseY - this.panY) * (newZoom / this.zoomLevel);
      this.zoomLevel = newZoom;

      this.updateTransform(false);
    }, { passive: false });

    // Canvas Click: Handle moving/placement mode OR deselect room & equipment
    svg.addEventListener('click', (e) => {
      if (hasDragged) return;

      // 1. Moving active equipment mode
      if (this.isMovingEquipment && this.movingResource) {
        e.stopPropagation();
        const coords = this.getSVGCoordinates(e);
        if (coords) {
          this.applyEquipmentReposition(this.movingResource, coords.x, coords.y);
        }
        return;
      }

      // 2. Placing new equipment mode
      if (this.isPlacingNewEquipment) {
        e.stopPropagation();
        const coords = this.getSVGCoordinates(e);
        if (coords) {
          this.applyEquipmentPlacement(coords.x, coords.y);
        }
        return;
      }

      const target = e.target;
      if (
        target.id === 'campusMapSvg' ||
        target.classList.contains('svg-building-arc') ||
        target.classList.contains('svg-corridor-arc') ||
        target.classList.contains('svg-corridor-guideline') ||
        target.id === 'svgBaseBuilding' ||
        target.tagName.toLowerCase() === 'svg'
      ) {
        this.deselectRoom();
        this.closeEquipmentDrawer();
      }
    });

    // Double click to reset
    viewport.addEventListener('dblclick', (e) => {
      if (!e.target.closest('.room-group') && !e.target.closest('.svg-safety-marker')) {
        this.resetView();
      }
    });
  },

  setupZoomControls() {
    const zoomIn = document.getElementById('mapZoomIn');
    const zoomOut = document.getElementById('mapZoomOut');
    const zoomReset = document.getElementById('mapZoomReset');
    const clearBtn = document.getElementById('mapClearBtn');

    if (zoomIn) {
      zoomIn.addEventListener('click', () => {
        this.zoomLevel = Math.min(this.zoomLevel + 0.25, 3.0);
        this.updateTransform(true);
      });
    }

    if (zoomOut) {
      zoomOut.addEventListener('click', () => {
        this.zoomLevel = Math.max(this.zoomLevel - 0.25, 0.65);
        this.updateTransform(true);
      });
    }

    if (zoomReset) {
      zoomReset.addEventListener('click', () => {
        this.resetView();
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.clearAll();
      });
    }
  },

  updateTransform(smooth = false) {
    const group = document.getElementById('svgViewportGroup');
    if (!group) return;

    if (smooth) {
      group.style.transition = 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)';
      setTimeout(() => {
        if (group) group.style.transition = '';
      }, 240);
    } else {
      group.style.transition = '';
    }

    group.setAttribute('transform', `translate(${this.panX}, ${this.panY}) scale(${this.zoomLevel})`);
  },

  resetView() {
    this.panX = 0;
    this.panY = 0;
    this.zoomLevel = 1;
    this.updateTransform(true);
  },

  clearAll() {
    // 1. Deselect room and close drawers
    this.deselectRoom();
    this.closeEquipmentDrawer();

    // 2. Clear route lines and turn-by-turn guidance
    if (window.CampusNav) {
      CampusNav.clearRoute(true);
    }

    // 3. Clear search query and hints
    const searchInput = document.getElementById('mapSearchInput');
    const clearBtn = document.getElementById('mapSearchClearBtn');
    const hintEl = document.getElementById('mapSearchResultHint');
    if (searchInput) searchInput.value = '';
    if (clearBtn) clearBtn.style.display = 'none';
    if (hintEl) hintEl.style.display = 'none';

    // 4. Restore room styling
    document.querySelectorAll('.svg-room').forEach(el => {
      el.style.opacity = '1';
      el.style.stroke = '';
      el.style.strokeWidth = '';
      el.classList.remove('search-match');
    });

    // 5. Reset pan and zoom to center
    this.resetView();

    // 6. Hide tooltip
    this.hideTooltip();

    // 7. Re-render current floor cleanly
    this.renderCurrentFloor();

    App.showToast('Map view reset and cleared.', 'info');
  }
};

window.CampusMap = CampusMap;
