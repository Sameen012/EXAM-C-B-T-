const { app, bootstrapDatabase } = require('../backend/server');
const { pool } = require('../backend/config/database');
const { buildWelcomeEmailContent } = require('../backend/utils/emailService');
const XLSX = require('xlsx');

const checks = [
  ['root page', '/', 200],
  ['student login page', '/student-login.html', 200],
  ['courses page', '/courses.html', 200],
  ['register page', '/register.html', 200],
  ['history page', '/history.html', 200],
  ['result page', '/result.html', 200],
  ['admin users page', '/admin/users.html', 200],
  ['admin settings page', '/admin/settings.html', 200],
  ['health endpoint', '/api/health', 200],
  ['readiness endpoint', '/api/ready', 200],
  ['available courses endpoint', '/api/courses/available', 200],
  ['protected student endpoint', '/api/students', 401],
  ['unauthenticated users endpoint', '/api/auth/users', 401],
  ['unauthenticated results endpoint', '/api/results', 401],
  ['favicon.ico asset', '/favicon.ico', 200],
  ['favicon.png asset', '/favicon.png', 200],
  ['SACHT logo asset', '/assets/SACHT.png', 200],
];

(async () => {
  await bootstrapDatabase();

  const server = app.listen(0, async () => {
    const port = server.address().port;
    let failed = false;
    let sharedCourseAId = null;

    try {
      for (const [name, route, expectedStatus] of checks) {
        const response = await fetch(`http://localhost:${port}${route}`);
        const passed = response.status === expectedStatus;
        console.log(`${passed ? 'PASS' : 'FAIL'} ${name}: ${response.status}`);
        if (!passed) failed = true;
      }

      const traceResponse = await fetch(`http://localhost:${port}/api/health`);
      const requestId = traceResponse.headers.get('x-request-id');
      console.log(`${requestId ? 'PASS' : 'FAIL'} request tracing header`);
      if (!requestId) failed = true;
      const cachePolicy = traceResponse.headers.get('cache-control');
      console.log(`${cachePolicy === 'no-store' ? 'PASS' : 'FAIL'} API cache policy`);
      if (cachePolicy !== 'no-store') failed = true;

      // Verify rejection of plain display name "Sameen" (enforce email-only login)
      const rejectNameResponse = await fetch(`http://localhost:${port}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: 'Sameen',
          password: process.env.ADMIN_PASSWORD || 'SameenAdmin2026',
        }),
      });
      const rejectNamePassed = rejectNameResponse.status === 401;
      console.log(`${rejectNamePassed ? 'PASS' : 'FAIL'} reject plain-name login 'Sameen': ${rejectNameResponse.status}`);
      if (!rejectNamePassed) failed = true;

      // Admin login using configured email
      const adminEmail = (
        process.env.ADMIN_EMAIL ||
        (process.env.ADMIN_USERNAME && process.env.ADMIN_USERNAME.includes('@')
          ? process.env.ADMIN_USERNAME
          : 'admin@sacht.edu.ng')
      ).trim().toLowerCase();

      const loginResponse = await fetch(`http://localhost:${port}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: adminEmail,
          password: process.env.ADMIN_PASSWORD || 'SameenAdmin2026',
        }),
      });
      const loginResult = await loginResponse.json();
      const adminToken = loginResult.data?.token;
      const loginPassed = loginResponse.status === 200 && Boolean(adminToken);
      console.log(`${loginPassed ? 'PASS' : 'FAIL'} admin login with email (${adminEmail}): ${loginResponse.status}`);
      if (!loginPassed) failed = true;

      if (adminToken) {
        const adminCheckResponse = await fetch(`http://localhost:${port}/api/auth/admin-check`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        const adminCheckPassed = adminCheckResponse.status === 200;
        console.log(`${adminCheckPassed ? 'PASS' : 'FAIL'} authenticated admin check: ${adminCheckResponse.status}`);
        if (!adminCheckPassed) failed = true;

        const usersResponse = await fetch(`http://localhost:${port}/api/auth/users`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        const usersPassed = usersResponse.status === 200;
        console.log(`${usersPassed ? 'PASS' : 'FAIL'} super admin get users endpoint: ${usersResponse.status}`);
        if (!usersPassed) failed = true;
      }

      // Test Dynamic Welcome Email Template Generation
      const sameenEmail = buildWelcomeEmailContent('Sameen');
      const aishaEmail = buildWelcomeEmailContent('Aisha');
      const emailTemplatePassed =
        sameenEmail.subject === 'Welcome to SACHT CBT 🎉' &&
        sameenEmail.text.includes('Hello Sameen,') &&
        sameenEmail.text.includes('Welcome to SACHT CBT!') &&
        sameenEmail.text.includes('Practice CBT questions') &&
        aishaEmail.text.includes('Hello Aisha,') &&
        sameenEmail.html.includes('Hello <strong>Sameen</strong>,') &&
        aishaEmail.html.includes('Hello <strong>Aisha</strong>,');
      console.log(`${emailTemplatePassed ? 'PASS' : 'FAIL'} dynamic welcome email template generation`);
      if (!emailTemplatePassed) failed = true;

      // Test Student Registration and Authentication Flow
      const testStudentEmail = `smoke_student_${Date.now()}@example.com`;
      const regResponse = await fetch(`http://localhost:${port}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: 'Smoke Test Student',
          email: testStudentEmail,
          password: 'Password123!',
          confirmPassword: 'Password123!',
          role: 'student',
        }),
      });
      const regResult = await regResponse.json();
      const studentToken = regResult.data?.token;
      const regPassed = regResponse.status === 201 && Boolean(studentToken);
      console.log(`${regPassed ? 'PASS' : 'FAIL'} student registration: ${regResponse.status}`);
      if (!regPassed) failed = true;

      if (studentToken) {
        const meResponse = await fetch(`http://localhost:${port}/api/auth/me`, {
          headers: { Authorization: `Bearer ${studentToken}` },
        });
        const meResult = await meResponse.json();
        const mePassed = meResponse.status === 200 && meResult.data?.role === 'student';
        console.log(`${mePassed ? 'PASS' : 'FAIL'} student /api/auth/me check: ${meResponse.status}`);
        if (!mePassed) failed = true;

        const studentResultsResponse = await fetch(`http://localhost:${port}/api/results`, {
          headers: { Authorization: `Bearer ${studentToken}` },
        });
        const resultsPassed = studentResultsResponse.status === 200;
        console.log(`${resultsPassed ? 'PASS' : 'FAIL'} student /api/results access: ${studentResultsResponse.status}`);
        if (!resultsPassed) failed = true;
      }

      // Test Unified Account Registration (no role dropdown sent, defaults to question_creator)
      const testCreatorEmail = `smoke_creator_${Date.now()}@example.com`;
      const creatorRegResponse = await fetch(`http://localhost:${port}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: 'Smoke Test Creator',
          email: testCreatorEmail,
          password: 'Password123!',
          confirmPassword: 'Password123!',
        }),
      });
      const creatorRegResult = await creatorRegResponse.json();
      const creatorToken = creatorRegResult.data?.token;
      const creatorRegPassed = creatorRegResponse.status === 201 && Boolean(creatorToken);
      console.log(`${creatorRegPassed ? 'PASS' : 'FAIL'} default creator registration without role param: ${creatorRegResponse.status}`);
      if (!creatorRegPassed) failed = true;

      if (creatorToken) {
        const creatorMeResponse = await fetch(`http://localhost:${port}/api/auth/me`, {
          headers: { Authorization: `Bearer ${creatorToken}` },
        });
        const creatorMeResult = await creatorMeResponse.json();
        const creatorMePassed = creatorMeResponse.status === 200 && creatorMeResult.data?.role === 'question_creator';
        console.log(`${creatorMePassed ? 'PASS' : 'FAIL'} default creator /api/auth/me has question_creator role: ${creatorMeResponse.status}`);
        if (!creatorMePassed) failed = true;

        // Verify creator can access courses list
        const creatorCoursesResponse = await fetch(`http://localhost:${port}/api/courses`, {
          headers: { Authorization: `Bearer ${creatorToken}` },
        });
        const coursesPassed = creatorCoursesResponse.status === 200;
        console.log(`${coursesPassed ? 'PASS' : 'FAIL'} creator /api/courses access: ${creatorCoursesResponse.status}`);
        if (!coursesPassed) failed = true;

        // Verify creator can also access personal practice results
        const creatorMyResultsResponse = await fetch(`http://localhost:${port}/api/results?myResults=true`, {
          headers: { Authorization: `Bearer ${creatorToken}` },
        });
        const myResultsPassed = creatorMyResultsResponse.status === 200;
        console.log(`${myResultsPassed ? 'PASS' : 'FAIL'} creator /api/results?myResults=true access: ${creatorMyResultsResponse.status}`);
        if (!myResultsPassed) failed = true;

        // Cybersecurity Test: User A creates Course A
        const courseCodeA = `SEC_${Date.now()}`;
        const createCourseResp = await fetch(`http://localhost:${port}/api/courses`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${creatorToken}`,
          },
          body: JSON.stringify({
            courseName: `Secured Course ${courseCodeA}`,
            courseCode: courseCodeA,
            courseDescription: 'Isolated course for user A',
          }),
        });
        const createCourseResult = await createCourseResp.json();
        const courseAId = createCourseResult.data?.id;
        sharedCourseAId = courseAId;
        const courseCreated = createCourseResp.status === 201 && Boolean(courseAId);
        console.log(`${courseCreated ? 'PASS' : 'FAIL'} user A course creation: ${createCourseResp.status}`);
        if (!courseCreated) failed = true;

        // Verify Bulk Question Import with Excel (.xlsx) format
        if (courseAId) {
          const ws = XLSX.utils.json_to_sheet([
            {
              'Course Code': courseCodeA,
              'Question Text': 'What does CBT stand for in modern examinations?',
              'Option A': 'Computer Based Testing',
              'Option B': 'Common Basic Test',
              'Option C': 'Central Board Training',
              'Option D': 'Core Binary Tracker',
              'Correct Answer': 'A'
            }
          ]);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'Questions');
          const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
          const base64Excel = excelBuffer.toString('base64');

          const importExcelResp = await fetch(`http://localhost:${port}/api/questions/import`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${creatorToken}`,
            },
            body: JSON.stringify({
              content: base64Excel,
              format: 'excel',
            }),
          });
          const importExcelResult = await importExcelResp.json();
          const importPassed = importExcelResp.status === 200 && importExcelResult.data?.imported === 1;
          console.log(`${importPassed ? 'PASS' : 'FAIL'} Excel (.xlsx) bulk question import: ${importExcelResp.status} (imported: ${importExcelResult.data?.imported})`);
          if (!importPassed) failed = true;

          // Test: Automatic Course Creation when importing questions for a brand new course
          const brandNewCode = `AUTO_CRS_${Date.now().toString().slice(-4)}`;
          const autoWs = XLSX.utils.json_to_sheet([
            {
              'Course Code': brandNewCode,
              'Question': 'Which vitamins are fat-soluble?',
              'A': 'A, D, E, K',
              'B': 'B and C',
              'C': 'All vitamins',
              'D': 'None of the above',
              'Answer': 'Option A'
            }
          ]);
          const autoWb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(autoWb, autoWs, 'Questions');
          const autoBuffer = XLSX.write(autoWb, { type: 'buffer', bookType: 'xlsx' });
          const autoBase64 = autoBuffer.toString('base64');

          const autoImportResp = await fetch(`http://localhost:${port}/api/questions/import`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${creatorToken}`,
            },
            body: JSON.stringify({
              content: autoBase64,
              format: 'excel',
            }),
          });
          const autoImportResult = await autoImportResp.json();
          const autoImportPassed = autoImportResp.status === 200 &&
            autoImportResult.data?.imported === 1 &&
            autoImportResult.data?.createdCourses?.length === 1 &&
            autoImportResult.data?.createdCourses[0].code === brandNewCode;
          console.log(`${autoImportPassed ? 'PASS' : 'FAIL'} auto-create course during import: ${autoImportResp.status} (created course: ${autoImportResult.data?.createdCourses?.[0]?.code})`);
          if (!autoImportPassed) failed = true;

          // Verify that this newly created course appears in Course Management (/api/courses)
          const verifyCoursesResp = await fetch(`http://localhost:${port}/api/courses`, {
            headers: { Authorization: `Bearer ${creatorToken}` },
          });
          const verifyCoursesData = await verifyCoursesResp.json();
          const courseFoundInManagement = (verifyCoursesData.data?.items || []).some((c) => c.course_code === brandNewCode);
          console.log(`${courseFoundInManagement ? 'PASS' : 'FAIL'} imported course displays in Course Management (/api/courses)`);
          if (!courseFoundInManagement) failed = true;

          // Test: Form-based New Course Creation via newCourseName and newCourseCode
          const explicitCode = `EXP_CRS_${Date.now().toString().slice(-4)}`;
          const formImportResp = await fetch(`http://localhost:${port}/api/questions/import`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${creatorToken}`,
            },
            body: JSON.stringify({
              newCourseName: `Explicitly Created Course ${explicitCode}`,
              newCourseCode: explicitCode,
              format: 'json',
              content: JSON.stringify([
                {
                  questionText: 'What is the primary purpose of oral rehydration salts?',
                  optionA: 'Treat dehydration caused by diarrhea',
                  optionB: 'Induce sleep',
                  optionC: 'Lower blood pressure',
                  optionD: 'Increase appetite',
                  correctAnswer: 'A',
                },
              ]),
            }),
          });
          const formImportResult = await formImportResp.json();
          const formImportPassed = formImportResp.status === 200 &&
            formImportResult.data?.imported === 1 &&
            formImportResult.data?.createdCourses?.some((c) => c.code === explicitCode);
          console.log(`${formImportPassed ? 'PASS' : 'FAIL'} form-based new course creation: ${formImportResp.status} (code: ${explicitCode})`);
          if (!formImportPassed) failed = true;
        }

        // User B registers
        const testUserBEmail = `smoke_user_b_${Date.now()}@example.com`;
        const userBRegResponse = await fetch(`http://localhost:${port}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fullName: 'Smoke Test User B',
            email: testUserBEmail,
            password: 'Password123!',
            confirmPassword: 'Password123!',
          }),
        });
        const userBRegResult = await userBRegResponse.json();
        const userBToken = userBRegResult.data?.token;

        if (userBToken && courseAId) {
          // Data Isolation Test 1: User B's getCourses MUST NOT include Course A
          const userBCoursesResp = await fetch(`http://localhost:${port}/api/courses`, {
            headers: { Authorization: `Bearer ${userBToken}` },
          });
          const userBCourses = await userBCoursesResp.json();
          const containsCourseA = (userBCourses.data?.items || []).some((c) => c.id === courseAId);
          console.log(`${!containsCourseA ? 'PASS' : 'FAIL'} cybersecurity data isolation: User B cannot see User A's course`);
          if (containsCourseA) failed = true;

          // Data Isolation Test 2: User B cannot edit User A's course (must return 403)
          const unauthorizedEditResp = await fetch(`http://localhost:${port}/api/courses/${courseAId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${userBToken}`,
            },
            body: JSON.stringify({
              courseName: 'Hacked Course',
              courseCode: courseCodeA,
              courseDescription: 'Tampered description',
            }),
          });
          const unauthorizedEditPassed = unauthorizedEditResp.status === 403;
          console.log(`${unauthorizedEditPassed ? 'PASS' : 'FAIL'} cybersecurity access control: User B cannot edit User A's course (HTTP 403)`);
          if (!unauthorizedEditPassed) failed = true;

          // User Deletion Test: Non-admin User B cannot delete any user (must return 403)
          const unauthorizedDeleteUserResp = await fetch(`http://localhost:${port}/api/auth/users/${creatorRegResult.data?.user?.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${userBToken}` },
          });
          const unauthorizedDeletePassed = unauthorizedDeleteUserResp.status === 403;
          console.log(`${unauthorizedDeletePassed ? 'PASS' : 'FAIL'} non-admin cannot delete user (HTTP 403)`);
          if (!unauthorizedDeletePassed) failed = true;

          // Admin User Deletion Test: Super Admin CAN delete user
          if (adminToken) {
            const adminDeleteUserResp = await fetch(`http://localhost:${port}/api/auth/users/${userBRegResult.data?.user?.id}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${adminToken}` },
            });
            const adminDeletePassed = adminDeleteUserResp.status === 200;
            console.log(`${adminDeletePassed ? 'PASS' : 'FAIL'} super admin can delete user (HTTP 200)`);
            if (!adminDeletePassed) failed = true;
          }
        }
      }

      // Multi-tenant Account Isolation Test: User C registers a new account
      const testUserCEmail = `smoke_user_c_${Date.now()}@example.com`;
        const userCRegResp = await fetch(`http://localhost:${port}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fullName: 'Smoke Test User C',
            email: testUserCEmail,
            password: 'Password123!',
            confirmPassword: 'Password123!',
          }),
        });
        const userCRegResult = await userCRegResp.json();
        const userCToken = userCRegResult.data?.token;

        if (userCToken) {
          // User C dashboard stats MUST be 0 and recent activity MUST be empty
          const userCStatsResp = await fetch(`http://localhost:${port}/api/dashboard/stats`, {
            headers: { Authorization: `Bearer ${userCToken}` },
          });
          const userCStats = await userCStatsResp.json();
          const cData = userCStats.data || {};
          const isBlankDashboard =
            userCStatsResp.status === 200 &&
            cData.totalCourses === 0 &&
            cData.totalQuestions === 0 &&
            cData.totalStudents === 0 &&
            cData.totalPracticeAttempts === 0 &&
            Array.isArray(cData.recentActivity) &&
            cData.recentActivity.length === 0;

          console.log(`${isBlankDashboard ? 'PASS' : 'FAIL'} new user C dashboard is completely blank: courses=${cData.totalCourses}, attempts=${cData.totalPracticeAttempts}, recent=${cData.recentActivity?.length}`);
          if (!isBlankDashboard) failed = true;

          // User C results MUST be empty
          const userCResultsResp = await fetch(`http://localhost:${port}/api/results`, {
            headers: { Authorization: `Bearer ${userCToken}` },
          });
          const userCResults = await userCResultsResp.json();
          const isBlankResults = userCResultsResp.status === 200 && userCResults.data?.items?.length === 0;
          console.log(`${isBlankResults ? 'PASS' : 'FAIL'} new user C results list is blank (count: ${userCResults.data?.items?.length})`);
          if (!isBlankResults) failed = true;

          // User C students list MUST be empty
          const userCStudentsResp = await fetch(`http://localhost:${port}/api/students`, {
            headers: { Authorization: `Bearer ${userCToken}` },
          });
          const userCStudents = await userCStudentsResp.json();
          const isBlankStudents = userCStudentsResp.status === 200 && userCStudents.data?.items?.length === 0;
          console.log(`${isBlankStudents ? 'PASS' : 'FAIL'} new user C students list is blank (count: ${userCStudents.data?.items?.length})`);
          if (!isBlankStudents) failed = true;

          // Exam Workflow Test: User C takes exam on Course A
          if (sharedCourseAId) {
            const startExamResp = await fetch(`http://localhost:${port}/api/exams/start`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${userCToken}`,
              },
              body: JSON.stringify({
                studentName: 'Smoke Test User C',
                courseId: sharedCourseAId,
                questionCount: 5,
              }),
            });
            const startExamResult = await startExamResp.json();
            const examData = startExamResult.data || {};
            const examStarted = startExamResp.status === 201 && Boolean(examData.examId) && Array.isArray(examData.questions);
            console.log(`${examStarted ? 'PASS' : 'FAIL'} exam session started successfully (examId: ${examData.examId}, questions: ${examData.questions?.length})`);
            if (!examStarted) failed = true;

            if (examStarted) {
              // Submit exam
              const questionId = examData.questions[0].id;
              const submitResp = await fetch(`http://localhost:${port}/api/exams/submit`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${userCToken}`,
                },
                body: JSON.stringify({
                  examId: examData.examId,
                  answers: [
                    { questionId, selectedOption: 'A' },
                  ],
                }),
              });
              const submitResult = await submitResp.json();
              if (submitResp.status !== 200) console.log('Submit error:', submitResp.status, submitResult);
              const submitPassed = submitResp.status === 200 && submitResult.data?.score === 1 && submitResult.data?.percentage === 100;
              console.log(`${submitPassed ? 'PASS' : 'FAIL'} exam submitted and scored in Turso (score: ${submitResult.data?.score}, percentage: ${submitResult.data?.percentage}%)`);
              if (!submitPassed) failed = true;

              // Result retrieval check
              const getResultResp = await fetch(`http://localhost:${port}/api/results/${examData.examId}`, {
                headers: { Authorization: `Bearer ${userCToken}` },
              });
              const getResultData = await getResultResp.json();
              const resultRetrieved = getResultResp.status === 200 && getResultData.data?.id === examData.examId;
              console.log(`${resultRetrieved ? 'PASS' : 'FAIL'} exam result retrieved from Turso by ID: ${getResultResp.status}`);
              if (!resultRetrieved) failed = true;
            }
          }

          // Single-question dummy subjects cleanup verification
          const { cleanupSingleQuestionCourses } = require('../database/initDatabase');
          await cleanupSingleQuestionCourses();
          console.log('PASS single-question dummy subjects cleanup routine executed');
        }

        if (failed) process.exitCode = 1;
    } catch (error) {
      console.error('Smoke test failed:', error.message);
      process.exitCode = 1;
    } finally {
      server.close();
      await pool.end();
    }
  });
})();
