document.addEventListener('DOMContentLoaded', () => {
  const resultSummary = document.getElementById('result-summary');
  const reviewSection = document.getElementById('review-section');
  const reviewList = document.getElementById('review-questions-list');
  const toggleReviewBtn = document.getElementById('toggle-review-btn');

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  if (!resultSummary) return;

  const resultId = localStorage.getItem('resultId');
  const token = localStorage.getItem('cbtUserToken') || localStorage.getItem('cbtStudentToken');

  if (!resultId) {
    resultSummary.innerHTML = '<p>No recent examination result is available to display.</p>';
    if (toggleReviewBtn) toggleReviewBtn.style.display = 'none';
    return;
  }

  fetch(`/api/results/${resultId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
    .then(async (response) => {
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to load examination result');
      return result.data;
    })
    .then((result) => {
      const dateObj = new Date(result.submitted_at || result.started_at || Date.now());
      const formattedDate = dateObj.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
      const formattedTime = dateObj.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      resultSummary.innerHTML = `
        <div style="margin-bottom: 16px;">
          <h3 style="margin: 0; color: #0b2545;">${escapeHtml(result.student_name)}</h3>
          <p style="margin: 4px 0; color: #64748b; font-weight: 500;">
            ${escapeHtml(result.course_name)} (${escapeHtml(result.course_code)})
          </p>
          <p style="margin: 4px 0; font-size: 0.9rem; color: #64748b;">
            Date: <strong>${formattedDate}</strong> &nbsp;|&nbsp; Time: <strong>${formattedTime}</strong>
          </p>
        </div>

        <div class="result-stats-grid">
          <div class="result-stat-box">
            <span>Total Questions</span>
            <strong>${result.total_questions}</strong>
          </div>
          <div class="result-stat-box">
            <span>Score</span>
            <strong style="color: #0b2545;">${result.correct_answers} / ${result.total_questions}</strong>
          </div>
          <div class="result-stat-box">
            <span>Percentage</span>
            <strong style="color: ${result.percentage >= 50 ? '#16a34a' : '#dc2626'};">${Number(result.percentage).toFixed(2)}%</strong>
          </div>
          <div class="result-stat-box">
            <span>Correct Answers</span>
            <strong style="color: #16a34a;">${result.correct_answers}</strong>
          </div>
          <div class="result-stat-box">
            <span>Wrong Answers</span>
            <strong style="color: #dc2626;">${result.wrong_answers}</strong>
          </div>
          <div class="result-stat-box">
            <span>Unanswered</span>
            <strong style="color: #ea580c;">${result.unanswered}</strong>
          </div>
        </div>
      `;

      // Render Question & Answer Review
      const answers = result.answers || [];
      if (answers.length === 0) {
        if (reviewList) reviewList.innerHTML = '<p>No question answer details found for this attempt.</p>';
        return;
      }

      if (reviewList) {
        reviewList.innerHTML = answers.map((item, index) => {
          const isCorrect = Number(item.is_correct) === 1;
          const studentChoice = item.selected_option ? item.selected_option.toUpperCase() : 'None (Unanswered)';
          const correctKey = item.correct_answer ? item.correct_answer.toUpperCase() : '';

          return `
            <div class="review-item ${isCorrect ? 'correct' : 'incorrect'}">
              <h4>Question ${index + 1}: ${escapeHtml(item.question_text)}</h4>
              <div class="review-options">
                <div class="review-option ${studentChoice === 'A' ? (isCorrect ? 'is-correct' : 'is-student') : (correctKey === 'A' ? 'is-correct' : '')}">
                  A. ${escapeHtml(item.option_a)}
                </div>
                <div class="review-option ${studentChoice === 'B' ? (isCorrect ? 'is-correct' : 'is-student') : (correctKey === 'B' ? 'is-correct' : '')}">
                  B. ${escapeHtml(item.option_b)}
                </div>
                <div class="review-option ${studentChoice === 'C' ? (isCorrect ? 'is-correct' : 'is-student') : (correctKey === 'C' ? 'is-correct' : '')}">
                  C. ${escapeHtml(item.option_c)}
                </div>
                <div class="review-option ${studentChoice === 'D' ? (isCorrect ? 'is-correct' : 'is-student') : (correctKey === 'D' ? 'is-correct' : '')}">
                  D. ${escapeHtml(item.option_d)}
                </div>
              </div>
              <div style="margin-top: 8px; font-size: 0.9rem;">
                Your Answer: <strong>${escapeHtml(studentChoice)}</strong> &nbsp;|&nbsp;
                Correct Answer: <strong style="color: #166534;">${escapeHtml(correctKey)}</strong>
              </div>
              <span class="review-status-badge ${isCorrect ? 'correct' : 'incorrect'}">
                ${isCorrect ? '✓ Correct' : (item.selected_option ? '✗ Incorrect' : '○ Unanswered')}
              </span>
            </div>
          `;
        }).join('');
      }

      if (toggleReviewBtn && reviewSection) {
        toggleReviewBtn.addEventListener('click', () => {
          const isHidden = reviewSection.style.display === 'none';
          reviewSection.style.display = isHidden ? 'block' : 'none';
          toggleReviewBtn.innerHTML = isHidden
            ? '<i class="fas fa-eye-slash"></i> Hide Answers'
            : '<i class="fas fa-list-check"></i> Review Answers';
          if (isHidden) {
            reviewSection.scrollIntoView({ behavior: 'smooth' });
          }
        });
      }

      // Handle Retake Exam (Top and Bottom buttons)
      const handleRetake = () => {
        if (!result.course_id) {
          window.location.href = './courses.html';
          return;
        }
        localStorage.setItem('selectedCourseId', result.course_id);
        localStorage.removeItem('examId');
        window.location.href = './exam.html';
      };

      const retakeBtn = document.getElementById('retake-exam-btn');
      if (retakeBtn) retakeBtn.addEventListener('click', handleRetake);

      const bottomRetakeBtn = document.getElementById('bottom-retake-btn');
      if (bottomRetakeBtn) bottomRetakeBtn.addEventListener('click', handleRetake);
    })
    .catch((error) => {
      resultSummary.innerHTML = `<p style="color: #dc2626;">${error.message}</p>`;
      if (toggleReviewBtn) toggleReviewBtn.style.display = 'none';
    });
});

