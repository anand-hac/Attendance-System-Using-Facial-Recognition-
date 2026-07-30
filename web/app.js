/**
 * FRAS Core Application Script
 * Decoupled Web Portal Logic (Vercel Frontend + Render Backend)
 */

class FRASPortal {
  constructor() {
    this.students = [];
    this.logs = [];
    this.modelTrained = false;
    this.activeStream = null;
    
    // API connection state
    this.backendUrl = localStorage.getItem('fras_backend_url') || 'https://fras-backend-api.onrender.com';
    this.isConnected = false;

    // Running states
    this.recognitionActive = false;
    this.registrationActive = false;
    this.recognitionInterval = null;
    this.sessionLogs = [];

    // Local Mock Fallback values (if offline / no backend url configured)
    this.mockStudents = [
      { id: 101, name: 'Adeetya Upadhyay' },
      { id: 102, name: 'Shreyas More' },
      { id: 103, name: 'Ciro Iriarte' }
    ];

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    this.mockLogs = [
      { id: 101, name: 'Adeetya Upadhyay', date: yesterdayStr, time: '09:05:12', status: 'Present' },
      { id: 102, name: 'Shreyas More', date: yesterdayStr, time: '09:12:44', status: 'Present' },
      { id: 103, name: 'Ciro Iriarte', date: yesterdayStr, time: '09:15:02', status: 'Present' }
    ];

    this.initElements();
    this.initEvents();
    this.loadState();
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

    // Render Backend API inputs
    this.inputBackendUrl = document.getElementById('settings-backend-url');
    this.btnSaveBackend = document.getElementById('btn-save-backend');
    this.statusConnection = document.getElementById('settings-connection-status');
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
      alert('SMTP credentials saved locally.');
    });
    
    this.btnRestoreDefaults.addEventListener('click', () => {
      if(confirm('Reset database to default mock configurations?')) {
        localStorage.clear();
        location.reload();
      }
    });

    // Save Render Backend API
    this.btnSaveBackend.addEventListener('click', () => {
      const url = this.inputBackendUrl.value.trim().replace(/\/$/, "");
      this.backendUrl = url;
      localStorage.setItem('fras_backend_url', url);
      this.testBackendConnection();
    });
  }

  async loadState() {
    // Sync UI value
    this.inputBackendUrl.value = this.backendUrl;
    await this.testBackendConnection();
    this.updateStats();
  }

  async testBackendConnection() {
    if (!this.backendUrl) {
      this.isConnected = false;
      this.statusConnection.textContent = "Local Simulation Mode";
      this.statusConnection.className = "badge badge-warning";
      
      // Pull from LocalStorage / Mock fallback
      this.students = JSON.parse(localStorage.getItem('fras_students')) || [...this.mockStudents];
      this.logs = JSON.parse(localStorage.getItem('fras_logs')) || [...this.mockLogs];
      this.modelTrained = localStorage.getItem('fras_model_trained') !== 'false';
      this.updateStats();
      return;
    }

    this.statusConnection.textContent = "Connecting to API...";
    this.statusConnection.className = "badge badge-warning";

    try {
      const res = await fetch(`${this.backendUrl}/api/status`, {
        signal: AbortSignal.timeout(5000) // 5s timeout
      });
      const data = await res.json();
      
      if (data.status === "online") {
        this.isConnected = true;
        this.statusConnection.textContent = "Connected to Render Backend";
        this.statusConnection.className = "badge badge-success";
        this.modelTrained = data.model_trained;
        
        // Fetch values from server
        await this.syncDataWithBackend();
      } else {
        throw new Error("Offline response");
      }
    } catch (err) {
      console.error("Connection Failed:", err);
      this.isConnected = false;
      this.statusConnection.textContent = "Connection Failed / Offline";
      this.statusConnection.className = "badge badge-danger";
      
      // Fallback
      this.students = JSON.parse(localStorage.getItem('fras_students')) || [...this.mockStudents];
      this.logs = JSON.parse(localStorage.getItem('fras_logs')) || [...this.mockLogs];
      this.modelTrained = localStorage.getItem('fras_model_trained') !== 'false';
    }
    this.updateStats();
  }

  async syncDataWithBackend() {
    if (!this.isConnected) return;
    try {
      // Sync Students
      const studentRes = await fetch(`${this.backendUrl}/api/students`);
      const studentData = await studentRes.json();
      if (studentData.success) {
        this.students = studentData.students;
      }

      // Sync Logs
      const logsRes = await fetch(`${this.backendUrl}/api/logs`);
      const logsData = await logsRes.json();
      if (logsData.success) {
        this.logs = logsData.logs;
      }
    } catch (e) {
      console.error("Sync data failed:", e);
    }
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

    // Refresh states
    if (this.isConnected) {
      await this.syncDataWithBackend();
    }
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
      this.statModelDetails.textContent = this.isConnected ? 'Trainner.yml loaded on server' : 'Trainner.yml loaded locally';
    } else {
      this.statModelStatus.textContent = 'Untrained';
      this.statModelStatus.className = 'value text-warning';
      this.statModelDetails.textContent = 'Unsaved registry updates pending';
    }

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

  // Capture current video frame as JPEG base64 payload
  captureVideoFrame(videoEl) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = videoEl.videoWidth || 640;
    tempCanvas.height = videoEl.videoHeight || 480;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(videoEl, 0, 0, tempCanvas.width, tempCanvas.height);
    return tempCanvas.toDataURL('image/jpeg', 0.8);
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

    // Initialize registration status in backend
    if (this.isConnected) {
      try {
        const regRes = await fetch(`${this.backendUrl}/api/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, name })
        });
        const regData = await regRes.json();
        if (!regData.success) {
          alert(`Server Registration Failed: ${regData.message}`);
          return;
        }
      } catch (err) {
        alert(`API communication failed: ${err.message}`);
        return;
      }
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

    // Setup Canvas
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
    
    const captureIntervalTime = this.isConnected ? 160 : 60; // Slower interval for API roundtrips
    
    const captureLoop = setInterval(async () => {
      if (!this.registrationActive) {
        clearInterval(captureLoop);
        return;
      }

      // Grab base64 image frame
      const frameData = this.captureVideoFrame(this.videoReg);

      if (this.isConnected) {
        // --- ONLINE MODE: Send to Render server ---
        try {
          const uploadRes = await fetch(`${this.backendUrl}/api/upload_face`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: id,
              name: name,
              image: frameData,
              sampleNum: frameCount + 1
            })
          });
          const uploadData = await uploadRes.json();
          
          if (uploadData.success) {
            frameCount++;
            
            // Draw matching bounding box returned by OpenCV on the server
            ctx.clearRect(0, 0, this.canvasReg.width, this.canvasReg.height);
            if (uploadData.box) {
              const { x, y, width, height } = uploadData.box;
              ctx.strokeStyle = '#10B981'; // Green for detected face
              ctx.lineWidth = 3;
              ctx.strokeRect(x, y, width, height);
              ctx.fillStyle = '#10B981';
              ctx.font = '11px Courier New';
              ctx.fillText(`FACE DETECTED [${x},${y}]`, x, y - 8);
            }
            
            // Update Progress
            this.updateRegistrationProgress(frameCount, maxFrames);
            
            if (frameCount % 5 === 0) {
              this.regConsole.innerHTML += `<div class="log-entry success">[SERVER] Saved face crop sample ${frameCount}/100.</div>`;
              this.regConsole.scrollTop = this.regConsole.scrollHeight;
            }
          } else {
            // No face detected, output warning in console
            this.regConsole.innerHTML += `<div class="log-entry warning">[WARNING] ${uploadData.message || "No face located."} Adjust position.</div>`;
            this.regConsole.scrollTop = this.regConsole.scrollHeight;
          }
        } catch (e) {
          this.regConsole.innerHTML += `<div class="log-entry warning">[API ERROR] Failed sending payload to server. Retrying...</div>`;
          this.regConsole.scrollTop = this.regConsole.scrollHeight;
        }

      } else {
        // --- OFFLINE SIMULATION MODE ---
        frameCount++;
        this.updateRegistrationProgress(frameCount, maxFrames);

        if (frameCount % 10 === 0) {
          this.regConsole.innerHTML += `<div class="log-entry">[INFO] Captured ${frameCount} face samples. Calculating mock boundaries...</div>`;
          this.regConsole.scrollTop = this.regConsole.scrollHeight;
        }

        ctx.clearRect(0, 0, this.canvasReg.width, this.canvasReg.height);
        const boxSize = 200;
        const jitterX = Math.sin(frameCount * 0.5) * 8;
        const jitterY = Math.cos(frameCount * 0.5) * 5;
        const x = (this.canvasReg.width - boxSize) / 2 + jitterX;
        const y = (this.canvasReg.height - boxSize) / 2 + jitterY;

        ctx.strokeStyle = '#00F2FE';
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, boxSize, boxSize);
        ctx.fillStyle = '#00F2FE';
        ctx.font = '11px Courier New';
        ctx.fillText(`SIMULATED BOX: [${Math.round(x)}, ${Math.round(y)}]`, x, y - 8);
      }

      // Finish registration
      if (frameCount >= maxFrames) {
        clearInterval(captureLoop);
        this.finalizeRegistration(id, name);
      }
    }, captureIntervalTime);
  }

  updateRegistrationProgress(count, max) {
    const percent = Math.min(Math.round((count / max) * 100), 100);
    this.regProgressBar.style.width = `${percent}%`;
    this.scanCountText.textContent = `${count} / ${max} Frames`;
    this.scanPercentText.textContent = `${percent}%`;
  }

  async finalizeRegistration(id, name) {
    this.stopActiveStream();
    this.registrationActive = false;

    if (this.isConnected) {
      // Refresh local cache representation of backend students list
      await this.syncDataWithBackend();
      this.modelTrained = false;
    } else {
      // Local
      this.students.push({ id, name });
      localStorage.setItem('fras_students', JSON.stringify(this.students));
      this.modelTrained = false;
      localStorage.setItem('fras_model_trained', 'false');
    }

    // Switch views
    this.viewScanning.style.display = 'none';
    this.viewSuccess.style.display = 'block';
    document.getElementById('success-message').innerHTML = `Student <strong>${name} (ID: ${id})</strong> has been successfully enrolled into the database registry.`;
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
  async executeTraining() {
    if (this.students.length === 0) {
      alert('No student datasets available. Please register students first.');
      return;
    }

    this.btnStartTraining.disabled = true;
    this.trainProgressSection.style.display = 'block';
    this.trainConsole.innerHTML = '<div class="log-entry">[SYSTEM] Initializing training environment...</div>';

    // Simulated progress steps to show details
    const logSteps = [
      { p: 15, text: 'Scanning directory files...' },
      { p: 35, text: 'Mapping datasets from StudentDetails registries...' },
      { p: 60, text: 'Computing Local Binary Pattern (LBP) histogram matrices...' },
      { p: 85, text: 'Structuring weight vectors...' }
    ];

    let currentLog = 0;
    const progressTimer = setInterval(() => {
      if (currentLog < logSteps.length) {
        const step = logSteps[currentLog];
        this.trainProgressBar.style.width = `${step.p}%`;
        this.trainPercentText.textContent = `${step.p}%`;
        this.trainStepText.textContent = step.text;
        this.trainConsole.innerHTML += `<div class="log-entry">[LOG] ${step.text}</div>`;
        this.trainConsole.scrollTop = this.trainConsole.scrollHeight;
        currentLog++;
      }
    }, 600);

    if (this.isConnected) {
      // --- ONLINE MODE: Trigger backend training ---
      try {
        const res = await fetch(`${this.backendUrl}/api/train`, { method: 'POST' });
        const data = await res.json();
        
        clearInterval(progressTimer);
        
        if (data.success) {
          this.trainProgressBar.style.width = '100%';
          this.trainPercentText.textContent = '100%';
          this.trainStepText.textContent = 'Training complete!';
          this.trainConsole.innerHTML += `<div class="log-entry success">[SERVER SUCCESS] ${data.message}</div>`;
          this.trainConsole.scrollTop = this.trainConsole.scrollHeight;
          
          this.modelTrained = true;
          alert('Model trained successfully on Render backend!');
        } else {
          this.trainConsole.innerHTML += `<div class="log-entry warning">[SERVER ERROR] ${data.message}</div>`;
          this.trainConsole.scrollTop = this.trainConsole.scrollHeight;
          alert(`Training Failed: ${data.message}`);
        }
      } catch (e) {
        clearInterval(progressTimer);
        this.trainConsole.innerHTML += `<div class="log-entry warning">[API ERROR] Failed to connect: ${e.message}</div>`;
        alert(`API communication failed: ${e.message}`);
      }
    } else {
      // --- OFFLINE SIMULATION MODE ---
      setTimeout(() => {
        clearInterval(progressTimer);
        this.trainProgressBar.style.width = '100%';
        this.trainPercentText.textContent = '100%';
        this.trainStepText.textContent = 'Compilation complete!';
        this.trainConsole.innerHTML += `<div class="log-entry success">[SYSTEM] Saved simulated weights locally.</div>`;
        this.trainConsole.scrollTop = this.trainConsole.scrollHeight;
        
        this.modelTrained = true;
        localStorage.setItem('fras_model_trained', 'true');
        alert('Simulation model compiled successfully.');
      }, 3000);
    }

    setTimeout(() => {
      this.btnStartTraining.disabled = false;
      this.updateStats();
    }, 3200);
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
    this.recStatusBadge.textContent = this.isConnected ? 'Server Matching Active' : 'Offline Simulation';
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
    let latestBox = null;
    let boxText = "LOCATING FACES...";
    let boxColor = "#00F2FE";

    // Sub-loop for drawing the bounding box smoothly at 60fps
    const renderOverlay = () => {
      if (!this.recognitionActive) return;

      ctx.clearRect(0, 0, this.canvasRec.width, this.canvasRec.height);

      if (latestBox) {
        const { x, y, width, height } = latestBox;
        ctx.strokeStyle = boxColor;
        ctx.lineWidth = 3;
        ctx.shadowBlur = 10;
        ctx.shadowColor = boxColor;
        ctx.strokeRect(x, y, width, height);

        ctx.fillStyle = boxColor;
        ctx.font = 'bold 12px Outfit, sans-serif';
        ctx.shadowBlur = 0;
        ctx.fillText(boxText, x, y - 10);
      } else {
        // Draw idle scan frame in center
        const boxSize = 220;
        const x = (this.canvasRec.width - boxSize) / 2;
        const y = (this.canvasRec.height - boxSize) / 2;
        ctx.strokeStyle = "rgba(0, 242, 254, 0.2)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, boxSize, boxSize);
      }

      requestAnimationFrame(renderOverlay);
    };

    requestAnimationFrame(renderOverlay);

    const matchIntervalTime = this.isConnected ? 1800 : 3000;

    // Recognition check loop
    this.recognitionInterval = setInterval(async () => {
      if (this.students.length === 0) return;

      const frameData = this.captureVideoFrame(this.videoRec);

      if (this.isConnected) {
        // --- ONLINE MODE: Query Render API ---
        try {
          const res = await fetch(`${this.backendUrl}/api/recognize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: frameData })
          });
          const data = await res.json();
          
          if (data.box) {
            latestBox = data.box;
          } else {
            latestBox = null;
          }

          if (data.success) {
            // Recognized student
            boxText = `${data.id} - ${data.name} [Pass]`.toUpperCase();
            boxColor = "#10B981"; // Success Green
            
            // Log session entry if newly logged in session
            const newLog = {
              id: data.id,
              name: data.name,
              date: new Date().toISOString().split('T')[0],
              time: new Date().toTimeString().split(' ')[0],
              status: 'Present'
            };
            
            this.logs.unshift(newLog);
            this.sessionLogs.unshift(newLog);
            this.addSessionLogItem(newLog, data.confidence);
            this.updateStats();

          } else if (data.name === "Unknown") {
            // Face detected but unknown
            boxText = `CONFIDENCE LOW: ${data.confidence}%`.toUpperCase();
            boxColor = "#EF4444"; // Warning Red
            
            this.addSessionLogItem({
              id: 'Unknown',
              name: 'Unknown Face',
              time: new Date().toTimeString().split(' ')[0],
              status: 'Failed'
            }, data.confidence);
          } else {
            // No face detected
            latestBox = null;
          }
        } catch (e) {
          console.error("API recognition failed:", e);
          boxText = "API CONNECTION TIMEOUT";
          boxColor = "#F59E0B";
        }

      } else {
        // --- OFFLINE SIMULATION MODE ---
        const isRecognized = Math.random() < 0.8;
        const confidence = Math.round(isRecognized ? 68 + Math.random() * 26 : 20 + Math.random() * 25);
        
        let idVal = 'Unknown';
        let nameVal = 'Unknown User';
        
        if (isRecognized) {
          const randStudent = this.students[Math.floor(Math.random() * this.students.length)];
          idVal = randStudent.id;
          nameVal = randStudent.name;
        }

        const boxSize = 220;
        latestBox = {
          x: (this.canvasRec.width - boxSize) / 2,
          y: (this.canvasRec.height - boxSize) / 2,
          width: boxSize,
          height: boxSize
        };

        const today = new Date().toISOString().split('T')[0];
        const timeNow = new Date().toTimeString().split(' ')[0];

        if (isRecognized) {
          boxText = `${idVal} - ${nameVal} [Pass]`.toUpperCase();
          boxColor = "#10B981";

          const newLog = {
            id: idVal,
            name: nameVal,
            date: today,
            time: timeNow,
            status: 'Present'
          };
          this.logs.unshift(newLog);
          localStorage.setItem('fras_logs', JSON.stringify(this.logs));
          
          this.sessionLogs.unshift(newLog);
          this.addSessionLogItem(newLog, confidence);
          this.updateStats();
        } else {
          boxText = `UNKNOWN FACE: ${confidence}%`.toUpperCase();
          boxColor = "#EF4444";

          this.addSessionLogItem({
            id: 'Unknown',
            name: 'Unknown User',
            time: timeNow,
            status: 'Failed'
          }, confidence);
        }
      }
    }, matchIntervalTime);
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

    setTimeout(() => {
      item.style.opacity = '1';
      item.style.transform = 'translateY(0)';
    }, 50);

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

  async triggerAutoMail() {
    if (this.logs.length === 0) {
      alert('Cannot send mail. The attendance roster is currently empty.');
      return;
    }

    const email = this.inputSMTPReceiver.value.trim();
    const sender = this.inputSMTPHost.value.trim();
    const pass = this.inputSMTPHost.value.trim() === 'youremail@email.com' ? '' : this.inputSMTPHost.value;
    
    this.btnTriggerEmail.disabled = true;
    this.btnTriggerEmail.textContent = 'Mailing Report...';

    if (this.isConnected) {
      // --- ONLINE MODE: Trigger backend email ---
      try {
        const res = await fetch(`${this.backendUrl}/api/send_email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sender, password: pass, receiver: email })
        });
        const data = await res.json();
        alert(data.message);
      } catch (err) {
        alert(`API mail failed: ${err.message}`);
      }
    } else {
      // --- OFFLINE SIMULATION MODE ---
      setTimeout(() => {
        alert(`Auto-attachment report compiled!\nCSV sheet mailed from "${sender}" to "${email}" successfully.`);
      }, 1500);
    }

    this.btnTriggerEmail.disabled = false;
    this.btnTriggerEmail.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
      Auto Mail Report
    `;
  }
}

// Initialise App once window resources bind
window.addEventListener('DOMContentLoaded', () => {
  window.app = new FRASPortal();
});
