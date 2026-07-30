import os
import io
import csv
import base64
import datetime
import time
import tempfile
from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
import numpy as np
import cv2
import pandas as pd
import yagmail

# MongoDB imports
import pymongo
import bson

app = Flask(__name__)
CORS(app)  # Enable Cross-Origin Resource Sharing for Vercel integration

# Initialize MongoDB Client
MONGO_URI = os.environ.get('MONGO_URI')
db = None

if MONGO_URI:
    try:
        # Connect to MongoDB Atlas
        client = pymongo.MongoClient(MONGO_URI)
        db = client['AttendanceSystem']
        # Trigger connection check
        client.admin.command('ping')
        print("[INFO] Connected to MongoDB Atlas successfully.")
    except Exception as e:
        print(f"[ERROR] Failed to connect to MongoDB Atlas: {e}")
        db = None
else:
    try:
        # Fallback to local MongoDB
        client = pymongo.MongoClient("mongodb://localhost:27017/")
        db = client['AttendanceSystem']
        client.admin.command('ping')
        print("[INFO] Connected to local MongoDB.")
    except Exception as e:
        print(f"[WARNING] MONGO_URI env variable not set and local MongoDB failed: {e}")
        db = None

# Define directories using system temp directory
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMP_DIR = tempfile.gettempdir()
TRAINING_IMAGE_DIR = os.path.join(TEMP_DIR, 'TrainingImage')
TRAINING_LABEL_DIR = os.path.join(TEMP_DIR, 'TrainingImageLabel')

# Resolve cascade file (from repo directory)
CASCADE_PATH = os.path.join(BASE_DIR, 'FRAS', 'haarcascade_frontalface_default.xml')
if not os.path.exists(CASCADE_PATH):
    # Fallback to local script folder if running standalone
    CASCADE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'haarcascade_frontalface_default.xml')

# Ensure directories exist
os.makedirs(TRAINING_IMAGE_DIR, exist_ok=True)
os.makedirs(TRAINING_LABEL_DIR, exist_ok=True)

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
    if db is None:
        print("[WARNING] Database not initialized. Cannot load recognizer.")
        return None
        
    if recognizer is None:
        model_path = os.path.join(TRAINING_LABEL_DIR, 'Trainner.yml')
        # Download model if it does not exist locally
        if not os.path.exists(model_path):
            try:
                doc = db.models.find_one({'_id': 'trainner_model'})
                if doc and 'model_data' in doc:
                    with open(model_path, 'wb') as f:
                        f.write(doc['model_data'])
                    print("[INFO] Downloaded Trainner.yml from MongoDB Atlas.")
            except Exception as e:
                print(f"[ERROR] Failed to download Trainner.yml from MongoDB: {e}")
        
        # Load the model
        if os.path.exists(model_path):
            try:
                recognizer = cv2.face.LBPHFaceRecognizer_create()
                recognizer.read(model_path)
                print("[INFO] LBPH Recognizer model loaded successfully from file.")
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
    if db is None:
        return jsonify({
            "status": "database_offline",
            "model_trained": False,
            "students_count": 0
        })
        
    try:
        recognizer_loaded = get_recognizer() is not None
        model_trained = False
        if recognizer_loaded:
            model_trained = True
        else:
            doc = db.models.find_one({'_id': 'trainner_model'})
            model_trained = doc is not None

        return jsonify({
            "status": "online",
            "model_trained": model_trained,
            "students_count": len(get_registered_students())
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "error": str(e),
            "model_trained": False,
            "students_count": 0
        })


def get_registered_students():
    students = []
    if db is None:
        return students
    try:
        cursor = db.students.find()
        for doc in cursor:
            if 'id' in doc and 'name' in doc:
                students.append({"id": int(doc['id']), "name": doc['name']})
    except Exception as e:
        print(f"[ERROR] Reading students from MongoDB failed: {e}")
    return students


@app.route('/api/students', methods=['GET'])
def list_students():
    return jsonify({"success": True, "students": get_registered_students()})


@app.route('/api/register', methods=['POST'])
def register_student():
    if db is None:
        return jsonify({"success": False, "message": "Database is currently offline"}), 500

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

    try:
        # Check if ID already exists
        doc = db.students.find_one({'id': student_id})
        if doc:
            return jsonify({"success": False, "message": f"Student ID {student_id} is already registered"}), 400

        # Save student registration to MongoDB
        db.students.insert_one({
            'id': student_id,
            'name': name
        })
        return jsonify({"success": True, "message": f"Student {name} registered successfully."})
    except Exception as e:
        return jsonify({"success": False, "message": f"Failed to write record to MongoDB: {e}"}), 500


@app.route('/api/upload_face', methods=['POST'])
def upload_face():
    if db is None:
        return jsonify({"success": False, "message": "Database is currently offline"}), 500

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
        
        # Save image crop locally (temp)
        filename = f"{name}.{student_id}.{sample_num}.jpg"
        filepath = os.path.join(TRAINING_IMAGE_DIR, filename)
        cv2.imwrite(filepath, cropped_face)

        # Upload image to MongoDB as Binary data
        try:
            with open(filepath, 'rb') as f:
                img_bytes = f.read()
                
            db.faces.update_one(
                {'filename': filename},
                {'$set': {
                    'filename': filename,
                    'id': int(student_id),
                    'name': name,
                    'image_data': bson.Binary(img_bytes)
                }},
                upsert=True
            )
        except Exception as store_err:
            print(f"[ERROR] Failed to save face crop to MongoDB: {store_err}")

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
    if db is None:
        return jsonify({"success": False, "message": "Database is currently offline"}), 500
    
    try:
        # Clear local temp directory first
        for f in os.listdir(TRAINING_IMAGE_DIR):
            try:
                os.remove(os.path.join(TRAINING_IMAGE_DIR, f))
            except Exception as e:
                print(f"[WARNING] Could not delete temp file {f}: {e}")
        
        # Download all images from MongoDB faces collection
        cursor = db.faces.find()
        download_count = 0
        for doc in cursor:
            if 'filename' in doc and 'image_data' in doc:
                filename = doc['filename']
                local_path = os.path.join(TRAINING_IMAGE_DIR, filename)
                with open(local_path, 'wb') as f:
                    f.write(doc['image_data'])
                download_count += 1
        
        print(f"[INFO] Downloaded {download_count} images from MongoDB for training.")
        
        # Scan downloaded images
        image_paths = [os.path.join(TRAINING_IMAGE_DIR, f) for f in os.listdir(TRAINING_IMAGE_DIR) if f.endswith('.jpg')]
        if len(image_paths) == 0:
            return jsonify({"success": False, "message": "No image samples found in MongoDB database"}), 400

        faces = []
        ids = []
        
        for image_path in image_paths:
            # Load grayscale
            gray_face = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
            filename = os.path.split(image_path)[-1]
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
        
        # Save locally
        model_path = os.path.join(TRAINING_LABEL_DIR, 'Trainner.yml')
        lbph_recognizer.save(model_path)
        
        # Upload model bytes to MongoDB models collection
        with open(model_path, 'rb') as f:
            model_bytes = f.read()
            
        db.models.update_one(
            {'_id': 'trainner_model'},
            {'$set': {
                'model_data': bson.Binary(model_bytes),
                'updated_at': datetime.datetime.utcnow()
            }},
            upsert=True
        )
        
        # Force model reload on next request
        recognizer = lbph_recognizer

        return jsonify({"success": True, "message": f"Trained successfully on {len(faces)} face samples. Model uploaded to MongoDB."})
    except Exception as e:
        return jsonify({"success": False, "message": f"Training failed: {str(e)}"}), 500


@app.route('/api/recognize', methods=['POST'])
def recognize_face():
    if db is None:
        return jsonify({"success": False, "message": "Database is currently offline"}), 500

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
            
            doc_id = f"{student_id}_{date_str}"
            
            # Simple deduplication check for the current day using _id
            already_present = False
            try:
                doc = db.attendance.find_one({'_id': doc_id})
                if doc:
                    already_present = True
            except Exception as e:
                print(f"Error checking attendance logs: {e}")

            if not already_present:
                try:
                    db.attendance.insert_one({
                        '_id': doc_id,
                        'id': int(student_id),
                        'name': matched_student['name'],
                        'date': date_str,
                        'time': time_str,
                        'timestamp': datetime.datetime.utcnow()
                    })
                except Exception as e:
                    print(f"[ERROR] Failed to save attendance to MongoDB: {e}")
            
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
    if db is None:
        return jsonify({"success": True, "logs": []})
        
    try:
        cursor = db.attendance.find()
        for doc in cursor:
            logs.append({
                "id": int(doc.get('id', 0)),
                "name": doc.get('name', 'Unknown'),
                "date": doc.get('date', ''),
                "time": doc.get('time', ''),
                "status": "Present"
            })
        # Sort logs by Date & Time descending
        logs.sort(key=lambda x: (x['date'], x['time']), reverse=True)
    except Exception as e:
        print(f"[ERROR] Fetching logs failed: {e}")
        
    return jsonify({"success": True, "logs": logs})


@app.route('/api/send_email', methods=['POST'])
def send_email():
    if db is None:
        return jsonify({"success": False, "message": "Database is currently offline"}), 500

    data = request.get_json() or {}
    # Prioritise server environment variables over client-sent payload parameters for security
    sender = os.environ.get('SMTP_SENDER', data.get('sender', 'youremail@email.com'))
    password = os.environ.get('SMTP_PASSWORD', data.get('password', ''))
    receiver = os.environ.get('SMTP_RECEIVER', data.get('receiver', 'recipient@email.com'))

    try:
        date_str = datetime.date.today().strftime('%Y-%m-%d')
        
        # Fetch today's logs from MongoDB
        cursor = db.attendance.find({'date': date_str})
        logs = []
        for doc in cursor:
            logs.append([doc.get('id'), doc.get('name'), doc.get('date'), doc.get('time')])
            
        if not logs:
            return jsonify({"success": False, "message": f"No attendance records available for today ({date_str}) to email"}), 400

        # Create local temporary CSV
        temp_csv_path = os.path.join(tempfile.gettempdir(), f"Attendance_{date_str}.csv")
        with open(temp_csv_path, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['Id', 'Name', 'Date', 'Time'])
            writer.writerows(logs)

        friendly_date_str = datetime.date.today().strftime("%B %d, %Y")
        
        yag = yagmail.SMTP(sender, password)
        yag.send(
            to=receiver,
            subject=f"Attendance Report for {friendly_date_str}",
            contents="Please find attached the latest daily attendance report.",
            attachments=temp_csv_path
        )
        
        # Clean up temp file
        try:
            os.remove(temp_csv_path)
        except Exception as e:
            print(f"[WARNING] Failed to remove temp CSV file: {e}")

        return jsonify({"success": True, "message": f"Attendance report emailed to {receiver}."})
    except Exception as e:
        return jsonify({"success": False, "message": f"Mail failed: {str(e)}"}), 500


if __name__ == '__main__':
    # Start debug server locally on port 5000
    app.run(host='0.0.0.0', port=5000, debug=True)
