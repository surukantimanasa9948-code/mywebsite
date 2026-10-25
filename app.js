/**
 * Campus Emergency and Safety Management System - Main App Controller
 * "Smart Campus. Safer Tomorrow."
 */

const App = {
  currentUser: null,
  currentTab: 'dashboard',
  notifications: [],

  async init() {
    console.log('[CampusSafety] Initializing System...');
    await this.fetchCurrentUser();
    this.setupEventListeners();
    this.setupNavigation();
    this.setupRoleSwitcher();
    this.renderUserProfile();

    // Initialize Submodules
    if (typeof CampusMap !== 'undefined' && CampusMap.init) CampusMap.init();
    if (typeof CampusNav !== 'undefined' && CampusNav.init) CampusNav.init();
    if (typeof CampusSOS !== 'undefined' && CampusSOS.init) CampusSOS.init();
    if (typeof CampusIncidents !== 'undefined' && CampusIncidents.init) CampusIncidents.init();
    if (typeof CampusResources !== 'undefined' && CampusResources.init) CampusResources.init();
    if (typeof CampusAnalytics !== 'undefined' && CampusAnalytics.init) CampusAnalytics.init();
    if (typeof CampusOffline !== 'undefined' && CampusOffline.init) CampusOffline.init();

    // Load initial dashboard
    this.loadDashboardData();
  },

  async fetchCurrentUser() {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (data.authenticated) {
        this.currentUser = data.user;
      } else if (data.suggested_user) {
        // Pre-loaded student session for demonstration
        this.currentUser = data.suggested_user;
      } else {
        this.currentUser = {
          name: 'Student Demo User',
          email: 'student@campus.edu',
          role: 'student',
          department: 'Engineering'
        };
      }
    } catch (err) {
      console.warn('[CampusSafety] Auth check fallback to offline student user', err);
      this.currentUser = {
        name: 'Offline Student',
        email: 'student@campus.edu',
        role: 'student',
        department: 'Engineering'
      };
    }
  },

  renderUserProfile() {
    const avatarEl = document.getElementById('userAvatar');
    const nameEl = document.getElementById('userName');
    const roleEl = document.getElementById('userRole');

    if (this.currentUser) {
      if (avatarEl) avatarEl.textContent = (this.currentUser.name || 'U').charAt(0).toUpperCase();
      if (nameEl) nameEl.textContent = this.currentUser.name;
      if (roleEl) roleEl.textContent = this.currentUser.role.toUpperCase();

      // Highlight active demo button
      document.querySelectorAll('.role-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.role === this.currentUser.role);
      });

      // Show/hide security and admin specific elements
      this.applyRolePermissions();
    }
  },

  applyRolePermissions() {
    const role = this.currentUser ? this.currentUser.role : 'student';
    const isSecurityOrAdmin = (role === 'security' || role === 'admin');
    const isAdmin = (role === 'admin');

    // Manage incidents tab visibility/badge
    const incidentsNavItem = document.getElementById('navItemIncidents');
    if (incidentsNavItem) {
      incidentsNavItem.style.display = 'flex'; // visible to all, but actions restricted
    }

    // Admin resource controls
    document.querySelectorAll('.admin-only').forEach(el => {
      el.style.display = isAdmin ? '' : 'none';
    });

    // Security/Admin controls
    document.querySelectorAll('.security-only').forEach(el => {
      el.style.display = isSecurityOrAdmin ? '' : 'none';
    });
  },

  setupRoleSwitcher() {
    document.querySelectorAll('.role-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const targetRole = e.currentTarget.dataset.role;
        try {
          const res = await fetch('/api/auth/demo-switch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: targetRole })
          });
          const data = await res.json();
          if (res.ok) {
            this.currentUser = data.user;
            this.renderUserProfile();
            this.showToast(`Switched active role to ${targetRole.toUpperCase()}`, 'success');
            // Refresh current tab data
            if (this.currentTab === 'incidents' && window.CampusIncidents) CampusIncidents.loadIncidents();
            if (this.currentTab === 'resources' && window.CampusResources) CampusResources.loadResources();
            if (this.currentTab === 'analytics' && window.CampusAnalytics) CampusAnalytics.loadAnalytics();
          } else {
            this.showToast(data.error || 'Failed to switch role', 'error');
          }
        } catch (err) {
          console.error('Role switch failed', err);
          // Fallback client-side role switch for offline demo
          this.currentUser.role = targetRole;
          this.currentUser.name = `${targetRole.charAt(0).toUpperCase() + targetRole.slice(1)} Demo`;
          this.renderUserProfile();
          this.showToast(`Switched to ${targetRole.toUpperCase()} (Offline Mode)`, 'success');
        }
      });
    });
  },

  setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.currentTarget.dataset.tab;
        if (tab) {
          this.switchTab(tab);
        }
      });
    });

    // Mobile Hamburger
    const menuBtn = document.getElementById('mobileMenuBtn');
    const sidebar = document.getElementById('appSidebar');
    const backdrop = document.getElementById('sidebarBackdrop');

    if (menuBtn && sidebar && backdrop) {
      menuBtn.addEventListener('click', () => {
        sidebar.classList.toggle('mobile-open');
        backdrop.classList.toggle('active');
      });

      backdrop.addEventListener('click', () => {
        sidebar.classList.remove('mobile-open');
        backdrop.classList.remove('active');
      });
    }
  },

  switchTab(tabId) {
    this.currentTab = tabId;

    // Update Nav Buttons
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    // Update Tab Panes
    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.classList.toggle('active', pane.id === `tab-${tabId}`);
    });

    // Update Page Header Title
    const titles = {
      dashboard: { title: 'Emergency Management Dashboard', sub: 'Comprehensive Campus Safety Monitoring' },
      map: { title: 'Interactive Campus Navigation', sub: '5-Floor Semi-Circular Block Map & Safe Routing' },
      incidents: { title: 'Incident Response Console', sub: 'Authorized Security Dispatch & Status Tracking' },
      resources: { title: 'Campus Safety Resources', sub: 'Verified Emergency Equipment Directory & Inspections' },
      analytics: { title: 'Safety Analytics & Drill Reports', sub: 'Compliance Audits and Real Response Times' }
    };

    const header = titles[tabId] || { title: 'Campus Safety', sub: '' };
    const titleEl = document.getElementById('pageTitle');
    const subEl = document.getElementById('pageSubtitle');
    if (titleEl) titleEl.textContent = header.title;
    if (subEl) subEl.textContent = header.sub;

    // Close mobile menu if open
    const sidebar = document.getElementById('appSidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (sidebar) sidebar.classList.remove('mobile-open');
    if (backdrop) backdrop.classList.remove('active');

    // Trigger specific tab refreshes
    if (tabId === 'dashboard') this.loadDashboardData();
    if (tabId === 'map' && window.CampusMap) CampusMap.onTabActivated();
    if (tabId === 'incidents' && window.CampusIncidents) CampusIncidents.loadIncidents();
    if (tabId === 'resources' && window.CampusResources) CampusResources.loadResources();
    if (tabId === 'analytics' && window.CampusAnalytics) CampusAnalytics.loadAnalytics();
  },

  async loadDashboardData() {
    try {
      const res = await fetch('/api/analytics/dashboard');
      const data = await res.json();
      if (res.ok) {
        this.renderDashboardKPIs(data.stats);
        this.renderRecentIncidents(data.recent_incidents);
      }
    } catch (err) {
      console.warn('Dashboard fetch error', err);
    }
  },

  renderDashboardKPIs(stats) {
    if (!stats) return;

    const classEl = document.getElementById('kpiClassrooms');
    const floorsEl = document.getElementById('kpiFloors');
    const activeEl = document.getElementById('kpiActiveEmergencies');
    const openEl = document.getElementById('kpiOpenReports');
    const resEl = document.getElementById('kpiResources');
    const statusEl = document.getElementById('kpiResponseStatus');

    if (classEl) classEl.textContent = stats.total_classrooms || 80;
    if (floorsEl) floorsEl.textContent = stats.total_floors || 5;
    if (activeEl) {
      activeEl.textContent = stats.active_emergencies || 0;
      activeEl.parentElement.parentElement.classList.toggle('emergency-kpi', (stats.active_emergencies > 0));
    }
    if (openEl) openEl.textContent = stats.open_reports || 0;
    if (resEl) resEl.textContent = `${stats.available_resources || 50}/${stats.total_resources || 50}`;
    if (statusEl) statusEl.textContent = stats.response_status_label || 'High Readiness';

    // Update incidents tab badge count
    const badge = document.getElementById('incidentCountBadge');
    if (badge) {
      badge.textContent = stats.active_emergencies || 0;
      badge.style.display = stats.active_emergencies > 0 ? 'inline-block' : 'none';
    }
  },

  renderRecentIncidents(incidents) {
    const listEl = document.getElementById('dashboardRecentIncidents');
    if (!listEl) return;

    if (!incidents || incidents.length === 0) {
      listEl.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:24px; color:var(--text-muted);">No incident reports on record.</td></tr>`;
      return;
    }

    listEl.innerHTML = incidents.map(inc => {
      const isDemo = inc.is_demo_data ? `<span class="badge" style="background:#FEF3C7; color:#B45309; margin-left:6px;">DEMO DATA</span>` : '';
      const statusClass = `badge-${inc.status.toLowerCase()}`;
      const sevClass = `badge-${inc.severity.toLowerCase()}`;

      return `
        <tr>
          <td>
            <strong>${inc.reference_no}</strong>
            ${isDemo}
          </td>
          <td><span class="badge ${sevClass}">${inc.severity}</span></td>
          <td><strong>${inc.emergency_type}</strong></td>
          <td>Floor ${inc.floor_number} - ${inc.room_code}</td>
          <td><span class="badge ${statusClass}">${inc.status}</span></td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="App.viewIncidentDetails('${inc.reference_no}')">
              Details
            </button>
          </td>
        </tr>
      `;
    }).join('');
  },

  viewIncidentDetails(refNo) {
    this.switchTab('incidents');
    if (window.CampusIncidents) {
      CampusIncidents.openIncidentByRef(refNo);
    }
  },

  setupEventListeners() {
    // SOS Open triggers
    document.querySelectorAll('.open-sos-btn, #sosSidebarBtn, .mobile-floating-sos').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof CampusSOS !== 'undefined' && CampusSOS.openModal) {
          CampusSOS.openModal();
        } else if (window.CampusSOS && window.CampusSOS.openModal) {
          window.CampusSOS.openModal();
        }
      });
    });

    // Notification Drawer Toggle
    const notifBtn = document.getElementById('notificationBellBtn');
    if (notifBtn) {
      notifBtn.addEventListener('click', () => {
        this.showToast('All campus safety systems operational. No unacknowledged alerts.', 'info');
      });
    }
  },

  /**
   * Synthesize clean audio alert without external audio files
   */
  playAlertSound(type = 'alarm') {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      if (type === 'alarm') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.35);
      } else {
        // Success / chime
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
        osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.12); // A5
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.35);
      }
    } catch (e) {
      // Audio not supported or blocked by user gesture policy
    }
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let iconSvg = '';
    if (type === 'emergency' || type === 'error') {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    } else {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    }

    toast.innerHTML = `${iconSvg} <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }
};

window.App = App;

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
