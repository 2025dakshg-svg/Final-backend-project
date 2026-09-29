var token = localStorage.getItem('sd_token');
var user = JSON.parse(localStorage.getItem('sd_user') || 'null');
var socket = null;

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

function saveSession(data) {
  token = data.token;
  user = { _id: data._id, name: data.name, email: data.email, role: data.role };
  localStorage.setItem('sd_token', token);
  localStorage.setItem('sd_user', JSON.stringify(user));
  showHeader();
}

function logout() {
  token = null;
  user = null;
  localStorage.removeItem('sd_token');
  localStorage.removeItem('sd_user');
  location.hash = '#/login';
  render();
}

function showHeader() {
  var header = document.getElementById('header');
  var label = document.getElementById('user-label');
  var navReports = document.getElementById('nav-reports');

  if (!user) {
    header.classList.add('hidden');
    return;
  }

  header.classList.remove('hidden');
  label.textContent = user.name + ' (' + user.role + ')';
  if (user.role === 'admin') {
    navReports.classList.remove('hidden');
  } else {
    navReports.classList.add('hidden');
  }
}

function connectSocket() {
  if (socket) socket.close();
  socket = io();

  var events = ['ticket:created', 'ticket:updated', 'ticket:assigned', 'ticket:status', 'ticket:deleted', 'comment:new'];
  events.forEach(function (name) {
    socket.on(name, function (data) {
      addFeed(name, data);
    });
  });
}

function addFeed(name, data) {
  var feed = document.getElementById('live-feed');
  if (!feed) return;

  var row = document.createElement('div');
  row.className = 'feed-event';

  var label = document.createElement('span');
  label.className = 'feed-name';
  label.textContent = name + ' ';

  row.appendChild(label);
  row.appendChild(document.createTextNode(summarise(name, data)));

  feed.insertBefore(row, feed.firstChild);
  while (feed.children.length > 30) feed.removeChild(feed.lastChild);
}

function summarise(name, data) {
  if (!data) return '';
  if (name === 'comment:new') {
    return (data.user ? data.user.name : '') + ': ' + data.message;
  }
  if (name === 'ticket:deleted') {
    return 'ticket removed (' + data._id.slice(-6) + ')';
  }
  return (data.title || '') + ' | ' + (data.status || '') + ' | ' + (data.priority || '') +
    ' | by ' + (data.createdBy ? data.createdBy.name : '-') +
    ' | agent: ' + (data.assignedTo ? data.assignedTo.name : 'none');
}

function statusBadge(status) {
  return '<span class="badge ' + status + '">' + status + '</span>';
}

function priorityBadge(priority) {
  if (!priority) return '';
  return '<span class="badge ' + priority + '">' + priority + '</span>';
}

function parseHash() {
  var parts = location.hash.replace(/^#\/?/, '').split('/');
  return { name: parts[0] || 'tickets', id: parts[1] };
}

function render() {
  var route = parseHash();
  showHeader();

  if (!user && route.name !== 'login') {
    location.hash = '#/login';
    return;
  }

  if (route.name === 'login') renderLogin();
  else if (route.name === 'tickets') renderTickets();
  else if (route.name === 'create') renderCreate();
  else if (route.name === 'ticket') renderTicketDetail(route.id);
  else if (route.name === 'reports') renderReports();
}

/* ---------- login / register ---------- */

function renderLogin() {
  document.getElementById('app').innerHTML = '' +
    '<div class="auth-wrap">' +
    '  <div class="tabs">' +
    '    <button id="tab-login" class="active">Login</button>' +
    '    <button id="tab-register">Register</button>' +
    '  </div>' +
    '  <div class="card" id="auth-card"></div>' +
    '  <p style="font-size:12px;color:#64748b">' +
    '    seeded accounts: user@supportdesk.com / user123, agent@supportdesk.com / agent123, admin@supportdesk.com / admin123' +
    '  </p>' +
    '</div>';

  document.getElementById('tab-login').onclick = function () { showAuthForm('login'); };
  document.getElementById('tab-register').onclick = function () { showAuthForm('register'); };
  showAuthForm('login');
}

function showAuthForm(mode) {
  var card = document.getElementById('auth-card');
  var loginTab = document.getElementById('tab-login');
  var regTab = document.getElementById('tab-register');
  loginTab.className = mode === 'login' ? 'active' : '';
  regTab.className = mode === 'register' ? 'active' : '';

  var extra = '';
  if (mode === 'register') {
    extra = '' +
      '  <label>Role</label>' +
      '  <select name="role">' +
      '    <option value="user">user</option>' +
      '    <option value="agent">agent</option>' +
      '    <option value="admin">admin</option>' +
      '  </select>';
  }

  card.innerHTML = '' +
    '  <div id="auth-error"></div>' +
    '  <form id="auth-form">' +
    (mode === 'register' ? '  <label>Name</label><input name="name" required />' : '') +
    '  <label>Email</label><input name="email" type="email" required />' +
    '  <label>Password</label><input name="password" type="password" required />' +
    extra +
    '  <div style="margin-top:18px"><button type="submit">' + (mode === 'login' ? 'Login' : 'Create account') + '</button></div>' +
    '  </form>';

  document.getElementById('auth-form').onsubmit = function (e) {
    e.preventDefault();
    authSubmit(mode, this);
  };
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
  document.getElementById(id).innerHTML = '<div class="error-msg">' + esc(msg) + '</div>';
}

/* ---------- tickets list ---------- */

function renderTickets() {
  document.getElementById('app').innerHTML = '' +
    '<div class="feed" id="live-feed">' +
    '  <div class="feed-event"><span class="feed-name">connected</span> waiting for events...</div>' +
    '</div>' +
    '<div class="card">' +
    '  <h2>Tickets</h2>' +
    '  <div class="filters">' +
    '    <select id="f-status">' +
    '      <option value="">all statuses</option>' +
    '      <option value="open">open</option><option value="in-progress">in-progress</option>' +
    '      <option value="resolved">resolved</option><option value="closed">closed</option>' +
    '    </select>' +
    '    <select id="f-priority">' +
    '      <option value="">all priorities</option>' +
    '      <option value="low">low</option><option value="medium">medium</option><option value="high">high</option>' +
    '    </select>' +
    '    <button class="secondary" id="f-apply">Apply</button>' +
    '  </div>' +
    '  <ul class="ticket-list" id="ticket-list"><div class="loading">Loading tickets...</div></ul>' +
    '</div>';

  document.getElementById('f-apply').onclick = function () { loadTickets(); };

  connectSocket();
  loadTickets();
}

function loadTickets() {
  var status = document.getElementById('f-status').value;
  var priority = document.getElementById('f-priority').value;
  var qs = '?t=' + Date.now();
  if (status) qs += '&status=' + status;
  if (priority) qs += '&priority=' + priority;

  api('GET', '/api/tickets' + qs)
    .then(function (tickets) {
      var list = document.getElementById('ticket-list');
      if (!tickets.length) {
        list.innerHTML = '<div class="empty">No tickets yet. Create one from the New ticket tab.</div>';
        return;
      }

      list.innerHTML = tickets.map(function (t) {
        return '' +
          '<li onclick="location.hash=(\'#/ticket/' + t._id + '\')">' +
          '  <div class="title">' + esc(t.title) + ' ' + statusBadge(t.status) + priorityBadge(t.priority) +
          (t.breached ? '<span class="badge breached">breached</span>' : '') + '</div>' +
          '  <div class="meta">' +
          '    by ' + esc(t.createdBy ? t.createdBy.name : '-') +
          ' | agent: ' + esc(t.assignedTo ? t.assignedTo.name : 'none') +
          ' | due: ' + (t.dueDate ? new Date(t.dueDate).toLocaleString() : '-') +
          ' | ' + esc(t.description.substring(0, 80)) + (t.description.length > 80 ? '...' : '') +
          '  </div>' +
          '</li>';
      }).join('');
    })
    .catch(function (err) {
      document.getElementById('ticket-list').innerHTML = '<div class="error-msg">' + esc(err.message) + '</div>';
    });
}

/* ---------- create ticket ---------- */

function renderCreate() {
  document.getElementById('app').innerHTML = '' +
    '<div class="card">' +
    '  <h2>New ticket</h2>' +
    '  <div id="create-error"></div>' +
    '  <div id="create-success"></div>' +
    '  <form id="create-form">' +
    '    <label>Title</label><input name="title" required />' +
    '    <label>Description</label><textarea name="description" required></textarea>' +
    '    <label>Priority</label>' +
    '    <select name="priority">' +
    '      <option value="low">low</option><option value="medium" selected>medium</option><option value="high">high</option>' +
    '    </select>' +
    '    <div style="margin-top:18px"><button type="submit">Create ticket</button></div>' +
    '  </form>' +
    '</div>';

  document.getElementById('create-form').onsubmit = function (e) {
    e.preventDefault();
    api('POST', '/api/tickets', {
      title: this.title.value,
      description: this.description.value,
      priority: this.priority.value,
    })
      .then(function (t) {
        document.getElementById('create-success').innerHTML =
          '<div class="success-msg">Ticket created. <a href="#/ticket/' + t._id + '">View it</a></div>';
        document.getElementById('create-form').reset();
      })
      .catch(function (err) {
        showError('create-error', err.message);
      });
  };
}

/* ---------- ticket detail ---------- */

function renderTicketDetail(id) {
  document.getElementById('app').innerHTML =
    '<div class="loading">Loading ticket...</div>';

  api('GET', '/api/tickets/' + id)
    .then(function (t) {
      buildDetail(t);
    })
    .catch(function (err) {
      document.getElementById('app').innerHTML = '<div class="error-msg">' + esc(err.message) + '</div>';
    });
}

function buildDetail(t) {
  var controls = '';
  if (user.role === 'agent' || user.role === 'admin') {
    controls = '' +
      '<div class="form-row" style="margin-top:14px">' +
      '  <div><label>Status</label>' +
      '    <select id="dd-status">' + statusOptions(t.status) + '</select>' +
      '    <button class="secondary" style="margin-top:8px" id="btn-status">Update status</button></div>' +
      '  <div><label>Assign to</label>' +
      '    <select id="dd-agent"><option value="">select agent</option></select>' +
      '    <button class="secondary" style="margin-top:8px" id="btn-assign">Assign</button></div>' +
      '</div>' +
      '  <div id="ctrl-msg"></div>';
  }

  document.getElementById('app').innerHTML = '' +
    '<div class="card">' +
    '  <h2>' + esc(t.title) + ' ' + statusBadge(t.status) + priorityBadge(t.priority) +
    (t.breached ? '<span class="badge breached">sla breached</span>' : '') + '</h2>' +
    '  <div class="meta" style="color:#64748b;font-size:12px">created ' +
    new Date(t.createdAt).toLocaleString() + ' by ' + esc(t.createdBy ? t.createdBy.name : '-') + '</div>' +
    '  <p>' + esc(t.description) + '</p>' +
    '  <div class="detail-grid">' +
    '    <div class="item"><div class="meta-label">status</div>' + esc(t.status) + '</div>' +
    '    <div class="item"><div class="meta-label">priority</div>' + esc(t.priority) + '</div>' +
    '    <div class="item"><div class="meta-label">due date</div>' + (t.dueDate ? new Date(t.dueDate).toLocaleString() : '-') + '</div>' +
    '    <div class="item"><div class="meta-label">assigned to</div>' + esc(t.assignedTo ? t.assignedTo.name : 'none') + '</div>' +
    '  </div>' +
    controls +
    '</div>' +
    '<div class="card">' +
    '  <h2>Comments</h2>' +
    '  <div id="comments"></div>' +
    '  <label>Add a comment</label>' +
    '  <textarea id="comment-text" placeholder="Type a comment"></textarea>' +
    '  <button style="margin-top:8px" id="btn-comment">Post comment</button>' +
    '  <div id="comment-msg"></div>' +
    '</div>';

  if (controls) {
    document.getElementById('btn-status').onclick = function () { changeStatus(t._id); };
    document.getElementById('btn-assign').onclick = function () { assignTicket(t._id); };
    loadAgents(t.assignedTo ? t.assignedTo._id : '');
  }

  document.getElementById('btn-comment').onclick = function () { postComment(t._id); };
  loadComments(t._id);
}

function statusOptions(current) {
  var statuses = ['open', 'in-progress', 'resolved', 'closed'];
  return statuses.map(function (s) {
    return '<option value="' + s + '"' + (s === current ? ' selected' : '') + '>' + s + '</option>';
  }).join('');
}

function loadAgents(assignedId) {
  api('GET', '/api/users?role=agent&t=' + Date.now())
    .then(function (users) {
      var dd = document.getElementById('dd-agent');
      dd.innerHTML = '<option value="">select agent</option>' + users.map(function (u) {
        return '<option value="' + u._id + '"' + (u._id === assignedId ? ' selected' : '') + '>' +
          esc(u.name) + ' (' + esc(u.email) + ')</option>';
      }).join('');
    })
    .catch(function () {});
}

function changeStatus(id) {
  var status = document.getElementById('dd-status').value;
  api('PUT', '/api/tickets/' + id + '/status', { status: status })
    .then(function (t) {
      document.getElementById('ctrl-msg').innerHTML =
        '<div class="success-msg">Status updated to ' + esc(t.status) + '</div>';
      setTimeout(function () { renderTicketDetail(id); }, 800);
    })
    .catch(function (err) {
      document.getElementById('ctrl-msg').innerHTML = '<div class="error-msg">' + esc(err.message) + '</div>';
    });
}

function assignTicket(id) {
  var agentId = document.getElementById('dd-agent').value;
  if (!agentId) {
    document.getElementById('ctrl-msg').innerHTML = '<div class="error-msg">Select an agent first</div>';
    return;
  }
  api('PUT', '/api/tickets/' + id + '/assign', { agentId: agentId })
    .then(function () {
      document.getElementById('ctrl-msg').innerHTML = '<div class="success-msg">Ticket assigned</div>';
      setTimeout(function () { renderTicketDetail(id); }, 800);
    })
    .catch(function (err) {
      document.getElementById('ctrl-msg').innerHTML = '<div class="error-msg">' + esc(err.message) + '</div>';
    });
}

function postComment(id) {
  var text = document.getElementById('comment-text').value.trim();
  if (!text) return;

  api('POST', '/api/comments', { ticketId: id, message: text })
    .then(function () {
      document.getElementById('comment-text').value = '';
      loadComments(id);
    })
    .catch(function (err) {
      document.getElementById('comment-msg').innerHTML = '<div class="error-msg">' + esc(err.message) + '</div>';
    });
}

function loadComments(id) {
  api('GET', '/api/comments/ticket/' + id)
    .then(function (comments) {
      var box = document.getElementById('comments');
      if (!comments.length) {
        box.innerHTML = '<div class="empty">No comments yet.</div>';
        return;
      }
      box.innerHTML = comments.map(function (c) {
        return '<div class="comment">' +
          '<span class="who">' + esc(c.user ? c.user.name : 'unknown') + '</span> ' +
          '<span class="when">' + new Date(c.createdAt).toLocaleString() + '</span><br />' +
          esc(c.message) + '</div>';
      }).join('');
    })
    .catch(function () {});
}

/* ---------- admin reports ---------- */

function renderReports() {
  if (user.role !== 'admin') {
    location.hash = '#/tickets';
    return;
  }

  document.getElementById('app').innerHTML =
    '<div class="loading">Loading reports...</div>';

  api('GET', '/api/admin/reports')
    .then(function (r) {
      document.getElementById('app').innerHTML = '' +
        '<div class="report-stats">' +
        stat(r.totalTickets, 'total tickets') +
        stat(r.slaBreached, 'sla breached') +
        stat(r.byStatus.resolved || 0, 'resolved') +
        stat(r.byStatus['in-progress'] || 0, 'in progress') +
        '</div>' +
        '<div class="card">' +
        '  <h2>Status distribution</h2>' + kvTable(r.byStatus) + '</div>' +
        '<div class="card">' +
        '  <h2>Priority distribution</h2>' + kvTable(r.byPriority) + '</div>' +
        '<div class="card">' +
        '  <h2>Tickets per agent</h2>' + agentTable(r.ticketsPerAgent) + '</div>';
    })
    .catch(function (err) {
      document.getElementById('app').innerHTML = '<div class="error-msg">' + esc(err.message) + '</div>';
    });
}

function stat(num, label) {
  return '<div class="stat"><div class="num">' + esc(num) + '</div><div class="lbl">' + esc(label) + '</div></div>';
}

function kvTable(obj) {
  var rows = Object.keys(obj || {}).map(function (k) {
    return '<tr><td>' + esc(k) + '</td><td>' + esc(obj[k]) + '</td></tr>';
  }).join('');
  return '<table><tr><th>key</th><th>count</th></tr>' + rows + '</table>';
}

function agentTable(agents) {
  if (!agents || !agents.length) return '<div class="empty">No assigned tickets.</div>';
  var rows = agents.map(function (a) {
    return '<tr><td>' + esc(a.name) + '</td><td>' + esc(a.email) + '</td><td>' +
      esc(a.total) + '</td><td>' + esc(a.resolved) + '</td></tr>';
  }).join('');
  return '<table><tr><th>agent</th><th>email</th><th>total</th><th>resolved</th></tr>' + rows + '</table>';
}

/* ---------- boot ---------- */

document.getElementById('logout-btn').onclick = logout;

window.addEventListener('hashchange', render);
showHeader();

if (!user) {
  location.hash = '#/login';
}
render();