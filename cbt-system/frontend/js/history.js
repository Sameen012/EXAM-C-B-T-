document.addEventListener('DOMContentLoaded', () => {
  const historyList = document.getElementById('history-list');
  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  if (!historyList) return;

  const token = localStorage.getItem('cbtUserToken') || localStorage.getItem('cbtStudentToken');

  if (!token) {
    historyList.innerHTML = `
      <p>Please <a href="./student-login.html" style="color: #0b2545; font-weight: 600;">log in</a> with your student account to view your examination history.</p>
    `;
    return;
  }

  fetch('/api/results?myResults=true', {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then(async (response) => {
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to load practice history');
      return result.data?.items || [];
    })
    .then((results) => {
      if (results.length === 0) {
        historyList.innerHTML = '<p>No completed practice attempts found. Choose a course and start practicing!</p>';
        return;
      }

      historyList.innerHTML = results.map((result) => {
        const dateObj = new Date(result.submitted_at || result.started_at || Date.now());
        const formattedDate = dateObj.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        const formattedTime = dateObj.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        const isPassed = Number(result.percentage) >= 50;

        return `
          <article class="history-card">
            <div style="display: flex; flex-direction: column; gap: 8px;">
              <div>
                <h3 style="margin: 0 0 4px 0; color: #0b2545;">
                  ${escapeHtml(result.course_name)}
                  <span style="font-size: 0.85rem; color: #64748b; background: #f1f5f9; padding: 2px 8px; border-radius: 4px; margin-left: 6px;">(${escapeHtml(result.course_code)})</span>
                </h3>
              </div>
              <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                <span class="score-pill">
                  Score: <strong>${result.score}</strong> / ${result.total_questions}
                </span>
                <span class="percentage-pill ${isPassed ? 'pass' : 'fail'}">
                  <i class="fas ${isPassed ? 'fa-check-circle' : 'fa-times-circle'}" style="font-size: 0.78rem;"></i>
                  ${Number(result.percentage).toFixed(2)}%
                </span>
                <span class="cell-date">
                  <i class="far fa-calendar-alt"></i> ${formattedDate} &bull; ${formattedTime}
                </span>
              </div>
            </div>
            <div>
              <a href="./result.html" class="primary-btn view-result-link" data-result-id="${result.id}" style="text-decoration: none; padding: 10px 18px; font-size: 0.9rem; display: inline-flex; align-items: center; gap: 6px;">
                <i class="fas fa-poll"></i> Review Result
              </a>
            </div>
          </article>
        `;
      }).join('');

      historyList.querySelectorAll('.view-result-link').forEach((link) => {
        link.addEventListener('click', () => {
          localStorage.setItem('resultId', link.dataset.resultId);
        });
      });
    })
    .catch((error) => {
      historyList.innerHTML = `<p style="color: #dc2626;">${error.message}</p>`;
    });
});
