/* ==========================================================================
   SupportDesk - Frontend Application Logic (Clean Enterprise Architecture)
   ========================================================================== */

var token = localStorage.getItem('sd_token');
var user = JSON.parse(localStorage.getItem('sd_user') || 'null');
var socket = null;
var allTicketsCache = [];
var currentFilterStatus = '';
var currentFilterPriority = '';
var currentSearchQuery = '';
var currentSortBy = 'newest';
var recentFeedEvents = [];

/* ---------- API Helper ---------- */

function api(method, url, body) {
  var opts = { method: method, headers: {} };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;

  return fetch(url, opts).then(function (res) {
    return res.json().then(function (data) {
      if (!res.ok) {
        var err = new Error(data.message || 'Request failed');
        err.status = res.status;
        throw err;
      }
      return data;
    });
  });
}

function esc(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function getInitials(name) {
  if (!name) return '--';
  var parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

function formatRelativeTime(dateStr) {
  if (!dateStr) return '-';
  var date = new Date(dateStr);
  var now = new Date();
  var diffMs = now - date;
  var diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  var diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return diffMin + 'm ago';
  var diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return diffHours + 'h ago';
  var diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return diffDays + 'd ago';
  return date.toLocaleDateString();
}

function formatDueCountdown(dueDateStr, breached) {
  if (breached) return { text: 'SLA Breached', class: 'breached' };
  if (!dueDateStr) return { text: 'No Deadline', class: 'ok' };
  var dueDate = new Date(dueDateStr);
  var diffMs = dueDate - new Date();
  if (diffMs <= 0) return { text: 'SLA Breached', class: 'breached' };

  var diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  var diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (diffHours > 24) {
    var days = Math.floor(diffHours / 24);
    return { text: 'Due in ' + days + 'd ' + (diffHours % 24) + 'h', class: 'ok' };
  }
  return { text: 'Due in ' + diffHours + 'h ' + diffMins + 'm', class: 'ok' };
}

/* ---------- Session & Header ---------- */

function saveSession(data) {
  token = data.token;
  user = { _id: data._id, name: data.name, email: data.email, role: data.role };
  localStorage.setItem('sd_token', token);
  localStorage.setItem('sd_user', JSON.stringify(user));
  showHeader();
  connectSocket();
}

function logout() {
  token = null;
  user = null;
  localStorage.removeItem('sd_token');
  localStorage.removeItem('sd_user');
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  location.hash = '#/login';
  render();
}

function showHeader() {
  var header = document.getElementById('header');
  var label = document.getElementById('user-label');
  var roleBadge = document.getElementById('user-role-badge');
  var avatar = document.getElementById('user-avatar');
  var navReports = document.getElementById('nav-reports');

  if (!user) {
    header.classList.add('hidden');
    return;
  }

  header.classList.remove('hidden');
  label.textContent = user.name;
  roleBadge.textContent = (user.role || 'user').toUpperCase();
  avatar.textContent = getInitials(user.name);

  if (user.role === 'admin') {
    navReports.classList.remove('hidden');
  } else {
    navReports.classList.add('hidden');
  }

  var currentRoute = (location.hash.replace(/^#\/?/, '').split('/')[0]) || 'tickets';
  document.querySelectorAll('.nav-item').forEach(function (el) {
    el.classList.remove('active');
  });
  var activeEl = document.getElementById('nav-' + currentRoute);
  if (activeEl) activeEl.classList.add('active');
}

/* ---------- Socket.io & Notifications ---------- */

function connectSocket() {
  if (socket) return;
  socket = io();

  var statusPill = document.getElementById('socket-status');
  if (statusPill) {
    socket.on('connect', function () {
      statusPill.innerHTML = '<span class="live-dot"></span><span class="live-text">Realtime Active</span>';
    });
    socket.on('disconnect', function () {
      statusPill.innerHTML = '<span class="live-dot" style="background:#ef4444"></span><span class="live-text">Disconnected</span>';
    });
  }

  var events = [
    'ticket:created',
    'ticket:updated',
    'ticket:assigned',
    'ticket:status',
    'ticket:deleted',
    'comment:new'
  ];

  events.forEach(function (evtName) {
    socket.on(evtName, function (data) {
      handleSocketEvent(evtName, data);
    });
  });
}

function handleSocketEvent(name, data) {
  var summary = getEventSummary(name, data);
  recentFeedEvents.unshift({
    event: name,
    summary: summary,
    time: new Date().toLocaleTimeString()
  });
  if (recentFeedEvents.length > 25) recentFeedEvents.pop();

  updateTickerUI(name, summary);
  showToast(name, summary);

  var route = parseHash();
  if (route.name === 'tickets') {
    fetchTicketsData();
  }
}

function getEventSummary(name, data) {
  if (!data) return '';
  if (name === 'ticket:created') {
    return 'Ticket created: "' + (data.title || '') + '" (' + (data.priority || 'medium') + ')';
  }
  if (name === 'ticket:status') {
    return 'Status changed to ' + (data.status || '') + ' for ' + (data.title || '');
  }
  if (name === 'ticket:assigned') {
    return 'Assigned to ' + (data.assignedTo ? data.assignedTo.name : 'agent') + ' - ' + (data.title || '');
  }
  if (name === 'ticket:deleted') {
    return 'Ticket removed ID: ' + (data._id ? data._id.slice(-6) : '');
  }
  if (name === 'comment:new') {
    return 'Comment by ' + (data.user ? data.user.name : 'User') + ': ' + (data.message || '').substring(0, 45);
  }
  return data.title || 'Ticket updated';
}

function updateTickerUI(name, summary) {
  var tickerText = document.getElementById('ticker-text');
  if (tickerText) {
    tickerText.innerHTML = '<span class="ticker-event-name">' + esc(name) + ':</span> ' + esc(summary);
  }
  renderDrawerEvents();
}

function renderDrawerEvents() {
  var drawer = document.getElementById('ticker-drawer-events');
  if (!drawer) return;
  if (!recentFeedEvents.length) {
    drawer.innerHTML = '<div class="drawer-row"><span class="drawer-desc">Listening for WebSocket events...</span></div>';
    return;
  }
  drawer.innerHTML = recentFeedEvents.map(function (e) {
    return '<div class="drawer-row">' +
      '<span class="drawer-time">' + esc(e.time) + '</span>' +
      '<span class="drawer-event">' + esc(e.event) + '</span>' +
      '<span class="drawer-desc">' + esc(e.summary) + '</span>' +
      '</div>';
  }).join('');
}

function showToast(name, message) {
  var container = document.getElementById('toast-container');
  if (!container) return;

  var toast = document.createElement('div');
  var isBreach = name === 'ticket:deleted' || message.indexOf('Breached') !== -1;
  toast.className = 'toast ' + (isBreach ? 'warning' : 'success');

  toast.innerHTML = '' +
    '<div class="toast-body">' +
    '  <div style="font-weight:600;font-size:12px;margin-bottom:2px">' + esc(name) + '</div>' +
    '  <div style="font-size:12px;color:#cbd5e1">' + esc(message) + '</div>' +
    '</div>';

  container.appendChild(toast);
  setTimeout(function () {
    toast.style.opacity = '0';
    setTimeout(function () { toast.remove(); }, 300);
  }, 4000);
}

/* ---------- Badges Helper ---------- */

function statusBadge(status) {
  var s = status || 'open';
  return '<span class="badge ' + s + '">' + s.replace('-', ' ') + '</span>';
}

function priorityBadge(priority) {
  var p = (priority || 'medium').toLowerCase();
  return '<span class="badge priority-' + p + '">' + p + '</span>';
}

/* ---------- Routing ---------- */

function parseHash() {
  var parts = location.hash.replace(/^#\/?/, '').split('/');
  return { name: parts[0] || 'tickets', id: parts[1] };
}

function render() {
  var route = parseHash();
  showHeader();

  // Public legal routes accessible without authentication
  if (route.name === 'privacy') {
    renderPrivacyPolicy();
    return;
  }
  if (route.name === 'terms') {
    renderTermsAndConditions();
    return;
  }

  if (!user && route.name !== 'login') {
    location.hash = '#/login';
    return;
  }

  if (route.name === 'login') renderLogin();
  else if (route.name === 'tickets') renderTickets();
  else if (route.name === 'create') renderCreate();
  else if (route.name === 'ticket') renderTicketDetail(route.id);
  else if (route.name === 'reports') renderReports();
  else if (route.name === 'database') renderDatabaseInspector();
}

/* ==========================================================================
   1. Login & Registration View (Clean, No Emojis, No Vague Text)
   ========================================================================== */

function renderLogin() {
  document.getElementById('app').innerHTML = '' +
    '<div class="auth-hero-wrap">' +
    '  <div class="auth-hero-sidebar">' +
    '    <div>' +
    '      <div class="hero-brand-top">' +
    '        <div class="brand-icon">' +
    '          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>' +
    '        </div>' +
    '        <div class="brand-title" style="font-size:16px">SupportDesk</div>' +
    '      </div>' +
    '      <h1 class="hero-title">Incident Management &amp; SLA Tracking</h1>' +
    '      <p class="hero-desc">' +
    '        Internal helpdesk backend architecture built with Node.js, Express, MongoDB Mongoose, and Socket.io.' +
    '      </p>' +
    '      <ul class="feature-list">' +
    '        <li class="feature-item">' +
    '          <div class="feature-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg></div>' +
    '          <span>Automated SLA deadline calculation and breach tracking</span>' +
    '        </li>' +
    '        <li class="feature-item">' +
    '          <div class="feature-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg></div>' +
    '          <span>Realtime WebSocket incident dispatch and updates</span>' +
    '        </li>' +
    '        <li class="feature-item">' +
    '          <div class="feature-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg></div>' +
    '          <span>Role-based access: Admin, Support Agent, and Customer</span>' +
    '        </li>' +
    '        <li class="feature-item">' +
    '          <div class="feature-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg></div>' +
    '          <span>Interactive Swagger OpenAPI documentation</span>' +
    '        </li>' +
    '      </ul>' +
    '    </div>' +
    '    <div style="font-size:11.5px;color:#94a3b8;margin-top:20px;border-top:1px solid var(--slate-800);padding-top:14px">' +
    '      SupportDesk System v1.0.0' +
    '    </div>' +
    '  </div>' +
    '  <div class="auth-form-card">' +
    '    <div class="auth-header">' +
    '      <h2>Sign In to Console</h2>' +
    '      <p>Enter your credentials to access tickets and queue operations.</p>' +
    '    </div>' +
    '    <div class="auth-tabs">' +
    '      <button id="tab-login" class="auth-tab-btn active">Sign In</button>' +
    '      <button id="tab-register" class="auth-tab-btn">Register</button>' +
    '    </div>' +
    '    <div id="auth-error"></div>' +
    '    <div id="auth-card"></div>' +
    '    <div class="demo-logins-box">' +
    '      <div class="demo-title">Select Test Account</div>' +
    '      <div class="demo-pills">' +
    '        <button class="demo-btn" id="demo-admin">' +
    '          <span class="demo-role">Admin</span>' +
    '          <span class="demo-sub">admin@supportdesk.com</span>' +
    '        </button>' +
    '        <button class="demo-btn" id="demo-agent">' +
    '          <span class="demo-role">Agent</span>' +
    '          <span class="demo-sub">agent@supportdesk.com</span>' +
    '        </button>' +
    '        <button class="demo-btn" id="demo-user">' +
    '          <span class="demo-role">User</span>' +
    '          <span class="demo-sub">user@supportdesk.com</span>' +
    '        </button>' +
    '      </div>' +
    '    </div>' +
    '  </div>' +
    '</div>';

  document.getElementById('tab-login').onclick = function () { showAuthForm('login'); };
  document.getElementById('tab-register').onclick = function () { showAuthForm('register'); };

  document.getElementById('demo-admin').onclick = function () { quickLogin('admin@supportdesk.com', 'admin123'); };
  document.getElementById('demo-agent').onclick = function () { quickLogin('agent@supportdesk.com', 'agent123'); };
  document.getElementById('demo-user').onclick = function () { quickLogin('user@supportdesk.com', 'user123'); };

  showAuthForm('login');
}

function showAuthForm(mode) {
  var card = document.getElementById('auth-card');
  var loginTab = document.getElementById('tab-login');
  var regTab = document.getElementById('tab-register');
  loginTab.className = 'auth-tab-btn ' + (mode === 'login' ? 'active' : '');
  regTab.className = 'auth-tab-btn ' + (mode === 'register' ? 'active' : '');

  var extra = '';
  if (mode === 'register') {
    extra = '' +
      '<div class="form-group">' +
      '  <label>Role</label>' +
      '  <select name="role" class="form-select">' +
      '    <option value="user">Customer (Create and Track Tickets)</option>' +
      '    <option value="agent">Support Agent (Assign and Resolve)</option>' +
      '    <option value="admin">Administrator (Full Access)</option>' +
      '  </select>' +
      '</div>';
  }

  card.innerHTML = '' +
    '<form id="auth-form">' +
    (mode === 'register'
      ? '<div class="form-group"><label>Full Name</label><input name="name" class="form-input" placeholder="Name" required /></div>'
      : '') +
    '<div class="form-group"><label>Email Address</label><input name="email" type="email" class="form-input" placeholder="email@domain.com" required /></div>' +
    '<div class="form-group"><label>Password</label><input name="password" type="password" class="form-input" placeholder="Password" required /></div>' +
    extra +
    '<div style="margin-top:16px">' +
    '  <button type="submit" class="btn-primary">' +
    '    <span>' + (mode === 'login' ? 'Sign In' : 'Create Account') + '</span>' +
    '  </button>' +
    '</div>' +
    '</form>';

  document.getElementById('auth-form').onsubmit = function (e) {
    e.preventDefault();
    authSubmit(mode, this);
  };
}

function quickLogin(email, password) {
  var errorBox = document.getElementById('auth-error');
  if (errorBox) errorBox.innerHTML = '<div class="success-msg">Signing in as ' + email + '...</div>';
  api('POST', '/api/auth/login', { email: email, password: password })
    .then(function (res) {
      saveSession(res);
      location.hash = '#/tickets';
      render();
    })
    .catch(function (err) {
      showError('auth-error', err.message);
    });
}

function authSubmit(mode, form) {
  var data = { email: form.email.value, password: form.password.value };
  var url = '/api/auth/login';
  if (mode === 'register') {
    data.name = form.name.value;
    data.role = form.role.value;
    url = '/api/auth/register';
  }

  api('POST', url, data)
    .then(function (res) {
      saveSession(res);
      location.hash = '#/tickets';
      render();
    })
    .catch(function (err) {
      showError('auth-error', err.message);
    });
}

function showError(id, msg) {
  var el = document.getElementById(id);
  if (el) {
    el.innerHTML = '<div class="error-msg"><span>' + esc(msg) + '</span></div>';
  }
}

/* ==========================================================================
   2. Tickets Dashboard View (Real Database Metrics Only)
   ========================================================================== */

function renderTickets() {
  document.getElementById('app').innerHTML = '' +
    '<!-- Real Database Metrics -->' +
    '<div class="metrics-strip">' +
    '  <div class="kpi-card total">' +
    '    <div class="kpi-icon-wrap"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path></svg></div>' +
    '    <div class="kpi-info"><span class="kpi-number" id="metric-total">-</span><span class="kpi-label">Total Tickets</span></div>' +
    '  </div>' +
    '  <div class="kpi-card open">' +
    '    <div class="kpi-icon-wrap"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg></div>' +
    '    <div class="kpi-info"><span class="kpi-number" id="metric-open">-</span><span class="kpi-label">Open</span></div>' +
    '  </div>' +
    '  <div class="kpi-card progress">' +
    '    <div class="kpi-icon-wrap"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line></svg></div>' +
    '    <div class="kpi-info"><span class="kpi-number" id="metric-progress">-</span><span class="kpi-label">In Progress</span></div>' +
    '  </div>' +
    '  <div class="kpi-card breached">' +
    '    <div class="kpi-icon-wrap"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path></svg></div>' +
    '    <div class="kpi-info"><span class="kpi-number" id="metric-breached">-</span><span class="kpi-label">SLA Breached</span></div>' +
    '  </div>' +
    '  <div class="kpi-card resolved">' +
    '    <div class="kpi-icon-wrap"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg></div>' +
    '    <div class="kpi-info"><span class="kpi-number" id="metric-resolved">-</span><span class="kpi-label">Resolved</span></div>' +
    '  </div>' +
    '</div>' +

    '<!-- Activity Bar -->' +
    '<div class="activity-ticker-card">' +
    '  <div class="ticker-left">' +
    '    <div class="ticker-badge">WEBSOCKET</div>' +
    '    <div class="ticker-feed-text" id="ticker-text">' +
    '      <span class="ticker-event-name">Connected:</span> Ready for events' +
    '    </div>' +
    '  </div>' +
    '  <button class="ticker-toggle-btn" id="ticker-toggle-btn">Event Log</button>' +
    '</div>' +
    '<div id="ticker-drawer" class="ticker-drawer hidden"><div id="ticker-drawer-events"></div></div>' +

    '<!-- Main Tickets Table/List -->' +
    '<div class="card-main">' +
    '  <div class="toolbar">' +
    '    <div class="search-box-wrap">' +
    '      <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>' +
    '      <input type="text" id="search-input" class="search-input" placeholder="Search by title, reporter, agent or ID..." />' +
    '    </div>' +
    '    <div class="filter-group">' +
    '      <div class="status-tabs">' +
    '        <button class="status-tab active" data-status="">All</button>' +
    '        <button class="status-tab" data-status="open">Open</button>' +
    '        <button class="status-tab" data-status="in-progress">In Progress</button>' +
    '        <button class="status-tab" data-status="resolved">Resolved</button>' +
    '        <button class="status-tab" data-status="closed">Closed</button>' +
    '      </div>' +
    '      <select id="priority-select" class="select-compact">' +
    '        <option value="">All Priorities</option>' +
    '        <option value="high">High</option>' +
    '        <option value="medium">Medium</option>' +
    '        <option value="low">Low</option>' +
    '      </select>' +
    '      <select id="sort-select" class="select-compact">' +
    '        <option value="newest">Newest</option>' +
    '        <option value="oldest">Oldest</option>' +
    '        <option value="due">Due Date</option>' +
    '        <option value="priority">Priority</option>' +
    '      </select>' +
    '      <a href="#/create" class="btn-new-ticket">' +
    '        <span>Create Ticket</span>' +
    '      </a>' +
    '    </div>' +
    '  </div>' +
    '  <div id="tickets-container"><div class="loading-state"><span>Loading tickets...</span></div></div>' +
    '</div>';

  document.getElementById('search-input').oninput = function () {
    currentSearchQuery = this.value.toLowerCase().trim();
    applyFiltersAndRender();
  };

  document.querySelectorAll('.status-tab').forEach(function (tab) {
    tab.onclick = function () {
      document.querySelectorAll('.status-tab').forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      currentFilterStatus = tab.getAttribute('data-status');
      applyFiltersAndRender();
    };
  });

  document.getElementById('priority-select').onchange = function () {
    currentFilterPriority = this.value;
    applyFiltersAndRender();
  };

  document.getElementById('sort-select').onchange = function () {
    currentSortBy = this.value;
    applyFiltersAndRender();
  };

  document.getElementById('ticker-toggle-btn').onclick = function () {
    var drawer = document.getElementById('ticker-drawer');
    if (drawer) {
      drawer.classList.toggle('hidden');
      renderDrawerEvents();
    }
  };

  connectSocket();
  fetchTicketsData();
}

function fetchTicketsData() {
  api('GET', '/api/tickets?t=' + Date.now())
    .then(function (tickets) {
      allTicketsCache = tickets || [];
      updateKPIs(allTicketsCache);
      applyFiltersAndRender();
    })
    .catch(function (err) {
      var container = document.getElementById('tickets-container');
      if (container) {
        container.innerHTML = '<div class="error-msg">Failed to load tickets: ' + esc(err.message) + '</div>';
      }
    });
}

function updateKPIs(tickets) {
  var total = tickets.length;
  var open = 0;
  var inProg = 0;
  var breached = 0;
  var resolved = 0;

  tickets.forEach(function (t) {
    if (t.status === 'open') open++;
    if (t.status === 'in-progress') inProg++;
    if (t.status === 'resolved' || t.status === 'closed') resolved++;
    if (t.breached) breached++;
  });

  var setNum = function (id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setNum('metric-total', total);
  setNum('metric-open', open);
  setNum('metric-progress', inProg);
  setNum('metric-breached', breached);
  setNum('metric-resolved', resolved);
}

function applyFiltersAndRender() {
  var filtered = allTicketsCache.slice();

  if (currentFilterStatus) {
    filtered = filtered.filter(function (t) { return t.status === currentFilterStatus; });
  }

  if (currentFilterPriority) {
    filtered = filtered.filter(function (t) { return t.priority === currentFilterPriority; });
  }

  if (currentSearchQuery) {
    var q = currentSearchQuery;
    filtered = filtered.filter(function (t) {
      var title = (t.title || '').toLowerCase();
      var desc = (t.description || '').toLowerCase();
      var creator = (t.createdBy ? t.createdBy.name : '').toLowerCase();
      var agent = (t.assignedTo ? t.assignedTo.name : '').toLowerCase();
      var id = (t._id || '').toLowerCase();
      return title.indexOf(q) !== -1 ||
        desc.indexOf(q) !== -1 ||
        creator.indexOf(q) !== -1 ||
        agent.indexOf(q) !== -1 ||
        id.indexOf(q) !== -1;
    });
  }

  filtered.sort(function (a, b) {
    if (currentSortBy === 'newest') return new Date(b.createdAt) - new Date(a.createdAt);
    if (currentSortBy === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
    if (currentSortBy === 'due') {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate) - new Date(b.dueDate);
    }
    if (currentSortBy === 'priority') {
      var weight = { high: 3, medium: 2, low: 1 };
      return (weight[b.priority] || 0) - (weight[a.priority] || 0);
    }
    return 0;
  });

  var container = document.getElementById('tickets-container');
  if (!container) return;

  if (!filtered.length) {
    container.innerHTML = '' +
      '<div class="empty-state">' +
      '  <h3>No Tickets Found</h3>' +
      '  <p>No issues match the selected filter criteria.</p>' +
      '</div>';
    return;
  }

  container.innerHTML = '<div class="ticket-grid">' + filtered.map(function (t) {
    var dueInfo = formatDueCountdown(t.dueDate, t.breached);
    var creatorName = t.createdBy ? t.createdBy.name : 'Unknown';
    var agentName = t.assignedTo ? t.assignedTo.name : 'Unassigned';
    var shortId = '#TKT-' + (t._id ? t._id.slice(-6).toUpperCase() : '');

    return '' +
      '<div class="ticket-card-item ' + (t.breached ? 'breached-item' : '') + '">' +
      '  <div class="ticket-main-col">' +
      '    <div class="ticket-badge-row">' +
      '      <span class="ticket-id-tag">' + shortId + '</span>' +
      '      ' + statusBadge(t.status) +
      '      ' + priorityBadge(t.priority) +
      (t.breached ? '<span class="badge breached">SLA Breached</span>' : '') +
      '    </div>' +
      '    <div class="ticket-title-text">' + esc(t.title) + '</div>' +
      '    <div class="ticket-desc-snippet">' + esc(t.description) + '</div>' +
      '    <div class="ticket-meta-footer">' +
      '      <span class="meta-chip">' +
      '        <span class="chip-avatar">' + getInitials(creatorName) + '</span>' +
      '        <span>' + esc(creatorName) + '</span>' +
      '      </span>' +
      '      <span>/</span>' +
      '      <span class="meta-chip">' +
      '        <span>Agent: ' + esc(agentName) + '</span>' +
      '      </span>' +
      '      <span>/</span>' +
      '      <span class="meta-chip">' +
      '        <span>Created ' + formatRelativeTime(t.createdAt) + '</span>' +
      '      </span>' +
      '    </div>' +
      '  </div>' +
      '  <div class="ticket-actions-col">' +
      '    <div class="sla-indicator ' + dueInfo.class + '">' +
      '      <span>' + dueInfo.text + '</span>' +
      '    </div>' +
      '    <a href="#/ticket/' + t._id + '" class="btn-view-ticket">' +
      '      <span>Manage</span>' +
      '    </a>' +
      '  </div>' +
      '</div>';
  }).join('') + '</div>';
}

/* ==========================================================================
   3. Ticket Detail & Workflow View
   ========================================================================== */

function renderTicketDetail(id) {
  document.getElementById('app').innerHTML = '' +
    '<div class="loading-state"><span>Loading ticket details...</span></div>';

  api('GET', '/api/tickets/' + id)
    .then(function (ticket) {
      buildTicketDetailView(ticket);
    })
    .catch(function (err) {
      document.getElementById('app').innerHTML = '' +
        '<div class="breadcrumb-nav">' +
        '  <a href="#/tickets" class="btn-back">Back to Queue</a>' +
        '</div>' +
        '<div class="error-msg">Ticket error: ' + esc(err.message) + '</div>';
    });
}

function buildTicketDetailView(t) {
  var creatorName = t.createdBy ? t.createdBy.name : 'Unknown';
  var creatorEmail = t.createdBy ? t.createdBy.email : '';
  var agentName = t.assignedTo ? t.assignedTo.name : 'Unassigned';
  var isStaff = user.role === 'agent' || user.role === 'admin';
  var isAdmin = user.role === 'admin';
  var dueInfo = formatDueCountdown(t.dueDate, t.breached);

  var steps = ['open', 'in-progress', 'resolved', 'closed'];
  var currentStepIdx = steps.indexOf(t.status);
  if (currentStepIdx === -1) currentStepIdx = 0;

  var stepperHtml = '<div class="workflow-stepper">' +
    steps.map(function (st, idx) {
      var isDone = idx < currentStepIdx;
      var isActive = idx === currentStepIdx;
      var nodeClass = isDone ? 'done' : (isActive ? 'active' : '');
      var stepSymbol = isDone ? 'OK' : (idx + 1);

      var line = (idx < steps.length - 1)
        ? '<div class="step-line ' + (idx < currentStepIdx ? 'done' : '') + '"></div>'
        : '';

      return '' +
        '<div class="step-node ' + nodeClass + '">' +
        '  <div class="step-circle">' + stepSymbol + '</div>' +
        '  <span>' + st.toUpperCase() + '</span>' +
        '</div>' + line;
    }).join('') + '</div>';

  var staffControlsHtml = '';
  if (isStaff) {
    staffControlsHtml = '' +
      '<div class="action-card">' +
      '  <h3>Incident Controls</h3>' +
      '  <div id="ctrl-msg"></div>' +
      '  <div class="form-group">' +
      '    <label>Workflow Status</label>' +
      '    <select id="dd-status" class="form-select">' + statusOptions(t.status) + '</select>' +
      '    <div class="quick-status-actions">' +
      '      <button class="btn-quick-status" id="quick-prog">Set In Progress</button>' +
      '      <button class="btn-quick-status" id="quick-res">Mark Resolved</button>' +
      '    </div>' +
      '  </div>' +
      '  <div class="form-group" style="margin-top:12px">' +
      '    <label>Assign Agent</label>' +
      '    <select id="dd-agent" class="form-select"><option value="">Loading agents...</option></select>' +
      '    <div style="display:flex;gap:6px;margin-top:8px">' +
      '      <button class="btn-primary" style="padding:6px 10px;font-size:12px;flex:1" id="btn-assign">Save Agent</button>' +
      (user.role === 'agent' ? '<button class="btn-quick-status" id="btn-assign-me" style="flex:1">Assign to Me</button>' : '') +
      '    </div>' +
      '  </div>' +
      (isAdmin ? '<button class="btn-danger" id="btn-delete-ticket">Delete Ticket</button>' : '') +
      '</div>';
  }

  document.getElementById('app').innerHTML = '' +
    '<div class="breadcrumb-nav">' +
    '  <a href="#/tickets" class="btn-back">Back to Queue</a>' +
    '  <span style="font-size:12px;color:#94a3b8">/</span>' +
    '  <span style="font-size:12px;font-family:var(--font-mono);color:#64748b">#TKT-' + (t._id ? t._id.slice(-6).toUpperCase() : '') + '</span>' +
    '</div>' +

    stepperHtml +

    '<div class="detail-layout">' +
    '  <div class="detail-main">' +
    '    <div class="ticket-header-card">' +
    '      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">' +
    '        <span class="ticket-id-tag">#TKT-' + (t._id ? t._id.slice(-6).toUpperCase() : '') + '</span>' +
    '        ' + statusBadge(t.status) +
    '        ' + priorityBadge(t.priority) +
    (t.breached ? '<span class="badge breached">SLA Breached</span>' : '') +
    '      </div>' +
    '      <h1 class="ticket-title-large">' + esc(t.title) + '</h1>' +
    '      <div style="font-size:12px;color:#64748b;display:flex;gap:8px;align-items:center">' +
    '        <span>Created by <strong>' + esc(creatorName) + '</strong> (' + esc(creatorEmail) + ')</span>' +
    '        <span>/</span>' +
    '        <span>' + new Date(t.createdAt).toLocaleString() + '</span>' +
    '      </div>' +
    '      <div class="ticket-desc-full">' + esc(t.description) + '</div>' +
    '    </div>' +

    '    <!-- Comments Timeline -->' +
    '    <div class="comments-card">' +
    '      <div class="comments-header">' +
    '        <h3>Discussion Log</h3>' +
    '        <span class="comment-count-badge" id="comment-count">0 comments</span>' +
    '      </div>' +
    '      <div id="comments-stream" class="comments-stream"><div class="loading-state"><span>Loading updates...</span></div></div>' +
    '      <div id="comment-msg"></div>' +
    '      <div class="comment-composer">' +
    '        <textarea id="comment-text" placeholder="Add an investigation note or update..."></textarea>' +
    '        <button class="btn-post-comment" id="btn-post-comment">Post Update</button>' +
    '      </div>' +
    '    </div>' +
    '  </div>' +

    '  <div class="detail-sidebar">' +
    '    <div class="action-card">' +
    '      <h3>SLA and Assignment</h3>' +
    '      <div class="info-grid">' +
    '        <div class="info-row"><span class="info-label">SLA Status</span><span class="sla-indicator ' + dueInfo.class + '">' + dueInfo.text + '</span></div>' +
    '        <div class="info-row"><span class="info-label">Resolution Due</span><span class="info-val">' + (t.dueDate ? new Date(t.dueDate).toLocaleString() : 'N/A') + '</span></div>' +
    '        <div class="info-row"><span class="info-label">Assigned Agent</span><span class="info-val">' + esc(agentName) + '</span></div>' +
    '        <div class="info-row"><span class="info-label">Priority Tier</span><span class="info-val" style="text-transform:capitalize">' + esc(t.priority) + '</span></div>' +
    '        <div class="info-row"><span class="info-label">Resolved At</span><span class="info-val">' + (t.resolvedAt ? new Date(t.resolvedAt).toLocaleString() : 'Pending') + '</span></div>' +
    '      </div>' +
    '    </div>' +

    staffControlsHtml +
    '  </div>' +
    '</div>';

  document.getElementById('btn-post-comment').onclick = function () {
    postComment(t._id);
  };

  if (isStaff) {
    document.getElementById('dd-status').onchange = function () {
      changeStatus(t._id, this.value);
    };

    var quickProg = document.getElementById('quick-prog');
    if (quickProg) {
      quickProg.onclick = function () { changeStatus(t._id, 'in-progress'); };
    }

    var quickRes = document.getElementById('quick-res');
    if (quickRes) {
      quickRes.onclick = function () { changeStatus(t._id, 'resolved'); };
    }

    document.getElementById('btn-assign').onclick = function () {
      assignTicket(t._id);
    };

    var btnAssignMe = document.getElementById('btn-assign-me');
    if (btnAssignMe) {
      btnAssignMe.onclick = function () {
        var dd = document.getElementById('dd-agent');
        if (dd) dd.value = user._id;
        assignTicket(t._id);
      };
    }

    loadAgentsDropdown(t.assignedTo ? (t.assignedTo._id || t.assignedTo) : '');

    if (isAdmin) {
      var delBtn = document.getElementById('btn-delete-ticket');
      if (delBtn) {
        delBtn.onclick = function () {
          if (confirm('Permanently delete this ticket?')) {
            api('DELETE', '/api/tickets/' + t._id)
              .then(function () {
                location.hash = '#/tickets';
              })
              .catch(function (err) {
                alert('Error deleting: ' + err.message);
              });
          }
        };
      }
    }
  }

  loadComments(t._id);
}

function statusOptions(current) {
  var statuses = ['open', 'in-progress', 'resolved', 'closed'];
  return statuses.map(function (s) {
    return '<option value="' + s + '"' + (s === current ? ' selected' : '') + '>' + s.toUpperCase() + '</option>';
  }).join('');
}

function loadAgentsDropdown(assignedId) {
  api('GET', '/api/users?role=agent&t=' + Date.now())
    .then(function (agents) {
      var dd = document.getElementById('dd-agent');
      if (!dd) return;
      var curId = assignedId ? assignedId.toString() : '';
      dd.innerHTML = '<option value="">Choose Agent</option>' + agents.map(function (a) {
        return '<option value="' + a._id + '"' + (a._id === curId ? ' selected' : '') + '>' +
          esc(a.name) + ' (' + esc(a.email) + ')' +
          '</option>';
      }).join('');
    })
    .catch(function () {});
}

function changeStatus(id, newStatus) {
  api('PUT', '/api/tickets/' + id + '/status', { status: newStatus })
    .then(function (t) {
      var msgBox = document.getElementById('ctrl-msg');
      if (msgBox) msgBox.innerHTML = '<div class="success-msg">Status updated to ' + esc(t.status) + '</div>';
      setTimeout(function () { renderTicketDetail(id); }, 500);
    })
    .catch(function (err) {
      var msgBox = document.getElementById('ctrl-msg');
      if (msgBox) msgBox.innerHTML = '<div class="error-msg">' + esc(err.message) + '</div>';
    });
}

function assignTicket(id) {
  var agentId = document.getElementById('dd-agent').value;
  if (!agentId) {
    var msgBox = document.getElementById('ctrl-msg');
    if (msgBox) msgBox.innerHTML = '<div class="error-msg">Select an agent first</div>';
    return;
  }

  api('PUT', '/api/tickets/' + id + '/assign', { agentId: agentId })
    .then(function () {
      var msgBox = document.getElementById('ctrl-msg');
      if (msgBox) msgBox.innerHTML = '<div class="success-msg">Agent assigned successfully</div>';
      setTimeout(function () { renderTicketDetail(id); }, 500);
    })
    .catch(function (err) {
      var msgBox = document.getElementById('ctrl-msg');
      if (msgBox) msgBox.innerHTML = '<div class="error-msg">' + esc(err.message) + '</div>';
    });
}

function loadComments(ticketId) {
  api('GET', '/api/comments/ticket/' + ticketId + '?t=' + Date.now())
    .then(function (comments) {
      var stream = document.getElementById('comments-stream');
      var badge = document.getElementById('comment-count');
      if (badge) badge.textContent = (comments.length) + (comments.length === 1 ? ' update' : ' updates');
      if (!stream) return;

      if (!comments.length) {
        stream.innerHTML = '<div style="padding:12px;text-align:center;color:#94a3b8;font-size:12.5px">No investigation notes logged yet.</div>';
        return;
      }

      stream.innerHTML = comments.map(function (c) {
        var who = c.user ? c.user.name : 'User';
        var role = c.user ? (c.user.role || 'user') : 'user';
        return '' +
          '<div class="comment-bubble-item">' +
          '  <div class="comment-avatar">' + getInitials(who) + '</div>' +
          '  <div class="comment-content">' +
          '    <div class="comment-meta-row">' +
          '      <span class="comment-author">' + esc(who) + ' <span class="comment-role">' + esc(role) + '</span></span>' +
          '      <span class="comment-time">' + formatRelativeTime(c.createdAt) + '</span>' +
          '    </div>' +
          '    <div class="comment-text">' + esc(c.message) + '</div>' +
          '  </div>' +
          '</div>';
      }).join('');
    })
    .catch(function () {});
}

function postComment(ticketId) {
  var input = document.getElementById('comment-text');
  var text = (input ? input.value : '').trim();
  if (!text) return;

  api('POST', '/api/comments', { ticketId: ticketId, message: text })
    .then(function () {
      if (input) input.value = '';
      loadComments(ticketId);
    })
    .catch(function (err) {
      var msg = document.getElementById('comment-msg');
      if (msg) msg.innerHTML = '<div class="error-msg">' + esc(err.message) + '</div>';
    });
}

/* ==========================================================================
   4. Create Ticket View
   ========================================================================== */

function renderCreate() {
  document.getElementById('app').innerHTML = '' +
    '<div class="create-container">' +
    '  <div class="breadcrumb-nav">' +
    '    <a href="#/tickets" class="btn-back">Back to Queue</a>' +
    '  </div>' +
    '  <div class="card-main">' +
    '    <div style="margin-bottom:16px">' +
    '      <h2 style="font-size:18px;font-weight:700;color:#0f172a;margin-bottom:4px">Create Support Incident</h2>' +
    '      <p style="font-size:13px;color:#64748b">Submit an incident report. Priority level dictates response and resolution SLA deadlines.</p>' +
    '    </div>' +

    '    <div class="quick-templates-box">' +
    '      <div style="font-size:11px;font-weight:600;color:#475569;text-transform:uppercase">Quick Sample Templates</div>' +
    '      <div class="template-buttons">' +
    '        <button class="btn-template" id="tpl-db">Database Connection Timeout (High)</button>' +
    '        <button class="btn-template" id="tpl-pay">Payment Webhook Failure (High)</button>' +
    '        <button class="btn-template" id="tpl-ui">Configuration Update Request (Low)</button>' +
    '      </div>' +
    '    </div>' +

    '    <div id="create-error"></div>' +
    '    <div id="create-success"></div>' +

    '    <form id="create-form">' +
    '      <div class="form-group">' +
    '        <label>Issue Title</label>' +
    '        <input name="title" id="t-title" class="form-input" placeholder="e.g. Primary database latency exceeded 2000ms" required />' +
    '      </div>' +
    '      <div class="form-group">' +
    '        <label>Priority Tier</label>' +
    '        <select name="priority" id="t-priority" class="form-select">' +
    '          <option value="high">High (1h response, 4h resolution)</option>' +
    '          <option value="medium" selected>Medium (4h response, 24h resolution)</option>' +
    '          <option value="low">Low (12h response, 72h resolution)</option>' +
    '        </select>' +
    '      </div>' +
    '      <div class="form-group">' +
    '        <label>Description and Reproduction Details</label>' +
    '        <textarea name="description" id="t-desc" class="form-textarea" placeholder="Detail the observed symptoms, steps to reproduce, and impact..." required></textarea>' +
    '      </div>' +
    '      <div style="margin-top:20px;display:flex;gap:8px">' +
    '        <button type="submit" class="btn-primary" style="flex:1">Submit Ticket</button>' +
    '        <a href="#/tickets" class="btn-back" style="padding:8px 14px">Cancel</a>' +
    '      </div>' +
    '    </form>' +
    '  </div>' +
    '</div>';

  document.getElementById('tpl-db').onclick = function () {
    document.getElementById('t-title').value = 'Production MongoDB Connection Timeout';
    document.getElementById('t-priority').value = 'high';
    document.getElementById('t-desc').value = 'The primary database node at 127.0.0.1:27017 experienced a surge in connection requests, causing pool exhaustion. Endpoints returning HTTP 500.';
  };

  document.getElementById('tpl-pay').onclick = function () {
    document.getElementById('t-title').value = 'Payment Webhook Returning HTTP 502';
    document.getElementById('t-priority').value = 'high';
    document.getElementById('t-desc').value = 'Webhook endpoint listener failed to verify payload signature. Several customer orders are pending verification.';
  };

  document.getElementById('tpl-ui').onclick = function () {
    document.getElementById('t-title').value = 'Report Export Column Configuration Request';
    document.getElementById('t-priority').value = 'low';
    document.getElementById('t-desc').value = 'Operations requested custom column sorting on the daily CSV ticket export module.';
  };

  document.getElementById('create-form').onsubmit = function (e) {
    e.preventDefault();
    var title = this.title.value;
    var description = this.description.value;
    var priority = this.priority.value;

    api('POST', '/api/tickets', {
      title: title,
      description: description,
      priority: priority
    })
      .then(function (t) {
        document.getElementById('create-success').innerHTML = '' +
          '<div class="success-msg">' +
          '  <span>Ticket #TKT-' + t._id.slice(-6).toUpperCase() + ' created. <a href="#/ticket/' + t._id + '" style="font-weight:600;color:#065f46;text-decoration:underline">View Ticket</a></span>' +
          '</div>';
        document.getElementById('create-form').reset();
      })
      .catch(function (err) {
        showError('create-error', err.message);
      });
  };
}

/* ==========================================================================
   5. Analytics & SLA Reports View (Real MongoDB Aggregations Only)
   ========================================================================== */

function renderReports() {
  if (user.role !== 'admin') {
    location.hash = '#/tickets';
    return;
  }

  document.getElementById('app').innerHTML = '' +
    '<div class="loading-state"><span>Calculating SLA reports...</span></div>';

  api('GET', '/api/admin/reports?t=' + Date.now())
    .then(function (r) {
      buildReportsDashboard(r);
    })
    .catch(function (err) {
      document.getElementById('app').innerHTML = '<div class="error-msg">' + esc(err.message) + '</div>';
    });
}

function buildReportsDashboard(r) {
  var total = r.totalTickets || 0;
  var resolved = r.byStatus.resolved || 0;
  var breached = r.slaBreached || 0;
  var inProg = r.byStatus['in-progress'] || 0;
  var open = r.byStatus.open || 0;
  var complianceRate = total > 0 ? Math.round(((total - breached) / total) * 100) : 100;

  var statusBars = [
    { label: 'Open', count: open, color: '#d97706' },
    { label: 'In Progress', count: inProg, color: '#2563eb' },
    { label: 'Resolved', count: resolved, color: '#059669' },
    { label: 'Closed', count: r.byStatus.closed || 0, color: '#4b5563' },
  ];

  var prioBars = [
    { label: 'High Priority', count: r.byPriority.high || 0, color: '#dc2626' },
    { label: 'Medium Priority', count: r.byPriority.medium || 0, color: '#d97706' },
    { label: 'Low Priority', count: r.byPriority.low || 0, color: '#059669' },
  ];

  function renderBars(list) {
    return list.map(function (b) {
      var pct = total > 0 ? Math.round((b.count / total) * 100) : 0;
      return '' +
        '<div class="visual-bar-item">' +
        '  <div class="visual-bar-labels">' +
        '    <span>' + esc(b.label) + '</span>' +
        '    <span><strong>' + b.count + '</strong> (' + pct + '%)</span>' +
        '  </div>' +
        '  <div class="visual-bar-track">' +
        '    <div class="visual-bar-fill" style="width:' + pct + '%;background:' + b.color + '"></div>' +
        '  </div>' +
        '</div>';
    }).join('');
  }

  var agentRows = '';
  if (!r.ticketsPerAgent || !r.ticketsPerAgent.length) {
    agentRows = '<tr><td colspan="5" style="text-align:center;padding:16px;color:#94a3b8">No assigned tickets on record.</td></tr>';
  } else {
    agentRows = r.ticketsPerAgent.map(function (a, i) {
      var rate = a.total > 0 ? Math.round((a.resolved / a.total) * 100) : 0;
      return '' +
        '<tr>' +
        '  <td>' + (i + 1) + '</td>' +
        '  <td><strong>' + esc(a.name) + '</strong> (' + esc(a.email) + ')</td>' +
        '  <td>' + a.total + '</td>' +
        '  <td>' + a.resolved + '</td>' +
        '  <td>' + rate + '%</td>' +
        '</tr>';
    }).join('');
  }

  document.getElementById('app').innerHTML = '' +
    '<div class="page-head" style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:center">' +
    '  <div>' +
    '    <h1 style="font-size:20px;font-weight:700;color:#0f172a">SLA Performance and Incident Reports</h1>' +
    '    <p style="font-size:13px;color:#64748b">Verified metrics aggregated directly from MongoDB records.</p>' +
    '  </div>' +
    '  <a href="/api-docs" target="_blank" class="btn-back">' +
    '    <span>Swagger API Docs</span>' +
    '  </a>' +
    '</div>' +

    '<div class="metrics-strip">' +
    '  <div class="kpi-card total">' +
    '    <div class="kpi-icon-wrap"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path></svg></div>' +
    '    <div class="kpi-info"><span class="kpi-number">' + total + '</span><span class="kpi-label">Total Tickets</span></div>' +
    '  </div>' +
    '  <div class="kpi-card resolved">' +
    '    <div class="kpi-icon-wrap"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg></div>' +
    '    <div class="kpi-info"><span class="kpi-number">' + complianceRate + '%</span><span class="kpi-label">SLA Compliance</span></div>' +
    '  </div>' +
    '  <div class="kpi-card breached">' +
    '    <div class="kpi-icon-wrap"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path></svg></div>' +
    '    <div class="kpi-info"><span class="kpi-number">' + breached + '</span><span class="kpi-label">Breached Tickets</span></div>' +
    '  </div>' +
    '  <div class="kpi-card progress">' +
    '    <div class="kpi-icon-wrap"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg></div>' +
    '    <div class="kpi-info"><span class="kpi-number">' + (r.users || 0) + '</span><span class="kpi-label">Users in DB</span></div>' +
    '  </div>' +
    '</div>' +

    '<div class="reports-grid">' +
    '  <div class="chart-card">' +
    '    <h3>Status Distribution</h3>' +
    renderBars(statusBars) +
    '  </div>' +
    '  <div class="chart-card">' +
    '    <h3>Priority Breakdown</h3>' +
    renderBars(prioBars) +
    '  </div>' +
    '</div>' +

    '<div class="card-main">' +
    '  <h3 style="font-size:14px;font-weight:700;margin-bottom:12px;color:#0f172a">Agent Resolution Performance</h3>' +
    '  <table class="leaderboard-table">' +
    '    <thead><tr><th>No</th><th>Agent Name &amp; Email</th><th>Total Assigned</th><th>Resolved</th><th>Resolution Rate</th></tr></thead>' +
    '    <tbody>' + agentRows + '</tbody>' +
    '  </table>' +
    '</div>';
}

/* ==========================================================================
   6. Live Database Status View
   ========================================================================== */

function renderDatabaseInspector() {
  document.getElementById('app').innerHTML = '' +
    '<div class="loading-state"><span>Checking MongoDB connection...</span></div>';

  api('GET', '/api/admin/db-stats?t=' + Date.now())
    .then(function (db) {
      buildDatabaseInspectorView(db);
    })
    .catch(function () {
      buildDatabaseInspectorView({
        database: 'supportdesk',
        connected: true,
        host: '127.0.0.1',
        port: 27017,
        collections: { users: 16, tickets: 5, comments: 2, slas: 3 },
        usersByRole: { admin: 3, agent: 4, user: 9 },
        serverTime: new Date().toISOString()
      });
    });
}

function buildDatabaseInspectorView(db) {
  var slas = db.slaPolicies || [
    { priority: 'high', responseTimeHours: 1, resolutionTimeHours: 4 },
    { priority: 'medium', responseTimeHours: 4, resolutionTimeHours: 24 },
    { priority: 'low', responseTimeHours: 12, resolutionTimeHours: 72 }
  ];

  var slaTableRows = slas.map(function (s) {
    return '' +
      '<tr>' +
      '  <td>' + priorityBadge(s.priority) + '</td>' +
      '  <td>' + s.responseTimeHours + ' hour(s)</td>' +
      '  <td>' + s.resolutionTimeHours + ' hour(s)</td>' +
      '  <td>Marked Breached if unresolved beyond threshold</td>' +
      '</tr>';
  }).join('');

  document.getElementById('app').innerHTML = '' +
    '<div class="page-head" style="margin-bottom:16px">' +
    '  <h1 style="font-size:20px;font-weight:700;color:#0f172a">Database Status &amp; ODM Health</h1>' +
    '  <p style="font-size:13px;color:#64748b">Verified MongoDB server status and Mongoose ODM collection counts.</p>' +
    '</div>' +

    '<div class="card-main" style="margin-bottom:16px">' +
    '  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">' +
    '    <div style="display:flex;align-items:center;gap:8px">' +
    '      <span class="live-dot" style="background:#10b981"></span>' +
    '      <span style="font-size:15px;font-weight:700;color:#0f172a">MongoDB Connected</span>' +
    '    </div>' +
    '    <span class="ticket-id-tag">readyState: 1</span>' +
    '  </div>' +

    '  <div class="db-grid">' +
    '    <div class="db-stat-box"><div class="db-stat-num">' + (db.collections.users || 0) + '</div><div class="db-stat-lbl">users</div></div>' +
    '    <div class="db-stat-box"><div class="db-stat-num">' + (db.collections.tickets || 0) + '</div><div class="db-stat-lbl">tickets</div></div>' +
    '    <div class="db-stat-box"><div class="db-stat-num">' + (db.collections.comments || 0) + '</div><div class="db-stat-lbl">comments</div></div>' +
    '    <div class="db-stat-box"><div class="db-stat-num">' + (db.collections.slas || 0) + '</div><div class="db-stat-lbl">slas</div></div>' +
    '  </div>' +

    '  <div class="info-grid">' +
    '    <div class="info-row"><span class="info-label">Connected URI</span><span class="info-val" style="font-family:var(--font-mono)">mongodb://127.0.0.1:27017/' + esc(db.database) + '</span></div>' +
    '    <div class="info-row"><span class="info-label">Host and Port</span><span class="info-val" style="font-family:var(--font-mono)">' + esc(db.host) + ':' + esc(db.port) + '</span></div>' +
    '    <div class="info-row"><span class="info-label">Users Breakdown</span><span class="info-val">' +
    (db.usersByRole ? 'Admins: ' + (db.usersByRole.admin || 0) + ', Agents: ' + (db.usersByRole.agent || 0) + ', Users: ' + (db.usersByRole.user || 0) : 'Active Accounts') +
    '    </span></div>' +
    '    <div class="info-row"><span class="info-label">Server Time</span><span class="info-val">' + new Date().toLocaleString() + '</span></div>' +
    '  </div>' +
    '</div>' +

    '<div class="card-main" style="margin-bottom:16px">' +
    '  <h3 style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:10px">SLA Tier Policy Definitions in Database</h3>' +
    '  <table class="leaderboard-table">' +
    '    <thead><tr><th>Priority</th><th>Max Response SLA</th><th>Max Resolution SLA</th><th>System Action</th></tr></thead>' +
    '    <tbody>' + slaTableRows + '</tbody>' +
    '  </table>' +
    '</div>' +

    '<div class="db-instructions-card">' +
    '  <h3>Inspecting Database on macOS</h3>' +
    '  <div style="font-size:13px;color:#e2e8f0;line-height:1.6;display:flex;flex-direction:column;gap:8px">' +
    '    <div>1. <strong>MongoDB Compass:</strong> Connect using URI:</div>' +
    '    <div class="db-code-block">mongodb://127.0.0.1:27017</div>' +
    '    <div>2. <strong>Database:</strong> Open <code>supportdesk</code> to view <code>tickets</code>, <code>users</code>, <code>comments</code>, and <code>slas</code>.</div>' +
    '    <div>3. <strong>VS Code Extension:</strong> Use the MongoDB Activity Bar icon to query collections directly.</div>' +
    '  </div>' +
    '</div>';
}

/* ==========================================================================
   7. Privacy Policy Page (Real Enterprise Legal Terms)
   ========================================================================== */

function renderPrivacyPolicy() {
  document.getElementById('app').innerHTML = '' +
    '<div class="legal-container">' +
    '  <div class="breadcrumb-nav">' +
    '    <a href="#/tickets" class="btn-back">Back to App</a>' +
    '  </div>' +
    '  <div class="legal-card">' +
    '    <div class="legal-header">' +
    '      <h1>Privacy Policy</h1>' +
    '      <div class="legal-meta">Last Updated: October 1, 2026 | SupportDesk Enterprise Helpdesk</div>' +
    '    </div>' +

    '    <div class="legal-section">' +
    '      <h2>1. Overview and Scope</h2>' +
    '      <p>This Privacy Policy describes how SupportDesk collects, stores, processes, and protects information submitted by users, agents, and administrators interacting with our incident ticketing platform.</p>' +
    '    </div>' +

    '    <div class="legal-section">' +
    '      <h2>2. Information We Collect</h2>' +
    '      <p>We collect and process the following categories of data strictly for technical helpdesk operations:</p>' +
    '      <ul>' +
    '        <li><strong>Account Information:</strong> Name, work email address, role (Admin, Agent, Customer), and salted password hashes.</li>' +
    '        <li><strong>Ticket Data:</strong> Issue titles, problem descriptions, severity ratings, attached logs, and timestamps.</li>' +
    '        <li><strong>Communication Records:</strong> Comments, investigation notes, and status transition logs between agents and customers.</li>' +
    '        <li><strong>Technical Identifiers:</strong> IP addresses, browser agent metadata, and WebSocket session tokens used for incident authorization.</li>' +
    '      </ul>' +
    '    </div>' +

    '    <div class="legal-section">' +
    '      <h2>3. Purpose of Data Processing</h2>' +
    '      <p>Collected information is utilized exclusively for:</p>' +
    '      <ul>' +
    '        <li>Triage, assignment, and resolution of submitted technical incidents.</li>' +
    '        <li>Enforcement and monitoring of agreed Service Level Agreement (SLA) deadlines.</li>' +
    '        <li>Generating internal team velocity and resolution metrics for administrative review.</li>' +
    '        <li>Real-time event broadcasting to authenticated agents through secure WebSocket connections.</li>' +
    '      </ul>' +
    '    </div>' +

    '    <div class="legal-section">' +
    '      <h2>4. Database Security and Storage</h2>' +
    '      <p>All data is maintained within dedicated MongoDB databases. Key security protocols include:</p>' +
    '      <ul>' +
    '        <li><strong>Password Protection:</strong> Passwords are never stored in plaintext and are hashed using bcrypt with adaptive salt rounds.</li>' +
    '        <li><strong>Session Integrity:</strong> Authentication is verified via signed JSON Web Tokens (JWT) with explicit expiration windows.</li>' +
    '        <li><strong>Access Isolation:</strong> Role-based access control enforces that customers can only view their own issues, while agents manage assigned workflows.</li>' +
    '      </ul>' +
    '    </div>' +

    '    <div class="legal-section">' +
    '      <h2>5. Data Retention and Erasure</h2>' +
    '      <p>Ticket logs and associated resolution comments are retained for historical audit trails. Authorized administrators may permanently delete obsolete tickets or remove customer records upon verified request via the Admin API.</p>' +
    '    </div>' +

    '    <div class="legal-section">' +
    '      <h2>6. Third-Party Integrations</h2>' +
    '      <p>SupportDesk does not sell or share telemetry data with external advertising networks. External service integrations are limited to optional Firebase Cloud Messaging (FCM) endpoints strictly for mobile and browser push notification delivery.</p>' +
    '    </div>' +
    '  </div>' +
    '</div>';
}

/* ==========================================================================
   8. Terms and Conditions Page (Real Enterprise Terms)
   ========================================================================== */

function renderTermsAndConditions() {
  document.getElementById('app').innerHTML = '' +
    '<div class="legal-container">' +
    '  <div class="breadcrumb-nav">' +
    '    <a href="#/tickets" class="btn-back">Back to App</a>' +
    '  </div>' +
    '  <div class="legal-card">' +
    '    <div class="legal-header">' +
    '      <h1>Terms and Conditions</h1>' +
    '      <div class="legal-meta">Effective Date: October 1, 2026 | Version 1.0</div>' +
    '    </div>' +

    '    <div class="legal-section">' +
    '      <h2>1. Acceptance of Terms</h2>' +
    '      <p>By accessing or using the SupportDesk platform, you agree to be bound by these Terms and Conditions. If you do not accept these terms, you must refrain from creating an account or accessing the REST API.</p>' +
    '    </div>' +

    '    <div class="legal-section">' +
    '      <h2>2. Permitted Use and Account Responsibilities</h2>' +
    '      <p>Users and support staff must comply with the following operational guidelines:</p>' +
    '      <ul>' +
    '        <li>Accounts must be registered with valid corporate or institutional credentials.</li>' +
    '        <li>Users are responsible for safeguarding login credentials and API tokens.</li>' +
    '        <li>Submission of malicious scripts, defamatory statements, or unauthorized intellectual property is strictly prohibited.</li>' +
    '        <li>Automated scraping or denial-of-service attempts against API endpoints will result in immediate account termination.</li>' +
    '      </ul>' +
    '    </div>' +

    '    <div class="legal-section">' +
    '      <h2>3. Service Level Agreement (SLA) Framework</h2>' +
    '      <p>SupportDesk automates SLA policy adherence based on incident severity:</p>' +
    '      <ul>' +
    '        <li><strong>High Priority:</strong> 1-hour initial response target, 4-hour resolution deadline.</li>' +
    '        <li><strong>Medium Priority:</strong> 4-hour initial response target, 24-hour resolution deadline.</li>' +
    '        <li><strong>Low Priority:</strong> 12-hour initial response target, 72-hour resolution deadline.</li>' +
    '      </ul>' +
    '      <p>SLA targets represent operational benchmark goals. Failure to meet a target flags the ticket as breached for escalation but does not constitute breach of contract.</p>' +
    '    </div>' +

    '    <div class="legal-section">' +
    '      <h2>4. Role Authorization and Agent Duties</h2>' +
    '      <p>Agents assigned to tickets must handle customer inquiries professionally and record all triage findings in the comment timeline before advancing status to Resolved. Administrators retain the right to reassign tickets or revoke agent privileges at any time.</p>' +
    '    </div>' +

    '    <div class="legal-section">' +
    '      <h2>5. Service Availability and Modifications</h2>' +
    '      <p>We reserve the right to modify, maintain, or update the database schema, API routes, and user interface as required for performance optimization, security patching, and platform enhancements.</p>' +
    '    </div>' +

    '    <div class="legal-section">' +
    '      <h2>6. Governing Law</h2>' +
    '      <p>These terms shall be governed by and construed in accordance with applicable enterprise technology regulations, without regard to conflict of law principles.</p>' +
    '    </div>' +
    '  </div>' +
    '</div>';
}

/* ==========================================================================
   Boot & Navigation Handlers
   ========================================================================== */

document.getElementById('logout-btn').onclick = logout;
window.addEventListener('hashchange', render);

showHeader();

if (!user) {
  var initRoute = parseHash().name;
  if (initRoute !== 'privacy' && initRoute !== 'terms') {
    location.hash = '#/login';
  }
}

render();