/* Storage layer: localStorage-backed persistence */
(function () {
  const KEY = 'badminton-cups-v1';

  const DEFAULT_LEVELS = ['beginner', 'tito', 'N-', 'N', 'N+', 'N/s', 'S-', 'S', 'S+'];

  const Store = {
    data: null,

    load() {
      try {
        const raw = localStorage.getItem(KEY);
        this.data = raw ? JSON.parse(raw) : null;
      } catch (e) {
        console.warn('Store load failed', e);
        this.data = null;
      }
      if (!this.data) {
        this.data = {
          players: [],
          tournaments: [],
          announcements: [],
          settings: { levels: [...DEFAULT_LEVELS] },
        };
        this.save();
      }
      if (!this.data.settings) this.data.settings = { levels: [...DEFAULT_LEVELS] };
      if (!this.data.announcements) this.data.announcements = [];
    },

    save() {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    },

    uid() {
      return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    },

    /* ------- Settings ------- */
    getLevels() { return this.data.settings.levels.slice(); },
    setLevels(levels) {
      this.data.settings.levels = levels.filter(Boolean);
      this.save();
    },

    /* ------- Players ------- */
    listPlayers() {
      return this.data.players.slice().sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    },
    getPlayer(id) { return this.data.players.find(p => p.id === id); },
    addPlayer(name, level) {
      const player = { id: this.uid(), name: name.trim(), level, createdAt: Date.now() };
      this.data.players.push(player);
      this.save();
      return player;
    },
    updatePlayer(id, patch) {
      const p = this.getPlayer(id);
      if (p) { Object.assign(p, patch); this.save(); }
    },
    removePlayer(id) {
      this.data.players = this.data.players.filter(p => p.id !== id);
      this.save();
    },

    /* ------- Tournaments ------- */
    listTournaments() {
      return this.data.tournaments.slice().sort((a, b) => b.createdAt - a.createdAt);
    },
    getTournament(id) { return this.data.tournaments.find(t => t.id === id); },
    createTournament(cfg) {
      const t = {
        id: this.uid(),
        name: cfg.name,
        date: cfg.date || '',
        format: cfg.format,                // 'singles' | 'doubles'
        levelFilter: cfg.levelFilter || [],// allowed levels (empty = any)
        courts: cfg.courts || 2,
        groupSize: cfg.groupSize || 4,
        advancePerGroup: cfg.advancePerGroup || 2,
        thirdPlaceMatch: !!cfg.thirdPlaceMatch,
        teams: [],
        groups: [],
        matches: [],
        koGenerated: false,
        status: 'setup',                   // setup | groups | knockout | finished
        announcements: [],
        createdAt: Date.now(),
      };
      this.data.tournaments.push(t);
      this.save();
      return t;
    },
    updateTournament(id, patch) {
      const t = this.getTournament(id);
      if (t) { Object.assign(t, patch); this.save(); }
    },
    removeTournament(id) {
      this.data.tournaments = this.data.tournaments.filter(t => t.id !== id);
      this.save();
    },

    /* ------- Teams ------- */
    addTeam(tournamentId, playerIds, levelOverride) {
      const t = this.getTournament(tournamentId);
      if (!t) return null;
      const players = playerIds.map(pid => this.getPlayer(pid)).filter(Boolean);
      if (!players.length) return null;
      const team = {
        id: this.uid(),
        playerIds: players.map(p => p.id),
        // average level = highest-ranked level among players
        level: levelOverride || this.dominantLevel(players),
        groupId: null,
        finalPlace: null,
      };
      t.teams.push(team);
      this.save();
      return team;
    },
    removeTeam(tournamentId, teamId) {
      const t = this.getTournament(tournamentId);
      if (!t) return;
      t.teams = t.teams.filter(x => x.id !== teamId);
      this.save();
    },
    dominantLevel(players) {
      const levels = this.getLevels();
      let max = -1;
      for (const p of players) {
        const idx = levels.indexOf(p.level);
        if (idx > max) max = idx;
      }
      return max >= 0 ? levels[max] : (players[0] && players[0].level);
    },

    /* ------- Matches ------- */
    finishMatch(tournamentId, matchId, sets) {
      const t = this.getTournament(tournamentId);
      if (!t) return;
      const m = t.matches.find(x => x.id === matchId);
      if (!m) return;
      m.sets = sets;
      // determine winner
      let s1 = 0, s2 = 0;
      for (const [a, b] of sets) { if (a > b) s1++; else if (b > a) s2++; }
      if (s1 === s2) return; // not decided
      m.winner = s1 > s2 ? m.team1 : m.team2;
      m.status = 'finished';
      m.finishedAt = Date.now();
      m.court = null;
      this.save();
    },

    /* ------- Announcements ------- */
    pushAnnouncement(tournamentId, text) {
      const t = this.getTournament(tournamentId);
      const item = { id: this.uid(), text, when: Date.now() };
      if (t) {
        t.announcements.unshift(item);
        if (t.announcements.length > 50) t.announcements.length = 50;
      }
      this.data.announcements.unshift({ ...item, tournamentId });
      if (this.data.announcements.length > 100) this.data.announcements.length = 100;
      this.save();
      return item;
    },

    /* ------- History ------- */
    playerHistory(playerId) {
      const out = [];
      for (const t of this.data.tournaments) {
        const team = t.teams.find(tm => tm.playerIds.includes(playerId));
        if (!team) continue;
        const matches = t.matches.filter(m =>
          (m.team1 === team.id || m.team2 === team.id) && m.status === 'finished'
        );
        const wins = matches.filter(m => m.winner === team.id).length;
        out.push({
          tournamentId: t.id,
          tournamentName: t.name,
          tournamentDate: t.date,
          format: t.format,
          teamId: team.id,
          played: matches.length,
          wins,
          losses: matches.length - wins,
          finalPlace: team.finalPlace,
          status: t.status,
        });
      }
      return out.sort((a, b) => (b.tournamentDate || '').localeCompare(a.tournamentDate || ''));
    },
  };

  window.Store = Store;
  Store.load();
})();
