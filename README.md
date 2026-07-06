# 🏥 Smart Health System

**AI-Driven Health Centre & Supply Chain Management**

A web dashboard for Primary Health Centres (PHCs) that combines operational data (patient footfall, bed occupancy, and medicine stock) with machine learning predictions and AI-generated (English + Hindi) explanations, helping staff anticipate risks before they become crises.



---

## ✨ Overview

Smart Health System gives hospital/PHC administrators a single dashboard to:

- Upload centre data (CSV) and instantly visualize KPIs, trends, and alerts
- Predict **patient footfall**, **bed occupancy risk**, and **medicine stockout risk** using trained ML models
- Get plain-language, bilingual (English/Hindi) explanations and recommendations for each prediction, powered by Google Gemini
- Track supply chain health, staff, and centre-level details across multiple health centres

## 🖥️ Dashboard Pages

| Page | Description |
|---|---|
| **Overview** | High-level KPIs, admissions chart, supply donut chart, and live alerts |
| **Health Centres** | Table view of all centres with uploaded data |
| **Analytics** | Monthly OPD volume trends and occupancy analytics |
| **Supply Chain** | Drug inventory status and stock risk charts |
| **Staff** | Staff-related information per centre |
| **Alerts** | Consolidated risk alerts across footfall, beds, and medicine stock |
| **Upload Data** | CSV upload for populating the dashboard |
| **Settings** | Account and app settings |

## 🧠 ML Prediction Services

The `backend/` folder contains three independent FastAPI microservices, each wrapping a trained scikit-learn model plus a Gemini-powered explanation layer:

| Service | Script | Endpoint | Predicts |
|---|---|---|---|
| Patient Footfall | `patient_footfall_api.py` | `POST /predict/footfall` | Risk of unusually high patient footfall |
| Bed Occupancy | `bed_occupancy_api.py` | `POST /predict/bed` | Risk of high bed occupancy |
| Medicine Stockout | `medicine_stockout_api.py` | `POST /predict/stockout` | Risk of a medicine stockout |

Each service:
1. Loads a pre-trained model, encoders, and feature list from `backend/models/`
2. Engineers date-based and domain-specific features from the input
3. Returns a prediction, probability, and risk label
4. Calls the Gemini API to generate a short explanation and recommendation in **English and Hindi**

The corresponding `*.py` files without the `_api` suffix (`patient_footfall.py`, `bed_occupancy.py`, `medicine_stockout.py`) contain the model training/data-processing logic used to produce the `.pkl` artifacts in `backend/models/`.

The hosted frontend currently calls these services on Render:
- `https://patient-footfall-api.onrender.com`
- `https://bed-occupancy-api.onrender.com`
- `https://medicine-stockout-api.onrender.com`

## 🗂️ Project Structure

```
Smart_Health_system/
├── index.html                     # Dashboard UI (auth + main app)
├── style.css                      # Styling
├── script.js                      # Frontend logic, charts, API calls
├── hospital.jpeg                  # Banner image
└── backend/
    ├── patient_footfall.py        # Footfall model training
    ├── patient_footfall_api.py    # Footfall FastAPI service
    ├── bed_occupancy.py           # Bed occupancy model training
    ├── bed_occupancy_api.py       # Bed occupancy FastAPI service
    ├── medicine_stockout.py       # Stockout model training
    ├── medicine_stockout_api.py   # Stockout FastAPI service
    └── models/                    # Trained models, encoders & feature lists (.pkl)
```

## 🛠️ Tech Stack

- **Frontend:** HTML, CSS, JavaScript (Chart.js for visualizations)
- **Backend:** Python, FastAPI, scikit-learn, pandas
- **AI Explanations:** Google Gemini (`gemini-2.5-flash`)
- **Deployment:** Render (backend APIs)

## 🚀 Getting Started

### Prerequisites
- Python 3.9+
- A [Google Gemini API key](https://ai.google.dev/)

### 1. Clone the repository
```bash
git clone https://github.com/ZahiPatel-lgtm/Smart_Health_system.git
cd Smart_Health_system
```

### 2. Set up the backend
```bash
cd backend
pip install fastapi uvicorn pandas scikit-learn python-dotenv google-generativeai
```

Create a `.env` file inside `backend/` with your Gemini API key:
```
GEMINI_API_KEY=your_api_key_here
```

### 3. Run the prediction services
Each service runs independently. In separate terminals:
```bash
uvicorn patient_footfall_api:app --host 0.0.0.0 --port 8002 --reload
uvicorn bed_occupancy_api:app --host 0.0.0.0 --port 8000 --reload
uvicorn medicine_stockout_api:app --host 0.0.0.0 --port 8001 --reload
```

Once running, interactive API docs are available at `http://localhost:<port>/docs` for each service.

### 4. Run the frontend
The frontend is a static site — simply open `index.html` in a browser, or serve it locally:
```bash
python -m http.server 5500
```
Then visit `http://localhost:5500`.

> **Note:** `script.js` currently points to hosted Render URLs for predictions. To use your local backend instead, update the API URLs in `script.js` (search for `onrender.com`) to point to your local endpoints (e.g. `http://localhost:8000/predict/bed`).

## 📡 Example API Request

```bash
curl -X POST https://bed-occupancy-api.onrender.com/predict/bed \
  -H "Content-Type: application/json" \
  -d '{
        "Total_Beds": 8,
        "Occupied_Beds": 7,
        "Admissions": 3,
        "Discharges": 1,
        "Average_Length_of_Stay": 4.5,
        "Disease_Outbreak": 1,
        "Date": "2024-07-15"
      }'
```

**Response**
```json
{
  "prediction": 1,
  "probability": 0.82,
  "risk_label": "High Occupancy Risk",
  "explanation_english": "...",
  "explanation_hindi": "..."
}
```

## 📌 Roadmap / Ideas
- Add authentication persistence with a real backend/database
- Consolidate the three microservices behind a single gateway
- Add automated retraining pipeline for the ML models

## 🤝 Contributing
Contributions, issues, and feature requests are welcome. Feel free to fork the repo and submit a pull request.

## 📄 License
No license has been specified for this project yet.
