// Attendance statistics. A student's rate counts present and late as attended and leaves excused sessions out.
export function groupStats(db, groupId) {
  const total = db.get("SELECT COUNT(*) AS n FROM sessions WHERE group_id = ? AND status = 'closed'", groupId).n;
  const rows = db.all(
    `SELECT a.student_id, a.status, COUNT(*) AS c FROM attendance a
     JOIN sessions s ON s.id = a.session_id
     WHERE s.group_id = ? AND s.status = 'closed' GROUP BY a.student_id, a.status`, groupId);
  const map = new Map();
  const ensure = (id) => {
    if (!map.has(id)) map.set(id, { present: 0, late: 0, absent: 0, excused: 0, total, rate: null, absences: 0 });
    return map.get(id);
  };
  for (const r of rows) ensure(r.student_id)[r.status] = r.c;
  for (const s of map.values()) finish(s);
  return { total, get: (id) => map.get(id) || finish({ present: 0, late: 0, absent: 0, excused: 0, total, rate: null, absences: 0 }) };
}
export function finish(s) {
  const denom = s.total - s.excused;
  s.absences = s.absent;
  s.rate = denom > 0 ? (s.present + s.late) / denom : null;
  return s;
}
export function flagFor(stat, group) {
  if (stat.absences >= group.absence_notice) return 'risk';
  if (stat.absences >= group.absence_warn) return 'warn';
  return 'ok';
}

// Weighted final grade on a scale of 20 (the scale used by Algerian universities).
export function finalGrade(assessments, grades) {
  let num = 0, den = 0, graded = 0;
  for (const a of assessments) {
    const g = grades[a.id];
    if (!g || g.score == null || !(a.max_score > 0)) continue;
    num += (g.score / a.max_score) * a.weight;
    den += a.weight;
    graded++;
  }
  return { final: den > 0 ? Math.round((num / den) * 20 * 100) / 100 : null, graded, of: assessments.length };
}
