document.addEventListener('DOMContentLoaded', () => {
  const isLoginPage = window.location.pathname.endsWith('/admin/login.html');
  const adminToken = localStorage.getItem('cbtAdminToken') || localStorage.getItem('cbtUserToken');

  if (!isLoginPage && !adminToken) {
    window.location.href = '../student-login.html';
    return;
  }

  if (!isLoginPage && adminToken) {
    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${adminToken}` },
    }).then(async (response) => {
      if (!response.ok) {
        localStorage.removeItem('cbtAdminToken');
        localStorage.removeItem('cbtUserToken');
        window.location.href = '../student-login.html';
        return;
      }
      const result = await response.json();
      const currentUser = result.data;

      // Cybersecurity Access Control: Restrict admin interface to super_admin only
      if (currentUser?.role !== 'super_admin') {
        document.querySelectorAll('.nav-users-link').forEach((el) => { el.style.display = 'none'; });
        document.querySelectorAll('.nav-settings-link').forEach((el) => { el.style.display = 'none'; });
        document.querySelectorAll('.nav-students-link, a[href*="students.html"]').forEach((el) => { el.style.display = 'none'; });
        const usersStatCard = document.getElementById('users-stat-card');
        if (usersStatCard) usersStatCard.style.display = 'none';
        const studentsStatCard = document.getElementById('students-stat-card');
        if (studentsStatCard) studentsStatCard.style.display = 'none';
        const dashboardTitle = document.getElementById('dashboard-title');
        if (dashboardTitle) dashboardTitle.textContent = 'Question Authoring & Practice Portal';

        // Guard admin-only pages against direct URL entry
        const path = window.location.pathname;
        if (path.endsWith('/admin/users.html') || path.endsWith('/admin/settings.html') || path.endsWith('/admin/students.html')) {
          window.location.href = './dashboard.html';
        }

        // Adjust table titles to reflect user-level data isolation
        const coursesHeading = document.querySelector('.courses-panel h3');
        if (coursesHeading) coursesHeading.textContent = 'My Created Courses';
        const questionsHeading = document.querySelector('.questions-panel h3');
        if (questionsHeading) questionsHeading.textContent = 'My Created Questions';
      }
    }).catch(() => {});
  }

  const adminLoginForm = document.getElementById('admin-login-form');
  const courseForm = document.getElementById('course-form');
  const questionForm = document.getElementById('question-form');
  const courseTableBody = document.getElementById('course-table-body');
  const questionTableBody = document.getElementById('question-table-body');
  const questionFilterCourse = document.getElementById('question-filter-course');
  const questionImportForm = document.getElementById('question-import-form');
  const studentTableBody = document.getElementById('student-table-body');
  const resultTableBody = document.getElementById('result-table-body');
  const logoutButtons = document.querySelectorAll('.logout-button, .logout-link');
  const systemStatus = document.getElementById('system-status');
  const changePasswordForm = document.getElementById('change-password-form');

  const getAuthHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('cbtAdminToken') || localStorage.getItem('cbtUserToken') || ''}`,
  });

  logoutButtons.forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      localStorage.removeItem('cbtAdminToken');
      localStorage.removeItem('cbtUserToken');
      localStorage.removeItem('cbtStudentToken');
      localStorage.removeItem('studentName');
      localStorage.removeItem('userRole');
      localStorage.removeItem('examId');
      localStorage.removeItem('selectedCourseId');
      window.location.href = '../index.html';
    });
  });

  if (systemStatus) {
    fetch('/api/ready')
      .then((response) => {
        if (!response.ok) throw new Error('Unavailable');
        return response.json();
      })
      .then(() => {
        systemStatus.textContent = 'Online';
      })
      .catch(() => {
        systemStatus.textContent = 'Unavailable';
      });
  }

  if (changePasswordForm) {
    const passwordStatus = document.getElementById('password-status');

    changePasswordForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const currentPassword = document.getElementById('current-password').value;
      const newPassword = document.getElementById('new-password').value;
      const confirmPassword = document.getElementById('confirm-password').value;

      if (newPassword !== confirmPassword) {
        passwordStatus.textContent = 'New passwords do not match.';
        return;
      }

      try {
        const response = await fetch('/api/auth/change-password', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ currentPassword, newPassword }),
        });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || 'Unable to change password');
        changePasswordForm.reset();
        passwordStatus.textContent = 'Password changed successfully.';
      } catch (error) {
        passwordStatus.textContent = error.message || 'Unable to change password.';
      }
    });
  }

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const renderCourseRows = (courses) => {
    if (!courseTableBody) return;

    if (!courses || courses.length === 0) {
      courseTableBody.innerHTML = '<tr><td colspan="5">No courses available.</td></tr>';
      return;
    }

    courseTableBody.innerHTML = courses
      .map(
        (course) => `
          <tr>
            <td><strong>${escapeHtml(course.course_name)}</strong></td>
            <td><span class="badge-course"><i class="fas fa-tag" style="font-size: 0.8rem; color: #3b82f6;"></i> ${escapeHtml(course.course_code)}</span></td>
            <td><div style="max-width: 320px; line-height: 1.5; word-break: break-word;">${escapeHtml(course.course_description || 'No description provided')}</div></td>
            <td>
              <div class="table-student-name">
                <span class="student-avatar-badge" style="background: #f1f5f9; color: #475569;"><i class="fas fa-user"></i></span>
                <span>${escapeHtml(course.creator_name || 'System Administrator')}</span>
              </div>
            </td>
            <td style="text-align: center;">
              <div class="actions-cell">
                <button type="button" class="secondary-btn edit-course-btn" data-id="${course.id}" style="padding: 6px 12px; font-size: 0.82rem; white-space: nowrap;"><i class="fas fa-edit"></i> Edit</button>
                <button type="button" class="danger-btn delete-course-btn" data-id="${course.id}" style="padding: 6px 12px; font-size: 0.82rem; white-space: nowrap;"><i class="fas fa-trash-alt"></i> Delete</button>
              </div>
            </td>
          </tr>
        `
      )
      .join('');

    document.querySelectorAll('.edit-course-btn').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.id;
        const course = courses.find((item) => String(item.id) === String(id));

        if (!course) return;

        document.getElementById('course-name').value = course.course_name || '';
        document.getElementById('course-code').value = course.course_code || '';
        document.getElementById('course-description').value = course.course_description || '';

        const existingIdField = document.getElementById('course-edit-id');

        if (existingIdField) {
          existingIdField.value = course.id;
        } else {
          const hiddenInput = document.createElement('input');
          hiddenInput.type = 'hidden';
          hiddenInput.id = 'course-edit-id';
          hiddenInput.value = course.id;
          courseForm.appendChild(hiddenInput);
        }
      });
    });

    document.querySelectorAll('.delete-course-btn').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = button.dataset.id;
        const confirmed = window.confirm('This action will permanently delete the course. Related questions must be removed first. Continue?');

        if (!confirmed) return;

        try {
          const response = await fetch(`/api/courses/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders(),
          });

          const result = await response.json();

          if (!response.ok || !result.success) {
            throw new Error(result.message || 'Unable to delete course');
          }

          alert('Course deleted successfully.');
          loadCourses();
        } catch (error) {
          alert(error.message || 'Course deletion failed.');
        }
      });
    });
  };

  const loadCourses = async () => {
    try {
      const token = localStorage.getItem('cbtAdminToken') || localStorage.getItem('cbtUserToken');

      if (!token) {
        window.location.href = '../student-login.html';
        return;
      }

      const response = await fetch('/api/courses', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Unable to load courses');
      }

      const result = await response.json();
      const courses = result.data?.items || result.data || [];

      renderCourseRows(courses);

      if (questionForm) {
        const questionCourseSelect = document.getElementById('question-course');

        if (questionCourseSelect) {
          questionCourseSelect.innerHTML = '<option value="">Select a course</option>';

          courses.forEach((course) => {
            const option = document.createElement('option');
            option.value = course.id;
            option.textContent = `${course.course_name || course.courseName} (${course.course_code || course.courseCode})`;
            questionCourseSelect.appendChild(option);
          });
        }
      }
    } catch (error) {
      console.error(error);
      if (courseTableBody) {
        courseTableBody.innerHTML = '<tr><td colspan="4">Unable to load courses.</td></tr>';
      }
    }
  };

  const populateQuestionCourses = (courses) => {
    if (questionFilterCourse) {
      questionFilterCourse.innerHTML = '<option value="">All courses</option>';
      courses.forEach((course) => {
        const option = document.createElement('option');
        option.value = course.id;
        option.textContent = `${course.course_name} (${course.course_code})`;
        questionFilterCourse.appendChild(option);
      });
    }

    const questionCourseSelect = document.getElementById('question-course');
    const importCourseSelect = document.getElementById('import-course');

    if (questionCourseSelect) {
      questionCourseSelect.innerHTML = '<option value="">Select a course</option>';
      courses.forEach((course) => {
        const option = document.createElement('option');
        option.value = course.id;
        option.textContent = `${course.course_name} (${course.course_code})`;
        questionCourseSelect.appendChild(option);
      });
    }

    if (importCourseSelect) {
      importCourseSelect.innerHTML = '<option value="">Auto-detect from spreadsheet (Auto-creates new course in Course Management)</option>';
      courses.forEach((course) => {
        const option = document.createElement('option');
        option.value = course.id;
        option.textContent = `${course.course_name} (${course.course_code})`;
        importCourseSelect.appendChild(option);
      });
      const createNewOpt = document.createElement('option');
      createNewOpt.value = '__create_new__';
      createNewOpt.textContent = '+ Create new course for this file...';
      createNewOpt.style.fontWeight = 'bold';
      createNewOpt.style.color = '#2563eb';
      importCourseSelect.appendChild(createNewOpt);
    }
  };

  const renderQuestionRows = (questions) => {
    if (!questionTableBody) return;

    if (questions.length === 0) {
      questionTableBody.innerHTML = '<tr><td colspan="5">No questions available.</td></tr>';
      return;
    }

    questionTableBody.innerHTML = questions.map((question) => `
      <tr>
        <td>
          <div class="cell-question-text">${escapeHtml(question.question_text)}</div>
        </td>
        <td>
          <span class="badge-course">
            <i class="fas fa-book-open" style="font-size: 0.8rem; color: #3b82f6;"></i>
            <span>${escapeHtml(question.course_name)}</span>
            <span class="course-code-sub">(${escapeHtml(question.course_code)})</span>
          </span>
        </td>
        <td style="text-align: center;">
          <span class="score-pill" style="font-weight: 700; color: #1e40af; background: #eff6ff; border-color: #bfdbfe;">
            ${escapeHtml(question.correct_answer)}
          </span>
        </td>
        <td>
          <div class="table-student-name">
            <span class="student-avatar-badge" style="background: #f1f5f9; color: #475569;"><i class="fas fa-user"></i></span>
            <span>${escapeHtml(question.creator_name || 'System Administrator')}</span>
          </div>
        </td>
        <td style="text-align: center;">
          <div class="actions-cell">
            <button type="button" class="secondary-btn edit-question-btn" data-id="${question.id}" style="padding: 6px 12px; font-size: 0.82rem; white-space: nowrap;">
              <i class="fas fa-edit"></i> Edit
            </button>
            <button type="button" class="danger-btn delete-question-btn" data-id="${question.id}" style="padding: 6px 12px; font-size: 0.82rem; white-space: nowrap;">
              <i class="fas fa-trash-alt"></i> Delete
            </button>
          </div>
        </td>
      </tr>
    `).join('');

    document.querySelectorAll('.edit-question-btn').forEach((button) => {
      button.addEventListener('click', () => {
        const question = questions.find((item) => String(item.id) === button.dataset.id);
        if (!question) return;

        document.getElementById('question-course').value = question.course_id;
        document.getElementById('question-text').value = question.question_text;
        document.getElementById('option-a').value = question.option_a;
        document.getElementById('option-b').value = question.option_b;
        document.getElementById('option-c').value = question.option_c;
        document.getElementById('option-d').value = question.option_d;
        document.getElementById('correct-answer').value = question.correct_answer;

        const existingIdField = document.getElementById('question-edit-id');
        if (existingIdField) {
          existingIdField.value = question.id;
        } else {
          const hiddenInput = document.createElement('input');
          hiddenInput.type = 'hidden';
          hiddenInput.id = 'question-edit-id';
          hiddenInput.value = question.id;
          questionForm.appendChild(hiddenInput);
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    document.querySelectorAll('.delete-question-btn').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!window.confirm('Delete this question permanently?')) return;

        try {
          const response = await fetch(`/api/questions/${button.dataset.id}`, {
            method: 'DELETE',
            headers: getAuthHeaders(),
          });
          const result = await response.json();

          if (!response.ok || !result.success) {
            throw new Error(result.message || 'Unable to delete question');
          }

          loadQuestions();
        } catch (error) {
          alert(error.message || 'Question deletion failed.');
        }
      });
    });
  };

  const loadQuestions = async () => {
    if (!questionTableBody) return;

    try {
      const selectedCourse = questionFilterCourse?.value;
      const searchVal = document.getElementById('question-search-input')?.value?.trim();
      const params = new URLSearchParams();
      if (selectedCourse) params.set('courseId', selectedCourse);
      if (searchVal) params.set('search', searchVal);
      const query = params.toString() ? `?${params.toString()}` : '';

      const response = await fetch(`/api/questions${query}`, { headers: getAuthHeaders() });

      if (!response.ok) throw new Error('Unable to load questions');

      const result = await response.json();
      renderQuestionRows(result.data?.items || []);
    } catch (error) {
      console.error(error);
      questionTableBody.innerHTML = '<tr><td colspan="5">Unable to load questions.</td></tr>';
    }
  };

  if (adminLoginForm) {
    adminLoginForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const identifier = document.getElementById('admin-email').value.trim();
      const password = document.getElementById('admin-password').value.trim();

      if (!identifier || !password) {
        alert('Please enter your admin username/email and password.');
        return;
      }

      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ identifier, password }),
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.message || 'Admin login failed');
        }

        const token = result.data?.token;

        if (!token) {
          throw new Error('Authentication token was not returned by the server');
        }

        localStorage.setItem('cbtAdminToken', token);
        window.location.href = './dashboard.html';
      } catch (error) {
        alert(error.message || 'Unable to log in. Please try again.');
      }
    });
  }

  if (courseForm) {
    courseForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const name = document.getElementById('course-name').value.trim();
      const code = document.getElementById('course-code').value.trim();
      const description = document.getElementById('course-description').value.trim();
      const editingId = document.getElementById('course-edit-id')?.value;

      if (!name || !code) {
        alert('Course name and code are required.');
        return;
      }

      try {
        const method = editingId ? 'PUT' : 'POST';
        const url = editingId ? `/api/courses/${editingId}` : '/api/courses';

        const response = await fetch(url, {
          method,
          headers: getAuthHeaders(),
          body: JSON.stringify({
            courseName: name,
            courseCode: code,
            courseDescription: description,
          }),
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.message || 'Course save failed');
        }

        alert(editingId ? 'Course updated successfully.' : 'Course created successfully.');
        courseForm.reset();

        const existingIdField = document.getElementById('course-edit-id');
        if (existingIdField) {
          existingIdField.remove();
        }

        loadCourses();
      } catch (error) {
        alert(error.message || 'Unable to save course.');
      }
    });

    loadCourses();
  }

  if (questionForm) {
    const loadCourseOptions = async () => {
      try {
        const response = await fetch('/api/courses', {
          headers: getAuthHeaders(),
        });

        if (!response.ok) {
          throw new Error('Unable to load courses');
        }

        const result = await response.json();
        const courses = result.data?.items || result.data || [];
        populateQuestionCourses(courses);
      } catch (error) {
        console.error(error);
        document.getElementById('question-course').innerHTML = '<option value="">No courses available</option>';
      }
    };

    questionForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const editId = document.getElementById('question-edit-id')?.value;
      const payload = {
        courseId: document.getElementById('question-course').value,
        questionText: document.getElementById('question-text').value.trim(),
        optionA: document.getElementById('option-a').value.trim(),
        optionB: document.getElementById('option-b').value.trim(),
        optionC: document.getElementById('option-c').value.trim(),
        optionD: document.getElementById('option-d').value.trim(),
        correctAnswer: document.getElementById('correct-answer').value,
      };

      if (Object.values(payload).some((value) => !value)) {
        alert('All question fields are required.');
        return;
      }

      try {
        const response = await fetch(editId ? `/api/questions/${editId}` : '/api/questions', {
          method: editId ? 'PUT' : 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload),
        });
        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.message || 'Unable to save question');
        }

        questionForm.reset();
        document.getElementById('question-edit-id')?.remove();
        loadQuestions();
      } catch (error) {
        alert(error.message || 'Question save failed.');
      }
    });

    loadCourseOptions();
    loadQuestions();
  }

  if (questionFilterCourse) {
    questionFilterCourse.addEventListener('change', loadQuestions);
  }

  const questionSearchInput = document.getElementById('question-search-input');
  if (questionSearchInput) {
    let searchTimeout;
    questionSearchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(loadQuestions, 300);
    });
  }

  if (questionImportForm) {
    const importStatus = document.getElementById('import-status');
    const importCourseSelect = document.getElementById('import-course');
    const newCourseFields = document.getElementById('new-course-fields');

    if (importCourseSelect && newCourseFields) {
      importCourseSelect.addEventListener('change', () => {
        newCourseFields.style.display = importCourseSelect.value === '__create_new__' ? 'block' : 'none';
      });
    }

    const loadImportCourses = async () => {
      try {
        const response = await fetch('/api/courses', { headers: getAuthHeaders() });
        if (!response.ok) throw new Error('Unable to load courses');
        const result = await response.json();
        populateQuestionCourses(result.data?.items || []);
      } catch (error) {
        importStatus.textContent = error.message;
      }
    };

    questionImportForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const fileInput = document.getElementById('question-import-file');
      const file = fileInput?.files?.[0];
      const courseSelect = document.getElementById('import-course');
      const newCourseNameInput = document.getElementById('new-course-name');
      const newCourseCodeInput = document.getElementById('new-course-code');

      if (!file) return;

      try {
        importStatus.innerHTML = '<p style="color: #2563eb; font-weight: 500;"><i class="fas fa-spinner fa-spin" style="margin-right: 6px;"></i> Processing and importing questions...</p>';

        const fileName = file.name.toLowerCase();
        const isCreatingNewCourse = courseSelect?.value === '__create_new__';
        const newCourseName = isCreatingNewCourse ? newCourseNameInput?.value?.trim() : undefined;
        const newCourseCode = isCreatingNewCourse ? newCourseCodeInput?.value?.trim() : undefined;

        if (isCreatingNewCourse && !newCourseName && !newCourseCode) {
          throw new Error('Please enter a Course Name or Course Code for the new course.');
        }

        const basePayload = {
          courseId: (!isCreatingNewCourse && courseSelect?.value) ? courseSelect.value : undefined,
          newCourseName,
          newCourseCode,
        };

        let payload;

        if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
          if (window.XLSX) {
            const buffer = await file.arrayBuffer();
            const workbook = window.XLSX.read(buffer, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            if (!firstSheetName) {
              throw new Error('The uploaded Excel file contains no worksheets.');
            }
            const rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], { defval: '' });
            payload = {
              ...basePayload,
              content: JSON.stringify(rows),
              format: 'json',
            };
          } else {
            const base64 = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                const res = String(reader.result);
                const data = res.includes('base64,') ? res.split('base64,')[1] : res;
                resolve(data);
              };
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });
            payload = {
              ...basePayload,
              content: base64,
              format: 'excel',
            };
          }
        } else if (fileName.endsWith('.csv')) {
          const content = await file.text();
          payload = {
            ...basePayload,
            content,
            format: 'csv',
          };
        } else {
          const content = await file.text();
          payload = {
            ...basePayload,
            content,
            format: 'json',
          };
        }

        const response = await fetch('/api/questions/import', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload),
        });
        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.message || 'Question import failed');
        }

        const { imported = 0, invalid = 0, createdCourses = [], errors = [] } = result.data || {};

        if (imported > 0) {
          let courseMsg = '';
          if (createdCourses.length > 0) {
            const courseLabels = createdCourses.map((c) => `<strong>${escapeHtml(c.name)} (${escapeHtml(c.code)})</strong>`).join(', ');
            courseMsg = `<p style="margin: 8px 0 0 0; font-size: 0.95rem; color: #047857;">
              <i class="fas fa-check-double" style="margin-right: 6px;"></i>
              Created &amp; Added to Course Management: ${courseLabels}
            </p>`;
          }

          importStatus.innerHTML = `
            <div style="background: #ecfdf5; border: 1.5px solid #6ee7b7; border-radius: 10px; padding: 16px 20px; color: #065f46; margin-top: 16px;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <i class="fas fa-check-circle" style="font-size: 1.4rem; color: #10b981;"></i>
                <h4 style="margin: 0; font-size: 1.1rem; color: #065f46;">Successfully imported ${imported} question(s)!</h4>
              </div>
              ${courseMsg}
              ${invalid > 0 ? `<p style="margin: 8px 0 0 0; font-size: 0.88rem; color: #b45309;">Note: ${invalid} row(s) had missing fields or invalid format.</p>` : ''}
              <div style="margin-top: 14px; display: flex; gap: 10px; flex-wrap: wrap;">
                <button type="button" id="btn-practice-imported" class="primary-btn" style="padding: 8px 18px; font-size: 0.92rem; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; background: #2563eb; border: none; border-radius: 6px; color: #fff; font-weight: 600;">
                  <i class="fas fa-play-circle"></i> Start Practice Exam on This Subject (${imported} Questions)
                </button>
                <a href="./courses.html" class="secondary-btn" style="padding: 8px 16px; font-size: 0.92rem; text-decoration: none; display: inline-flex; align-items: center; gap: 6px;">
                  <i class="fas fa-book"></i> View in Course Management
                </a>
                <a href="./questions.html" class="secondary-btn" style="padding: 8px 16px; font-size: 0.92rem; text-decoration: none; display: inline-flex; align-items: center; gap: 6px;">
                  <i class="fas fa-question-circle"></i> View in Question Management
                </a>
              </div>
            </div>
          `;

          const practiceBtn = document.getElementById('btn-practice-imported');
          if (practiceBtn) {
            practiceBtn.addEventListener('click', () => {
              const targetCourseId = result.data?.targetCourseId || (createdCourses.length > 0 ? createdCourses[0].id : null) || courseSelect?.value;
              if (targetCourseId && targetCourseId !== '__create_new__') {
                localStorage.setItem('selectedCourseId', targetCourseId);
              }
              localStorage.removeItem('examId');
              window.location.href = '../exam.html';
            });
          }

          questionImportForm.reset();
          if (newCourseFields) newCourseFields.style.display = 'none';
          loadImportCourses();
        } else {
          importStatus.innerHTML = `
            <div style="background: #fef2f2; border: 1.5px solid #fca5a5; border-radius: 10px; padding: 16px 20px; color: #991b1b; margin-top: 16px;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <i class="fas fa-exclamation-triangle" style="font-size: 1.4rem; color: #ef4444;"></i>
                <h4 style="margin: 0; font-size: 1.1rem; color: #991b1b;">Import Unsuccessful (0 questions imported)</h4>
              </div>
              <p style="margin: 8px 0 0 0; font-size: 0.92rem;">None of the rows could be imported. Please verify that each row has Question Text, 4 options (A-D), and a Correct Answer.</p>
              ${errors.length > 0 ? `
                <ul style="margin: 8px 0 0 18px; font-size: 0.88rem;">
                  ${errors.slice(0, 3).map((e) => `<li>Row ${e.row}: ${escapeHtml(e.message)}</li>`).join('')}
                </ul>
              ` : ''}
            </div>
          `;
        }
      } catch (error) {
        importStatus.innerHTML = `
          <div style="background: #fef2f2; border: 1.5px solid #fca5a5; border-radius: 10px; padding: 14px 18px; color: #991b1b; margin-top: 16px;">
            <p style="margin: 0; font-weight: 600;"><i class="fas fa-times-circle" style="color: #ef4444; margin-right: 6px;"></i> ${escapeHtml(error.message || 'Question import failed.')}</p>
          </div>
        `;
      }
    });

    loadImportCourses();
  }

  if (studentTableBody) {
    fetch('/api/students', { headers: getAuthHeaders() })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || 'Unable to load students');
        return result.data.items || [];
      })
      .then((students) => {
        if (students.length === 0) {
          studentTableBody.innerHTML = '<tr><td colspan="4">No students found.</td></tr>';
          return;
        }

        studentTableBody.innerHTML = students.map((student) => {
          const initials = (student.student_name || 'S')
            .trim()
            .split(/\s+/)
            .map((part) => part[0])
            .slice(0, 2)
            .join('')
            .toUpperCase();

          return `
            <tr>
              <td>
                <div class="table-student-name">
                  <span class="student-avatar-badge">${escapeHtml(initials)}</span>
                  <span>${escapeHtml(student.student_name)}</span>
                </div>
              </td>
              <td style="text-align: center;">
                <span class="score-pill">${student.completed_attempts}</span>
              </td>
              <td>
                <span class="cell-date">
                  <i class="far fa-clock" style="color: #94a3b8;"></i>
                  ${student.last_attempt_at ? new Date(student.last_attempt_at).toLocaleString() : 'No attempts yet'}
                </span>
              </td>
              <td>
                <span class="cell-date">
                  <i class="far fa-calendar-alt" style="color: #94a3b8;"></i>
                  ${new Date(student.created_at).toLocaleDateString()}
                </span>
              </td>
            </tr>
          `;
        }).join('');
      })
      .catch((error) => {
        studentTableBody.innerHTML = `<tr><td colspan="4">${escapeHtml(error.message)}</td></tr>`;
      });
  }

  if (resultTableBody) {
    const filterStudent = document.getElementById('result-filter-student');
    const filterCourse = document.getElementById('result-filter-course');
    const filterScore = document.getElementById('result-filter-score');
    const filterDate = document.getElementById('result-filter-date');

    const loadFilterCourses = async () => {
      if (!filterCourse) return;
      try {
        const response = await fetch('/api/courses', { headers: getAuthHeaders() });
        if (!response.ok) return;
        const result = await response.json();
        const courses = result.data?.items || result.data || [];
        filterCourse.innerHTML = '<option value="">All Courses</option>';
        courses.forEach((c) => {
          const opt = document.createElement('option');
          opt.value = c.id;
          opt.textContent = `${c.course_name} (${c.course_code})`;
          filterCourse.appendChild(opt);
        });
      } catch (_) {}
    };

    const loadAdminResults = async () => {
      try {
        const params = new URLSearchParams();
        if (filterStudent?.value?.trim()) params.set('studentName', filterStudent.value.trim());
        if (filterCourse?.value) params.set('courseId', filterCourse.value);
        if (filterScore?.value) params.set('scoreMin', filterScore.value);
        if (filterDate?.value) params.set('date', filterDate.value);
        const query = params.toString() ? `?${params.toString()}` : '';

        const response = await fetch(`/api/results${query}`, { headers: getAuthHeaders() });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || 'Unable to load results');
        const results = result.data.items || [];

        if (results.length === 0) {
          resultTableBody.innerHTML = '<tr><td colspan="6">No completed results found.</td></tr>';
          return;
        }

        resultTableBody.innerHTML = results.map((item) => {
          const initials = (item.student_name || 'S')
            .trim()
            .split(/\s+/)
            .map((part) => part[0])
            .slice(0, 2)
            .join('')
            .toUpperCase();
          const isPassed = Number(item.percentage) >= 50;

          return `
            <tr>
              <td>
                <div class="table-student-name">
                  <span class="student-avatar-badge">${escapeHtml(initials)}</span>
                  <span>${escapeHtml(item.student_name)}</span>
                </div>
              </td>
              <td>
                <span class="badge-course">
                  <i class="fas fa-book-open" style="font-size: 0.8rem; color: #3b82f6;"></i>
                  <span>${escapeHtml(item.course_name)}</span>
                  <span class="course-code-sub">(${escapeHtml(item.course_code)})</span>
                </span>
              </td>
              <td style="text-align: center;">
                <span class="score-pill">
                  <strong>${item.correct_answers}</strong> <span style="color: #94a3b8;">/</span> ${item.total_questions}
                </span>
              </td>
              <td style="text-align: center;">
                <span class="percentage-pill ${isPassed ? 'pass' : 'fail'}">
                  <i class="fas ${isPassed ? 'fa-check-circle' : 'fa-times-circle'}" style="font-size: 0.8rem;"></i>
                  ${Number(item.percentage).toFixed(2)}%
                </span>
              </td>
              <td>
                <span class="cell-date">
                  <i class="far fa-calendar-alt" style="color: #94a3b8;"></i>
                  ${new Date(item.submitted_at).toLocaleString()}
                </span>
              </td>
              <td style="text-align: center;">
                <button type="button" class="danger-btn delete-result-btn" data-id="${item.id}" style="padding: 6px 12px; font-size: 0.82rem;">
                  <i class="fas fa-trash-alt"></i> Delete
                </button>
              </td>
            </tr>
          `;
        }).join('');

        resultTableBody.querySelectorAll('.delete-result-btn').forEach((button) => {
          button.addEventListener('click', async () => {
            if (!window.confirm('Delete this completed result permanently?')) return;

            const deleteResponse = await fetch(`/api/results/${button.dataset.id}`, {
              method: 'DELETE',
              headers: getAuthHeaders(),
            });
            const deleteResult = await deleteResponse.json();
            if (!deleteResponse.ok || !deleteResult.success) {
              alert(deleteResult.message || 'Unable to delete result');
              return;
            }
            loadAdminResults();
          });
        });
      } catch (error) {
        resultTableBody.innerHTML = `<tr><td colspan="6">${escapeHtml(error.message)}</td></tr>`;
      }
    };

    [filterCourse, filterDate].forEach((el) => el?.addEventListener('change', loadAdminResults));
    let filterTimeout;
    [filterStudent, filterScore].forEach((el) => el?.addEventListener('input', () => {
      clearTimeout(filterTimeout);
      filterTimeout = setTimeout(loadAdminResults, 300);
    }));

    loadFilterCourses();
    loadAdminResults();
  }

  // Super Admin User Management
  const userTableBody = document.getElementById('user-table-body');
  const createUserForm = document.getElementById('create-user-form');

  if (userTableBody) {
    const loadUsers = async () => {
      try {
        const response = await fetch('/api/auth/users', { headers: getAuthHeaders() });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || 'Unable to load users');
        const users = result.data?.items || [];

        if (users.length === 0) {
          userTableBody.innerHTML = '<tr><td colspan="6">No registered users found.</td></tr>';
          return;
        }

        userTableBody.innerHTML = users.map((user) => {
          const roleDisplay = user.role === 'super_admin' ? 'Super Admin' : (user.role === 'question_creator' ? 'Question Creator' : 'Student');
          const isActive = Number(user.is_active) === 1;

          return `
            <tr>
              <td><strong>${escapeHtml(user.full_name)}</strong></td>
              <td>${escapeHtml(user.email)}</td>
              <td><span class="review-status-badge ${user.role === 'super_admin' ? 'correct' : ''}" style="background: #e2e8f0; color: #1e293b;">${escapeHtml(roleDisplay)}</span></td>
              <td><strong style="color: ${isActive ? '#16a34a' : '#dc2626'};">${isActive ? 'Active' : 'Deactivated'}</strong></td>
              <td>${new Date(user.created_at).toLocaleDateString()}</td>
              <td style="text-align: center;">
                <div class="actions-cell">
                  <button type="button" class="secondary-btn toggle-user-btn" data-id="${user.id}" data-active="${isActive ? '1' : '0'}" style="padding: 6px 12px; font-size: 0.82rem; white-space: nowrap;">
                    ${isActive ? 'Deactivate' : 'Activate'}
                  </button>
                  <button type="button" class="danger-btn delete-user-btn" data-id="${user.id}" style="padding: 6px 12px; font-size: 0.82rem; white-space: nowrap;">
                    <i class="fas fa-trash-alt"></i> Delete
                  </button>
                </div>
              </td>
            </tr>
          `;
        }).join('');

        userTableBody.querySelectorAll('.toggle-user-btn').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const userId = btn.dataset.id;
            const currentActive = btn.dataset.active === '1';
            try {
              const res = await fetch(`/api/auth/users/${userId}`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({ isActive: !currentActive }),
              });
              const resJson = await res.json();
              if (!res.ok || !resJson.success) throw new Error(resJson.message || 'Unable to update user');
              loadUsers();
            } catch (err) {
              alert(err.message || 'Unable to toggle user status');
            }
          });
        });

        userTableBody.querySelectorAll('.delete-user-btn').forEach((btn) => {
          btn.addEventListener('click', async () => {
            if (!window.confirm('Are you sure you want to delete this user? This action cannot be undone.')) return;
            try {
              const res = await fetch(`/api/auth/users/${btn.dataset.id}`, {
                method: 'DELETE',
                headers: getAuthHeaders(),
              });
              const resJson = await res.json();
              if (!res.ok || !resJson.success) throw new Error(resJson.message || 'Unable to delete user');
              loadUsers();
            } catch (err) {
              alert(err.message || 'Unable to delete user');
            }
          });
        });
      } catch (err) {
        userTableBody.innerHTML = `<tr><td colspan="6" style="color: #dc2626;">${escapeHtml(err.message)}</td></tr>`;
      }
    };

    if (createUserForm) {
      createUserForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fullName = document.getElementById('new-user-fullname').value.trim();
        const email = document.getElementById('new-user-email').value.trim();
        const password = document.getElementById('new-user-password').value;
        const role = document.getElementById('new-user-role').value;

        try {
          const res = await fetch('/api/auth/users', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ fullName, email, password, role }),
          });
          const resJson = await res.json();
          if (!res.ok || !resJson.success) throw new Error(resJson.message || 'Unable to create user');
          alert('User account created successfully.');
          createUserForm.reset();
          loadUsers();
        } catch (err) {
          alert(err.message || 'User creation failed');
        }
      });
    }

    loadUsers();
  }

  const totalCoursesEl = document.getElementById('total-courses');
  const totalQuestionsEl = document.getElementById('total-questions');
  const totalStudentsEl = document.getElementById('total-students');
  const totalAttemptsEl = document.getElementById('total-attempts');
  const totalUsersEl = document.getElementById('total-users');
  const recentActivityBody = document.getElementById('recent-activity-body');

  if (totalCoursesEl && totalQuestionsEl && totalStudentsEl && totalAttemptsEl) {
    const loadDashboardStats = async () => {
      try {
        const token = localStorage.getItem('cbtAdminToken') || localStorage.getItem('cbtUserToken');

        if (!token) {
          window.location.href = '../student-login.html';
          return;
        }

        const response = await fetch('/api/dashboard/stats', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Unable to load dashboard statistics');
        }

        const result = await response.json();
        const stats = result.data || {};

        if (totalUsersEl) totalUsersEl.textContent = stats.totalUsers ?? '0';
        totalCoursesEl.textContent = stats.totalCourses ?? '0';
        totalQuestionsEl.textContent = stats.totalQuestions ?? '0';
        totalStudentsEl.textContent = stats.totalStudents ?? '0';
        totalAttemptsEl.textContent = stats.totalPracticeAttempts ?? '0';

        if (recentActivityBody) {
          const activities = stats.recentActivity || [];
          if (activities.length === 0) {
            recentActivityBody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 24px; color: #64748b;">No recent practice attempts recorded.</td></tr>';
          } else {
            recentActivityBody.innerHTML = activities.map((item) => {
              const initials = (item.student_name || 'S')
                .trim()
                .split(/\s+/)
                .map((part) => part[0])
                .slice(0, 2)
                .join('')
                .toUpperCase();
              const isPassed = Number(item.percentage) >= 50;

              return `
                <tr>
                  <td>
                    <div class="table-student-name">
                      <span class="student-avatar-badge">${escapeHtml(initials)}</span>
                      <span>${escapeHtml(item.student_name)}</span>
                    </div>
                  </td>
                  <td>
                    <span class="badge-course">
                      <i class="fas fa-book-open" style="font-size: 0.8rem; color: #3b82f6;"></i>
                      <span>${escapeHtml(item.course_name)}</span>
                      <span class="course-code-sub">(${escapeHtml(item.course_code)})</span>
                    </span>
                  </td>
                  <td style="text-align: center;">
                    <span class="score-pill">
                      <strong>${item.score}</strong> <span style="color: #94a3b8;">/</span> ${item.total_questions}
                    </span>
                  </td>
                  <td style="text-align: center;">
                    <span class="percentage-pill ${isPassed ? 'pass' : 'fail'}">
                      <i class="fas ${isPassed ? 'fa-check-circle' : 'fa-times-circle'}" style="font-size: 0.8rem;"></i>
                      ${Number(item.percentage).toFixed(2)}%
                    </span>
                  </td>
                  <td>
                    <span class="cell-date">
                      <i class="far fa-calendar-alt" style="color: #94a3b8;"></i>
                      ${new Date(item.submitted_at).toLocaleString()}
                    </span>
                  </td>
                </tr>
              `;
            }).join('');
          }
        }
      } catch (error) {
        console.error(error);
        if (totalUsersEl) totalUsersEl.textContent = '0';
        totalCoursesEl.textContent = '0';
        totalQuestionsEl.textContent = '0';
        totalStudentsEl.textContent = '0';
        totalAttemptsEl.textContent = '0';
      }
    };

    loadDashboardStats();
  }
});
