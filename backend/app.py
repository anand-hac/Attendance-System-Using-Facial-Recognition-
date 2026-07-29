import os
import io
import csv
import base64
import datetime
import time
from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
import numpy as np
import cv2
import pandas as pd
import yagmail

app = Flask(__name__)
CORS(app)  # Enable Cross-Origin Resource Sharing for Vercel integration

# Define directories relative to project root
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STUDENT_DETAILS_DIR = os.path.join(BASE_DIR, 'StudentDetails')
TRAINING_IMAGE_DIR = os.path.join(BASE_DIR, 'TrainingImage')
TRAINING_LABEL_DIR = os.path.join(BASE_DIR, 'TrainingImageLabel')
ATTENDANCE_DIR = os.path.join(BASE_DIR, 'Attendance')

# Resolve cascade file
CASCADE_PATH = os.path.join(BASE_DIR, 'FRAS', 'haarcascade_frontalface_default.xml')
if not os.path.exists(CASCADE_PATH):
    # Fallback to local script folder if running standalone
    CASCADE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'haarcascade_frontalface_default.xml')

# Ensure directories exist
for folder in [STUDENT_DETAILS_DIR, TRAINING_IMAGE_DIR, TRAINING_LABEL_DIR, ATTENDANCE_DIR]:
    os.makedirs(folder, exist_ok=True)

# In-memory Cache for the trained recognizer model
recognizer = None
detector = None

def get_detector():
    global detector
    if detector is None:
        if os.path.exists(CASCADE_PATH):
            detector = cv2.CascadeClassifier(CASCADE_PATH)
        else:
            print(f"[ERROR] Cascade file not found at: {CASCADE_PATH}")
    return detector

def get_recognizer():
    global recognizer
    if recognizer is None:
        model_path = os.path.join(TRAINING_LABEL_DIR, 'Trainner.yml')
        if os.path.exists(model_path):
            try:
                recognizer = cv2.face.LBPHFaceRecognizer_create()
                recognizer.read(model_path)
                print("[INFO] LBPH Recognizer model loaded successfully from cache.")
            except Exception as e:
                print(f"[ERROR] Failed to load LBPH Recognizer model: {e}")
                recognizer = None
    return recognizer

def decode_base64_image(base64_str):
    """
    Utility function to decode base64 image strings sent from client browser
    and convert them to BGR OpenCV format.
    """
    if ',' in base64_str:
        base64_str = base64_str.split(',')[1]
    img_data = base64.b64decode(base64_str)
    pil_img = Image.open(io.BytesIO(img_data)).convert('RGB')
    open_cv_image = np.array(pil_img)
    # RGB to BGR
    open_cv_image = open_cv_image[:, :, ::-1].copy()
    return open_cv_image


@app.route('/api/status', methods=['GET'])
def get_status():
    model_path = os.path.join(TRAINING_LABEL_DIR, 'Trainner.yml')
    return jsonify({
        "status": "online",
        "model_trained": os.path.exists(model_path),
        "students_count": len(get_registered_students())
    })


def get_registered_students():
    csv_file_path = os.path.join(STUDENT_DETAILS_DIR, 'StudentDetails.csv')
    students = []
    if os.path.exists(csv_file_path):
        try:
            with open(csv_file_path, 'r') as f:
                reader = csv.reader(f)
                header = next(reader, None)  # Skip header
                for row in reader:
                    if len(row) >= 2:
                        students.append({"id": int(row[0]), "name": row[1]})
        except Exception as e:
            print(f"[ERROR] Reading StudentDetails.csv failed: {e}")
    return students


@app.route('/api/students', methods=['GET'])
def list_students():
    return jsonify({"success": True, "students": get_registered_students()})


@app.route('/api/register', methods=['POST'])
def register_student():
    data = request.get_json()
    if not data or 'id' not in data or 'name' not in data:
        return jsonify({"success": False, "message": "Missing student ID or name"}), 400

    try:
        student_id = int(data['id'])
    except ValueError:
        return jsonify({"success": False, "message": "Student ID must be a numeric integer"}), 400

    name = data['name'].strip()
    if not name:
        return jsonify({"success": False, "message": "Student name cannot be empty"}), 400

    csv_file_path = os.path.join(STUDENT_DETAILS_DIR, 'StudentDetails.csv')
    
    # Check duplicate ID
    students = get_registered_students()
    if any(s['id'] == student_id for s in students):
        return jsonify({"success": False, "message": f"Student ID {student_id} is already registered"}), 400

    # Write registry log
    file_exists = os.path.exists(csv_file_path)
    try:
        with open(csv_file_path, 'a', newline='') as csvFile:
            writer = csv.writer(csvFile)
            if not file_exists:
                writer.writerow(["Id", "Name"])
            writer.writerow([student_id, name])
        return jsonify({"success": True, "message": f"Student {name} registered in details log."})
    except Exception as e:
        return jsonify({"success": False, "message": f"Failed to write record: {e}"}), 500


@app.route('/api/upload_face', methods=['POST'])
def upload_face():
    data = request.get_json()
    if not data or 'id' not in data or 'name' not in data or 'image' not in data or 'sampleNum' not in data:
        return jsonify({"success": False, "message": "Missing required fields"}), 400

    student_id = data['id']
    name = data['name']
    image_b64 = data['image']
    sample_num = data['sampleNum']

    face_detector = get_detector()
    if face_detector is None:
        return jsonify({"success": False, "message": "Cascade Classifier file is missing on the server"}), 500

    try:
        img = decode_base64_image(image_b64)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # Detect face
        faces = face_detector.detectMultiScale(gray, 1.3, 5, minSize=(30, 30))
        
        if len(faces) == 0:
            return jsonify({"success": False, "message": "No face detected in webcam frame"}), 200

        # Take first detected face
        (x, y, w, h) = faces[0]
        cropped_face = gray[y:y+h, x:x+w]
        
        # Save image crop
        filename = f"{name}.{student_id}.{sample_num}.jpg"
        filepath = os.path.join(TRAINING_IMAGE_DIR, filename)
        cv2.imwrite(filepath, cropped_face)

        return jsonify({
            "success": True,
            "message": f"Face sample {sample_num} saved successfully",
            "box": {"x": int(x), "y": int(y), "width": int(w), "height": int(h)}
        })
    except Exception as e:
        return jsonify({"success": False, "message": f"Failed processing frame: {str(e)}"}), 500


@app.route('/api/train', methods=['POST'])
def train_model():
    global recognizer
    
    # Scan images
    image_paths = [os.path.join(TRAINING_IMAGE_DIR, f) for f in os.listdir(TRAINING_IMAGE_DIR) if f.endswith('.jpg')]
    if len(image_paths) == 0:
        return jsonify({"success": False, "message": "No image samples found in dataset directory"}), 400

    faces = []
    ids = []
    
    try:
        for image_path in image_paths:
            # Load grayscale
            gray_face = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
            filename = os.path.split(image_path)[-1]
            # Parse ID (format: name.id.sampleNum.jpg)
            parts = filename.split('.')
            if len(parts) >= 3:
                student_id = int(parts[1])
                faces.append(gray_face)
                ids.append(student_id)
        
        if not faces:
            return jsonify({"success": False, "message": "No valid formatted image datasets found"}), 400

        # Execute training
        lbph_recognizer = cv2.face.LBPHFaceRecognizer_create()
        lbph_recognizer.train(faces, np.array(ids))
        
        # Save
        model_path = os.path.join(TRAINING_LABEL_DIR, 'Trainner.yml')
        lbph_recognizer.save(model_path)
        
        # Force model reload on next request
        recognizer = lbph_recognizer

        return jsonify({"success": True, "message": f"Trained successfully on {len(faces)} face samples."})
    except Exception as e:
        return jsonify({"success": False, "message": f"Training failed: {str(e)}"}), 500


@app.route('/api/recognize', methods=['POST'])
def recognize_face():
    data = request.get_json()
    if not data or 'image' not in data:
        return jsonify({"success": False, "message": "Missing image frame"}), 400

    image_b64 = data['image']
    
    # Load recognizer
    lbph_recognizer = get_recognizer()
    if lbph_recognizer is None:
        return jsonify({"success": False, "message": "Model not trained yet"}), 200

    face_detector = get_detector()
    if face_detector is None:
        return jsonify({"success": False, "message": "Detector missing"}), 500

    try:
        img = decode_base64_image(image_b64)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        faces = face_detector.detectMultiScale(gray, 1.2, 5, minSize=(60, 60))
        if len(faces) == 0:
            return jsonify({"success": False, "message": "No face detected"}), 200

        # Detect the primary face
        (x, y, w, h) = faces[0]
        student_id, conf = lbph_recognizer.predict(gray[y:y+h, x:x+w])
        
        confidence_percent = round(100 - conf)
        
        # Pull matching details
        students = get_registered_students()
        matched_student = next((s for s in students if s['id'] == student_id), None)

        if matched_student and confidence_percent > 67:
            # Log attendance
            date_str = datetime.date.today().strftime('%Y-%m-%d')
            time_str = datetime.datetime.now().strftime('%H:%M:%S')
            
            attendance_file = os.path.join(ATTENDANCE_DIR, f"Attendance_{date_str}.csv")
            
            # Simple deduplication check for the current day
            already_present = False
            if os.path.exists(attendance_file):
                try:
                    df = pd.read_csv(attendance_file)
                    if not df.empty and 'Id' in df.columns:
                        already_present = int(student_id) in df['Id'].values
                except Exception as e:
                    print(f"Error checking attendance logs: {e}")

            if not already_present:
                file_exists = os.path.exists(attendance_file)
                with open(attendance_file, 'a', newline='') as csvFile:
                    writer = csv.writer(csvFile)
                    if not file_exists:
                        writer.writerow(['Id', 'Name', 'Date', 'Time'])
                    writer.writerow([student_id, matched_student['name'], date_str, time_str])
            
            return jsonify({
                "success": True,
                "id": student_id,
                "name": matched_student['name'],
                "confidence": confidence_percent,
                "logged": not already_present,
                "box": {"x": int(x), "y": int(y), "width": int(w), "height": int(h)}
            })
        else:
            return jsonify({
                "success": False,
                "name": "Unknown",
                "confidence": confidence_percent,
                "box": {"x": int(x), "y": int(y), "width": int(w), "height": int(h)}
            })

    except Exception as e:
        return jsonify({"success": False, "message": f"Error running recognition: {str(e)}"}), 500


@app.route('/api/logs', methods=['GET'])
def get_logs():
    logs = []
    try:
        # Scan all Attendance files in folder
        files = [f for f in os.listdir(ATTENDANCE_DIR) if f.startswith('Attendance_') and f.endswith('.csv')]
        
        for file in files:
            filepath = os.path.join(ATTENDANCE_DIR, file)
            df = pd.read_csv(filepath)
            for _, row in df.iterrows():
                logs.append({
                    "id": int(row['Id']),
                    "name": row['Name'],
                    "date": row['Date'],
                    "time": row['Time'],
                    "status": "Present"
                })
        # Sort logs by Date & Time descending
        logs.sort(key=lambda x: (x['date'], x['time']), reverse=True)
    except Exception as e:
        print(f"[ERROR] Fetching logs failed: {e}")
        
    return jsonify({"success": True, "logs": logs})


@app.route('/api/send_email', methods=['POST'])
def send_email():
    data = request.get_json() or {}
    sender = data.get('sender', 'youremail@email.com')
    password = data.get('password', '')
    receiver = data.get('receiver', 'recipient@email.com')

    try:
        files = sorted([f for f in os.listdir(ATTENDANCE_DIR) if f.endswith('.csv')], 
                       key=lambda x: os.path.getmtime(os.path.join(ATTENDANCE_DIR, x)))
        if not files:
            return jsonify({"success": False, "message": "No attendance files available to mail"}), 400

        newest_file_path = os.path.join(ATTENDANCE_DIR, files[-1])
        date_str = datetime.date.today().strftime("%B %d, %Y")
        
        yag = yagmail.SMTP(sender, password)
        yag.send(
            to=receiver,
            subject=f"Attendance Report for {date_str}",
            contents="Please find attached the latest daily attendance report.",
            attachments=newest_file_path
        )
        return jsonify({"success": True, "message": f"Attendance report emailed to {receiver}."})
    except Exception as e:
        return jsonify({"success": False, "message": f"Mail failed: {str(e)}"}), 500


if __name__ == '__main__':
    # Start debug server locally on port 5000
    app.run(host='0.0.0.0', port=5000, debug=True)
