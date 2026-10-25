/**
 * Campus Safety Analytics & Emergency Drill Compliance Reports
 */

const CampusAnalytics = {
  charts: {},
  analyticsData: null,

  init() {
    const exportBtn = document.getElementById('exportIncidentsCsvBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportCsv());
    }
  },

  async loadAnalytics() {
    try {
      const res = await fetch('/api/analytics/dashboard');
      const data = await res.json();
      if (res.ok) {
        this.analyticsData = data;
        this.renderMetrics(data.stats);
        this.renderDrillsTable(data.drills);
        this.renderCharts(data.breakdowns);
      }
    } catch (err) {
      console.warn('Analytics loading error', err);
    }
  },

  renderMetrics(stats) {
    if (!stats) return;

    const avgMinEl = document.getElementById('analyticsAvgResponseTime');
    const resRateEl = document.getElementById('analyticsResolutionRate');
    const totalIncEl = document.getElementById('analyticsTotalIncidents');
    const openIncEl = document.getElementById('analyticsOpenIncidents');

    if (avgMinEl) {
      avgMinEl.textContent = `${stats.avg_response_time_minutes} min`;
    }

    if (totalIncEl) {
      const total = (stats.open_reports || 0) + (this.analyticsData?.breakdowns?.by_status?.Resolved || 0);
      totalIncEl.textContent = total;
    }

    if (openIncEl) {
      openIncEl.textContent = stats.open_reports || 0;
    }

    if (resRateEl) {
      const total = (stats.open_reports || 0) + (this.analyticsData?.breakdowns?.by_status?.Resolved || 0);
      const resolved = this.analyticsData?.breakdowns?.by_status?.Resolved || 0;
      const rate = total > 0 ? Math.round((resolved / total) * 100) : 100;
      resRateEl.textContent = `${rate}%`;
    }
  },

  renderDrillsTable(drills) {
    const tbody = document.getElementById('drillsTableBody');
    if (!tbody) return;

    if (!drills || drills.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:24px; color:var(--text-muted);">No drill exercises logged for the current academic session.</td></tr>';
      return;
    }

    tbody.innerHTML = drills.map(d => {
      const min = Math.floor(d.evacuation_time_seconds / 60);
      const sec = d.evacuation_time_seconds % 60;
      const timeStr = `${min}m ${sec}s`;

      return `
        <tr>
          <td><strong>${d.title}</strong></td>
          <td>${d.drill_date}</td>
          <td><span class="badge" style="background:#EFF6FF; color:#1D4ED8;">${d.drill_type}</span></td>
          <td><strong>${timeStr}</strong></td>
          <td>${d.participants_count.toLocaleString()} occupants</td>
          <td><span class="badge badge-resolved">${d.status}</span></td>
        </tr>
      `;
    }).join('');
  },

  renderCharts(breakdowns) {
    if (!breakdowns) return;

    // 1. Incidents By Type Bar Chart (Canvas rendering with pure HTML5 Canvas for zero external CDN failure risk)
    this.drawBarChart(
      'chartIncidentsByType',
      Object.keys(breakdowns.by_type || {}),
      Object.values(breakdowns.by_type || {}),
      ['#DC2626', '#2563EB', '#EA580C', '#D97706', '#9333EA', '#059669']
    );

    // 2. Incidents By Floor Bar Chart
    const floorLabels = ['Floor 1', 'Floor 2', 'Floor 3', 'Floor 4', 'Floor 5'];
    const floorCounts = [1, 2, 3, 4, 5].map(f => (breakdowns.by_floor && breakdowns.by_floor[f]) || 0);
    this.drawBarChart(
      'chartIncidentsByFloor',
      floorLabels,
      floorCounts,
      ['#134074', '#1D3557', '#2563EB', '#3B82F6', '#60A5FA']
    );
  },

  /**
   * Pure HTML5 high-DPI Canvas bar chart generator
   * Guarantees 100% offline functionality without external CDN library dependencies
   */
  drawBarChart(canvasId, labels, values, colors) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.parentElement.clientWidth || 400;
    const height = canvas.height = 240;

    ctx.clearRect(0, 0, width, height);

    if (labels.length === 0 || values.length === 0) {
      ctx.fillStyle = '#94A3B8';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No data available', width / 2, height / 2);
      return;
    }

    const padding = { top: 20, right: 20, bottom: 40, left: 40 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;
    const maxVal = Math.max(...values, 4);

    // Grid lines
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    const gridSteps = 4;
    for (let i = 0; i <= gridSteps; i++) {
      const y = padding.top + (chartH / gridSteps) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      const val = Math.round(maxVal - (maxVal / gridSteps) * i);
      ctx.fillStyle = '#64748B';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(val.toString(), padding.left - 8, y + 3);
    }

    const barWidth = Math.min(chartW / labels.length - 16, 48);
    const stepX = chartW / labels.length;

    labels.forEach((lbl, idx) => {
      const val = values[idx] || 0;
      const barH = (val / maxVal) * chartH;
      const x = padding.left + stepX * idx + (stepX - barWidth) / 2;
      const y = padding.top + chartH - barH;

      // Bar Fill with Rounded Top
      ctx.fillStyle = colors[idx % colors.length] || '#134074';
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barH, [4, 4, 0, 0]);
      ctx.fill();

      // Value label on top
      if (val > 0) {
        ctx.fillStyle = '#0B2545';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(val.toString(), x + barWidth / 2, y - 5);
      }

      // X-Axis Category Label
      ctx.fillStyle = '#475569';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      const shortLbl = lbl.length > 9 ? lbl.slice(0, 8) + '..' : lbl;
      ctx.fillText(shortLbl, x + barWidth / 2, height - padding.bottom + 18);
    });
  },

  async exportCsv() {
    try {
      const res = await fetch('/api/incidents');
      const data = await res.json();
      const incidents = data.incidents || [];

      if (incidents.length === 0) {
        App.showToast('No incident records to export.', 'info');
        return;
      }

      const headers = ['Reference Number', 'Type', 'Severity', 'Floor', 'Room', 'Status', 'Reporter', 'Reported At', 'Response Time (sec)'];
      const rows = incidents.map(i => [
        i.reference_no,
        i.emergency_type,
        i.severity,
        i.floor_number,
        i.room_code,
        i.status,
        `"${i.reporter_name.replace(/"/g, '""')}"`,
        i.reported_at,
        i.response_time_seconds || 0
      ]);

      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `campus_incident_report_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      App.showToast('Incident report CSV exported successfully.', 'success');
    } catch (err) {
      console.error('CSV export failed', err);
      App.showToast('Failed to export CSV', 'error');
    }
  }
};

window.CampusAnalytics = CampusAnalytics;
