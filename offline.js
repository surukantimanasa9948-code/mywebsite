/**
 * Campus Offline Detection, Service Worker Manager, and Local Sync Queue
 */

const CampusOffline = {
  init() {
    this.registerServiceWorker();
    this.setupNetworkListeners();
    this.updateSyncBadge();

    const syncBtn = document.getElementById('manualSyncBtn');
    if (syncBtn) {
      syncBtn.addEventListener('click', () => this.syncPendingQueue());
    }
  },

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then((reg) => {
            console.log('[ServiceWorker] Registered with scope:', reg.scope);
          })
          .catch((err) => {
            console.warn('[ServiceWorker] Registration failed:', err);
          });
      });
    }
  },

  setupNetworkListeners() {
    const banner = document.getElementById('offlineBanner');

    const updateOnlineStatus = () => {
      const isOnline = navigator.onLine;
      if (banner) {
        banner.classList.toggle('active', !isOnline);
      }

      if (isOnline) {
        App.showToast('Network connection re-established. Synchronizing campus data...', 'success');
        this.syncPendingQueue();
      } else {
        App.showToast('You are currently working offline. Cached floor plans and emergency instructions remain accessible.', 'info');
      }
    };

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    // Initial check
    if (!navigator.onLine && banner) {
      banner.classList.add('active');
    }
  },

  getOfflineQueue() {
    try {
      return JSON.parse(localStorage.getItem('campus_offline_incidents') || '[]');
    } catch (e) {
      return [];
    }
  },

  saveOfflineQueue(queue) {
    localStorage.setItem('campus_offline_incidents', JSON.stringify(queue));
    this.updateSyncBadge();
  },

  updateSyncBadge() {
    const queue = this.getOfflineQueue();
    const count = queue.length;
    const badge = document.getElementById('offlineQueueCount');
    const syncContainer = document.getElementById('offlineSyncContainer');

    if (badge) badge.textContent = count;
    if (syncContainer) {
      syncContainer.style.display = count > 0 ? 'flex' : 'none';
    }
  },

  async syncPendingQueue() {
    const queue = this.getOfflineQueue();
    if (queue.length === 0) return;

    if (!navigator.onLine) {
      App.showToast('Cannot synchronize: still offline. Reports will sync when connectivity resumes.', 'info');
      return;
    }

    console.log(`[CampusOffline] Synchronizing ${queue.length} pending incident reports...`);
    App.showToast(`Synchronizing ${queue.length} queued emergency reports...`, 'info');

    // Ensure all queued items have idempotency keys
    const payload = queue.map(item => ({
      ...item,
      idempotency_key: item.idempotency_key || `offline-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      floor_id: item.floor_number || item.floor_id,
      description: item.description.includes('[Auto-synchronized') ? item.description : `${item.description} [Auto-synchronized from Offline Storage]`
    }));

    try {
      const res = await fetch('/api/sync/emergencies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reports: payload })
      });

      const data = await res.json();
      if (res.ok && data.results) {
        let syncedCount = 0;
        const failedKeys = new Set();

        data.results.forEach(r => {
          if (r.status === 'synchronized' || r.status === 'already_exists') {
            syncedCount++;
          } else {
            failedKeys.add(r.idempotency_key);
          }
        });

        // Keep only failed reports in the queue
        const remaining = payload.filter(p => failedKeys.has(p.idempotency_key));
        this.saveOfflineQueue(remaining);

        if (syncedCount > 0) {
          App.showToast(`Successfully synchronized ${syncedCount} emergency reports to Security Dispatch!`, 'success');
          App.loadDashboardData();
          if (window.CampusIncidents) CampusIncidents.loadIncidents();
        }
      }
    } catch (err) {
      console.warn('Batch sync failed, will retry on next connection', err);
    }
  }
};

window.CampusOffline = CampusOffline;
