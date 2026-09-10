document.addEventListener('DOMContentLoaded', async () => {
  let studentName = localStorage.getItem('studentName');
  const selectedCourseId = localStorage.getItem('selectedCourseId');
  let savedExamId = localStorage.getItem('examId');
  const studentToken = localStorage.getItem('cbtUserToken') || localStorage.getItem('cbtAdminToken') || localStorage.getItem('cbtStudentToken');

  const questionText = document.getElementById('question-text');
  const questionCounter = document.getElementById('question-counter');
  const countdownTimer = document.getElementById('countdown-timer');
  const questionNumberPanel = document.getElementById('question-number-panel');
  const answerOptions = document.getElementById('answer-options');
  const previousButton = document.getElementById('prev-question');
  const nextButton = document.getElementById('next-question');
  const submitButton = document.getElementById('submit-exam');
  const studentNameLabel = document.getElementById('student-name-label');
  const courseNameLabel = document.getElementById('course-name-label');
  const examNotice = document.getElementById('exam-notice');

  // Confirmation modal elements
  const confirmModal = document.getElementById('submit-confirm-modal');
  const modalTotal = document.getElementById('modal-total-questions');
  const modalAnswered = document.getElementById('modal-answered-questions');
  const modalUnanswered = document.getElementById('modal-unanswered-questions');
  const modalCancelBtn = document.getElementById('modal-cancel-btn');
  const modalConfirmBtn = document.getElementById('modal-confirm-btn');

  // Fallback to fetch profile name if authenticated token exists but studentName key was absent
  if (!studentName && studentToken) {
    try {
      const meRes = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      if (meRes.ok) {
        const meData = await meRes.json();
        if (meData.data?.user?.fullName) {
          studentName = meData.data.user.fullName;
          localStorage.setItem('studentName', studentName);
        }
      }
    } catch (_) {}
    if (!studentName) {
      studentName = 'Student';
      localStorage.setItem('studentName', studentName);
    }
  }

  if (!questionText || !studentName) {
    window.location.href = './student-login.html';
    return;
  }

  if (!selectedCourseId) {
    window.location.href = './courses.html';
    return;
  }

  let questions = [];
  let currentIndex = 0;
  let answers = {};
  let timerId;
  let submitted = false;

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const renderQuestion = () => {
    const question = questions[currentIndex];
    if (!question) return;

    questionText.textContent = question.question_text;
    questionCounter.textContent = `Question ${currentIndex + 1} of ${questions.length}`;
    answerOptions.innerHTML = ['A', 'B', 'C', 'D'].map((option) => `
      <label class="answer-option">
        <input type="radio" name="answer" value="${option}" ${answers[question.id] === option ? 'checked' : ''} />
        <span>${option}. ${escapeHtml(question[`option_${option.toLowerCase()}`])}</span>
      </label>
    `).join('');

    answerOptions.querySelectorAll('input').forEach((input) => {
      input.addEventListener('change', () => {
        answers[question.id] = input.value;
        renderNavigation();
      });
    });

    previousButton.disabled = currentIndex === 0;
    nextButton.disabled = currentIndex === questions.length - 1;
    renderNavigation();
  };

  const renderNavigation = () => {
    questionNumberPanel.innerHTML = questions.map((question, index) => `
      <button type="button" class="nav-btn ${index === currentIndex ? 'active' : ''} ${answers[question.id] ? 'answered' : ''}" data-index="${index}">${index + 1}</button>
    `).join('');

    questionNumberPanel.querySelectorAll('.nav-btn').forEach((button) => {
      button.addEventListener('click', () => {
        currentIndex = Number(button.dataset.index);
        renderQuestion();
      });
    });
  };

  const startTimer = (startedAt) => {
    const durationMs = 60 * 60 * 1000; // 60 minutes
    const startTime = new Date(startedAt).getTime();
    const endTime = startTime + durationMs;

    const updateTimer = () => {
      const remaining = Math.max(0, endTime - Date.now());
      const totalSeconds = Math.floor(remaining / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;

      countdownTimer.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

      // Automatically submit when the timer reaches 00:00 without requiring confirmation
      if (remaining === 0) {
        window.clearInterval(timerId);
        executeSubmission(true);
      }
    };

    updateTimer();
    timerId = window.setInterval(updateTimer, 1000);
  };

  const executeSubmission = async (isAutoSubmit = false) => {
    if (submitted) return;
    submitted = true;
    window.clearInterval(timerId);

    if (confirmModal) confirmModal.style.display = 'none';

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (studentToken) headers.Authorization = `Bearer ${studentToken}`;

      const response = await fetch('/api/exams/submit', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          examId: localStorage.getItem('examId'),
          answers: Object.entries(answers).map(([questionId, selectedOption]) => ({ questionId, selectedOption })),
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to submit exam');

      localStorage.setItem('resultId', result.data.resultId);
      localStorage.removeItem('examId');
      window.location.href = './result.html';
    } catch (error) {
      submitted = false;
      alert(isAutoSubmit ? 'Time expired. Finalizing submission...' : (error.message || 'Unable to submit exam.'));
    }
  };

  const loadExam = async () => {
    try {
      let result = null;
      const headers = { 'Content-Type': 'application/json' };
      if (studentToken) headers.Authorization = `Bearer ${studentToken}`;

      // 1. If savedExamId exists, attempt to resume active in-progress session for this course
      if (savedExamId) {
        try {
          const response = await fetch(`/api/exams/${savedExamId}`, { headers });
          if (response.ok) {
            const data = await response.json();
            if (
              data.success &&
              data.data &&
              !data.data.submitted_at &&
              (!selectedCourseId || String(data.data.course_id) === String(selectedCourseId)) &&
              Array.isArray(data.data.questions) &&
              data.data.questions.length > 0
            ) {
              result = data;
            } else {
              localStorage.removeItem('examId');
              savedExamId = null;
            }
          } else {
            localStorage.removeItem('examId');
            savedExamId = null;
          }
        } catch (_) {
          localStorage.removeItem('examId');
          savedExamId = null;
        }
      }

      // 2. If no valid in-progress exam was resumed, start a fresh exam session for selectedCourseId
      if (!result) {
        const response = await fetch('/api/exams/start', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            studentName: studentName || 'Student',
            courseId: selectedCourseId,
            questionCount: 100,
          }),
        });

        const startData = await response.json();
        if (!response.ok || !startData.success) {
          throw new Error(startData.message || 'Unable to start exam for this course');
        }

        result = startData;
        if (result.data?.examId) {
          localStorage.setItem('examId', result.data.examId);
          savedExamId = result.data.examId;
        }
      }

      const exam = result.data;
      questions = exam.questions || [];
      studentNameLabel.textContent = exam.student_name || studentName || 'Student';
      courseNameLabel.textContent = exam.course_name || exam.course?.course_name || 'Course';

      if (examNotice && (exam.isPartialQuestionCount || questions.length < 100)) {
        examNotice.textContent = `Notice: This course currently has ${questions.length} question(s). You will be tested on all available questions.`;
        examNotice.style.display = 'block';
      }

      if (questions.length === 0) {
        throw new Error('No questions are available for this course yet. Please upload questions or select another course.');
      }

      renderQuestion();
      startTimer(exam.started_at || new Date().toISOString());
    } catch (error) {
      localStorage.removeItem('examId');
      if (answerOptions) answerOptions.innerHTML = '';
      if (questionNumberPanel) questionNumberPanel.innerHTML = '';
      if (questionCounter) questionCounter.textContent = 'Notice';

      questionText.innerHTML = `
        <div style="color: #dc2626; font-size: 1.15rem; margin-bottom: 14px;">
          <i class="fas fa-exclamation-triangle" style="margin-right: 6px;"></i> ${escapeHtml(error.message)}
        </div>
        <a href="./courses.html" class="primary-btn" style="display: inline-flex; align-items: center; gap: 8px; text-decoration: none; padding: 10px 18px; font-size: 0.95rem;">
          <i class="fas fa-arrow-left"></i> Return to Course Selection
        </a>
      `;
      previousButton.disabled = true;
      nextButton.disabled = true;
      submitButton.disabled = true;
    }
  };

  previousButton.addEventListener('click', () => {
    if (currentIndex > 0) {
      currentIndex -= 1;
      renderQuestion();
    }
  });

  nextButton.addEventListener('click', () => {
    if (currentIndex < questions.length - 1) {
      currentIndex += 1;
      renderQuestion();
    }
  });

  // Open confirmation modal when user manually clicks Submit Exam
  submitButton.addEventListener('click', () => {
    if (submitted) return;

    const totalCount = questions.length;
    const answeredCount = Object.keys(answers).length;
    const unansweredCount = totalCount - answeredCount;

    if (modalTotal) modalTotal.textContent = totalCount;
    if (modalAnswered) modalAnswered.textContent = answeredCount;
    if (modalUnanswered) modalUnanswered.textContent = unansweredCount;

    if (confirmModal) {
      confirmModal.style.display = 'flex';
    } else {
      if (window.confirm(`You have answered ${answeredCount} of ${totalCount} questions (${unansweredCount} unanswered). Do you want to submit now?`)) {
        executeSubmission(false);
      }
    }
  });

  if (modalCancelBtn) {
    modalCancelBtn.addEventListener('click', () => {
      if (confirmModal) confirmModal.style.display = 'none';
    });
  }

  if (modalConfirmBtn) {
    modalConfirmBtn.addEventListener('click', () => {
      executeSubmission(false);
    });
  }

  loadExam();
});

