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
      <div class="history-empty-state">
        <i class="fas fa-user-lock"></i>
        <h4 class="history-empty-title">Authentication Required</h4>
        <p class="history-empty-desc">Please log in with your student account to view your examination history.</p>
        <a href="./student-login.html" class="history-review-btn" style="text-decoration: none;">
          <i class="fas fa-sign-in-alt"></i> Log In
        </a>
      </div>
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
        historyList.innerHTML = `
          <div class="history-empty-state">
            <i class="fas fa-clipboard-list"></i>
            <h4 class="history-empty-title">No Practice Attempts Yet</h4>
            <p class="history-empty-desc">You haven't completed any CBT practice exams. Choose a subject to get started!</p>
            <a href="./courses.html" class="history-review-btn" style="text-decoration: none;">
              <i class="fas fa-play-circle"></i> Browse Courses
            </a>
          </div>
        `;
        return;
      }

      historyList.innerHTML = results.map((result) => {
        const dateObj = new Date(result.submitted_at || result.started_at || Date.now());
        const formattedDate = dateObj.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
        const formattedTime = dateObj.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });

        const percentageNum = Number(result.percentage ?? (result.total_questions > 0 ? (result.score / result.total_questions) * 100 : 0));
        const isPassed = percentageNum >= 50;

        return `
          <article class="history-card">
            <div class="history-card-header">
              <span class="history-course-name">${escapeHtml(result.course_name)}</span>
              <span class="history-course-code">(${escapeHtml(result.course_code)})</span>
            </div>
            <div class="history-card-badges">
              <span class="history-badge-score">
                Score: ${result.score} / ${result.total_questions}
              </span>
              <span class="history-badge-percentage ${isPassed ? 'pass' : 'fail'}">
                <i class="fas ${isPassed ? 'fa-check-circle' : 'fa-times-circle'}"></i>
                ${percentageNum.toFixed(2)}%
              </span>
              <span class="history-card-date">
                <i class="far fa-calendar"></i>
                ${formattedDate} &middot; ${formattedTime}
              </span>
            </div>
            <div class="history-card-actions">
              <a href="./result.html" class="history-review-btn view-result-link" data-result-id="${result.id}">
                <i class="fas fa-file-alt"></i> Review Result
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
      historyList.innerHTML = `
        <div class="history-empty-state" style="border-color: #fecaca; background: #fff5f5;">
          <i class="fas fa-exclamation-triangle" style="color: #ef4444;"></i>
          <h4 class="history-empty-title" style="color: #991b1b;">Error Loading History</h4>
          <p class="history-empty-desc" style="color: #dc2626;">${escapeHtml(error.message)}</p>
        </div>
      `;
    });
});
