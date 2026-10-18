// =========================================================
// Aroma Cafe Admin Dashboard - Controller & Data Engine
// =========================================================

(function() {
  'use strict';

  const token = localStorage.getItem('aroma_admin_token');
  if (!token) {
    window.location.href = '/login';
    return;
  }

  // Dashboard State
  const state = {
    user: JSON.parse(localStorage.getItem('aroma_admin_user') || '{}'),
    branches: [],
    questions: [],
    surveys: [],
    pagination: { total: 0, page: 1, limit: 15, totalPages: 1 },
    analytics: null,
    filters: {
      branchId: 'all',
      dateRange: 'all',
      visitTime: 'all',
      minRating: 'all',
      search: '',
      status: 'all'
    },
    activeTab: 'tab-analytics',
    charts: {}
  };

  // Helper for authenticated requests
  async function apiFetch(endpoint, options = {}) {
    const currentToken = localStorage.getItem('aroma_admin_token') || token;
    options.headers = {
      ...(options.headers || {}),
      'Authorization': `Bearer ${currentToken}`
    };

    const res = await fetch(endpoint, options);
    if (res.status === 401) {
      localStorage.removeItem('aroma_admin_token');
      localStorage.removeItem('aroma_admin_user');
      window.location.href = '/login';
      throw new Error('انتهت صلاحية الجلسة');
    }
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'حدث خطأ في استدعاء الخادم');
    return data;
  }

  // Initialize Admin
  async function init() {
    setupUserDisplay();
    setupEventListeners();
    await loadBranches();
    await loadAnalytics();
    await loadSubmissions();
    await loadQuestions();
  }

  function setupUserDisplay() {
    const elName = document.getElementById('admin-display-name');
    if (elName && state.user.name) {
      elName.textContent = state.user.name;
    }
  }

  function setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabTarget = btn.dataset.tab;
        switchTab(tabTarget, btn);
      });
    });

    // Filters
    const elBranchFilter = document.getElementById('filter-branch');
    const elDateFilter = document.getElementById('filter-daterange');
    const elTimeFilter = document.getElementById('filter-visittime');
    const elRatingFilter = document.getElementById('filter-minrating');
    const elSearchInput = document.getElementById('filter-search');

    if (elBranchFilter) {
      elBranchFilter.addEventListener('change', (e) => {
        state.filters.branchId = e.target.value;
        refreshCurrentView();
      });
    }

    if (elDateFilter) {
      elDateFilter.addEventListener('change', (e) => {
        state.filters.dateRange = e.target.value;
        refreshCurrentView();
      });
    }

    if (elTimeFilter) {
      elTimeFilter.addEventListener('change', (e) => {
        state.filters.visitTime = e.target.value;
        refreshCurrentView();
      });
    }

    if (elRatingFilter) {
      elRatingFilter.addEventListener('change', (e) => {
        state.filters.minRating = e.target.value;
        refreshCurrentView();
      });
    }

    if (elSearchInput) {
      let debounceTimer;
      elSearchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          state.filters.search = e.target.value.trim();
          loadSubmissions();
        }, 300);
      });
    }

    // Export buttons
    const btnExportExcel = document.getElementById('btn-export-excel');
    if (btnExportExcel) {
      btnExportExcel.addEventListener('click', () => {
        const q = buildFilterQuery();
        window.location.href = `/api/export/excel?${q}`;
      });
    }

    const btnExportCsv = document.getElementById('btn-export-csv');
    if (btnExportCsv) {
      btnExportCsv.addEventListener('click', () => {
        const q = buildFilterQuery();
        window.location.href = `/api/export/csv?${q}`;
      });
    }

    // QR Table Stand Generator Button
    const btnOpenQr = document.getElementById('btn-admin-qr');
    if (btnOpenQr) {
      btnOpenQr.addEventListener('click', () => openAdminQrModal());
    }

    // Logout
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
      btnLogout.addEventListener('click', () => {
        if (confirm('هل أنت متأكد من رغبتك في تسجيل الخروج؟')) {
          localStorage.removeItem('aroma_admin_token');
          localStorage.removeItem('aroma_admin_user');
          window.location.href = '/login';
        }
      });
    }

    // Drawer close
    const drawerOverlay = document.getElementById('submission-drawer');
    const drawerClose = document.getElementById('drawer-close');
    if (drawerClose && drawerOverlay) {
      drawerClose.addEventListener('click', () => drawerOverlay.classList.remove('open'));
      drawerOverlay.addEventListener('click', (e) => {
        if (e.target === drawerOverlay) drawerOverlay.classList.remove('open');
      });
    }

    // Profile & Security Events
    setupProfileEvents();
  }

  function switchTab(tabId, activeBtn) {
    state.activeTab = tabId;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));

    const targetTabBtn = activeBtn || document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    if (targetTabBtn) targetTabBtn.classList.add('active');
    const targetView = document.getElementById(tabId);
    if (targetView) targetView.classList.add('active');

    // Trigger chart resize if entering analytics
    if (tabId === 'tab-analytics') {
      setTimeout(() => {
        Object.values(state.charts).forEach(c => c && c.resize && c.resize());
      }, 50);
    }

    // Load admin profile if entering profile tab
    if (tabId === 'tab-profile') {
      loadAdminProfile();
    }
  }

  function buildFilterQuery() {
    const params = new URLSearchParams();
    if (state.filters.branchId !== 'all') params.append('branchId', state.filters.branchId);
    if (state.filters.dateRange !== 'all') params.append('dateRange', state.filters.dateRange);
    if (state.filters.visitTime !== 'all') params.append('visitTime', state.filters.visitTime);
    if (state.filters.minRating !== 'all') params.append('minRating', state.filters.minRating);
    if (state.filters.search) params.append('search', state.filters.search);
    if (state.filters.status !== 'all') params.append('status', state.filters.status);
    return params.toString();
  }

  async function refreshCurrentView() {
    await loadAnalytics();
    await loadSubmissions();
  }

  // Load Branches
  async function loadBranches() {
    try {
      const res = await apiFetch('/api/branches');
      state.branches = res.data;

      // Populate branch select filters
      const elBranchFilter = document.getElementById('filter-branch');
      const elQrBranchSelect = document.getElementById('qr-branch-select');

      if (elBranchFilter) {
        elBranchFilter.innerHTML = '<option value="all">كافة الفروع</option>';
        state.branches.forEach(b => {
          const opt = document.createElement('option');
          opt.value = b.id;
          opt.textContent = `${b.name} (${b.responsesCount} مشاركة)`;
          elBranchFilter.appendChild(opt);
        });
      }

      if (elQrBranchSelect) {
        elQrBranchSelect.innerHTML = '';
        state.branches.forEach(b => {
          const opt = document.createElement('option');
          opt.value = b.id;
          opt.textContent = b.name;
          elQrBranchSelect.appendChild(opt);
        });
      }

      renderBranchesList();
    } catch (err) {
      console.error('Error loading branches:', err);
    }
  }

  // Load Analytics Data & KPIs
  async function loadAnalytics() {
    try {
      const q = buildFilterQuery();
      const res = await apiFetch(`/api/analytics?${q}`);
      state.analytics = res.data.analytics;

      renderKPIs(state.analytics);
      renderCharts(state.analytics);
      renderSmartInsights(state.analytics.smartInsights || []);
      renderQuestionsBreakdown(state.analytics.questionAverages || {});
    } catch (err) {
      console.error('Error loading analytics:', err);
    }
  }

  // Render KPI Metrics
  function renderKPIs(analytics) {
    document.getElementById('kpi-total').textContent = analytics.totalSubmissions;
    document.getElementById('kpi-satisfaction').textContent = `${analytics.averageSatisfaction} / 5`;
    document.getElementById('kpi-csat').textContent = `${analytics.csatPercent}%`;

    const npsEl = document.getElementById('kpi-nps');
    npsEl.textContent = (analytics.npsScore > 0 ? '+' : '') + analytics.npsScore;
    npsEl.style.color = analytics.npsScore >= 50 ? 'var(--success)' : (analytics.npsScore >= 0 ? 'var(--warning)' : 'var(--danger)');

    const npsBreakdownEl = document.getElementById('kpi-nps-sub');
    if (npsBreakdownEl && analytics.npsBreakdown) {
      npsBreakdownEl.innerHTML = `
        <span style="color: var(--success); font-weight: 700;">${analytics.npsBreakdown.promotersPct}% مروجين</span> • 
        <span style="color: var(--warning); font-weight: 700;">${analytics.npsBreakdown.passivesPct}% محايدين</span> • 
        <span style="color: var(--danger); font-weight: 700;">${analytics.npsBreakdown.detractorsPct}% منتقدين</span>
      `;
    }
  }

  // Render Charts using Chart.js
  function renderCharts(analytics) {
    if (!window.Chart) return;

    // 1. Sections Performance Bar Chart
    const secCtx = document.getElementById('chart-sections');
    if (secCtx) {
      const secData = analytics.sectionsBreakdown || {};
      const labels = Object.values(secData).map(s => s.name);
      const scores = Object.values(secData).map(s => s.average);

      if (state.charts.sections) state.charts.sections.destroy();
      state.charts.sections = new Chart(secCtx, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'متوسط التقييم من 5',
            data: scores,
            backgroundColor: scores.map(s => s >= 4.5 ? '#c89658' : (s >= 4.0 ? '#dfa968' : '#e07a5f')),
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            y: {
              min: 0,
              max: 5,
              ticks: { stepSize: 1 }
            }
          }
        }
      });
    }

    // 2. Timeline Trend Line Chart
    const timeCtx = document.getElementById('chart-timeline');
    if (timeCtx) {
      const timeline = analytics.timeline || [];
      const labels = timeline.map(t => t.date);
      const scores = timeline.map(t => t.avgScore);
      const counts = timeline.map(t => t.count);

      if (state.charts.timeline) state.charts.timeline.destroy();
      state.charts.timeline = new Chart(timeCtx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'معدل رضا العملاء (من 5)',
              data: scores,
              borderColor: '#c89658',
              backgroundColor: 'rgba(200, 150, 88, 0.1)',
              fill: true,
              tension: 0.3,
              yAxisID: 'y'
            },
            {
              label: 'عدد التقييمات',
              data: counts,
              borderColor: '#2b1f1a',
              backgroundColor: '#2b1f1a',
              type: 'bar',
              yAxisID: 'y1',
              borderRadius: 4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              min: 0,
              max: 5,
              position: 'right',
              title: { display: true, text: 'معدل الرضا' }
            },
            y1: {
              min: 0,
              position: 'left',
              grid: { drawOnChartArea: false },
              title: { display: true, text: 'عدد المشاركات' }
            }
          }
        }
      });
    }

    // 3. NPS Donut Chart
    const npsCtx = document.getElementById('chart-nps');
    if (npsCtx && analytics.npsBreakdown) {
      if (state.charts.nps) state.charts.nps.destroy();
      state.charts.nps = new Chart(npsCtx, {
        type: 'doughnut',
        data: {
          labels: ['المروجون (9-10)', 'المحايدون (7-8)', 'المنتقدون (0-6)'],
          datasets: [{
            data: [
              analytics.npsBreakdown.promoters || 0,
              analytics.npsBreakdown.passives || 0,
              analytics.npsBreakdown.detractors || 0
            ],
            backgroundColor: ['#2e7d32', '#f57c00', '#d32f2f']
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom' }
          }
        }
      });
    }

    // 4. Visit Times Distribution
    const vtCtx = document.getElementById('chart-visittimes');
    if (vtCtx && analytics.visitTimes) {
      const labels = Object.keys(analytics.visitTimes);
      const dataVals = Object.values(analytics.visitTimes);

      if (state.charts.visitTimes) state.charts.visitTimes.destroy();
      state.charts.visitTimes = new Chart(vtCtx, {
        type: 'pie',
        data: {
          labels,
          datasets: [{
            data: dataVals,
            backgroundColor: ['#e0a96d', '#776254', '#2c1f19', '#1a130f']
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom' }
          }
        }
      });
    }
  }

  // Render Smart Weakness & Opportunity Insights
  function renderSmartInsights(insights) {
    const container = document.getElementById('insights-container');
    if (!container) return;

    if (!insights || insights.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 24px; background: #fff; border-radius: var(--radius-md); border: 1px solid var(--admin-border);">
          <span>لا توجد تنبيهات حرجة مسجلة حالياً، كافة المؤشرات ضمن المستويات الإيجابية.</span>
        </div>
      `;
      return;
    }

    container.innerHTML = insights.map(item => `
      <div class="insight-card ${item.type}">
        <div>
          <span class="insight-tag">${item.tag}</span>
          <h4 class="insight-title">${item.title}</h4>
          <p class="insight-desc">${item.description}</p>
        </div>
        <div class="insight-recommendation">
          <strong>💡 التوصية التنفيذية:</strong> ${item.recommendation}
        </div>
      </div>
    `).join('');
  }

  // Render Questions Breakdown Table
  function renderQuestionsBreakdown(questionAverages) {
    const tbody = document.getElementById('questions-breakdown-tbody');
    if (!tbody) return;

    const list = Object.values(questionAverages);
    list.sort((a, b) => b.average - a.average);

    tbody.innerHTML = list.map(q => {
      const isWeak = q.average < 3.8;
      const isStrong = q.average >= 4.6;
      const badgeClass = isWeak ? 'pill-danger' : (isStrong ? 'pill-success' : 'pill-info');
      const badgeText = isWeak ? 'يحتاج تحسين ⚠️' : (isStrong ? 'نقطة قوة كبرى 🌟' : 'جيد جداً ✓');
      const fillColor = isWeak ? '#d32f2f' : (isStrong ? '#2e7d32' : '#c89658');

      return `
        <tr>
          <td style="font-weight: 700;">${q.label}</td>
          <td><span style="font-size: 0.8rem; background: #faf7f2; padding: 3px 8px; border-radius: 4px; border: 1px solid #ebdcd0;">${q.section}</span></td>
          <td>${q.count}</td>
          <td style="font-weight: 900; font-size: 1.05rem;">${q.average} / 5</td>
          <td>
            <div class="rating-progress-cell">
              <div class="progress-track">
                <div class="progress-track-fill" style="width: ${q.percentage}%; background: ${fillColor};"></div>
              </div>
              <span style="font-size: 0.8rem; font-weight: 700;">${q.percentage}%</span>
            </div>
          </td>
          <td><span class="kpi-pill ${badgeClass}">${badgeText}</span></td>
        </tr>
      `;
    }).join('');
  }

  // Load Submissions List
  async function loadSubmissions() {
    try {
      const q = buildFilterQuery();
      const res = await apiFetch(`/api/surveys?${q}&page=${state.pagination.page}&limit=20`);
      state.surveys = res.data.surveys || [];
      state.pagination = res.data.pagination || state.pagination;

      renderSubmissionsTable();
    } catch (err) {
      console.error('Error loading surveys:', err);
    }
  }

  // Render Submissions Table
  function renderSubmissionsTable() {
    const tbody = document.getElementById('submissions-tbody');
    const countEl = document.getElementById('submissions-count-display');
    if (countEl) countEl.textContent = `(إجمالي النتائج: ${state.pagination.total})`;

    if (!tbody) return;

    if (state.surveys.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; padding: 32px; color: var(--admin-text-muted);">
            لا توجد تقييمات مطابقة لمعايير البحث الحالية.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = state.surveys.map(s => {
      const customerName = s.answers?.customer_name || 'فاعل خير (مجهول)';
      const customerPhone = s.answers?.customer_phone || '-';
      const highlight = s.answers?.positive_highlight ? `<div style="color: var(--success); font-weight: 600; font-size: 0.82rem;">“${s.answers.positive_highlight.substring(0, 40)}...”</div>` : '-';
      const suggestion = s.answers?.improvement_suggestion ? `<div style="color: var(--warning); font-weight: 600; font-size: 0.82rem;">“${s.answers.improvement_suggestion.substring(0, 40)}...”</div>` : '-';
      
      const statusClass = `status-${s.status || 'new'}`;
      const statusText = s.status === 'resolved' ? 'تم الحل ومكافأته' : (s.status === 'in_progress' ? 'قيد المتابعة' : 'جديد');

      return `
        <tr>
          <td><code style="font-weight: 800; font-size: 0.85rem;">${s.id}</code></td>
          <td style="font-weight: 700;">${s.branchName}</td>
          <td style="font-size: 0.82rem; color: var(--admin-text-muted);">${new Date(s.createdAt).toLocaleDateString('ar-SA')}</td>
          <td><span style="font-weight: 900; color: var(--admin-accent); font-size: 1rem;">${s.overallSatisfaction} ★</span></td>
          <td><span style="font-weight: 800; ${s.npsScore >= 9 ? 'color: var(--success)' : (s.npsScore >= 7 ? 'color: var(--warning)' : 'color: var(--danger)')};">${s.npsScore}</span></td>
          <td>
            <div style="font-weight: 700;">${customerName}</div>
            <div style="font-size: 0.78rem; color: var(--admin-text-muted); direction: ltr; text-align: right;">${customerPhone}</div>
          </td>
          <td>${highlight}</td>
          <td>${suggestion}</td>
          <td><span class="status-pill ${statusClass}">${statusText}</span></td>
          <td>
            <button class="btn-admin-action" onclick="window.viewSubmissionDetail('${s.id}')" style="padding: 4px 10px; font-size: 0.8rem;">
              تفاصيل كاملة 🔍
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Open Detailed Submission Drawer
  window.viewSubmissionDetail = async function(surveyId) {
    let survey = state.surveys.find(s => s.id === surveyId);
    if (!survey) return;

    try {
      const res = await apiFetch(`/api/surveys/${surveyId}`);
      if (res.data) survey = res.data;
    } catch (e) {
      console.warn('Could not fetch single survey details:', e);
    }

    const drawer = document.getElementById('submission-drawer');
    const content = document.getElementById('drawer-content');
    if (!drawer || !content) return;

    let ratingsHtml = '';
    if (survey.ratings) {
      Object.entries(survey.ratings).forEach(([key, val]) => {
        if (typeof val === 'number') {
          ratingsHtml += `
            <div class="drawer-item-row">
              <span class="drawer-item-label">${key}:</span>
              <span class="drawer-item-val">${val} ★</span>
            </div>
          `;
        }
      });
    }

    content.innerHTML = `
      <div style="margin-bottom: 16px;">
        <span class="kpi-pill pill-info">رقم التقييم: ${survey.id}</span>
        <h3 style="font-size: 1.35rem; font-weight: 800; color: var(--admin-primary); margin: 8px 0;">
          ${survey.branchName}
        </h3>
        <p style="font-size: 0.85rem; color: var(--admin-text-muted);">
          التاريخ: ${new Date(survey.createdAt).toLocaleString('ar-SA')} • زمن الإكمال: ${survey.durationSeconds || 120} ثانية
        </p>
      </div>

      <!-- WhatsApp Routing Box -->
      <div style="background: #f0fdf4; border: 1.5px solid #86efac; border-radius: var(--radius-md); padding: 16px; margin-bottom: 20px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
          <span style="font-size: 0.82rem; font-weight: 800; color: #166534; background: #dcfce7; padding: 2px 8px; border-radius: 4px;">
            📲 توجيه واتساب للفرع
          </span>
          <span style="font-size: 0.85rem; font-weight: 700; color: #15803d; direction: ltr;">
            ${survey.managerPhone || (survey.branchId === 'branch-1' ? '00966567833138' : '+966 54 873 1474')}
          </span>
        </div>
        <p style="font-size: 0.85rem; color: #166534; margin-bottom: 10px;">
          رقم واتساب المشرف المعتمد لهذا الفرع: <strong>${survey.managerPhone || (survey.branchId === 'branch-1' ? '00966567833138' : '+966 54 873 1474')}</strong>
        </p>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          ${survey.whatsappManagerUrl ? `
            <a href="${survey.whatsappManagerUrl}" target="_blank" class="btn-admin-action" style="background: #22c55e; color: #fff; border: none; font-weight: 800; padding: 7px 12px; font-size: 0.82rem;">
              📲 إرسال التقرير لمشرف الفرع واتساب
            </a>
          ` : ''}
          ${survey.whatsappCustomerUrl ? `
            <a href="${survey.whatsappCustomerUrl}" target="_blank" class="btn-admin-action" style="background: #e8f5e9; color: #1b5e20; border: 1px solid #86efac; font-weight: 800; padding: 7px 12px; font-size: 0.82rem;">
              💬 محادثة العميل على واتساب
            </a>
          ` : ''}
        </div>
      </div>

      <div class="drawer-section-title">بيانات العميل والتواصل</div>
      <div class="drawer-item-row">
        <span class="drawer-item-label">اسم العميل:</span>
        <span class="drawer-item-val">${survey.answers?.customer_name || 'مجهول (لم يشارك بياناته)'}</span>
      </div>
      <div class="drawer-item-row">
        <span class="drawer-item-label">رقم الجوال:</span>
        <span class="drawer-item-val" style="direction: ltr;">${survey.answers?.customer_phone || '-'}</span>
      </div>
      <div class="drawer-item-row">
        <span class="drawer-item-label">البريد الإلكتروني:</span>
        <span class="drawer-item-val">${survey.answers?.customer_email || '-'}</span>
      </div>
      <div class="drawer-item-row">
        <span class="drawer-item-label">كود القسيمة الممنوح:</span>
        <span class="drawer-item-val" style="color: var(--admin-accent); font-family: monospace;">${survey.voucherCode || '-'}</span>
      </div>

      <div class="drawer-section-title">طبيعة الزيارة والطلبات</div>
      <div class="drawer-item-row">
        <span class="drawer-item-label">نوع الزيارة:</span>
        <span class="drawer-item-val">${survey.answers?.visit_type || '-'}</span>
      </div>
      <div class="drawer-item-row">
        <span class="drawer-item-label">فترة الزيارة:</span>
        <span class="drawer-item-val">${survey.answers?.visit_time || '-'}</span>
      </div>
      <div class="drawer-item-row">
        <span class="drawer-item-label">المشروب:</span>
        <span class="drawer-item-val">${survey.answers?.beverage_type || '-'}</span>
      </div>
      <div class="drawer-item-row">
        <span class="drawer-item-label">هل طلب طعاماً؟</span>
        <span class="drawer-item-val">${survey.ratings?.ordered_food ? 'نعم ✓' : 'لا (تخطى القسم)'}</span>
      </div>

      <div class="drawer-section-title">التعليقات والملاحظات النصية</div>
      <div style="background: #e8f5e9; border: 1px solid #c8e6c9; border-radius: var(--radius-sm); padding: 12px; margin-bottom: 12px;">
        <strong style="color: var(--success); font-size: 0.88rem;">✨ أكثر ما أعجب العميل:</strong>
        <p style="margin-top: 4px; font-size: 0.9rem;">${survey.answers?.positive_highlight || 'لم يكتب تعليقاً'}</p>
      </div>

      <div style="background: #fff3e0; border: 1px solid #ffe0b2; border-radius: var(--radius-sm); padding: 12px; margin-bottom: 16px;">
        <strong style="color: var(--warning); font-size: 0.88rem;">⚠️ أهم مقترحات التحسين:</strong>
        <p style="margin-top: 4px; font-size: 0.9rem;">${survey.answers?.improvement_suggestion || 'لم يكتب مقترحاً'}</p>
      </div>

      <div class="drawer-section-title">تقييمات الأقسام التفصيلية (من 5)</div>
      ${ratingsHtml}

      <div class="drawer-section-title">إجراءات المتابعة وحالة الشكوى</div>
      <div style="margin-bottom: 14px;">
        <label style="display: block; font-weight: 700; margin-bottom: 6px; font-size: 0.88rem;">تحديث الحالة:</label>
        <select id="detail-status" class="filter-select" style="width: 100%;">
          <option value="new" ${survey.status === 'new' ? 'selected' : ''}>جديد (لم يتم التدقيق)</option>
          <option value="in_progress" ${survey.status === 'in_progress' ? 'selected' : ''}>قيد المتابعة والتواصل</option>
          <option value="resolved" ${survey.status === 'resolved' ? 'selected' : ''}>تم الحل والتعويض / الشكر</option>
        </select>
      </div>

      <div style="margin-bottom: 18px;">
        <label style="display: block; font-weight: 700; margin-bottom: 6px; font-size: 0.88rem;">ملاحظات الإدارة الداخلية:</label>
        <textarea id="detail-notes" class="input-field" rows="3" placeholder="اكتب إجراءات الإدارة هنا...">${survey.adminNotes || ''}</textarea>
      </div>

      <div style="display: flex; gap: 10px; justify-content: space-between;">
        <button type="button" class="btn-admin-action btn-admin-primary" onclick="window.saveSubmissionUpdates('${survey.id}')">
          حفظ التعديلات ✓
        </button>
        <button type="button" class="btn-admin-action btn-admin-danger" onclick="window.deleteSubmissionItem('${survey.id}')">
          حذف التقييم 🗑️
        </button>
      </div>
    `;

    drawer.classList.add('open');
  };

  // Save changes from drawer
  window.saveSubmissionUpdates = async function(surveyId) {
    const status = document.getElementById('detail-status').value;
    const adminNotes = document.getElementById('detail-notes').value.trim();

    try {
      await apiFetch(`/api/surveys/${surveyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, adminNotes })
      });
      alert('تم حفظ الإجراء بنجاح ✓');
      document.getElementById('submission-drawer').classList.remove('open');
      await loadSubmissions();
    } catch (err) {
      alert('فشل حفظ التعديلات: ' + err.message);
    }
  };

  // Delete submission
  window.deleteSubmissionItem = async function(surveyId) {
    if (!confirm('هل أنت متأكد من حذف هذا التقييم نهائياً؟')) return;

    try {
      await apiFetch(`/api/surveys/${surveyId}`, { method: 'DELETE' });
      alert('تم حذف التقييم بنجاح.');
      document.getElementById('submission-drawer').classList.remove('open');
      await refreshCurrentView();
    } catch (err) {
      alert('فشل الحذف: ' + err.message);
    }
  };

  // Render Branches List Tab
  function renderBranchesList() {
    const container = document.getElementById('branches-list-container');
    if (!container) return;

    container.innerHTML = state.branches.map(b => `
      <div class="kpi-card" style="margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
        <div>
          <h4 style="font-size: 1.15rem; font-weight: 800; color: var(--admin-primary); margin-bottom: 4px;">${b.name}</h4>
          <p style="font-size: 0.85rem; color: var(--admin-text-muted);">${b.city} • ${b.address || 'العنوان الرئيسي'}</p>
          <div style="margin-top: 6px; font-size: 0.82rem; font-weight: 700; color: #16a34a; display: flex; align-items: center; gap: 4px;">
            <span>📱 واتساب الإشعار المعتمد:</span>
            <code style="background: #dcfce7; padding: 2px 6px; border-radius: 4px; color: #15803d; direction: ltr;">${b.whatsappDisplay || b.whatsappNumber || (b.id === 'branch-1' ? '00966567833138' : '+966 54 873 1474')}</code>
          </div>
        </div>
        <div style="display: flex; gap: 16px; align-items: center;">
          <div style="text-align: center;">
            <div style="font-size: 1.25rem; font-weight: 900; color: var(--admin-accent);">${b.averageRating || 0} ★</div>
            <div style="font-size: 0.78rem; color: var(--admin-text-light);">متوسط الرضا</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 1.25rem; font-weight: 900; color: var(--admin-primary);">${b.responsesCount || 0}</div>
            <div style="font-size: 0.78rem; color: var(--admin-text-light);">مشاركة</div>
          </div>
        </div>
      </div>
    `).join('');

    // Setup Add Branch Form
    const addBranchForm = document.getElementById('form-add-branch');
    if (addBranchForm && !addBranchForm.dataset.initialized) {
      addBranchForm.dataset.initialized = 'true';
      addBranchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('new-branch-name').value.trim();
        const city = document.getElementById('new-branch-city').value.trim();
        const address = document.getElementById('new-branch-address').value.trim();
        const whatsappNumber = (document.getElementById('new-branch-whatsapp')?.value || '').trim();

        if (!name) return alert('يرجى كتابة اسم الفرع');

        try {
          await apiFetch('/api/branches', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, city, address, whatsappNumber })
          });
          alert('تمت إضافة الفرع بنجاح ✓');
          addBranchForm.reset();
          await loadBranches();
        } catch (err) {
          alert('فشل إضافة الفرع: ' + err.message);
        }
      });
    }
  }

  // Load Questions Editor Tab
  async function loadQuestions() {
    try {
      const res = await apiFetch('/api/questions');
      state.questions = res.data;
      renderQuestionsEditor();
    } catch (err) {
      console.error('Error loading questions config:', err);
    }
  }

  function renderQuestionsEditor() {
    const container = document.getElementById('questions-editor-container');
    if (!container) return;

    container.innerHTML = state.questions.map((sec, secIndex) => `
      <div class="admin-form-card" style="margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid var(--admin-border); padding-bottom: 8px;">
          <h4 style="font-size: 1.15rem; font-weight: 800; color: var(--admin-primary);">
            القسم ${secIndex + 1}: ${sec.title}
          </h4>
          <span style="font-size: 0.8rem; background: var(--admin-accent-subtle); padding: 4px 10px; border-radius: 4px; font-weight: 700;">
            ${sec.skippable ? 'قابل للتخطي الشرطي' : 'إلزامي للجميع'}
          </span>
        </div>
        <p style="font-size: 0.88rem; color: var(--admin-text-muted); margin-bottom: 14px;">${sec.description}</p>

        <div style="display: flex; flex-direction: column; gap: 10px;">
          ${sec.questions.map(q => `
            <div style="background: #faf7f2; border: 1px solid #ebdcd0; border-radius: 6px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center;">
              <div>
                <strong style="font-size: 0.9rem; color: var(--admin-primary);">${q.label}</strong>
                <div style="font-size: 0.78rem; color: var(--admin-text-muted);">المعرف: <code>${q.id}</code> • النوع: ${q.type} • ${q.required ? 'مطلوب إجباري' : 'اختياري'}</div>
              </div>
              <button class="btn-admin-action" onclick="window.editQuestionPrompt('${sec.id}', '${q.id}')" style="padding: 4px 10px; font-size: 0.78rem;">
                تعديل الصياغة ✏️
              </button>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');
  }

  // Edit question prompt text
  window.editQuestionPrompt = function(sectionId, questionId) {
    const sec = state.questions.find(s => s.id === sectionId);
    if (!sec) return;
    const q = sec.questions.find(item => item.id === questionId);
    if (!q) return;

    const newLabel = prompt('تعديل نص السؤال في الاستبيان:', q.label);
    if (newLabel && newLabel.trim()) {
      q.label = newLabel.trim();
      saveQuestionsConfig();
    }
  };

  async function saveQuestionsConfig() {
    try {
      await apiFetch('/api/questions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: state.questions })
      });
      alert('تم حفظ تخصيص الأسئلة بنجاح ✓');
      renderQuestionsEditor();
    } catch (err) {
      alert('فشل حفظ الأسئلة: ' + err.message);
    }
  }

  // QR Modal for Admin
  function openAdminQrModal() {
    const modal = document.getElementById('admin-qr-modal');
    if (!modal) return;

    const qrBranchSelect = document.getElementById('qr-branch-select');
    const qrTableNumberInput = document.getElementById('qr-table-number');
    const qrContainer = document.getElementById('admin-qr-canvas');
    const qrTitle = document.getElementById('admin-qr-title');

    function updateQR() {
      const branchId = qrBranchSelect.value;
      const branch = state.branches.find(b => b.id === branchId) || state.branches[0];
      const tableNum = qrTableNumberInput.value.trim();

      if (qrTitle && branch) {
        qrTitle.textContent = `${branch.name} ${tableNum ? `- طاولة رقم (${tableNum})` : ''}`;
      }

      if (qrContainer && window.QRCode) {
        qrContainer.innerHTML = '';
        let targetUrl = window.location.origin + `/?branch=${branchId}`;
        if (tableNum) targetUrl += `&table=${tableNum}`;

        new QRCode(qrContainer, {
          text: targetUrl,
          width: 180,
          height: 180,
          colorDark: '#1e1511',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.H
        });
      }
    }

    qrBranchSelect.onchange = updateQR;
    qrTableNumberInput.oninput = updateQR;
    updateQR();

    modal.classList.add('open');

    const btnClose = document.getElementById('btn-close-admin-qr');
    if (btnClose) {
      btnClose.onclick = () => modal.classList.remove('open');
    }
    modal.onclick = (e) => {
      if (e.target === modal) modal.classList.remove('open');
    };

    const btnPrint = document.getElementById('btn-print-admin-qr');
    if (btnPrint) {
      btnPrint.onclick = () => window.print();
    }
  }

  // --- Admin Profile & Security Operations ---
  async function loadAdminProfile() {
    const alertBox = document.getElementById('profile-alert');
    if (alertBox) alertBox.style.display = 'none';

    try {
      const res = await apiFetch('/api/auth/profile');
      if (res && res.data) {
        const u = res.data;
        const elUsername = document.getElementById('prof-username');
        const elEmail = document.getElementById('prof-email');
        const elName = document.getElementById('prof-name');

        if (elUsername) elUsername.value = u.username || '';
        if (elEmail) elEmail.value = u.email || '';
        if (elName) elName.value = u.name || '';
      }
    } catch (err) {
      console.warn('Could not load profile from API, falling back to local user:', err.message);
      if (state.user) {
        const elUsername = document.getElementById('prof-username');
        const elEmail = document.getElementById('prof-email');
        const elName = document.getElementById('prof-name');
        if (elUsername && state.user.username) elUsername.value = state.user.username;
        if (elEmail && state.user.email) elEmail.value = state.user.email;
        if (elName && state.user.name) elName.value = state.user.name;
      }
    }
  }

  function setupProfileEvents() {
    const btnAdminProfile = document.getElementById('btn-admin-profile');
    if (btnAdminProfile) {
      btnAdminProfile.addEventListener('click', () => {
        switchTab('tab-profile');
      });
    }

    const form = document.getElementById('profile-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const alertBox = document.getElementById('profile-alert');
      const spinner = document.getElementById('profile-saving-spinner');
      const btnSubmit = document.getElementById('btn-save-profile');

      const username = (document.getElementById('prof-username')?.value || '').trim();
      const email = (document.getElementById('prof-email')?.value || '').trim();
      const name = (document.getElementById('prof-name')?.value || '').trim();
      const newPassword = document.getElementById('prof-new-password')?.value || '';
      const confirmPassword = document.getElementById('prof-confirm-password')?.value || '';
      const currentPassword = document.getElementById('prof-current-password')?.value || '';

      function showAlert(msg, isSuccess) {
        if (!alertBox) return;
        alertBox.style.display = 'block';
        alertBox.style.background = isSuccess ? '#dcfce7' : '#fee2e2';
        alertBox.style.border = `1.5px solid ${isSuccess ? '#86efac' : '#fca5a5'}`;
        alertBox.style.color = isSuccess ? '#166534' : '#991b1b';
        alertBox.textContent = msg;
      }

      if (!currentPassword) {
        showAlert('⚠️ يرجى إدخال كلمة المرور الحالية لتأكيد حفظ التعديلات', false);
        return;
      }

      if (newPassword) {
        if (newPassword.length < 6) {
          showAlert('⚠️ كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف', false);
          return;
        }
        if (newPassword !== confirmPassword) {
          showAlert('⚠️ كلمة المرور الجديدة وتأكيد كلمة المرور غير متطابقتين', false);
          return;
        }
      }

      try {
        if (spinner) spinner.style.display = 'inline-block';
        if (btnSubmit) btnSubmit.disabled = true;
        if (alertBox) alertBox.style.display = 'none';

        const payload = {
          currentPassword,
          username,
          email,
          name
        };
        if (newPassword) {
          payload.newPassword = newPassword;
        }

        const res = await apiFetch('/api/auth/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        showAlert(res.message || 'تم تحديث بيانات الحساب والأمان بنجاح ✓', true);

        // Update local storage and app state with refreshed JWT and details
        if (res.data) {
          if (res.data.token) {
            localStorage.setItem('aroma_admin_token', res.data.token);
          }
          if (res.data.admin) {
            state.user = res.data.admin;
            localStorage.setItem('aroma_admin_user', JSON.stringify(res.data.admin));
            const elName = document.getElementById('admin-display-name');
            if (elName && res.data.admin.name) {
              elName.textContent = res.data.admin.name;
            }
          }
        }

        // Reset password fields
        const elNewPass = document.getElementById('prof-new-password');
        const elConfirmPass = document.getElementById('prof-confirm-password');
        const elCurPass = document.getElementById('prof-current-password');
        if (elNewPass) elNewPass.value = '';
        if (elConfirmPass) elConfirmPass.value = '';
        if (elCurPass) elCurPass.value = '';
      } catch (err) {
        showAlert(err.message || 'حدث خطأ أثناء حفظ التعديلات', false);
      } finally {
        if (spinner) spinner.style.display = 'none';
        if (btnSubmit) btnSubmit.disabled = false;
      }
    });
  }

  window.addEventListener('DOMContentLoaded', init);
})();
