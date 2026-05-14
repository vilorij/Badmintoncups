/* Tournament logic: seeding, groups, round-robin, court scheduling, brackets. */
(function () {
  const Logic = {

    /* ----- Helpers ----- */
    playersOfTeam(tournament, teamId) {
      const team = tournament.teams.find(t => t.id === teamId);
      return team ? team.playerIds.slice() : [];
    },

    teamName(tournament, teamId) {
      if (!teamId) return '—';
      const team = tournament.teams.find(t => t.id === teamId);
      if (!team) return '—';
      const players = team.playerIds.map(pid => Store.getPlayer(pid)).filter(Boolean);
      const names = players.map(p => p.name);
      return names.join(' / ');
    },

    /* ----- Seeding: snake distribution by level ----- */
    seedIntoGroups(teams, numGroups, levelOrder) {
      // Sort teams by level (strongest first), tie-break by id for stability
      const sorted = [...teams].sort((a, b) => {
        const la = levelOrder.indexOf(a.level);
        const lb = levelOrder.indexOf(b.level);
        if (lb !== la) return lb - la;
        return a.id.localeCompare(b.id);
      });
      // Snake/serpentine draft
      const groups = Array.from({ length: numGroups }, () => []);
      for (let i = 0; i < sorted.length; i++) {
        const row = Math.floor(i / numGroups);
        const col = i % numGroups;
        const target = row % 2 === 0 ? col : (numGroups - 1 - col);
        groups[target].push(sorted[i]);
      }
      return groups;
    },

    /* ----- Round-robin schedule (Berger tables) ----- */
    roundRobin(teamIds) {
      const ts = teamIds.slice();
      if (ts.length < 2) return [];
      const hadBye = ts.length % 2 !== 0;
      if (hadBye) ts.push(null);
      const n = ts.length;
      const rounds = [];
      for (let r = 0; r < n - 1; r++) {
        const round = [];
        for (let i = 0; i < n / 2; i++) {
          const a = ts[i];
          const b = ts[n - 1 - i];
          if (a && b) round.push([a, b]);
        }
        rounds.push(round);
        // rotate: keep first fixed, rotate others
        const last = ts.pop();
        ts.splice(1, 0, last);
      }
      return rounds;
    },

    /* ----- Build groups + their matches into tournament ----- */
    startGroupStage(tournament) {
      if (tournament.teams.length < 2) throw new Error('Нужно минимум 2 команды');
      const levels = Store.getLevels();
      // Determine group count from groupSize
      const N = tournament.teams.length;
      const numGroups = Math.max(1, Math.ceil(N / tournament.groupSize));
      const seeded = this.seedIntoGroups(tournament.teams, numGroups, levels);

      tournament.groups = seeded.map((teams, i) => ({
        id: Store.uid(),
        name: String.fromCharCode(65 + i), // A, B, C, ...
        teamIds: teams.map(t => t.id),
      }));
      // Tag each team with groupId
      for (const g of tournament.groups) {
        for (const tid of g.teamIds) {
          const team = tournament.teams.find(t => t.id === tid);
          if (team) team.groupId = g.id;
        }
      }
      // Generate matches for each group
      tournament.matches = [];
      for (const g of tournament.groups) {
        const rounds = this.roundRobin(g.teamIds);
        rounds.forEach((round, rIdx) => {
          for (const [t1, t2] of round) {
            tournament.matches.push({
              id: Store.uid(),
              stage: 'group',
              groupId: g.id,
              round: rIdx,
              team1: t1,
              team2: t2,
              sets: [],
              status: 'pending', // pending | live | finished
              court: null,
              winner: null,
              feedFromA: null,
              feedFromB: null,
            });
          }
        });
      }
      tournament.status = 'groups';
      tournament.koGenerated = false;
    },

    /* ----- Court scheduling -----
       Assign pending matches to free courts, avoiding player conflicts.
       Returns list of newly assigned matches.
    */
    assignCourts(tournament) {
      const live = tournament.matches.filter(m => m.status === 'live');
      const busyPlayers = new Set();
      const busyCourts = new Set();
      for (const m of live) {
        if (m.court) busyCourts.add(m.court);
        this.playersOfTeam(tournament, m.team1).forEach(p => busyPlayers.add(p));
        this.playersOfTeam(tournament, m.team2).forEach(p => busyPlayers.add(p));
      }

      const freeCourts = [];
      for (let i = 1; i <= tournament.courts; i++) {
        if (!busyCourts.has(i)) freeCourts.push(i);
      }

      // Build pending queue: prioritize matches with smaller round (groups have round indexes; KO too)
      // For KO, also require both teams set (no null) — those are TBD until parent finishes.
      const pending = tournament.matches
        .filter(m => m.status === 'pending' && m.team1 && m.team2)
        .sort((a, b) => {
          // groups first if mixed; within stage by round
          if (a.stage !== b.stage) return a.stage === 'group' ? -1 : 1;
          return (a.round || 0) - (b.round || 0);
        });

      const newlyAssigned = [];
      const taken = new Set();
      for (const court of freeCourts) {
        for (const m of pending) {
          if (taken.has(m.id)) continue;
          const players = [
            ...this.playersOfTeam(tournament, m.team1),
            ...this.playersOfTeam(tournament, m.team2),
          ];
          if (players.some(p => busyPlayers.has(p))) continue;
          // Assign
          m.status = 'live';
          m.court = court;
          m.startedAt = Date.now();
          players.forEach(p => busyPlayers.add(p));
          taken.add(m.id);
          newlyAssigned.push(m);
          break;
        }
      }
      return newlyAssigned;
    },

    /* ----- Group standings -----
       Rank by: wins, then set diff, then point diff, then head-to-head wins.
    */
    standings(tournament, group) {
      const stats = {};
      for (const tid of group.teamIds) {
        stats[tid] = {
          teamId: tid,
          played: 0, wins: 0, losses: 0,
          setsW: 0, setsL: 0,
          pointsW: 0, pointsL: 0,
        };
      }
      const groupMatches = tournament.matches.filter(m =>
        m.stage === 'group' && m.groupId === group.id
      );
      for (const m of groupMatches) {
        if (m.status !== 'finished') continue;
        const s1 = stats[m.team1], s2 = stats[m.team2];
        if (!s1 || !s2) continue;
        s1.played++; s2.played++;
        let setsW1 = 0, setsW2 = 0;
        let p1Total = 0, p2Total = 0;
        for (const [p1, p2] of m.sets || []) {
          p1Total += p1; p2Total += p2;
          if (p1 > p2) setsW1++; else if (p2 > p1) setsW2++;
        }
        s1.setsW += setsW1; s1.setsL += setsW2;
        s2.setsW += setsW2; s2.setsL += setsW1;
        s1.pointsW += p1Total; s1.pointsL += p2Total;
        s2.pointsW += p2Total; s2.pointsL += p1Total;
        if (m.winner === m.team1) { s1.wins++; s2.losses++; }
        else if (m.winner === m.team2) { s2.wins++; s1.losses++; }
      }
      const arr = Object.values(stats);
      arr.sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        const sdA = a.setsW - a.setsL, sdB = b.setsW - b.setsL;
        if (sdB !== sdA) return sdB - sdA;
        const pdA = a.pointsW - a.pointsL, pdB = b.pointsW - b.pointsL;
        if (pdB !== pdA) return pdB - pdA;
        // h2h
        const h2h = groupMatches.find(m =>
          m.status === 'finished' &&
          ((m.team1 === a.teamId && m.team2 === b.teamId) || (m.team1 === b.teamId && m.team2 === a.teamId))
        );
        if (h2h) {
          if (h2h.winner === a.teamId) return -1;
          if (h2h.winner === b.teamId) return 1;
        }
        return 0;
      });
      return arr;
    },

    groupComplete(tournament, group) {
      const groupMatches = tournament.matches.filter(m =>
        m.stage === 'group' && m.groupId === group.id
      );
      return groupMatches.length > 0 && groupMatches.every(m => m.status === 'finished');
    },

    allGroupsComplete(tournament) {
      return tournament.groups.length > 0 && tournament.groups.every(g => this.groupComplete(tournament, g));
    },

    /* ----- Bracket generation ----- */
    bracketSeeding(size) {
      if (size === 1) return [1];
      const half = this.bracketSeeding(size / 2);
      const out = [];
      for (const s of half) {
        out.push(s);
        out.push(size + 1 - s);
      }
      return out;
    },

    nextPow2(n) {
      let p = 1;
      while (p < n) p *= 2;
      return Math.max(p, 2);
    },

    generateBracket(tournament) {
      // Collect advancers: 1st of A, 1st of B, ..., 2nd of A, 2nd of B...
      const advancers = [];
      for (let pos = 0; pos < tournament.advancePerGroup; pos++) {
        for (const g of tournament.groups) {
          const standings = this.standings(tournament, g);
          if (standings[pos]) {
            advancers.push({
              teamId: standings[pos].teamId,
              groupName: g.name,
              groupPos: pos + 1,
            });
          }
        }
      }
      if (advancers.length < 2) throw new Error('Слишком мало команд для сетки');

      const size = this.nextPow2(advancers.length);
      const placements = this.bracketSeeding(size); // length = size, contains seeds 1..size

      // Build initial slots
      let slots = placements.map(seed => {
        const a = advancers[seed - 1];
        return a
          ? { teamId: a.teamId, sourceMatchId: null, bye: false }
          : { teamId: null, sourceMatchId: null, bye: true };
      });

      // Strip existing KO matches
      tournament.matches = tournament.matches.filter(m => m.stage !== 'ko' && m.stage !== '3rd');

      const koMatches = [];
      let round = 0;
      while (slots.length > 1) {
        const next = [];
        for (let i = 0; i < slots.length; i += 2) {
          const a = slots[i], b = slots[i + 1];
          if (a.bye && b.bye) {
            next.push({ teamId: null, sourceMatchId: null, bye: true });
          } else if (a.bye) {
            next.push({ teamId: b.teamId, sourceMatchId: b.sourceMatchId, bye: false });
          } else if (b.bye) {
            next.push({ teamId: a.teamId, sourceMatchId: a.sourceMatchId, bye: false });
          } else {
            const m = {
              id: Store.uid(),
              stage: 'ko',
              round,
              team1: a.teamId,
              team2: b.teamId,
              sets: [],
              status: 'pending',
              court: null,
              winner: null,
              feedFromA: a.sourceMatchId,
              feedFromB: b.sourceMatchId,
            };
            koMatches.push(m);
            next.push({ teamId: null, sourceMatchId: m.id, bye: false });
          }
        }
        slots = next;
        round++;
      }
      tournament.matches.push(...koMatches);

      // Optional 3rd-place match: created when both semifinals finish.
      // We mark it by creating a placeholder linking to the two semi losers.
      if (tournament.thirdPlaceMatch) {
        // Find semifinals: matches whose winner feeds into the final
        const finalMatch = koMatches.find(m => m.round === Math.max(...koMatches.map(x => x.round)));
        if (finalMatch && finalMatch.feedFromA && finalMatch.feedFromB) {
          tournament.matches.push({
            id: Store.uid(),
            stage: '3rd',
            round: finalMatch.round,
            team1: null,
            team2: null,
            sets: [],
            status: 'pending',
            court: null,
            winner: null,
            // we resolve loser of semifinals dynamically when propagating
            feedFromA: finalMatch.feedFromA,
            feedFromB: finalMatch.feedFromB,
            isLoserBracket: true,
          });
        }
      }

      tournament.koGenerated = true;
      tournament.status = 'knockout';
    },

    /* ----- After a match finishes, propagate winner into next slot ----- */
    propagateWinner(tournament, completedMatch) {
      const losers = {};
      for (const m of tournament.matches) {
        if (m.id === completedMatch.id) continue;
        // For KO winner advancement
        if (m.stage === 'ko' || m.stage === '3rd') {
          if (m.feedFromA === completedMatch.id) {
            if (m.stage === '3rd' && m.isLoserBracket) {
              const loserId = completedMatch.team1 === completedMatch.winner ? completedMatch.team2 : completedMatch.team1;
              m.team1 = loserId;
            } else {
              m.team1 = completedMatch.winner;
            }
          }
          if (m.feedFromB === completedMatch.id) {
            if (m.stage === '3rd' && m.isLoserBracket) {
              const loserId = completedMatch.team1 === completedMatch.winner ? completedMatch.team2 : completedMatch.team1;
              m.team2 = loserId;
            } else {
              m.team2 = completedMatch.winner;
            }
          }
        }
      }
    },

    /* ----- Final placement once everything is done ----- */
    computePlacements(tournament) {
      if (!tournament.koGenerated) return;
      const ko = tournament.matches.filter(m => m.stage === 'ko');
      if (!ko.length) return;
      const maxRound = Math.max(...ko.map(m => m.round));
      const finalMatch = ko.find(m => m.round === maxRound);
      if (!finalMatch || finalMatch.status !== 'finished') return;

      // 1st & 2nd
      const winner = finalMatch.winner;
      const loserFinal = finalMatch.team1 === winner ? finalMatch.team2 : finalMatch.team1;
      this.setPlace(tournament, winner, 1);
      this.setPlace(tournament, loserFinal, 2);

      // 3rd from 3rd-place match if present, else semifinal losers tied 3rd
      const thirdMatch = tournament.matches.find(m => m.stage === '3rd');
      if (thirdMatch && thirdMatch.status === 'finished') {
        const w = thirdMatch.winner;
        const l = thirdMatch.team1 === w ? thirdMatch.team2 : thirdMatch.team1;
        this.setPlace(tournament, w, 3);
        this.setPlace(tournament, l, 4);
      } else {
        const semis = ko.filter(m => m.round === maxRound - 1);
        for (const s of semis) {
          if (s.status !== 'finished') continue;
          const loser = s.team1 === s.winner ? s.team2 : s.team1;
          this.setPlace(tournament, loser, 3);
        }
      }

      // Check if everything done -> finished
      const allKoDone = ko.every(m => m.status === 'finished');
      if (allKoDone) tournament.status = 'finished';
    },

    setPlace(tournament, teamId, place) {
      const team = tournament.teams.find(t => t.id === teamId);
      if (team) team.finalPlace = place;
    },

    /* ----- Tick: after any match change, propagate + reassign courts + announce ----- */
    tick(tournament, justFinished) {
      if (justFinished && justFinished.status === 'finished') this.propagateWinner(tournament, justFinished);
      // Try to generate bracket automatically if groups done & not generated yet
      if (tournament.status === 'groups' && this.allGroupsComplete(tournament) && !tournament.koGenerated) {
        try { this.generateBracket(tournament); } catch (e) { /* not enough teams */ }
      }
      this.computePlacements(tournament);
      const newlyAssigned = this.assignCourts(tournament);
      // Build announcements
      const events = [];
      for (const m of newlyAssigned) {
        const text = `Корт ${m.court}: ${this.teamName(tournament, m.team1)} — ${this.teamName(tournament, m.team2)}`;
        Store.pushAnnouncement(tournament.id, text);
        events.push(text);
      }
      Store.save();
      return events;
    },
  };

  window.Logic = Logic;
})();
