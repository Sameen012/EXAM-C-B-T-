document.addEventListener('DOMContentLoaded', () => {
  const studentLoginForm = document.getElementById('student-login-form');
  const registerForm = document.getElementById('register-form');
  const courseSelectionForm = document.getElementById('course-selection-form');
  const studentLogoutBtn = document.getElementById('student-logout-btn');
  const studentWelcomeName = document.getElementById('student-welcome-name');
  const recentResultsContainer = document.getElementById('recent-results-container');
  const courseDetailsBox = document.getElementById('course-details-box');
  const studentToken = localStorage.getItem('cbtUserToken') || localStorage.getItem('cbtStudentToken');

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  // Redirect logged-in user away from login page
  if (studentToken && window.location.pathname.endsWith('/student-login.html')) {
    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${studentToken}` },
    }).then(async (response) => {
      if (response.ok) {
        const result = await response.json();
        const user = result.data;
        localStorage.setItem('studentName', user?.fullName || 'User');
        localStorage.setItem('userRole', user?.role || 'question_creator');
        if (user?.role === 'super_admin') {
          window.location.href = './admin/dashboard.html';
        } else {
          window.location.href = './courses.html';
        }
      }
    }).catch(() => {});
  }

  // Handle User Registration (Automatic Question Creator & Exam Candidate)
  if (registerForm) {
    registerForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const payload = {
        fullName: document.getElementById('register-full-name').value.trim(),
        email: document.getElementById('register-email').value.trim(),
        password: document.getElementById('register-password').value,
        confirmPassword: document.getElementById('register-confirm-password').value,
        role: 'question_creator',
      };

      if (!payload.fullName || !payload.email || !payload.password || !payload.confirmPassword) {
        alert('Please complete all fields before creating an account.');
        return;
      }

      if (payload.password !== payload.confirmPassword) {
        alert('Passwords do not match.');
        return;
      }

      try {
        const response = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.message || 'Unable to create account');
        }

        const user = result.data?.user;
        const token = result.data?.token;

        // Store tokens for test taking and question authoring
        localStorage.setItem('cbtUserToken', token);
        localStorage.setItem('cbtStudentToken', token);
        localStorage.setItem('cbtAdminToken', token);
        localStorage.setItem('studentName', user?.fullName || payload.fullName);
        localStorage.setItem('userRole', user?.role || 'question_creator');

        alert('Account created successfully! You can now author questions, manage your courses, and take practice exams.');
        window.location.href = './courses.html';
      } catch (error) {
        alert(error.message || 'Unable to create account.');
      }
    });
  }

  // Handle Portal Login (Unified for Users and Administrator)
  if (studentLoginForm) {
    studentLoginForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const email = document.getElementById('student-email').value.trim();
      const password = document.getElementById('student-password').value;

      if (!email || !password) {
        alert('Please enter your email and password.');
        return;
      }

      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.message || 'Login failed');
        }

        const user = result.data?.user;
        const token = result.data?.token;

        localStorage.setItem('cbtUserToken', token);
        localStorage.setItem('cbtStudentToken', token);
        localStorage.setItem('cbtAdminToken', token);
        localStorage.setItem('studentName', user?.fullName || 'User');
        localStorage.setItem('userRole', user?.role || 'question_creator');

        // Cybersecurity Access Control: Automatically recognize Admin vs Regular User
        if (user?.role === 'super_admin') {
          window.location.href = './admin/dashboard.html';
        } else {
          window.location.href = './courses.html';
        }
      } catch (error) {
        alert(error.message || 'Unable to log in.');
      }
    });
  }

  // Handle Student Dashboard (courses.html)
  if (courseSelectionForm) {
    const courseSelect = document.getElementById('student-course');
    let availableCoursesList = [];

    // Authenticate and load student profile
    if (!studentToken) {
      window.location.href = './student-login.html';
      return;
    }

    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${studentToken}` },
    })
      .then(async (response) => {
        if (!response.ok) {
          localStorage.removeItem('cbtUserToken');
          localStorage.removeItem('cbtStudentToken');
          localStorage.removeItem('cbtAdminToken');
          window.location.href = './student-login.html';
          return;
        }
        const result = await response.json();
        const user = result.data;
        if (studentWelcomeName && user?.fullName) {
          studentWelcomeName.textContent = user.fullName;
        }

        // If admin visits courses.html, show an Admin Console button in topbar
        if (user?.role === 'super_admin') {
          const navLinks = document.querySelector('.nav-links');
          if (navLinks && !document.getElementById('nav-admin-console')) {
            const adminBtn = document.createElement('a');
            adminBtn.id = 'nav-admin-console';
            adminBtn.href = './admin/dashboard.html';
            adminBtn.className = 'nav-link';
            adminBtn.style.background = 'rgba(245, 158, 11, 0.25)';
            adminBtn.style.color = '#fef08a';
            adminBtn.innerHTML = '<i class="fas fa-shield-alt"></i> Admin Console';
            navLinks.insertBefore(adminBtn, navLinks.firstChild);
          }
        }
      })
      .catch(() => {});

    // Student Logout
    if (studentLogoutBtn) {
      studentLogoutBtn.addEventListener('click', () => {
        localStorage.removeItem('cbtUserToken');
        localStorage.removeItem('cbtStudentToken');
        localStorage.removeItem('cbtAdminToken');
        localStorage.removeItem('studentName');
        localStorage.removeItem('userRole');
        localStorage.removeItem('selectedCourseId');
        window.location.href = './student-login.html';
      });
    }

    // Load Recent Results for student
    const loadRecentResults = async () => {
      if (!recentResultsContainer) return;
      try {
        const response = await fetch('/api/results?myResults=true', {
          headers: { Authorization: `Bearer ${studentToken}` },
        });
        const result = await response.json();
        if (!response.ok || !result.success) return;

        const results = result.data?.items || [];
        if (results.length === 0) {
          recentResultsContainer.innerHTML = `
            <p style="color: #64748b; font-size: 0.92rem; margin: 0;">
              No completed practice attempts found. Choose a course and start practicing!
            </p>
          `;
          return;
        }

        const recent = results.slice(0, 3);
        recentResultsContainer.innerHTML = recent.map((item) => {
          const isPassed = Number(item.percentage) >= 50;
          const dateStr = new Date(item.submitted_at || item.started_at || Date.now()).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          });

          return `
            <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; gap: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
              <div style="display: flex; flex-direction: column; gap: 6px;">
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                  <strong style="color: var(--primary); font-size: 0.95rem;">${escapeHtml(item.course_name)}</strong>
                  ${item.course_code ? `<span style="font-size: 0.8rem; color: #64748b; background: #f1f5f9; padding: 2px 8px; border-radius: 4px;">${escapeHtml(item.course_code)}</span>` : ''}
                </div>
                <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 0.85rem;">
                  <span class="score-pill" style="padding: 3px 10px; font-size: 0.82rem;">Score: ${item.score}/${item.total_questions}</span>
                  <span class="percentage-pill ${isPassed ? 'pass' : 'fail'}" style="padding: 3px 10px; font-size: 0.82rem;">${Number(item.percentage).toFixed(1)}%</span>
                  <span style="color: #94a3b8; font-size: 0.8rem;"><i class="far fa-calendar-alt"></i> ${dateStr}</span>
                </div>
              </div>
              <a href="./result.html" class="recent-review-btn secondary-btn" data-result-id="${item.id}" style="padding: 8px 14px; font-size: 0.82rem; text-decoration: none; white-space: nowrap;">
                Review
              </a>
            </div>
          `;
        }).join('');

        recentResultsContainer.querySelectorAll('.recent-review-btn').forEach((link) => {
          link.addEventListener('click', (event) => {
            event.preventDefault();
            const id = link.getAttribute('data-result-id');
            localStorage.setItem('resultId', id);
            window.location.href = './result.html';
          });
        });
      } catch (err) {
        console.error('Error loading recent results:', err);
      }
    };

    // Load Available Courses
    const loadCourses = async () => {
      try {
        const response = await fetch('/api/courses/available');

        if (!response.ok) {
          throw new Error('Unable to load courses');
        }

        const result = await response.json();
        availableCoursesList = result.data || [];

        courseSelect.innerHTML = '<option value="">-- Select a Course --</option>';

        availableCoursesList.forEach((course) => {
          const option = document.createElement('option');
          option.value = course.id;
          const qCount = course.question_count !== undefined ? ` (${course.question_count} questions)` : '';
          option.textContent = `${course.course_name} (${course.course_code})${qCount}`;
          courseSelect.appendChild(option);
        });

        const preselectedCourseId = localStorage.getItem('selectedCourseId');
        if (preselectedCourseId && availableCoursesList.some((c) => String(c.id) === String(preselectedCourseId))) {
          courseSelect.value = preselectedCourseId;
          courseSelect.dispatchEvent(new Event('change'));
        }
      } catch (error) {
        console.error(error);
        courseSelect.innerHTML = '<option value="">No courses available</option>';
      }
    };

    // On Course selection change, show details preview
    courseSelect.addEventListener('change', () => {
      const selectedId = courseSelect.value;
      const course = availableCoursesList.find((c) => String(c.id) === String(selectedId));

      if (course && courseDetailsBox) {
        const titleEl = document.getElementById('course-detail-title');
        const descEl = document.getElementById('course-detail-desc');
        const countEl = document.getElementById('course-detail-count');

        if (titleEl) titleEl.textContent = `${course.course_name} (${course.course_code})`;
        if (descEl) descEl.textContent = course.course_description || 'Standard National Examination curriculum.';
        if (countEl) countEl.textContent = course.question_count ? `${course.question_count} available` : '100';

        courseDetailsBox.style.display = 'block';
      } else if (courseDetailsBox) {
        courseDetailsBox.style.display = 'none';
      }
    });

    courseSelectionForm.addEventListener('submit', (event) => {
      event.preventDefault();

      const courseId = courseSelect.value;

      if (!courseId) {
        alert('Please select a course before continuing.');
        return;
      }

      localStorage.setItem('selectedCourseId', courseId);
      localStorage.removeItem('examId');
      window.location.href = './exam.html';
    });

    loadCourses();
    loadRecentResults();
  }
});
