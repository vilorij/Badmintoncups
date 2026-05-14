/* UI: rendering + event handling. Hash-based routing. */
(function () {
  const UI = {};

  /* ---------- Helpers ---------- */
  function el(html) {
    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    return wrap.firstElementChild;
  }
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function fmtDate(ts) {
    if (!ts) return '';
    const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
    return d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  function fmtDateOnly(s) {
    if (!s) return '';
    return new Date(s).toLocaleDateString('ru-RU');
  }

  /* ---------- Toast ---------- */
  UI.toast = function (title, body, kind = '') {
    const t = el(`
      <div class="toast ${kind}">
        <div class="toast-title">${escapeHtml(title)}</div>
        ${body ? `<div class="toast-body">${escapeHtml(body)}</div>` : ''}
      </div>
    `);
    document.getElementById('toast-container').appendChild(t);
    setTimeout(() => {
      t.style.transition = 'opacity .3s, transform .3s';
      t.style.opacity = '0';
      t.style.transform = 'translateX(100%)';
      setTimeout(() => t.remove(), 300);
    }, 4500);
  };

  /* ---------- Modal ---------- */
  UI.modal = function (title, bodyEl) {
    const tpl = document.getElementById('tpl-modal');
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.querySelector('.modal-title').textContent = title;
    node.querySelector('.modal-body').appendChild(bodyEl);
    document.body.appendChild(node);
    function close() { node.remove(); }
    node.querySelector('[data-action="close-modal"]').addEventListener('click', close);
    node.addEventListener('click', e => { if (e.target === node) close(); });
    return { close, root: node };
  };

  /* ---------- Router ---------- */
  const routes = [];
  UI.route = function (pattern, handler) { routes.push({ pattern, handler }); };

  UI.go = function (path) { location.hash = '#' + path; };

  UI.render = function () {
    const hash = location.hash.replace(/^#/, '') || '/';
    for (const r of routes) {
      const m = matchPath(r.pattern, hash);
      if (m) {
        const app = document.getElementById('app');
        app.innerHTML = '';
        r.handler(app, m);
        // highlight nav
        document.querySelectorAll('.nav a').forEach(a => {
          a.classList.toggle('active', a.getAttribute('href') === '#' + hash || (hash.startsWith('/tournament') && a.getAttribute('href') === '#/tournaments'));
        });
        return;
      }
    }
    // not found
    document.getElementById('app').innerHTML = '<div class="empty">Страница не найдена</div>';
  };

  function matchPath(pattern, path) {
    const pp = pattern.split('/').filter(Boolean);
    const ap = path.split('/').filter(Boolean);
    if (pattern === '/' && path === '/') return {};
    if (pp.length !== ap.length) return null;
    const params = {};
    for (let i = 0; i < pp.length; i++) {
      if (pp[i].startsWith(':')) params[pp[i].slice(1)] = decodeURIComponent(ap[i]);
      else if (pp[i] !== ap[i]) return null;
    }
    return params;
  }

  /* ---------- Demo seed ---------- */
  function seedDemo() {
    const levels = Store.getLevels();
    const roster = [
      ['Алексей Петров',   'S'],
      ['Мария Иванова',    'S-'],
      ['Дмитрий Сидоров',  'N/s'],
      ['Ольга Смирнова',   'N/s'],
      ['Иван Кузнецов',    'N+'],
      ['Анна Попова',      'N+'],
      ['Сергей Новиков',   'N'],
      ['Елена Соколова',   'N'],
      ['Павел Морозов',    'N-'],
      ['Ирина Волкова',    'N-'],
      ['Никита Зайцев',    'tito'],
      ['Юлия Орлова',      'tito'],
      ['Михаил Ковалёв',   'beginner'],
      ['Дарья Романова',   'beginner'],
      ['Андрей Лебедев',   'S-'],
      ['Татьяна Беляева',  'N'],
    ];
    const players = roster.map(([name, lvl]) =>
      Store.addPlayer(name, levels.includes(lvl) ? lvl : 'N')
    );

    // 1) Finished singles tournament (full demo)
    const past = Store.createTournament({
      name: 'Зимний кубок',
      date: '2026-02-08',
      format: 'singles',
      courts: 3,
      groupSize: 4,
      advancePerGroup: 2,
      thirdPlaceMatch: true,
    });
    for (const p of players.slice(0, 12)) Store.addTeam(past.id, [p.id]);
    Logic.startGroupStage(past);
    Logic.tick(past);
    // simulate full play with deterministic-ish bias toward higher level
    function simulateAll(t) {
      let safety = 0;
      while (t.matches.some(m => m.status !== 'finished') && safety < 500) {
        safety++;
        const live = t.matches.filter(m => m.status === 'live');
        if (!live.length) { Logic.tick(t); continue; }
        const m = live[0];
        const team1 = t.teams.find(x => x.id === m.team1);
        const team2 = t.teams.find(x => x.id === m.team2);
        const l1 = levels.indexOf(team1.level);
        const l2 = levels.indexOf(team2.level);
        const team1Wins = (l1 + Math.random() * 3) > (l2 + Math.random() * 3);
        const sets = team1Wins ? [[21, 15 + Math.floor(Math.random() * 5)], [21, 12 + Math.floor(Math.random() * 8)]]
                               : [[15 + Math.floor(Math.random() * 5), 21], [12 + Math.floor(Math.random() * 8), 21]];
        Store.finishMatch(t.id, m.id, sets);
        Logic.tick(t, m);
      }
    }
    simulateAll(past);

    // 2) Active doubles tournament (mid-flight)
    const active = Store.createTournament({
      name: 'Весенний кубок (пары)',
      date: '2026-05-15',
      format: 'doubles',
      courts: 2,
      groupSize: 4,
      advancePerGroup: 2,
      thirdPlaceMatch: true,
    });
    const pairs = [
      [0, 1], [2, 3], [4, 5], [6, 7],
      [8, 9], [10, 11], [12, 13], [14, 15],
    ];
    for (const [i, j] of pairs) Store.addTeam(active.id, [players[i].id, players[j].id]);
    Logic.startGroupStage(active);
    Logic.tick(active);
    // Finish about 60% of group matches randomly
    const groupMs = active.matches.filter(m => m.stage === 'group');
    const toFinish = Math.floor(groupMs.length * 0.6);
    for (let k = 0; k < toFinish; k++) {
      // Find a live match
      const live = active.matches.filter(m => m.status === 'live');
      if (!live.length) { Logic.tick(active); continue; }
      const m = live[0];
      const t1 = active.teams.find(x => x.id === m.team1);
      const t2 = active.teams.find(x => x.id === m.team2);
      const l1 = levels.indexOf(t1.level), l2 = levels.indexOf(t2.level);
      const t1Wins = (l1 + Math.random() * 3) > (l2 + Math.random() * 3);
      const sets = t1Wins ? [[21, 17], [21, 19]] : [[17, 21], [19, 21]];
      Store.finishMatch(active.id, m.id, sets);
      Logic.tick(active, m);
    }
    Logic.tick(active);

    // 3) Brand-new tournament in setup (a few teams already)
    const upcoming = Store.createTournament({
      name: 'Ночной открытый',
      date: '2026-06-01',
      format: 'singles',
      courts: 4,
      groupSize: 4,
      advancePerGroup: 2,
      thirdPlaceMatch: false,
    });
    for (const p of players.slice(0, 5)) Store.addTeam(upcoming.id, [p.id]);

    Store.save();
  }

  /* ---------- Pages ---------- */

  // Dashboard
  UI.route('/', function (root) {
    const tournaments = Store.listTournaments();
    const active = tournaments.filter(t => t.status === 'groups' || t.status === 'knockout');
    const announcements = Store.data.announcements.slice(0, 10);

    const isEmpty = !Store.listPlayers().length && !tournaments.length;
    root.appendChild(el(`
      <div class="row space-between">
        <h1>Главная</h1>
        <div class="row">
          <button class="btn secondary" id="demo-btn">${isEmpty ? '✨ Загрузить демо-данные' : '✨ Демо-данные'}</button>
        </div>
      </div>
    `));
    root.querySelector('#demo-btn').addEventListener('click', () => {
      try {
        if (Store.listPlayers().length || Store.listTournaments().length) {
          if (!confirm('Это перезапишет текущие данные. Продолжить?')) return;
          localStorage.removeItem('badminton-cups-v1');
          Store.load();
        }
        seedDemo();
        const p = Store.listPlayers().length;
        const tCnt = Store.listTournaments().length;
        UI.toast('Демо загружено', `Игроков: ${p}, турниров: ${tCnt}. Открой «Турниры».`, 'success');
        UI.render();
      } catch (e) {
        console.error('seedDemo failed', e);
        UI.toast('Ошибка генерации демо', e && e.message ? e.message : String(e), 'error');
      }
    });

    const grid = el(`<div class="grid cols-2"></div>`);
    grid.appendChild(el(`
      <div class="card">
        <h3>Игроки</h3>
        <div style="font-size:32px;font-weight:700">${Store.listPlayers().length}</div>
        <div class="row" style="margin-top:8px">
          <a href="#/players" class="btn small secondary">Открыть реестр</a>
        </div>
      </div>
    `));
    grid.appendChild(el(`
      <div class="card">
        <h3>Турниры</h3>
        <div style="font-size:32px;font-weight:700">${tournaments.length}</div>
        <div class="muted">Активных: ${active.length}</div>
        <div class="row" style="margin-top:8px">
          <a href="#/tournaments" class="btn small secondary">К списку турниров</a>
        </div>
      </div>
    `));
    root.appendChild(grid);

    if (active.length) {
      const sec = el(`<div class="card"><h2>Идут сейчас</h2></div>`);
      for (const t of active) {
        const courtsLive = t.matches.filter(m => m.status === 'live').length;
        sec.appendChild(el(`
          <div class="row space-between" style="padding:8px 0;border-bottom:1px solid var(--border)">
            <div><a href="#/tournament/${t.id}"><b>${escapeHtml(t.name)}</b></a>
              <span class="badge ${t.status === 'knockout' ? 'orange' : 'blue'}">${t.status === 'groups' ? 'Группы' : 'Сетка'}</span>
            </div>
            <div class="muted">Кортов в игре: ${courtsLive}/${t.courts}</div>
          </div>
        `));
      }
      root.appendChild(sec);
    }

    const annCard = el(`<div class="card"><h2>Оповещения</h2></div>`);
    if (!announcements.length) {
      annCard.appendChild(el(`<div class="muted">Пока пусто. Когда матч завершится — здесь появятся следующие пары на кортах.</div>`));
    } else {
      for (const a of announcements) {
        const t = Store.getTournament(a.tournamentId);
        annCard.appendChild(el(`
          <div class="announcement">
            <div>${escapeHtml(a.text)}</div>
            <div class="when">${escapeHtml(t ? t.name : '')} · ${fmtDate(a.when)}</div>
          </div>
        `));
      }
    }
    root.appendChild(annCard);
  });

  // Players list
  UI.route('/players', function (root) {
    root.appendChild(el(`<div class="row space-between"><h1>Игроки</h1></div>`));

    const levels = Store.getLevels();
    const addCard = el(`
      <div class="card">
        <h3>Добавить игрока</h3>
        <div class="row">
          <div class="field grow"><label>Имя</label><input id="pl-name" type="text" placeholder="Имя Фамилия"></div>
          <div class="field"><label>Уровень</label>
            <select id="pl-level">
              ${levels.map(l => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('')}
            </select>
          </div>
          <div><label>&nbsp;</label><button class="btn" id="pl-add">Добавить</button></div>
        </div>
      </div>
    `);
    root.appendChild(addCard);

    addCard.querySelector('#pl-add').addEventListener('click', () => {
      const name = addCard.querySelector('#pl-name').value.trim();
      const level = addCard.querySelector('#pl-level').value;
      if (!name) return UI.toast('Введите имя', '', 'warn');
      Store.addPlayer(name, level);
      UI.render();
    });

    const players = Store.listPlayers();
    const tableCard = el(`<div class="card"><h2>Реестр (${players.length})</h2></div>`);
    if (!players.length) {
      tableCard.appendChild(el(`<div class="muted">Игроков пока нет. Добавьте выше.</div>`));
    } else {
      const table = el(`
        <table>
          <thead><tr><th>Имя</th><th>Уровень</th><th>Турниров</th><th>В/П</th><th></th></tr></thead>
          <tbody></tbody>
        </table>
      `);
      const tbody = table.querySelector('tbody');
      for (const p of players) {
        const history = Store.playerHistory(p.id);
        const wins = history.reduce((s, h) => s + h.wins, 0);
        const losses = history.reduce((s, h) => s + h.losses, 0);
        const tr = el(`
          <tr>
            <td><a href="#/player/${p.id}">${escapeHtml(p.name)}</a></td>
            <td><span class="badge gray">${escapeHtml(p.level)}</span></td>
            <td>${history.length}</td>
            <td>${wins}/${losses}</td>
            <td>
              <button class="icon-btn" data-edit="${p.id}" title="Изменить">✎</button>
              <button class="icon-btn" data-del="${p.id}" title="Удалить">🗑</button>
            </td>
          </tr>
        `);
        tr.querySelector('[data-edit]').addEventListener('click', () => editPlayerModal(p));
        tr.querySelector('[data-del]').addEventListener('click', () => {
          if (confirm(`Удалить игрока «${p.name}»?`)) { Store.removePlayer(p.id); UI.render(); }
        });
        tbody.appendChild(tr);
      }
      tableCard.appendChild(table);
    }
    root.appendChild(tableCard);
  });

  function editPlayerModal(player) {
    const levels = Store.getLevels();
    const body = el(`
      <div class="col">
        <div class="field"><label>Имя</label><input id="ed-name" type="text" value="${escapeHtml(player.name)}"></div>
        <div class="field"><label>Уровень</label>
          <select id="ed-level">${levels.map(l => `<option value="${escapeHtml(l)}" ${l === player.level ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}</select>
        </div>
        <div class="row"><button class="btn" id="ed-save">Сохранить</button></div>
      </div>
    `);
    const m = UI.modal('Редактировать игрока', body);
    body.querySelector('#ed-save').addEventListener('click', () => {
      Store.updatePlayer(player.id, {
        name: body.querySelector('#ed-name').value.trim(),
        level: body.querySelector('#ed-level').value,
      });
      m.close();
      UI.render();
    });
  }

  // Player profile
  UI.route('/player/:id', function (root, params) {
    const p = Store.getPlayer(params.id);
    if (!p) {
      root.appendChild(el(`<div class="empty">Игрок не найден</div>`));
      return;
    }
    const history = Store.playerHistory(p.id);
    const wins = history.reduce((s, h) => s + h.wins, 0);
    const losses = history.reduce((s, h) => s + h.losses, 0);

    root.appendChild(el(`
      <div class="row space-between">
        <h1>${escapeHtml(p.name)}</h1>
        <div><span class="badge">${escapeHtml(p.level)}</span></div>
      </div>
    `));

    root.appendChild(el(`
      <div class="grid cols-3">
        <div class="card"><h3>Турниров</h3><div style="font-size:28px;font-weight:700">${history.length}</div></div>
        <div class="card"><h3>Победы</h3><div style="font-size:28px;font-weight:700;color:var(--green)">${wins}</div></div>
        <div class="card"><h3>Поражения</h3><div style="font-size:28px;font-weight:700;color:var(--red)">${losses}</div></div>
      </div>
    `));

    const card = el(`<div class="card"><h2>История</h2></div>`);
    if (!history.length) {
      card.appendChild(el(`<div class="muted">Игрок ещё не участвовал в турнирах.</div>`));
    } else {
      const table = el(`
        <table>
          <thead><tr><th>Дата</th><th>Турнир</th><th>Формат</th><th>В/П</th><th>Место</th></tr></thead>
          <tbody></tbody>
        </table>
      `);
      const tb = table.querySelector('tbody');
      for (const h of history) {
        tb.appendChild(el(`
          <tr>
            <td>${fmtDateOnly(h.tournamentDate)}</td>
            <td><a href="#/tournament/${h.tournamentId}">${escapeHtml(h.tournamentName)}</a></td>
            <td>${h.format === 'singles' ? 'Одиночка' : 'Пара'}</td>
            <td>${h.wins}/${h.losses}</td>
            <td>${h.finalPlace ? '<b>' + h.finalPlace + '</b>' : '—'}</td>
          </tr>
        `));
      }
      card.appendChild(table);
    }
    root.appendChild(card);
  });

  // Tournaments list
  UI.route('/tournaments', function (root) {
    root.appendChild(el(`<div class="row space-between"><h1>Турниры</h1><button class="btn" id="t-new">+ Новый турнир</button></div>`));

    root.querySelector('#t-new').addEventListener('click', newTournamentModal);

    const tournaments = Store.listTournaments();
    if (!tournaments.length) {
      root.appendChild(el(`<div class="empty">Турниров ещё нет. Создайте первый.</div>`));
      return;
    }
    const card = el(`<div class="card"></div>`);
    const table = el(`
      <table>
        <thead><tr><th>Название</th><th>Дата</th><th>Формат</th><th>Команд</th><th>Статус</th><th></th></tr></thead>
        <tbody></tbody>
      </table>
    `);
    const tb = table.querySelector('tbody');
    for (const t of tournaments) {
      const statusBadge = {
        setup: '<span class="badge gray">Настройка</span>',
        groups: '<span class="badge blue">Группы</span>',
        knockout: '<span class="badge orange">Сетка</span>',
        finished: '<span class="badge green">Завершён</span>',
      }[t.status];
      const tr = el(`
        <tr>
          <td><a href="#/tournament/${t.id}">${escapeHtml(t.name)}</a></td>
          <td>${fmtDateOnly(t.date)}</td>
          <td>${t.format === 'singles' ? 'Одиночка' : 'Пара'}</td>
          <td>${t.teams.length}</td>
          <td>${statusBadge}</td>
          <td><button class="icon-btn" data-del="${t.id}" title="Удалить">🗑</button></td>
        </tr>
      `);
      tr.querySelector('[data-del]').addEventListener('click', () => {
        if (confirm(`Удалить турнир «${t.name}»?`)) { Store.removeTournament(t.id); UI.render(); }
      });
      tb.appendChild(tr);
    }
    card.appendChild(table);
    root.appendChild(card);
  });

  function newTournamentModal() {
    const levels = Store.getLevels();
    const body = el(`
      <div class="col">
        <div class="field"><label>Название</label><input id="nt-name" type="text" placeholder="Кубок выходного дня"></div>
        <div class="row">
          <div class="field grow"><label>Дата</label><input id="nt-date" type="date"></div>
          <div class="field grow"><label>Формат</label>
            <select id="nt-format">
              <option value="singles">Одиночка</option>
              <option value="doubles">Пара</option>
            </select>
          </div>
        </div>
        <div class="row">
          <div class="field grow"><label>Кортов</label><input id="nt-courts" type="number" min="1" max="20" value="2"></div>
          <div class="field grow"><label>Размер группы</label><input id="nt-group" type="number" min="2" max="8" value="4"></div>
          <div class="field grow"><label>Выходят</label><input id="nt-adv" type="number" min="1" max="4" value="2"></div>
        </div>
        <div class="field">
          <label>Уровни (можно ограничить состав)</label>
          <div class="row" id="nt-levels">
            ${levels.map(l => `<label class="row" style="margin:0;gap:4px"><input type="checkbox" value="${escapeHtml(l)}"> ${escapeHtml(l)}</label>`).join('')}
          </div>
          <div class="muted" style="margin-top:4px">Пусто = любые уровни</div>
        </div>
        <div class="row"><label class="row" style="margin:0;gap:4px"><input id="nt-3rd" type="checkbox" checked> Матч за 3-е место</label></div>
        <div class="row"><button class="btn" id="nt-create">Создать</button></div>
      </div>
    `);
    const m = UI.modal('Новый турнир', body);
    body.querySelector('#nt-create').addEventListener('click', () => {
      const name = body.querySelector('#nt-name').value.trim();
      if (!name) return UI.toast('Введите название', '', 'warn');
      const cfg = {
        name,
        date: body.querySelector('#nt-date').value,
        format: body.querySelector('#nt-format').value,
        courts: parseInt(body.querySelector('#nt-courts').value, 10) || 2,
        groupSize: parseInt(body.querySelector('#nt-group').value, 10) || 4,
        advancePerGroup: parseInt(body.querySelector('#nt-adv').value, 10) || 2,
        thirdPlaceMatch: body.querySelector('#nt-3rd').checked,
        levelFilter: Array.from(body.querySelectorAll('#nt-levels input:checked')).map(i => i.value),
      };
      const t = Store.createTournament(cfg);
      m.close();
      UI.go('/tournament/' + t.id);
    });
  }

  /* ---------- Tournament detail (tabs) ---------- */
  UI.route('/tournament/:id', function (root, params) {
    renderTournament(root, params.id, 'teams');
  });
  UI.route('/tournament/:id/:tab', function (root, params) {
    renderTournament(root, params.id, params.tab);
  });

  function renderTournament(root, tid, tab) {
    const t = Store.getTournament(tid);
    if (!t) {
      root.appendChild(el(`<div class="empty">Турнир не найден</div>`));
      return;
    }

    root.appendChild(el(`
      <div class="row space-between">
        <div>
          <h1>${escapeHtml(t.name)}</h1>
          <div class="muted">${fmtDateOnly(t.date)} · ${t.format === 'singles' ? 'Одиночка' : 'Пара'} · ${t.teams.length} ${t.format === 'singles' ? 'игроков' : 'пар'} · ${t.courts} кортов</div>
        </div>
        <div>
          <span class="badge ${t.status === 'finished' ? 'green' : t.status === 'knockout' ? 'orange' : t.status === 'groups' ? 'blue' : 'gray'}">${
            { setup: 'Настройка', groups: 'Группы', knockout: 'Сетка', finished: 'Завершён' }[t.status]
          }</span>
        </div>
      </div>
    `));

    const tabs = el(`
      <div class="tabs">
        <a href="#/tournament/${tid}/teams" data-t="teams">Команды</a>
        <a href="#/tournament/${tid}/groups" data-t="groups">Группы</a>
        <a href="#/tournament/${tid}/bracket" data-t="bracket">Сетка</a>
        <a href="#/tournament/${tid}/courts" data-t="courts">Корты</a>
        <a href="#/tournament/${tid}/schedule" data-t="schedule">Расписание</a>
      </div>
    `);
    tabs.querySelectorAll('a').forEach(a => {
      if (a.dataset.t === tab) a.classList.add('active');
    });
    root.appendChild(tabs);

    const view = document.createElement('div');
    root.appendChild(view);

    if (tab === 'teams') renderTeams(view, t);
    else if (tab === 'groups') renderGroups(view, t);
    else if (tab === 'bracket') renderBracket(view, t);
    else if (tab === 'courts') renderCourts(view, t);
    else if (tab === 'schedule') renderSchedule(view, t);
  }

  function renderTeams(root, t) {
    const allowedLevels = t.levelFilter && t.levelFilter.length ? t.levelFilter : Store.getLevels();
    const availablePlayers = Store.listPlayers().filter(p =>
      allowedLevels.includes(p.level) &&
      !t.teams.some(team => team.playerIds.includes(p.id))
    );

    // Header actions
    const header = el(`<div class="row space-between">
      <h2>Состав (${t.teams.length})</h2>
      <div class="row">
        ${t.status === 'setup' ? `<button class="btn" id="start-groups" ${t.teams.length < 2 ? 'disabled' : ''}>Запустить группы →</button>` : ''}
      </div>
    </div>`);
    root.appendChild(header);

    if (t.status === 'setup') {
      const addCard = el(`<div class="card"><h3>Добавить команду</h3></div>`);
      if (t.format === 'singles') {
        const wrap = el(`<div class="row">
          <div class="field grow"><label>Игрок</label>
            <select id="team-p1">
              <option value="">— выбрать —</option>
              ${availablePlayers.map(p => `<option value="${p.id}">${escapeHtml(p.name)} (${escapeHtml(p.level)})</option>`).join('')}
            </select>
          </div>
          <div><label>&nbsp;</label><button class="btn" id="team-add">+ Добавить</button></div>
        </div>`);
        addCard.appendChild(wrap);
        wrap.querySelector('#team-add').addEventListener('click', () => {
          const pid = wrap.querySelector('#team-p1').value;
          if (!pid) return UI.toast('Выберите игрока', '', 'warn');
          Store.addTeam(t.id, [pid]);
          UI.render();
        });
      } else {
        const wrap = el(`<div class="row">
          <div class="field grow"><label>Игрок 1</label>
            <select id="team-p1">
              <option value="">— выбрать —</option>
              ${availablePlayers.map(p => `<option value="${p.id}">${escapeHtml(p.name)} (${escapeHtml(p.level)})</option>`).join('')}
            </select>
          </div>
          <div class="field grow"><label>Игрок 2</label>
            <select id="team-p2">
              <option value="">— выбрать —</option>
              ${availablePlayers.map(p => `<option value="${p.id}">${escapeHtml(p.name)} (${escapeHtml(p.level)})</option>`).join('')}
            </select>
          </div>
          <div><label>&nbsp;</label><button class="btn" id="team-add">+ Добавить</button></div>
        </div>`);
        addCard.appendChild(wrap);
        wrap.querySelector('#team-add').addEventListener('click', () => {
          const p1 = wrap.querySelector('#team-p1').value;
          const p2 = wrap.querySelector('#team-p2').value;
          if (!p1 || !p2) return UI.toast('Выберите обоих игроков', '', 'warn');
          if (p1 === p2) return UI.toast('Игроки должны быть разными', '', 'warn');
          Store.addTeam(t.id, [p1, p2]);
          UI.render();
        });
      }
      root.appendChild(addCard);
    }

    const listCard = el(`<div class="card"></div>`);
    if (!t.teams.length) {
      listCard.appendChild(el(`<div class="muted">Команд пока нет.</div>`));
    } else {
      const table = el(`
        <table>
          <thead><tr><th>#</th><th>Состав</th><th>Уровень</th>${t.status === 'finished' ? '<th>Место</th>' : ''}${t.status === 'setup' ? '<th></th>' : ''}</tr></thead>
          <tbody></tbody>
        </table>
      `);
      const tb = table.querySelector('tbody');
      t.teams.forEach((team, i) => {
        const tr = el(`
          <tr>
            <td>${i + 1}</td>
            <td>${escapeHtml(Logic.teamName(t, team.id))}</td>
            <td><span class="badge gray">${escapeHtml(team.level)}</span></td>
            ${t.status === 'finished' ? `<td>${team.finalPlace ? '<b>' + team.finalPlace + '</b>' : '—'}</td>` : ''}
            ${t.status === 'setup' ? `<td><button class="icon-btn" data-del="${team.id}">🗑</button></td>` : ''}
          </tr>
        `);
        const delBtn = tr.querySelector('[data-del]');
        if (delBtn) delBtn.addEventListener('click', () => {
          Store.removeTeam(t.id, team.id);
          UI.render();
        });
        tb.appendChild(tr);
      });
      listCard.appendChild(table);
    }
    root.appendChild(listCard);

    const sg = root.querySelector('#start-groups');
    if (sg) sg.addEventListener('click', () => {
      try {
        Logic.startGroupStage(t);
        const events = Logic.tick(t);
        events.forEach(e => UI.toast('Следующий матч', e, 'success'));
        Store.save();
        UI.go('/tournament/' + t.id + '/groups');
      } catch (e) {
        UI.toast('Ошибка', e.message, 'error');
      }
    });
  }

  function renderGroups(root, t) {
    if (t.status === 'setup') {
      root.appendChild(el(`<div class="empty">Группы будут созданы после нажатия «Запустить группы» во вкладке Команды.</div>`));
      return;
    }
    if (!t.groups.length) {
      root.appendChild(el(`<div class="empty">Группы не созданы.</div>`));
      return;
    }
    const grid = el(`<div class="grid cols-2"></div>`);
    for (const g of t.groups) {
      const standings = Logic.standings(t, g);
      const gMatches = t.matches.filter(m => m.stage === 'group' && m.groupId === g.id);
      const finished = gMatches.filter(m => m.status === 'finished').length;

      const card = el(`
        <div class="card">
          <div class="row space-between">
            <h2>Группа ${escapeHtml(g.name)}</h2>
            <span class="badge ${finished === gMatches.length ? 'green' : 'gray'}">${finished}/${gMatches.length}</span>
          </div>
          <table class="standings">
            <thead><tr><th>#</th><th>Команда</th><th>И</th><th>В-П</th><th>Сеты</th><th>Очки</th></tr></thead>
            <tbody></tbody>
          </table>
          <div style="margin-top:12px"><h3>Матчи</h3></div>
        </div>
      `);
      const tbody = card.querySelector('tbody');
      standings.forEach((s, idx) => {
        const isAdv = idx < t.advancePerGroup;
        tbody.appendChild(el(`
          <tr>
            <td class="pos ${isAdv ? 'adv' : ''}">${idx + 1}</td>
            <td>${escapeHtml(Logic.teamName(t, s.teamId))}</td>
            <td>${s.played}</td>
            <td>${s.wins}-${s.losses}</td>
            <td>${s.setsW}-${s.setsL}</td>
            <td>${s.pointsW}-${s.pointsL}</td>
          </tr>
        `));
      });

      const matchList = el(`<div class="col"></div>`);
      gMatches.forEach(m => matchList.appendChild(matchRow(t, m)));
      card.appendChild(matchList);
      grid.appendChild(card);
    }
    root.appendChild(grid);

    if (Logic.allGroupsComplete(t) && !t.koGenerated) {
      const card = el(`<div class="card"><div class="row space-between"><div>Группы сыграны. Готова сетка плей-офф.</div><button class="btn" id="gen-bracket">Сгенерировать сетку →</button></div></div>`);
      card.querySelector('#gen-bracket').addEventListener('click', () => {
        try {
          Logic.generateBracket(t);
          const events = Logic.tick(t);
          events.forEach(e => UI.toast('Следующий матч', e, 'success'));
          UI.go('/tournament/' + t.id + '/bracket');
        } catch (e) {
          UI.toast('Ошибка', e.message, 'error');
        }
      });
      root.appendChild(card);
    }
  }

  function matchRow(t, m) {
    const winnerCls1 = m.winner === m.team1 ? 'winner' : '';
    const winnerCls2 = m.winner === m.team2 ? 'winner' : '';
    const score = (m.sets || []).map(s => `${s[0]}-${s[1]}`).join(', ');
    const statusBadge = {
      pending: m.team1 && m.team2 ? '<span class="badge gray">Ожидает</span>' : '<span class="badge gray">TBD</span>',
      live: `<span class="badge orange">Корт ${m.court}</span>`,
      finished: '<span class="badge green">Сыграно</span>',
    }[m.status];
    const row = el(`
      <div class="row space-between" style="padding:6px 0;border-bottom:1px dashed var(--border)">
        <div class="grow">
          <div class="${winnerCls1}">${escapeHtml(Logic.teamName(t, m.team1))}</div>
          <div class="${winnerCls2}">${escapeHtml(Logic.teamName(t, m.team2))}</div>
        </div>
        <div style="text-align:right">
          <div class="mono" style="font-size:13px">${score || '—'}</div>
          <div>${statusBadge}</div>
        </div>
        <div><button class="icon-btn" data-edit="${m.id}" title="Ввести/изменить счёт">✎</button></div>
      </div>
    `);
    row.querySelector('[data-edit]').addEventListener('click', () => {
      if (!m.team1 || !m.team2) return UI.toast('Команды ещё не определены', '', 'warn');
      scoreEditorModal(t, m);
    });
    return row;
  }

  function scoreEditorModal(t, m) {
    const initial = (m.sets && m.sets.length) ? m.sets.slice() : [[null, null], [null, null], [null, null]];
    while (initial.length < 3) initial.push([null, null]);

    const body = el(`
      <div class="col">
        <div style="text-align:center;font-size:15px">
          <div><b>${escapeHtml(Logic.teamName(t, m.team1))}</b></div>
          <div class="muted">vs</div>
          <div><b>${escapeHtml(Logic.teamName(t, m.team2))}</b></div>
        </div>
        <div class="score-editor" id="sets">
          ${initial.map((s, i) => `
            <div class="score-row">
              <div class="muted">Сет ${i + 1}</div>
              <input type="number" min="0" max="40" value="${s[0] ?? ''}" data-side="0" data-idx="${i}">
              <input type="number" min="0" max="40" value="${s[1] ?? ''}" data-side="1" data-idx="${i}">
              <div></div>
            </div>
          `).join('')}
        </div>
        <div class="row">
          <button class="btn" id="sv">Сохранить результат</button>
          ${m.status === 'finished' ? '<button class="btn ghost" id="rev">Откатить</button>' : ''}
        </div>
      </div>
    `);
    const modal = UI.modal('Счёт матча', body);

    body.querySelector('#sv').addEventListener('click', () => {
      const sets = [];
      for (let i = 0; i < 3; i++) {
        const a = body.querySelector(`input[data-side="0"][data-idx="${i}"]`).value;
        const b = body.querySelector(`input[data-side="1"][data-idx="${i}"]`).value;
        if (a === '' && b === '') continue;
        sets.push([parseInt(a, 10) || 0, parseInt(b, 10) || 0]);
      }
      if (!sets.length) return UI.toast('Введите счёт хотя бы одного сета', '', 'warn');
      // determine winner — count sets won
      let s1 = 0, s2 = 0;
      sets.forEach(([a, b]) => { if (a > b) s1++; else if (b > a) s2++; });
      if (s1 === s2) return UI.toast('Не определён победитель — добавьте решающий сет', '', 'warn');

      Store.finishMatch(t.id, m.id, sets);
      const events = Logic.tick(t, m);
      events.forEach(e => UI.toast('Следующий матч', e, 'success'));
      modal.close();
      UI.render();
    });

    const revBtn = body.querySelector('#rev');
    if (revBtn) revBtn.addEventListener('click', () => {
      m.status = 'pending';
      m.winner = null;
      m.sets = [];
      m.court = null;
      m.finishedAt = null;
      // Clean downstream: child matches that received this match's winner
      for (const child of t.matches) {
        if (child.feedFromA === m.id) { child.team1 = null; child.status = 'pending'; child.court = null; child.sets = []; child.winner = null; }
        if (child.feedFromB === m.id) { child.team2 = null; child.status = 'pending'; child.court = null; child.sets = []; child.winner = null; }
      }
      // Reset placements that may have been set
      for (const team of t.teams) team.finalPlace = null;
      if (t.status === 'finished') t.status = 'knockout';
      Store.save();
      Logic.tick(t);
      modal.close();
      UI.render();
    });
  }

  function renderBracket(root, t) {
    const ko = t.matches.filter(m => m.stage === 'ko');
    if (!ko.length) {
      root.appendChild(el(`<div class="empty">Сетка ещё не сгенерирована. Завершите групповой этап.</div>`));
      return;
    }
    const maxRound = Math.max(...ko.map(m => m.round));
    const wrap = el(`<div class="bracket"></div>`);
    for (let r = 0; r <= maxRound; r++) {
      const roundMatches = ko.filter(m => m.round === r);
      const col = el(`<div class="bracket-round"><h4>${roundLabel(r, maxRound)}</h4></div>`);
      for (const m of roundMatches) {
        const tbd = !m.team1 || !m.team2;
        const cls = m.status === 'finished' ? 'finished' : m.status === 'live' ? 'live' : tbd ? 'tbd' : '';
        const score = (m.sets || []).map(s => `${s[0]}-${s[1]}`).join(' ');
        const node = el(`
          <div class="bracket-match ${cls}" data-match="${m.id}">
            <div class="team ${m.winner === m.team1 ? 'winner' : ''}">
              <span>${escapeHtml(Logic.teamName(t, m.team1)) || '—'}</span>
              <span class="mono">${m.sets?.[0]?.[0] ?? ''}</span>
            </div>
            <div class="vs">vs ${m.status === 'live' ? `· Корт ${m.court}` : ''}</div>
            <div class="team ${m.winner === m.team2 ? 'winner' : ''}">
              <span>${escapeHtml(Logic.teamName(t, m.team2)) || '—'}</span>
              <span class="mono">${m.sets?.[0]?.[1] ?? ''}</span>
            </div>
            ${m.sets && m.sets.length > 1 ? `<div class="muted mono" style="font-size:10px;text-align:right;margin-top:2px">${score}</div>` : ''}
          </div>
        `);
        node.addEventListener('click', () => {
          if (!m.team1 || !m.team2) return;
          scoreEditorModal(t, m);
        });
        col.appendChild(node);
      }
      wrap.appendChild(col);
    }
    root.appendChild(wrap);

    const thirdMatch = t.matches.find(m => m.stage === '3rd');
    if (thirdMatch) {
      const card = el(`<div class="card"><h3>Матч за 3-е место</h3></div>`);
      card.appendChild(matchRow(t, thirdMatch));
      root.appendChild(card);
    }

    if (t.status === 'finished') {
      const podium = t.teams.filter(x => x.finalPlace && x.finalPlace <= 3).sort((a, b) => a.finalPlace - b.finalPlace);
      if (podium.length) {
        const card = el(`<div class="card"><h2>Призёры</h2></div>`);
        for (const p of podium) {
          const icon = p.finalPlace === 1 ? '🥇' : p.finalPlace === 2 ? '🥈' : '🥉';
          card.appendChild(el(`<div style="padding:6px 0">${icon} <b>${escapeHtml(Logic.teamName(t, p.id))}</b></div>`));
        }
        root.appendChild(card);
      }
    }
  }

  function roundLabel(r, maxRound) {
    const left = maxRound - r;
    if (left === 0) return 'Финал';
    if (left === 1) return '1/2';
    if (left === 2) return '1/4';
    if (left === 3) return '1/8';
    if (left === 4) return '1/16';
    return `Раунд ${r + 1}`;
  }

  function renderCourts(root, t) {
    if (t.status === 'setup') {
      root.appendChild(el(`<div class="empty">Турнир ещё не запущен.</div>`));
      return;
    }
    // Active announcements
    const annCard = el(`<div class="card"><h2>Следующие матчи и оповещения</h2></div>`);
    if (!t.announcements.length) {
      annCard.appendChild(el(`<div class="muted">Пока ничего не объявлено.</div>`));
    } else {
      for (const a of t.announcements.slice(0, 8)) {
        annCard.appendChild(el(`<div class="announcement"><div>${escapeHtml(a.text)}</div><div class="when">${fmtDate(a.when)}</div></div>`));
      }
    }
    root.appendChild(annCard);

    const courts = el(`<div class="courts"></div>`);
    const liveByCourt = {};
    for (const m of t.matches) {
      if (m.status === 'live' && m.court) liveByCourt[m.court] = m;
    }
    for (let i = 1; i <= t.courts; i++) {
      const m = liveByCourt[i];
      const card = el(`<div class="court ${m ? 'live' : 'free'}">
        <div class="court-head">
          <div class="court-num">Корт ${i}</div>
          <div class="court-status">${m ? '<span class="badge orange">Идёт игра</span>' : '<span class="badge gray">Свободен</span>'}</div>
        </div>
      </div>`);
      if (m) {
        const div = el(`<div class="court-match">
          <div class="court-team"><b>${escapeHtml(Logic.teamName(t, m.team1))}</b></div>
          <div class="court-vs">vs</div>
          <div class="court-team"><b>${escapeHtml(Logic.teamName(t, m.team2))}</b></div>
          <div class="muted" style="margin-top:6px;font-size:11px">Стадия: ${stageName(m)}</div>
          <div style="margin-top:10px"><button class="btn small" data-finish="${m.id}">Ввести счёт →</button></div>
        </div>`);
        div.querySelector('[data-finish]').addEventListener('click', () => scoreEditorModal(t, m));
        card.appendChild(div);
      }
      courts.appendChild(card);
    }
    root.appendChild(courts);

    // Queue
    const queue = t.matches.filter(m => m.status === 'pending' && m.team1 && m.team2);
    if (queue.length) {
      const card = el(`<div class="card"><h2>Очередь (${queue.length})</h2></div>`);
      const list = el(`<div class="col"></div>`);
      queue.slice(0, 10).forEach(m => {
        list.appendChild(el(`
          <div class="row space-between" style="padding:6px 0;border-bottom:1px dashed var(--border)">
            <div>${escapeHtml(Logic.teamName(t, m.team1))} — ${escapeHtml(Logic.teamName(t, m.team2))}</div>
            <div class="muted">${stageName(m)}</div>
          </div>
        `));
      });
      card.appendChild(list);
      root.appendChild(card);
    }
  }

  function stageName(m) {
    if (m.stage === 'group') return 'Группа';
    if (m.stage === '3rd') return 'Матч за 3-е';
    return 'Плей-офф';
  }

  function renderSchedule(root, t) {
    if (!t.matches.length) {
      root.appendChild(el(`<div class="empty">Расписание появится после запуска турнира.</div>`));
      return;
    }
    const groups = { group: [], ko: [], '3rd': [] };
    for (const m of t.matches) (groups[m.stage] || (groups[m.stage] = [])).push(m);

    const card = el(`<div class="card"><h2>Все матчи</h2></div>`);
    const table = el(`
      <table>
        <thead><tr><th>Стадия</th><th>Матч</th><th>Счёт</th><th>Корт</th><th>Статус</th></tr></thead>
        <tbody></tbody>
      </table>
    `);
    const tb = table.querySelector('tbody');
    const all = [...t.matches].sort((a, b) => {
      if (a.stage !== b.stage) return a.stage === 'group' ? -1 : 1;
      return (a.round || 0) - (b.round || 0);
    });
    for (const m of all) {
      const score = (m.sets || []).map(s => `${s[0]}-${s[1]}`).join(', ');
      const statusBadge = m.status === 'finished'
        ? '<span class="badge green">Сыграно</span>'
        : m.status === 'live' ? '<span class="badge orange">Идёт</span>' : '<span class="badge gray">Ожидает</span>';
      const tr = el(`
        <tr>
          <td>${stageName(m)}${m.stage === 'group' ? ' ' + groupNameOf(t, m) : ''}</td>
          <td>${escapeHtml(Logic.teamName(t, m.team1))} — ${escapeHtml(Logic.teamName(t, m.team2))}</td>
          <td class="mono">${score || '—'}</td>
          <td>${m.court || '—'}</td>
          <td>${statusBadge}</td>
        </tr>
      `);
      tb.appendChild(tr);
    }
    card.appendChild(table);
    root.appendChild(card);
  }

  function groupNameOf(t, m) {
    if (!m.groupId) return '';
    const g = t.groups.find(g => g.id === m.groupId);
    return g ? g.name : '';
  }

  /* ---------- Settings ---------- */
  UI.route('/settings', function (root) {
    root.appendChild(el(`<h1>Настройки</h1>`));
    const levels = Store.getLevels();
    const card = el(`<div class="card">
      <h3>Уровни игроков</h3>
      <div class="muted">От слабого к сильному. Используется для посева в группы. Разделитель — запятая.</div>
      <div class="row" style="margin-top:8px">
        <input id="levels-input" type="text" class="grow" value="${levels.map(escapeHtml).join(', ')}">
        <button class="btn" id="levels-save">Сохранить</button>
      </div>
    </div>`);
    root.appendChild(card);
    card.querySelector('#levels-save').addEventListener('click', () => {
      const txt = card.querySelector('#levels-input').value;
      const arr = txt.split(',').map(s => s.trim()).filter(Boolean);
      if (!arr.length) return UI.toast('Список не может быть пустым', '', 'warn');
      Store.setLevels(arr);
      UI.toast('Сохранено', '', 'success');
      UI.render();
    });

    const dataCard = el(`<div class="card">
      <h3>Данные</h3>
      <div class="row" style="margin-top:8px">
        <button class="btn secondary" id="export">Экспорт JSON</button>
        <button class="btn secondary" id="import">Импорт JSON</button>
        <button class="btn danger" id="wipe">Очистить всё</button>
      </div>
    </div>`);
    root.appendChild(dataCard);
    dataCard.querySelector('#export').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(Store.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'badminton-cups-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      URL.revokeObjectURL(url);
    });
    dataCard.querySelector('#import').addEventListener('click', () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'application/json';
      inp.addEventListener('change', () => {
        const file = inp.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const data = JSON.parse(reader.result);
            Store.data = data;
            Store.save();
            UI.toast('Импортировано', '', 'success');
            UI.render();
          } catch (e) {
            UI.toast('Файл повреждён', '', 'error');
          }
        };
        reader.readAsText(file);
      });
      inp.click();
    });
    dataCard.querySelector('#wipe').addEventListener('click', () => {
      if (confirm('Удалить ВСЕ данные? Это необратимо.')) {
        localStorage.removeItem('badminton-cups-v1');
        Store.load();
        UI.render();
      }
    });
  });

  window.UI = UI;
})();
