// Khởi tạo biến toàn cục
         let kpiData = {
             timetable: {},
             schoolTasks: [],
             homeroomTasks: [],
             regularTasks: [],
             irregularTasks: [],
             dailyProgress: [],
             storageMode: 'local',
             user: null,
             settings: {
                 dailyTarget: 8,
                 daysOff: [1, 7] // Mặc định: Chủ nhật (1) và Thứ 7 (7)
             }
         };
         
         // ================= GOOGLE DRIVE INTEGRATION =================
         // Biến toàn cục cho Google Drive integration
         const DRIVE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyU7fkNnuRR4t4gf9_E6jRX8uoNSxaBLVWrOyFi2gw9JKPXwB2GTPIZ7BE9KCLuZjQY7w/exec';
         let driveAccessToken = null;
         
         // Hàm khởi tạo ứng dụng
         function initApp() {
             // Xử lý đăng nhập
             document.getElementById('kpi-login-btn').addEventListener('click', handleLogin);
             document.getElementById('kpi-admin-btn').addEventListener('click', handleAdminAccess);
             document.getElementById('kpi-logout-btn').addEventListener('click', handleLogout);
             
             // Xử lý tab
             document.querySelectorAll('.kpi-tab').forEach(tab => {
                 tab.addEventListener('click', () => {
                     document.querySelectorAll('.kpi-tab').forEach(t => t.classList.remove('active'));
                     document.querySelectorAll('.kpi-tab-content').forEach(c => c.classList.remove('active'));
                     tab.classList.add('active');
                     document.getElementById(tab.dataset.tab).classList.add('active');
                 });
             });
             
             // Xử lý thời khóa biểu
             document.querySelectorAll('.kpi-editable-cell').forEach(cell => {
                 cell.addEventListener('click', () => {
                     const currentValue = cell.textContent;
                     const newValue = prompt('Nhập nội dung cho ô:', currentValue);
                     if (newValue !== null) {
                         cell.textContent = newValue;
                         const day = cell.dataset.day;
                         const lesson = cell.dataset.lesson;
                         if (!kpiData.timetable[day]) kpiData.timetable[day] = {};
                         kpiData.timetable[day][lesson] = newValue;
                         saveData();
                         updateTimetableSummary();
                         updateDailyProgress();
                     }
                 });
             });
             
             document.getElementById('kpi-save-timetable').addEventListener('click', () => {
                 saveData();
                 showNotification('Đã lưu thời khóa biểu!');
             });
             
             document.getElementById('kpi-reset-timetable').addEventListener('click', () => {
                 if (confirm('Bạn có chắc muốn đặt lại thời khóa biểu? Dữ liệu sẽ bị xóa.')) {
                     document.querySelectorAll('.kpi-editable-cell').forEach(cell => {
                         cell.textContent = '';
                     });
                     kpiData.timetable = {};
                     saveData();
                     updateTimetableSummary();
                     showNotification('Đã đặt lại thời khóa biểu!');
                 }
             });
             
             // Xử lý công việc nhà trường
             document.getElementById('kpi-add-school-task').addEventListener('click', () => {
                 addTask('school');
             });
             
             // Xử lý công việc chủ nhiệm
             document.getElementById('kpi-add-homeroom-task').addEventListener('click', () => {
                 addTask('homeroom');
             });
             
             // Xử lý công việc thường nhật
             document.getElementById('kpi-add-regular-task').addEventListener('click', () => {
                 addTask('regular');
             });
             
             // Xử lý công việc đột xuất
             document.getElementById('kpi-add-irregular-task').addEventListener('click', () => {
                 addTask('irregular');
             });
             
             // Xử lý chế độ lưu trữ
             document.getElementById('kpi-local-mode').addEventListener('click', () => {
                 setStorageMode('local');
             });
             
             document.getElementById('kpi-drive-mode').addEventListener('click', function() {
                 showDriveModal();
             });
             
             document.getElementById('kpi-sync-drive').addEventListener('click', () => {
                 showDriveModal();
             });
             
             // Xử lý modal Google Drive
             document.getElementById('kpi-drive-modal-close').addEventListener('click', () => {
                 document.getElementById('kpi-drive-modal').style.display = 'none';
             });
             
             // Xử lý kết nối Google Drive
             document.getElementById('kpi-drive-connect-btn').addEventListener('click', handleDriveConnect);
             
             document.getElementById('kpi-drive-save-btn').addEventListener('click', saveToDrive);
             document.getElementById('kpi-drive-load-btn').addEventListener('click', loadFromDrive);
             
             // Nút sử dụng lưu trữ cục bộ
             document.getElementById('kpi-use-local-btn').addEventListener('click', () => {
                 setStorageMode('local');
                 document.getElementById('kpi-drive-modal').style.display = 'none';
                 showNotification('Đã chuyển sang chế độ lưu trữ cục bộ');
             });
             
             // Xử lý cài đặt
             document.getElementById('kpi-save-settings').addEventListener('click', saveSettings);
             
             // Cho phép đăng nhập bằng phím Enter
             document.getElementById('kpi-password').addEventListener('keypress', function(e) {
                 if (e.key === 'Enter') {
                     handleLogin();
                 }
             });
             
             // Kiểm tra xem có dữ liệu đã lưu không
             checkSavedData();
             
             // THÊM: Tự động đăng nhập nếu đã có thông tin trong localStorage
             autoLoginIfPossible();
             
             // THÊM: Kiểm tra kết nối Google Drive khi khởi động
             setTimeout(() => {
                 checkAuthRedirect();
                 testDriveConnection();
             }, 2000);
         // Kiểm tra xem Font Awesome đã load chưa
         function checkFontAwesomeLoaded() {
         const testIcon = document.createElement('i');
         testIcon.className = 'fa fa-check';
         testIcon.style.position = 'absolute';
         testIcon.style.left = '-9999px';
         document.body.appendChild(testIcon);
         
         setTimeout(() => {
         const computedStyle = window.getComputedStyle(testIcon, ':before');
         const contentValue = computedStyle.content;
         console.log('Font Awesome check:', contentValue);
         
         if (contentValue === 'none' || !contentValue) {
         console.warn('Font Awesome chưa load đúng cách!');
         // Thử load lại font awesome
         const newLink = document.createElement('link');
         newLink.rel = 'stylesheet';
         newLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css';
         newLink.integrity = 'sha512-z3gLpd7yknf1YoNbCzqRKc4qyor8gaKU1qmn+CShxbuBusANI9QpRohGBreCFkKxLhei6S9CQXFEbbKuqLg0DA==';
         newLink.crossOrigin = 'anonymous';
         newLink.referrerPolicy = 'no-referrer';
         document.head.appendChild(newLink);
         }
         
         document.body.removeChild(testIcon);
         }, 100);
         }
         
         // Gọi hàm kiểm tra
         setTimeout(checkFontAwesomeLoaded, 2000);
         
         }
         
         // THÊM: Hàm tự động đăng nhập nếu đã có thông tin
         function autoLoginIfPossible() {
             const keys = Object.keys(localStorage);
             const userKeys = keys.filter(key => key.startsWith('kpiData_'));
             
             if (userKeys.length > 0) {
                 // Lấy key đầu tiên và trích xuất tên người dùng
                 const username = userKeys[0].replace('kpiData_', '');
                 
                 // Điền thông tin đăng nhập
                 document.getElementById('kpi-username').value = username;
                 document.getElementById('kpi-password').value = 'password';
                 
                 // Hiển thị thông báo
                 showNotification('Đã tìm thấy thông tin đăng nhập. Nhấn Đăng nhập để tiếp tục.', 'warning');
             }
         }
         
         // Kiểm tra dữ liệu đã lưu
         function checkSavedData() {
             const keys = Object.keys(localStorage);
             const hasData = keys.some(key => key.startsWith('kpiData_'));
             
             if (hasData) {
                 console.log('Đã tìm thấy dữ liệu đã lưu trong localStorage');
             }
         }
         
         // Hàm xử lý đăng nhập THỰC
         function handleLogin() {
             const username = document.getElementById('kpi-username').value;
             const password = document.getElementById('kpi-password').value;
             
             // Kiểm tra thông tin đăng nhập THỰC
             if ((username === 'pnhung72' && password === 'password') || 
                 (username === 'giaovien' && password === 'password')) {
                 document.getElementById('kpi-login-screen').style.display = 'none';
                 document.getElementById('kpi-app').style.display = 'block';
                 
                 // Thiết lập thông tin người dùng
                 let userName, userRole, userAvatar;
                 if (username === 'pnhung72') {
                     userName = 'Phan Ngọc Hùng';
                     userRole = 'Giáo viên';
                     userAvatar = 'PH';
                 } else {
                     userName = 'Giáo viên';
                     userRole = 'Giáo viên';
                     userAvatar = 'GV';
                 }
                 
                 document.getElementById('kpi-user-name').textContent = userName;
                 document.getElementById('kpi-user-avatar').textContent = userAvatar;
                 document.getElementById('kpi-user-role').textContent = userRole;
                 document.getElementById('kpi-teacher-name').textContent = userName;
                 
                 // Lưu thông tin người dùng
                 kpiData.user = {
                     username: username,
                     name: userName,
                     role: userRole,
                     loginTime: new Date().toISOString()
                 };
                 
                 // Tải dữ liệu đã lưu sau khi đăng nhập
                 loadData();
                 loadSettings();
                 
                 // CẬP NHẬT QUAN TRỌNG: Gọi cập nhật UI ngay sau khi đăng nhập
                 setTimeout(() => {
                     updateTimetableSummary();
                     updateDailyProgress();
                 }, 100);
                 
                 showNotification('Đăng nhập thành công!');
             } else {
                 showNotification('Tên đăng nhập hoặc mật khẩu không đúng!', 'error');
             }
         }
         
         // Hàm xử lý truy cập Admin
         function handleAdminAccess() {
             document.getElementById('kpi-login-screen').style.display = 'none';
             document.getElementById('kpi-app').style.display = 'block';
             
             // Thiết lập thông tin admin
             document.getElementById('kpi-user-name').textContent = 'Administrator';
             document.getElementById('kpi-user-avatar').textContent = 'A';
             document.getElementById('kpi-user-role').textContent = 'Quản trị hệ thống';
             document.getElementById('kpi-teacher-name').textContent = 'Administrator';
             
             // Lưu thông tin admin
             kpiData.user = {
                 username: 'admin',
                 name: 'Administrator',
                 role: 'admin',
                 loginTime: new Date().toISOString()
             };
             
             // Tự động điền thông tin đăng nhập
             document.getElementById('kpi-username').value = 'admin';
             document.getElementById('kpi-password').value = 'admin123';
             
             // Tải dữ liệu đã lưu sau khi đăng nhập
             loadData();
             loadSettings();
             
             // CẬP NHẬT QUAN TRỌNG: Gọi cập nhật UI ngay sau khi đăng nhập
                 setTimeout(() => {
                     updateTimetableSummary();
                     updateDailyProgress();
                 }, 100);
                 
                 showNotification('Đăng nhập với quyền Administrator thành công!');
         }
         
         // Hàm xử lý đăng xuất
         function handleLogout() {
             kpiData.user = null;
             document.getElementById('kpi-login-screen').style.display = 'block';
             document.getElementById('kpi-app').style.display = 'none';
             document.getElementById('kpi-username').value = '';
             document.getElementById('kpi-password').value = '';
             showNotification('Đã đăng xuất thành công!');
         }
             
         // Hàm thêm công việc THỰC
         function addTask(type) {
             let task, deadline, hours, startDate, days, frequency;
             
             switch (type) {
                 case 'school':
                     task = document.getElementById('kpi-school-task').value;
                     deadline = document.getElementById('kpi-school-deadline').value;
                     hours = parseFloat(document.getElementById('kpi-school-hours').value);
                     startDate = document.getElementById('kpi-school-start-date').value;
                     days = parseInt(document.getElementById('kpi-school-days').value);
                     break;
                 case 'homeroom':
                     task = document.getElementById('kpi-homeroom-task').value;
                     deadline = document.getElementById('kpi-homeroom-deadline').value;
                     hours = parseFloat(document.getElementById('kpi-homeroom-hours').value);
                     startDate = document.getElementById('kpi-homeroom-start-date').value;
                     days = parseInt(document.getElementById('kpi-homeroom-days').value);
                     break;
                 case 'regular':
                     task = document.getElementById('kpi-regular-task').value;
                     hours = parseFloat(document.getElementById('kpi-regular-hours').value);
                     frequency = document.getElementById('kpi-regular-frequency').value;
                     break;
                 case 'irregular':
                     task = document.getElementById('kpi-irregular-task').value;
                     deadline = document.getElementById('kpi-irregular-deadline').value;
                     hours = parseFloat(document.getElementById('kpi-irregular-hours').value);
                     break;
             }
             
             if (!task || (type !== 'regular' && !hours)) {
                 showNotification('Vui lòng nhập đầy đủ thông tin!', 'error');
                 return;
             }
             
             const newTask = {
                 id: Date.now(),
                 task: task,
                 hours: hours,
                 completed: false,
                 createdAt: new Date().toISOString()
             };
             
             if (type === 'school' || type === 'homeroom') {
                 newTask.deadline = deadline;
                 newTask.startDate = startDate;
                 newTask.days = days || 1;
             } else if (type === 'regular') {
                 newTask.frequency = frequency;
             } else if (type === 'irregular') {
                 newTask.deadline = deadline;
             }
             
             kpiData[type + 'Tasks'].push(newTask);
             saveData();
             updateTasksList(type);
             
             // Reset form
             if (type === 'school') {
                 document.getElementById('kpi-school-task').value = '';
                 document.getElementById('kpi-school-deadline').value = '';
                 document.getElementById('kpi-school-hours').value = '';
                 document.getElementById('kpi-school-start-date').value = '';
                 document.getElementById('kpi-school-days').value = '1';
             } else if (type === 'homeroom') {
                 document.getElementById('kpi-homeroom-task').value = '';
                 document.getElementById('kpi-homeroom-deadline').value = '';
                 document.getElementById('kpi-homeroom-hours').value = '';
                 document.getElementById('kpi-homeroom-start-date').value = '';
                 document.getElementById('kpi-homeroom-days').value = '1';
             } else if (type === 'regular') {
                 document.getElementById('kpi-regular-task').value = '';
                 document.getElementById('kpi-regular-hours').value = '';
             } else if (type === 'irregular') {
                 document.getElementById('kpi-irregular-task').value = '';
                 document.getElementById('kpi-irregular-deadline').value = '';
                 document.getElementById('kpi-irregular-hours').value = '';
             }
             
             showNotification('Đã thêm công việc mới!');
         }
         
         // Hàm cập nhật UI
         function updateUI() {
             // Cập nhật thời khóa biểu
             for (const day in kpiData.timetable) {
                 for (const lesson in kpiData.timetable[day]) {
                     const cell = document.querySelector(`.kpi-editable-cell[data-day="${day}"][data-lesson="${lesson}"]`);
                     if (cell) {
                         cell.textContent = kpiData.timetable[day][lesson];
                     }
                 }
             }
             
             // Cập nhật danh sách công việc
             updateTasksList('school');
             updateTasksList('homeroom');
             updateTasksList('regular');
             updateTasksList('irregular');
             
             // Cập nhật tổng quan
             updateTimetableSummary();
             updateDailyProgress();
         }
         
         // Hàm cập nhật danh sách công việc THỰC
         function updateTasksList(type) {
             const listElement = document.getElementById(`kpi-${type}-tasks-list`);
             listElement.innerHTML = '';
             
             if (kpiData[type + 'Tasks'].length === 0) {
                 listElement.innerHTML = '<div class="kpi-empty-tab"><p>Chưa có công việc nào</p></div>';
                 return;
             }
             
             kpiData[type + 'Tasks'].forEach(task => {
                 const taskElement = document.createElement('div');
                 taskElement.className = `kpi-work-item ${task.completed ? 'completed' : ''}`;
                 
                 let taskHtml = `
                     <div class="kpi-work-item-header">
                         <div class="kpi-work-item-title">${task.task}</div>
                         <div class="kpi-work-item-time">${task.hours} giờ</div>
                     </div>
                     <div class="kpi-work-item-meta">
                 `;
                 
                 if (task.deadline) {
                     taskHtml += `<span><i class="fas fa-calendar-day"></i> Hạn: ${formatDate(task.deadline)}</span>`;
                 }
                 
                 if (task.startDate && task.days) {
                     taskHtml += `<span><i class="fas fa-calendar-range"></i> Bắt đầu: ${formatDate(task.startDate)} (${task.days} ngày)</span>`;
                 }
                 
                 if (task.frequency) {
                     const frequencyText = {
                         daily: 'Hàng ngày',
                         weekly: 'Hàng tuần',
                         monthly: 'Hàng tháng'
                     }[task.frequency];
                     taskHtml += `<span><i class="fas fa-history"></i> ${frequencyText}</span>`;
                 }
                 
                 taskHtml += `<span><i class="fas fa-clock"></i> Tạo: ${formatDateTime(task.createdAt)}</span>`;
                 
                 if (task.completed && task.completedAt) {
                     taskHtml += `<span><i class="fas fa-check-circle"></i> Hoàn thành: ${formatDateTime(task.completedAt)}</span>`;
                 }
                 
                 taskHtml += `</div>`;
                 
                 taskHtml += `
                     <div class="kpi-work-item-actions">
                         <button class="kpi-btn kpi-btn-sm ${task.completed ? 'kpi-btn-warning' : 'kpi-btn-success'}" data-id="${task.id}" data-action="toggle">
                             ${task.completed ? '<i class="fas fa-undo"></i> Mở lại' : '<i class="fas fa-check"></i> Hoàn thành'}
                         </button>
                         <button class="kpi-btn kpi-btn-sm kpi-btn-danger" data-id="${task.id}" data-action="delete">
                             <i class="fas fa-trash"></i> Xóa
                         </button>
                     </div>
                 `;
                 
                 taskElement.innerHTML = taskHtml;
                 listElement.appendChild(taskElement);
             });
             
             // Thêm sự kiện cho các nút
             listElement.querySelectorAll('button').forEach(button => {
                 button.addEventListener('click', () => {
                     const id = parseInt(button.dataset.id);
                     const action = button.dataset.action;
                     
                     if (action === 'toggle') {
                         const task = kpiData[type + 'Tasks'].find(t => t.id === id);
                         if (task) {
                             task.completed = !task.completed;
                             task.completedAt = task.completed ? new Date().toISOString() : null;
                             saveData();
                             updateTasksList(type);
                             updateDailyProgress();
                             showNotification(`Đã ${task.completed ? 'hoàn thành' : 'mở lại'} công việc!`);
                         }
                     } else if (action === 'delete') {
                         if (confirm('Bạn có chắc muốn xóa công việc này?')) {
                             kpiData[type + 'Tasks'] = kpiData[type + 'Tasks'].filter(t => t.id !== id);
                             saveData();
                             updateTasksList(type);
                             updateDailyProgress();
                             showNotification('Đã xóa công việc!');
                         }
                     }
                 });
             });
         }
         
         // Hàm cập nhật tổng quan thời khóa biểu THỰC (ĐÃ SỬA)
         function updateTimetableSummary() {
             let totalLessons = 0;
             
             // Đếm số tiết dạy thực tế (chỉ các ô có nội dung)
             document.querySelectorAll('.kpi-editable-cell').forEach(cell => {
                 if (cell.textContent && cell.textContent.trim() !== '') {
                     totalLessons++;
                 }
             });
             
             const teachingTime = totalLessons * 0.75; // 45 phút = 0.75 giờ
             const preparationTime = totalLessons * 0.5; // 30 phút chuẩn bị cho mỗi tiết
             const totalTeachingWork = teachingTime + preparationTime;
             
             document.getElementById('kpi-total-lessons').textContent = `${totalLessons} tiết`;
             document.getElementById('kpi-teaching-time').textContent = `${teachingTime.toFixed(2)} giờ`;
             document.getElementById('kpi-preparation-time').textContent = `${preparationTime.toFixed(2)} giờ`;
             document.getElementById('kpi-total-teaching-work').textContent = `${totalTeachingWork.toFixed(2)} giờ`;
             
             // Cập nhật dashboard
             document.getElementById('kpi-total-hours').textContent = `${totalTeachingWork.toFixed(2)} giờ`;
             
             const progressPercent = Math.min(100, (totalTeachingWork / kpiData.settings.dailyTarget) * 100);
             document.getElementById('kpi-progress-bar').style.width = `${progressPercent}%`;
             document.getElementById('kpi-progress-bar').textContent = `${Math.round(progressPercent)}%`;
             
             // Tính KPI điểm THỰC dựa trên công việc hoàn thành
             updateKpiScore();
         }
         
         // Hàm tính điểm KPI THỰC
         function updateKpiScore() {
         // Tính tổng thời gian công việc đã hoàn thành
         let totalCompletedHours = 0;
         let totalPlannedHours = 0;
         
         // 1. Tính thời gian từ thời khóa biểu (coi như đã hoàn thành)
         let totalLessons = 0;
         document.querySelectorAll('.kpi-editable-cell').forEach(cell => {
         if (cell.textContent && cell.textContent.trim() !== '') {
            totalLessons++;
         }
         });
         
         const teachingTime = totalLessons * 0.75; // 45 phút = 0.75 giờ
         const preparationTime = totalLessons * 0.5; // 30 phút chuẩn bị cho mỗi tiết
         const totalTeachingWork = teachingTime + preparationTime;
         
         totalCompletedHours += totalTeachingWork;
         totalPlannedHours += totalTeachingWork;
         
         // 2. Công việc nhà trường
         kpiData.schoolTasks.forEach(task => {
         totalPlannedHours += task.hours;
         if (task.completed) totalCompletedHours += task.hours;
         });
         
         // 3. Công việc chủ nhiệm
         kpiData.homeroomTasks.forEach(task => {
         totalPlannedHours += task.hours;
         if (task.completed) totalCompletedHours += task.hours;
         });
         
         // 4. Công việc thường nhật
         kpiData.regularTasks.forEach(task => {
         totalPlannedHours += task.hours;
         if (task.completed) totalCompletedHours += task.hours;
         });
         
         // 5. Công việc đột xuất
         kpiData.irregularTasks.forEach(task => {
         totalPlannedHours += task.hours;
         if (task.completed) totalCompletedHours += task.hours;
         });
         
         // Tính điểm KPI thực tế
         const kpiScore = totalPlannedHours > 0 
         ? Math.min(100, Math.round((totalCompletedHours / totalPlannedHours) * 100))
         : 100; // Nếu không có công việc nào, coi như hoàn thành 100%
         
         document.getElementById('kpi-kpi-score').textContent = `${kpiScore}%`;
         
         // Cập nhật màu sắc dựa trên điểm KPI
         const kpiElement = document.getElementById('kpi-kpi-score');
         kpiElement.style.color = kpiScore >= 80 ? 'var(--kpi-success-color)' : 
                            kpiScore >= 50 ? 'var(--kpi-warning-color)' : 
                            'var(--kpi-danger-color)';
         }
         
         // Hàm cập nhật tiến trình hàng ngày THỰC (Đã sửa)
         function updateDailyProgress() {
         const today = new Date();
         const dayOfWeek = today.getDay(); // 0 là Chủ nhật, 1 là Thứ 2, ..., 6 là Thứ 7
         
         // Chuyển đổi sang định dạng số (1-7) để phù hợp với dữ liệu thời khóa biểu
         // Chủ nhật = 1, Thứ 2 = 2, ..., Thứ 7 = 7
         const dayNumber = dayOfWeek === 0 ? 1 : dayOfWeek + 1;
         
         // Kiểm tra xem hôm nay có phải là ngày nghỉ không
         const isDayOff = kpiData.settings.daysOff.includes(dayNumber);
         
         if (isDayOff) {
         document.getElementById('kpi-total-hours').textContent = "0.00 giờ (Ngày nghỉ)";
         document.getElementById('kpi-progress-bar').style.width = "0%";
         document.getElementById('kpi-progress-bar').textContent = "0%";
         updateKpiScore();
         return;
         }
         
         // Tính tổng thời gian làm việc hôm nay
         let todayHours = 0;
         
         // Tính thời gian dạy từ thời khóa biểu
         const dayCells = document.querySelectorAll(`.kpi-editable-cell[data-day="${dayNumber}"]`);
         
         // Đếm số môn học KHÁC NHAU để tính thời gian chuẩn bị
         const uniqueSubjects = new Set();
         
         dayCells.forEach(cell => {
         if (cell.textContent && cell.textContent.trim() !== '') {
            // Thêm thời gian dạy thực tế (0.75 giờ/tiết)
            todayHours += 0.75; // 45 phút mỗi tiết
            
            // Trích xuất tên môn học (ví dụ: "Lý-10A13" -> "Lý")
            const subjectMatch = cell.textContent.match(/^[^\d-]+/); // Lấy phần chữ cái đầu tiên
            if (subjectMatch) {
                uniqueSubjects.add(subjectMatch[0].trim());
            }
         }
         });
         
         // Tính thời gian chuẩn bị: 0.5 giờ cho mỗi môn học KHÁC NHAU
         const preparationTime = uniqueSubjects.size * 0.5;
         todayHours += preparationTime;
         
         // Kiểm tra các công việc đã hoàn thành hôm nay
         const todayStr = today.toISOString().split('T')[0];
         const allTasks = [
         ...kpiData.schoolTasks,
         ...kpiData.homeroomTasks,
         ...kpiData.regularTasks,
         ...kpiData.irregularTasks
         ];
         
         allTasks.forEach(task => {
         if (task.completed && task.completedAt && task.completedAt.startsWith(todayStr)) {
            todayHours += task.hours;
         }
         });
         
         document.getElementById('kpi-total-hours').textContent = `${todayHours.toFixed(2)} giờ`;
         
         const progressPercent = Math.min(100, (todayHours / kpiData.settings.dailyTarget) * 100);
         document.getElementById('kpi-progress-bar').style.width = `${progressPercent}%`;
         document.getElementById('kpi-progress-bar').textContent = `${Math.round(progressPercent)}%`;
         
         // Cập nhật KPI
         updateKpiScore();
         }
         
         // Hàm khởi tạo dữ liệu mẫu cho thời khóa biểu
         function initializeSampleTimetable() {
             // Dữ liệu thời khóa biểu mẫu
             kpiData.timetable = {
                 '2-3': 'Lý-10A12',
                 '2-4': 'Lý-10A13',
                 '2-5': 'Lý-10A13',
                 '3-6': 'Lý-11B13',
                 '3-7': 'Lý-11B13', 
                 '3-8': 'Lý-11B12',
                 '3-9': 'Lý-11B12',
                 '4-1': 'Lý-10A13',
                 '4-3': 'Lý-10A12',
                 '4-4': 'Lý-10A12',
                 '4-6': 'Lý-11B11',
                 '4-7': 'Lý-11B11',
                 '6-6': 'Lý-11B11',
                 '6-7': 'Lý-11B12',
                 '6-8': 'Lý-11B13',
                 '6-9': 'Lý-11B13'
             };
             
             // Cập nhật giao diện với dữ liệu mẫu
             for (const key in kpiData.timetable) {
                 const [day, lesson] = key.split('-');
                 const cell = document.querySelector(`.kpi-editable-cell[data-day="${day}"][data-lesson="${lesson}"]`);
                 if (cell) {
                     cell.textContent = kpiData.timetable[key];
                 }
             }
             
             saveData();
             updateTimetableSummary();
             updateDailyProgress();
             
             // THÊM: Tự động thêm một số công việc mẫu
             addSampleTasks();
         }
         
         // THÊM: Hàm thêm công việc mẫu
         function addSampleTasks() {
             const today = new Date();
             const tomorrow = new Date(today);
             tomorrow.setDate(tomorrow.getDate() + 1);
             
             // Thêm công việc nhà trường mẫu
             kpiData.schoolTasks.push({
                 id: Date.now() + 1,
                 task: 'Chấm bài kiểm tra 15 phút',
                 hours: 2,
                 completed: false,
                 deadline: tomorrow.toISOString().split('T')[0],
                 createdAt: new Date().toISOString()
             });
             
             // Thêm công việc chủ nhiệm mẫu
             kpiData.homeroomTasks.push({
                 id: Date.now() + 2,
                 task: 'Họp phụ huynh cuối kỳ',
                 hours: 3,
                 completed: false,
                 deadline: tomorrow.toISOString().split('T')[0],
                 createdAt: new Date().toISOString()
             });
             
             // Thêm công việc thường nhật mẫu
             kpiData.regularTasks.push({
                 id: Date.now() + 3,
                 task: 'Soạn giáo án',
                 hours: 1.5,
                 completed: false,
                 frequency: 'daily',
                 createdAt: new Date().toISOString()
             });
             
             saveData();
             updateTasksList('school');
             updateTasksList('homeroom');
             updateTasksList('regular');
         }
         
         // Hàm tải dữ liệu - tự động khởi tạo dữ liệu mẫu nếu chưa có
         function loadData() {
             if (kpiData.user) {
                 const userDataKey = `kpiData_${kpiData.user.username}`;
                 const savedData = localStorage.getItem(userDataKey);
                 
                 if (savedData) {
                     const parsedData = JSON.parse(savedData);
                     // Chỉ cập nhật các phần dữ liệu cần thiết, giữ nguyên thông tin user
                     kpiData.timetable = parsedData.timetable || {};
                     kpiData.schoolTasks = parsedData.schoolTasks || [];
                     kpiData.homeroomTasks = parsedData.homeroomTasks || [];
                     kpiData.regularTasks = parsedData.regularTasks || [];
                     kpiData.irregularTasks = parsedData.irregularTasks || [];
                     kpiData.dailyProgress = parsedData.dailyProgress || [];
                     kpiData.storageMode = parsedData.storageMode || 'local';
                     kpiData.settings = parsedData.settings || {
                         dailyTarget: 8,
                         daysOff: [1, 7]
                     };
                     
                     // Nếu không có dữ liệu thời khóa biểu, tự động tạo dữ liệu mẫu
                     if (Object.keys(kpiData.timetable).length === 0) {
                         initializeSampleTimetable();
                     }
                     
                     updateUI();
                 } else {
                     // Nếu không có dữ liệu đã lưu, tự động tạo dữ liệu mẫu
                     initializeSampleTimetable();
                 }
             }
         }
         
         // Hàm hiển thị thông báo
         function showNotification(message, type = 'success') {
             const notification = document.getElementById('kpi-notification');
             const notificationText = document.getElementById('kpi-notification-text');
             
             // Đặt màu nền theo loại thông báo
             if (type === 'error') {
                 notification.className = 'kpi-notification kpi-error';
             } else if (type === 'warning') {
                 notification.className = 'kpi-notification kpi-warning';
             } else {
                 notification.className = 'kpi-notification';
             }
             
             notificationText.textContent = message;
             notification.classList.add('show');
             
             setTimeout(() => {
                 notification.classList.remove('show');
             }, 3000);
         }
         
         // Hàm lưu dữ liệu THỰC
         function saveData() {
             if (kpiData.user) {
                 const userDataKey = `kpiData_${kpiData.user.username}`;
                 localStorage.setItem(userDataKey, JSON.stringify(kpiData));
                 
                 // Nếu đang ở chế độ Google Drive, đồng bộ lên Drive
                 if (kpiData.storageMode === 'drive' && driveAccessToken) {
                     saveToDrive();
                 }
             }
         }
         
         // Hàm tải cài đặt
         function loadSettings() {
             document.getElementById('kpi-daily-target').value = kpiData.settings.dailyTarget;
             document.getElementById('kpi-daily-target-display').textContent = kpiData.settings.dailyTarget;
             
             // Cập nhật checkbox ngày nghỉ
             const days = [1, 2, 3, 4, 5, 6, 7];
             days.forEach(day => {
                 const checkbox = document.getElementById(`kpi-day-off-${day}`);
                 if (checkbox) {
                     checkbox.checked = kpiData.settings.daysOff.includes(day);
                 }
             });
         }
         
         // Hàm lưu cài đặt
         function saveSettings() {
             kpiData.settings.dailyTarget = parseFloat(document.getElementById('kpi-daily-target').value);
             document.getElementById('kpi-daily-target-display').textContent = kpiData.settings.dailyTarget;
             
             // Lấy danh sách ngày nghỉ
             kpiData.settings.daysOff = [];
             const days = [1, 2, 3, 4, 5, 6, 7];
             days.forEach(day => {
                 const checkbox = document.getElementById(`kpi-day-off-${day}`);
                 if (checkbox && checkbox.checked) {
                     kpiData.settings.daysOff.push(day);
                 }
             });
             
             saveData();
             updateDailyProgress();
             updateTimetableSummary();
             showNotification('Đã lưu cài đặt!');
         }
         
         // Hàm thiết lập chế độ lưu trữ
         function setStorageMode(mode) {
             kpiData.storageMode = mode;
             
             // Cập nhật UI
             document.getElementById('kpi-local-mode').classList.toggle('active', mode === 'local');
             document.getElementById('kpi-drive-mode').classList.toggle('active', mode === 'drive');
             
             const driveStatus = document.getElementById('kpi-drive-status');
             if (mode === 'drive') {
                 driveStatus.innerHTML = '<i class="fas fa-cloud"></i> Chế độ Google Drive';
                 driveStatus.className = 'kpi-drive-status connected';
             } else {
                 driveStatus.innerHTML = '<i class="fas fa-desktop"></i> Chế độ lưu trữ cục bộ';
                 driveStatus.className = 'kpi-drive-status disconnected';
             }
             
             saveData();
             showNotification(`Đã chuyển sang chế độ lưu trữ ${mode === 'local' ? 'cục bộ' : 'Google Drive'}`);
         }
         
         // Hàm hiển thị modal Google Drive
         function showDriveModal() {
             document.getElementById('kpi-drive-modal').style.display = 'block';
             
             // Kiểm tra trạng thái kết nối
             if (driveAccessToken) {
                 document.getElementById('kpi-drive-status-text').textContent = 'Đã kết nối với Google Drive';
                 document.getElementById('kpi-drive-connect-btn').textContent = 'Ngắt kết nối';
                 document.getElementById('kpi-drive-save-btn').disabled = false;
                 document.getElementById('kpi-drive-load-btn').disabled = false;
             } else {
                 document.getElementById('kpi-drive-status-text').textContent = 'Chưa kết nối với Google Drive';
                 document.getElementById('kpi-drive-connect-btn').textContent = 'Kết nối Google Drive';
                 document.getElementById('kpi-drive-save-btn').disabled = true;
                 document.getElementById('kpi-drive-load-btn').disabled = true;
             }
         }
         
         // Hàm xử lý kết nối Google Drive
         function handleDriveConnect() {
             if (driveAccessToken) {
                 // Ngắt kết nối
                 driveAccessToken = null;
                 document.getElementById('kpi-drive-status-text').textContent = 'Đã ngắt kết nối Google Drive';
                 document.getElementById('kpi-drive-connect-btn').textContent = 'Kết nối Google Drive';
                 document.getElementById('kpi-drive-save-btn').disabled = true;
                 document.getElementById('kpi-drive-load-btn').disabled = true;
                 
                 // Quay về chế độ lưu trữ cục bộ
                 setStorageMode('local');
                 showNotification('Đã ngắt kết nối Google Drive');
             } else {
                 // Kết nối với Google Drive
                 const clientId = '1046769580708-etihbh16pec9et0h2m2d56jideet0p29.apps.googleusercontent.com'; // Thay bằng Client ID thực của bạn
                 const redirectUri = window.location.origin + window.location.pathname;
                 const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=https://www.googleapis.com/auth/drive.file&state=drive_auth`;
                 
                 // Lưu URL hiện tại để quay lại sau khi xác thực
                 localStorage.setItem('kpi_redirect_url', window.location.href);
                 
                 // Chuyển hướng đến trang xác thực Google
                 window.location.href = authUrl;
             }
         }
         
         // Hàm kiểm tra xác thực chuyển hướng
         function checkAuthRedirect() {
             const hash = window.location.hash;
             if (hash && hash.includes('access_token')) {
                 const params = new URLSearchParams(hash.substring(1));
                 driveAccessToken = params.get('access_token');
                 
                 if (driveAccessToken) {
                     // Chuyển sang chế độ Google Drive
                     setStorageMode('drive');
                     
                     // Ẩn modal nếu đang hiển thị
                     document.getElementById('kpi-drive-modal').style.display = 'none';
                     
                     // Xóa hash từ URL
                     history.replaceState(null, null, ' ');
                     
                     showNotification('Đã kết nối thành công với Google Drive!');
                 }
             }
         }
         
         // Hàm kiểm tra kết nối Google Drive
         function testDriveConnection() {
             if (driveAccessToken) {
                 fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
                     headers: {
                         'Authorization': `Bearer ${driveAccessToken}`
                     }
                 })
                 .then(response => response.json())
                 .then(data => {
                     console.log('Kết nối Google Drive thành công', data);
                 })
                 .catch(error => {
                     console.error('Lỗi kết nối Google Drive', error);
                     driveAccessToken = null;
                     setStorageMode('local');
                 });
             }
         }
         
         // Hàm lưu dữ liệu lên Google Drive
         function saveToDrive() {
             if (!driveAccessToken) {
                 showNotification('Chưa kết nối với Google Drive!', 'error');
                 return;
             }
             
             // Tạo dữ liệu JSON
             const dataStr = JSON.stringify(kpiData);
             const blob = new Blob([dataStr], {type: 'application/json'});
             
             // Tạo metadata cho file
             const metadata = {
                 'name': `kpi_data_${kpiData.user.username}.json`,
                 'mimeType': 'application/json',
                 'parents': ['root']
             };
             
             // Tạo FormData để gửi file
             const form = new FormData();
             form.append('metadata', new Blob([JSON.stringify(metadata)], {type: 'application/json'}));
             form.append('file', blob);
             
             // Gửi yêu cầu tải lên Google Drive
             fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                 method: 'POST',
                 headers: new Headers({
                     'Authorization': `Bearer ${driveAccessToken}`
                 }),
                 body: form
             })
             .then(response => response.json())
             .then(data => {
                 console.log('Đã lưu dữ liệu lên Google Drive', data);
                 showNotification('Đã lưu dữ liệu lên Google Drive thành công!');
             })
             .catch(error => {
                 console.error('Lỗi khi lưu lên Google Drive', error);
                 showNotification('Lỗi khi lưu dữ liệu lên Google Drive!', 'error');
             });
         }
         
         // Hàm tải dữ liệu từ Google Drive
         function loadFromDrive() {
             if (!driveAccessToken) {
                 showNotification('Chưa kết nối với Google Drive!', 'error');
                 return;
             }
             
             // Tìm file dữ liệu
             const fileName = `kpi_data_${kpiData.user.username}.json`;
             
             fetch(`https://www.googleapis.com/drive/v3/files?q=name='${fileName}'&fields=files(id,name)`, {
                 headers: {
                     'Authorization': `Bearer ${driveAccessToken}`
                 }
             })
             .then(response => response.json())
             .then(data => {
                 if (data.files && data.files.length > 0) {
                     const fileId = data.files[0].id;
                     
                     // Tải nội dung file
                     return fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                         headers: {
                             'Authorization': `Bearer ${driveAccessToken}`
                         }
                     });
                 } else {
                     throw new Error('Không tìm thấy file dữ liệu trên Google Drive');
                 }
             })
             .then(response => response.json())
             .then(data => {
                 // Cập nhật dữ liệu từ Google Drive
                 kpiData.timetable = data.timetable || {};
                 kpiData.schoolTasks = data.schoolTasks || [];
                 kpiData.homeroomTasks = data.homeroomTasks || [];
                 kpiData.regularTasks = data.regularTasks || [];
                 kpiData.irregularTasks = data.irregularTasks || [];
                 kpiData.dailyProgress = data.dailyProgress || [];
                 kpiData.settings = data.settings || {
                     dailyTarget: 8,
                     daysOff: [1, 7]
                 };
                 
                 // Cập nhật UI
                 updateUI();
                 
                 // Lưu vào localStorage để đồng bộ
                 saveData();
                 
                 showNotification('Đã tải dữ liệu từ Google Drive thành công!');
             })
             .catch(error => {
                 console.error('Lỗi khi tải từ Google Drive', error);
                 showNotification('Lỗi khi tải dữ liệu từ Google Drive!', 'error');
             });
         }
         
         // Hàm định dạng ngày tháng
         function formatDate(dateStr) {
             if (!dateStr) return '';
             const date = new Date(dateStr);
             return date.toLocaleDateString('vi-VN');
         }
         
         // Hàm định dạng ngày giờ
         function formatDateTime(dateTimeStr) {
             if (!dateTimeStr) return '';
             const date = new Date(dateTimeStr);
             return date.toLocaleString('vi-VN');
         }
         
         // Khởi tạo ứng dụng khi trang được tải
         initApp();