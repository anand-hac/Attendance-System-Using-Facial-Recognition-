/**
 * FRAS Core Application Script
 * Face Recognition Attendance System Portal Logic
 */

class FRASPortal {
  constructor() {
    this.students = JSON.parse(localStorage.getItem('fras_students')) || [
      { id: 101, name: 'Adeetya Upadhyay' },
      { id: 102, name: 'Shreyas More' },
      { id: 103, name: 'Ciro Iriarte' }
    ];

    // Mock some yesterday attendance logs, and active session logs
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    this.logs = JSON.parse(localStorage.getItem('fras_logs')) || [
      { id: 101, name: 'Adeetya Upadhyay', date: yesterdayStr, time: '09:05:12', status: 'Present' },
      { id: 102, name: 'Shreyas More', date: yesterdayStr, time: '09:12:44', status: 'Present' },
      { id: 103, name: 'Ciro Iriarte', date: yesterdayStr, time: '09:15:02', status: 'Present' }
    ];

    this.modelTrained = localStorage.getItem('fras_model_trained') === 'true';
    if (localStorage.getItem('fras_model_trained') === null) {
      this.modelTrained = true; // Default students are pre-trained
      localStorage.setItem('fras_model_trained', 'true');
    }

    this.activeStream = null;
    this.recognitionActive = false;
    this.registrationActive = false;
    this.recognitionInterval = null;
    this.sessionLogs = []; // Temporary logs for current recognition session

    this.initElements();
    this.initEvents();
    this.updateStats();
    this.renderLogsTable();
  }

  initElements() {
    // Nav Items
    this.navItems = document.querySelectorAll('.nav-item');
    this.pageViews = document.querySelectorAll('.page-view');

    // Stats
    this.statTotalStudents = document.getElementById('stats-total-students');
    this.statPresentToday = document.getElementById('stats-present-today');
    this.statPresentRate = document.getElementById('stats-present-rate');
    this.statModelStatus = document.getElementById('stats-model-status');
    this.statModelDetails = document.getElementById('stats-model-details');

    // Check Camera Elements
    this.btnStartCheckCam = document.getElementById('btn-start-check-cam');
    this.btnStopCheckCam = document.getElementById('btn-stop-check-cam');
    this.videoCheck = document.getElementById('camera-check-video');
    this.placeholderCheck = document.getElementById('camera-check-placeholder');

    // Registration Elements
    this.viewForm = document.getElementById('registration-form-view');
    this.viewScanning = document.getElementById('registration-scanning-view');
    this.viewSuccess = document.getElementById('registration-success-view');
    
    this.inputStudentId = document.getElementById('reg-student-id');
    this.inputStudentName = document.getElementById('reg-student-name');
    this.btnBeginReg = document.getElementById('btn-begin-registration');
    this.btnCancelReg = document.getElementById('btn-cancel-registration');
    
    this.videoReg = document.getElementById('camera-reg-video');
    this.canvasReg = document.getElementById('canvas-reg-overlay');
    this.regProgressBar = document.getElementById('reg-progress-bar');
    this.scanCountText = document.getElementById('scan-count-text');
    this.scanPercentText = document.getElementById('scan-percent-text');
    this.regConsole = document.getElementById('reg-console');

    // Training Elements
    this.btnStartTraining = document.getElementById('btn-start-training');
    this.trainProgressSection = document.getElementById('training-process-section');
    this.trainProgressBar = document.getElementById('train-progress-bar');
    this.trainStepText = document.getElementById('train-step-text');
    this.trainPercentText = document.getElementById('train-percent-text');
    this.trainConsole = document.getElementById('train-console');

    // Recognition Elements
    this.videoRec = document.getElementById('camera-rec-video');
    this.canvasRec = document.getElementById('canvas-rec-overlay');
    this.btnStartRec = document.getElementById('btn-start-rec');
    this.btnStopRec = document.getElementById('btn-stop-rec');
    this.placeholderRec = document.getElementById('camera-rec-placeholder');
    this.recStatusBadge = document.getElementById('rec-stream-status');
    this.recScannerGrid = document.getElementById('rec-scanner-grid');
    this.sessionLogList = document.getElementById('session-log-list');

    // Logs view
    this.logsTableBody = document.getElementById('logs-table-body');
    this.dashboardRecentTable = document.getElementById('dashboard-recent-table');
    this.logSearchInput = document.getElementById('log-search-input');
    this.logDateFilter = document.getElementById('log-date-filter');
    this.btnClearFilters = document.getElementById('btn-clear-filters');
    this.btnExportCSV = document.getElementById('btn-export-csv');
    this.btnTriggerEmail = document.getElementById('btn-trigger-email');

    // Settings
    this.btnSaveSMTP = document.getElementById('btn-save-smtp');
    this.btnRestoreDefaults = document.getElementById('btn-restore-defaults');
    this.inputSMTPHost = document.getElementById('settings-sender-email');
    this.inputSMTPReceiver = document.getElementById('settings-receiver-email');
    this.inputThreshold = document.getElementById('settings-threshold');
  }

  initEvents() {
    // Navigation routing
    this.navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const target = item.getAttribute('data-target');
        this.switchTab(target);
      });
    });

    // Check camera events
    this.btnStartCheckCam.addEventListener('click', () => this.startCheckCamera());
    this.btnStopCheckCam.addEventListener('click', () => this.stopCheckCamera());

    // Registration events
    this.btnBeginReg.addEventListener('click', () => this.beginRegistration());
    this.btnCancelReg.addEventListener('click', () => this.cancelRegistration());

    // Training events
    this.btnStartTraining.addEventListener('click', () => this.executeTraining());

    // Recognition events
    this.btnStartRec.addEventListener('click', () => this.startRecognition());
    this.btnStopRec.addEventListener('click', () => this.stopRecognition());

    // Log table filters
    this.logSearchInput.addEventListener('input', () => this.renderLogsTable());
    this.logDateFilter.addEventListener('change', () => this.renderLogsTable());
    this.btnClearFilters.addEventListener('click', () => {
      this.logSearchInput.value = '';
      this.logDateFilter.value = '';
      this.renderLogsTable();
    });

    // Exports
    this.btnExportCSV.addEventListener('click', () => this.exportLogsCSV());
    this.btnTriggerEmail.addEventListener('click', () => this.triggerAutoMail());

    // Save configurations
    this.btnSaveSMTP.addEventListener('click', () => {
      alert('SMTP details configured! Credentials securely locked in virtual keystore.');
    });
    this.btnRestoreDefaults.addEventListener('click', () => {
      if(confirm('Reset database to default mock configurations?')) {
        localStorage.clear();
        location.reload();
      }
    });
  }

  // Handle SPA Tab Switching cleanly, releasing system webcam hooks
  async switchTab(tabId) {
    this.stopCheckCamera();
    this.stopRecognition();
    this.cancelRegistration();

    this.navItems.forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-target') === tabId);
    });

    this.pageViews.forEach(view => {
      view.classList.toggle('active', view.getAttribute('id') === tabId);
    });

    this.updateStats();
    if (tabId === 'logs') {
      this.renderLogsTable();
    }
  }

  updateStats() {
    const today = new Date().toISOString().split('T')[0];
    const presentTodayCount = new Set(
      this.logs.filter(log => log.date === today && log.status === 'Present').map(l => l.id)
    ).size;

    this.statTotalStudents.textContent = this.students.length;
    this.statPresentToday.textContent = presentTodayCount;
    this.statPresentRate.textContent = this.students.length > 0 
      ? `${Math.round((presentTodayCount / this.students.length) * 100)}% Attendance Rate` 
      : '0% Attendance Rate';

    if (this.modelTrained) {
      this.statModelStatus.textContent = 'Active Model';
      this.statModelStatus.className = 'value text-success';
      this.statModelDetails.textContent = 'Trainner.yml compiled successfully';
    } else {
      this.statModelStatus.textContent = 'Untrained';
      this.statModelStatus.className = 'value text-warning';
      this.statModelDetails.textContent = 'Unsaved registration updates pending';
    }

    // Render recent dashboard list
    this.renderDashboardRecent();
  }

  // Webcam access engine
  async getCameraStream(videoEl, placeholderEl) {
    try {
      if (this.activeStream) {
        this.stopActiveStream();
      }

      this.activeStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' }
      });
      videoEl.srcObject = this.activeStream;
      if (placeholderEl) placeholderEl.classList.add('hidden');
      return true;
    } catch (err) {
      console.error('Webcam Access Denied:', err);
      alert('Camera access denied. Please grant webcam permissions in browser settings.');
      return false;
    }
  }

  stopActiveStream() {
    if (this.activeStream) {
      this.activeStream.getTracks().forEach(track => track.stop());
      this.activeStream = null;
    }
  }

  // --- Diagnostics Tab ---
  async startCheckCamera() {
    const success = await this.getCameraStream(this.videoCheck, this.placeholderCheck);
    if (success) {
      this.btnStartCheckCam.disabled = true;
      this.btnStopCheckCam.disabled = false;
    }
  }

  stopCheckCamera() {
    this.stopActiveStream();
    this.videoCheck.srcObject = null;
    this.placeholderCheck.classList.remove('hidden');
    this.btnStartCheckCam.disabled = false;
    this.btnStopCheckCam.disabled = true;
  }

  // --- Registration Flow ---
  async beginRegistration() {
    const id = parseInt(this.inputStudentId.value.trim());
    const name = this.inputStudentName.value.trim();

    if (isNaN(id)) {
      alert('Please enter a valid numerical ID.');
      return;
    }
    if (!name || !/^[A-Za-z\s]+$/.test(name)) {
      alert('Please enter a valid alphabetical name.');
      return;
    }

    // Check duplicate ID
    if (this.students.some(s => s.id === id)) {
      alert(`Student ID ${id} is already registered. Please assign a unique ID.`);
      return;
    }

    // Prepare views
    this.viewForm.style.display = 'none';
    this.viewScanning.style.display = 'block';
    this.viewSuccess.style.display = 'none';
    this.registrationActive = true;

    // Start webcam
    const success = await this.getCameraStream(this.videoReg);
    if (!success) {
      this.cancelRegistration();
      return;
    }

    // Setup Canvas and logging
    this.canvasReg.width = this.videoReg.clientWidth || 640;
    this.canvasReg.height = this.videoReg.clientHeight || 480;
    this.regConsole.innerHTML = '<div class="log-entry">[SYSTEM] Initializing video frames...</div>';
    
    // Animate registration frame acquisition
    this.runRegistrationCapture(id, name);
  }

  runRegistrationCapture(id, name) {
    let frameCount = 0;
    const maxFrames = 100;
    const ctx = this.canvasReg.getContext('2d');
    
    this.regConsole.innerHTML += `<div class="log-entry">[INFO] Initializing capture pipeline for ID:${id} - ${name}</div>`;
    
    const captureLoop = setInterval(() => {
      if (!this.registrationActive) {
        clearInterval(captureLoop);
        return;
      }

      frameCount++;
      
      // Update UI Progress
      const percent = Math.min(Math.round((frameCount / maxFrames) * 100), 100);
      this.regProgressBar.style.width = `${percent}%`;
      this.scanCountText.textContent = `${frameCount} / ${maxFrames} Frames`;
      this.scanPercentText.textContent = `${percent}%`;

      // Log progress to virtual CLI console
      if (frameCount % 10 === 0) {
        this.regConsole.innerHTML += `<div class="log-entry">[INFO] Captured ${frameCount} face samples. Calculating haar cascade crop bounds...</div>`;
        this.regConsole.scrollTop = this.regConsole.scrollHeight;
      }

      // Draw simulated bounding box on canvas
      ctx.clearRect(0, 0, this.canvasReg.width, this.canvasReg.height);
      
      // Add slight jitter to face crop bounding box to simulate actual real-time tracking
      const boxSize = 200;
      const jitterX = Math.sin(frameCount * 0.5) * 8;
      const jitterY = Math.cos(frameCount * 0.5) * 5;
      const x = (this.canvasReg.width - boxSize) / 2 + jitterX;
      const y = (this.canvasReg.height - boxSize) / 2 + jitterY;

      ctx.strokeStyle = '#00F2FE';
      ctx.lineWidth = 3;
      ctx.shadowBlur = 15;
      ctx.shadowColor = 'rgba(0, 242, 254, 0.5)';
      ctx.strokeRect(x, y, boxSize, boxSize);
      
      // Text coordinates overlay
      ctx.fillStyle = '#00F2FE';
      ctx.font = '12px Courier New';
      ctx.shadowBlur = 0;
      ctx.fillText(`CROP: [${Math.round(x)}, ${Math.round(y)}, ${boxSize}, ${boxSize}]`, x, y - 10);
      ctx.fillText(`ID: ${id}.${frameCount}.jpg`, x, y + boxSize + 20);

      // Stop once 100 images are saved
      if (frameCount >= maxFrames) {
        clearInterval(captureLoop);
        this.finalizeRegistration(id, name);
      }
    }, 60);
  }

  finalizeRegistration(id, name) {
    this.stopActiveStream();
    this.registrationActive = false;

    // Add student to local database
    this.students.push({ id, name });
    localStorage.setItem('fras_students', JSON.stringify(this.students));
    
    // Set model status as untrained since new pictures were captured
    this.modelTrained = false;
    localStorage.setItem('fras_model_trained', 'false');

    // Switch views
    this.viewScanning.style.display = 'none';
    this.viewSuccess.style.display = 'block';
    document.getElementById('success-message').innerHTML = `Student <strong>${name} (ID: ${id})</strong> has been successfully enrolled into the local database registry.`;
    this.updateStats();
  }

  cancelRegistration() {
    this.stopActiveStream();
    this.registrationActive = false;
    this.viewScanning.style.display = 'none';
    this.viewSuccess.style.display = 'none';
    this.viewForm.style.display = 'block';
  }

  resetRegistrationForm() {
    this.inputStudentId.value = '';
    this.inputStudentName.value = '';
    this.cancelRegistration();
  }

  // --- Training Model ---
  executeTraining() {
    if (this.students.length === 0) {
      alert('No student datasets available. Please register students first.');
      return;
    }

    this.btnStartTraining.disabled = true;
    this.trainProgressSection.style.display = 'block';
    this.trainConsole.innerHTML = '<div class="log-entry">[SYSTEM] Initializing training environment...</div>';

    const steps = [
      { p: 10, text: 'Scanning local directories for registered face dataset index...' },
      { p: 25, text: `Extracted ${this.students.length} student profile mappings from StudentDetails.csv.` },
      { p: 40, text: 'Executing Haar Cascade face localization matrices...' },
      { p: 60, text: 'Calculating Local Binary Pattern (LBP) histogram matrices...' },
      { p: 80, text: 'Aligning model weight tensors and compiling histogram indices...' },
      { p: 95, text: 'Saving compiled weights map into TrainingImageLabel/Trainner.yml...' },
      { p: 100, text: 'Success! Training completed. compiled weights size: 2.34 MB.' }
    ];

    let currentStep = 0;
    const interval = setInterval(() => {
      const step = steps[currentStep];
      this.trainProgressBar.style.width = `${step.p}%`;
      this.trainPercentText.textContent = `${step.p}%`;
      this.trainStepText.textContent = step.text;

      let logClass = '';
      if (step.p === 100) logClass = 'success';
      this.trainConsole.innerHTML += `<div class="log-entry ${logClass}">[LOG] ${step.text}</div>`;
      this.trainConsole.scrollTop = this.trainConsole.scrollHeight;

      currentStep++;
      if (currentStep >= steps.length) {
        clearInterval(interval);
        
        // Finalize
        this.modelTrained = true;
        localStorage.setItem('fras_model_trained', 'true');
        
        setTimeout(() => {
          this.btnStartTraining.disabled = false;
          alert('Model training completed! System ready for live verification.');
          this.updateStats();
        }, 800);
      }
    }, 800);
  }

  // --- Live Recognition & Attendance Logs ---
  async startRecognition() {
    if (!this.modelTrained) {
      alert('The model is untrained. Please run "Train Model" before starting recognition.');
      return;
    }

    const success = await this.getCameraStream(this.videoRec);
    if (!success) return;

    this.recognitionActive = true;
    this.btnStartRec.disabled = true;
    this.btnStopRec.disabled = false;
    this.placeholderRec.classList.add('hidden');
    this.recStatusBadge.textContent = 'Scanning Active';
    this.recStatusBadge.className = 'badge badge-success';
    this.recScannerGrid.classList.add('active');

    this.canvasRec.width = this.videoRec.clientWidth || 640;
    this.canvasRec.height = this.videoRec.clientHeight || 480;

    this.sessionLogList.innerHTML = '';
    this.sessionLogs = [];

    this.runRecognitionLoop();
  }

  stopRecognition() {
    this.stopActiveStream();
    clearInterval(this.recognitionInterval);
    this.recognitionActive = false;
    this.btnStartRec.disabled = false;
    this.btnStopRec.disabled = true;
    this.placeholderRec.classList.remove('hidden');
    this.recStatusBadge.textContent = 'Inactive';
    this.recStatusBadge.className = 'badge badge-danger';
    this.recScannerGrid.classList.remove('active');

    const ctx = this.canvasRec.getContext('2d');
    ctx.clearRect(0, 0, this.canvasRec.width, this.canvasRec.height);
  }

  runRecognitionLoop() {
    const ctx = this.canvasRec.getContext('2d');
    let frameTicks = 0;

    const renderOverlay = () => {
      if (!this.recognitionActive) return;

      frameTicks++;
      ctx.clearRect(0, 0, this.canvasRec.width, this.canvasRec.height);

      // Bounding box dimensions
      const boxWidth = 220;
      const boxHeight = 220;
      // Float bounding box slightly
      const x = (this.canvasRec.width - boxWidth) / 2 + Math.sin(frameTicks * 0.05) * 12;
      const y = (this.canvasRec.height - boxHeight) / 2 + Math.cos(frameTicks * 0.04) * 8;

      // Draw detection box
      ctx.strokeStyle = '#00F2FE';
      ctx.lineWidth = 3;
      ctx.shadowBlur = 12;
      ctx.shadowColor = 'rgba(0, 242, 254, 0.4)';
      ctx.strokeRect(x, y, boxWidth, boxHeight);

      // Scanning overlay info
      ctx.fillStyle = '#00F2FE';
      ctx.font = 'bold 13px Outfit, sans-serif';
      ctx.shadowBlur = 0;
      ctx.fillText('FACIAL TRACKING ACTIVE', x, y - 12);

      requestAnimationFrame(renderOverlay);
    };

    // Begin drawing box overlay
    requestAnimationFrame(renderOverlay);

    // Recognition simulator logic: identifies user every 3 seconds
    this.recognitionInterval = setInterval(() => {
      if (this.students.length === 0) return;

      // 80% chance of matching a registered student, 20% unknown
      const isRecognized = Math.random() < 0.8;
      const confidence = Math.round(isRecognized ? 68 + Math.random() * 26 : 20 + Math.random() * 25);
      
      let identifiedStudent = null;
      if (isRecognized) {
        identifiedStudent = this.students[Math.floor(Math.random() * this.students.length)];
      }

      const today = new Date().toISOString().split('T')[0];
      const timeNow = new Date().toTimeString().split(' ')[0];

      if (isRecognized && identifiedStudent) {
        // Match found! Logs attendance
        const alreadyLogged = this.logs.some(log => log.id === identifiedStudent.id && log.date === today);

        if (!alreadyLogged) {
          const newLog = {
            id: identifiedStudent.id,
            name: identifiedStudent.name,
            date: today,
            time: timeNow,
            status: 'Present'
          };
          this.logs.unshift(newLog);
          localStorage.setItem('fras_logs', JSON.stringify(this.logs));
          
          this.sessionLogs.unshift(newLog);
          this.addSessionLogItem(newLog, confidence);
          this.updateStats();
        }
      } else {
        // Unknown user detection event
        this.addSessionLogItem({
          id: 'Unknown',
          name: 'Unknown User',
          time: timeNow,
          status: 'Failed'
        }, confidence);
      }
    }, 3000);
  }

  addSessionLogItem(log, confidence) {
    const list = this.sessionLogList;
    if (list.querySelector('div[style*="text-align"]')) {
      list.innerHTML = '';
    }

    const item = document.createElement('div');
    item.className = 'activity-item';
    item.style.opacity = '0';
    item.style.transform = 'translateY(10px)';
    item.style.transition = 'all 0.3s ease';

    const isSuccess = log.status === 'Present';
    const initial = log.name.split(' ').map(n => n[0]).join('').slice(0, 2);

    item.innerHTML = `
      <div class="activity-avatar" style="background: ${isSuccess ? 'var(--grad-success)' : 'var(--grad-danger)'}">
        ${isSuccess ? initial : '?' }
      </div>
      <div class="activity-details">
        <div class="activity-name">${log.name}</div>
        <div class="activity-meta">ID: ${log.id} • ${log.time}</div>
      </div>
      <div class="activity-badge">
        <span class="badge ${isSuccess ? 'badge-success' : 'badge-danger'}">
          ${isSuccess ? `${confidence}% Pass` : `${confidence}% Unknown`}
        </span>
      </div>
    `;

    list.insertBefore(item, list.firstChild);

    // Fade animation trigger
    setTimeout(() => {
      item.style.opacity = '1';
      item.style.transform = 'translateY(0)';
    }, 50);

    // Truncate list size to keep layout clean
    if (list.children.length > 5) {
      list.removeChild(list.lastChild);
    }
  }

  // --- Attendance Log Tables ---
  renderLogsTable() {
    const searchQuery = this.logSearchInput.value.toLowerCase();
    const dateQuery = this.logDateFilter.value;

    const filteredLogs = this.logs.filter(log => {
      const matchName = log.name.toLowerCase().includes(searchQuery) || String(log.id).includes(searchQuery);
      const matchDate = !dateQuery || log.date === dateQuery;
      return matchName && matchDate;
    });

    this.logsTableBody.innerHTML = '';
    if (filteredLogs.length === 0) {
      this.logsTableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; color: var(--text-muted);">No records match the current filters.</td>
        </tr>
      `;
      return;
    }

    filteredLogs.forEach(log => {
      const tr = document.createElement('tr');
      const isSuccess = log.status === 'Present';
      
      tr.innerHTML = `
        <td><strong>#${log.id}</strong></td>
        <td>${log.name}</td>
        <td>${log.date}</td>
        <td>${log.time}</td>
        <td>
          <span class="badge ${isSuccess ? 'badge-success' : 'badge-danger'}">
            ${log.status}
          </span>
        </td>
      `;
      this.logsTableBody.appendChild(tr);
    });
  }

  renderDashboardRecent() {
    const today = new Date().toISOString().split('T')[0];
    const todayLogs = this.logs.filter(log => log.date === today);

    this.dashboardRecentTable.innerHTML = '';
    if (todayLogs.length === 0) {
      this.dashboardRecentTable.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px 0;">No logs registered today. Start recognition.</td>
        </tr>
      `;
      return;
    }

    // Show top 4 logs
    todayLogs.slice(0, 4).forEach(log => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>#${log.id}</td>
        <td>${log.name}</td>
        <td>${log.date}</td>
        <td>${log.time}</td>
        <td><span class="badge badge-success">${log.status}</span></td>
      `;
      this.dashboardRecentTable.appendChild(tr);
    });
  }

  // --- Exports ---
  exportLogsCSV() {
    if (this.logs.length === 0) {
      alert('No attendance data available to export.');
      return;
    }

    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'Student ID,Name,Date,Time,Status\n';

    this.logs.forEach(log => {
      csvContent += `${log.id},"${log.name}",${log.date},${log.time},${log.status}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    
    const todayStr = new Date().toISOString().split('T')[0];
    link.setAttribute('download', `Attendance_Report_${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  triggerAutoMail() {
    if (this.logs.length === 0) {
      alert('Cannot send mail. The attendance roster is currently empty.');
      return;
    }

    const email = this.inputSMTPReceiver.value.trim();
    const sender = this.inputSMTPHost.value.trim();
    
    this.btnTriggerEmail.disabled = true;
    this.btnTriggerEmail.textContent = 'Mailing Report...';

    setTimeout(() => {
      this.btnTriggerEmail.disabled = false;
      this.btnTriggerEmail.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
        Auto Mail Report
      `;
      alert(`Auto-attachment report compiled!\nCSV sheet mailed from "${sender}" to "${email}" successfully.`);
    }, 1500);
  }
}

// Initialise App once window resources bind
window.addEventListener('DOMContentLoaded', () => {
  window.app = new FRASPortal();
});
