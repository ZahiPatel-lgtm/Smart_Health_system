import pickle
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    roc_auc_score,
    roc_curve,
    f1_score,
)

DATA_PATH    = r"data/2_Patient_Footfall.xlsx"
MODEL_PATH   = "models/patient_footfall_model.pkl"
ENCODER_PATH = "models/patient_footfall_encoders.pkl"
FEATURE_PATH = "models/patient_footfall_features.pkl"
REPORT_PATH  = "reports/patient_footfall_report.png"
ROC_PATH     = "reports/patient_footfall_roc.png"


TARGET       = "Target"
RANDOM_STATE = 42
TEST_SIZE    = 0.20
THRESHOLD    = 0.50


def load_data():
    print("\n📂 Loading data ...")
    df = pd.read_excel(DATA_PATH)
    print(f"   Shape              : {df.shape}")
    print(f"   Target distribution:\n{df[TARGET].value_counts()}")
    return df


def preprocess(df):
    df = df.copy()

    df["Date"]         = pd.to_datetime(df["Date"])
    df["day_of_week"]  = df["Date"].dt.dayofweek
    df["month"]        = df["Date"].dt.month
    df["week_of_year"] = df["Date"].dt.isocalendar().week.astype(int)
    df["quarter"]      = df["Date"].dt.quarter


    df["patients_per_doctor"]   = (df["Patient_Count"] / df["Doctors"].replace(0, 1)).clip(upper=500)
    df["population_per_doctor"] = (df["Population"] / df["Doctors"].replace(0, 1))
    df["is_high_risk_day"]      = (
        (df["Holiday"] == 1) | (df["Weekend"] == 1) | (df["Disease_Outbreak"] == 1)
    ).astype(int)
    df["outbreak_on_weekday"]   = (
        (df["Disease_Outbreak"] == 1) & (df["Weekend"] == 0) & (df["Holiday"] == 0)
    ).astype(int)


    encoders = {}

    features = [
        "Patient_Count",
        "Holiday",
        "Weekend",
        "Disease_Outbreak",
        "Population",
        "Doctors",
        "Rainfall",
        "day_of_week",
        "month",
        "week_of_year",
        "quarter",
        "patients_per_doctor",
        "population_per_doctor",
        "is_high_risk_day",
        "outbreak_on_weekday",
    ]

    X = df[features]
    y = df[TARGET]
    print(f"\n✅ Features ready ({len(features)})")
    return X, y, encoders, features


def split_data(X, y):
    X_train, X_test, y_train, y_test = train_test_split(
        X, y,
        test_size=TEST_SIZE,
        random_state=RANDOM_STATE,
        stratify=y
    )
    print(f"\n📊 Train : {X_train.shape[0]} rows  |  Test : {X_test.shape[0]} rows")
    return X_train, X_test, y_train, y_test


def train_model(X_train, y_train):
    print("\n🚀 Training model ...")
    model = GradientBoostingClassifier(
        n_estimators=200,
        max_depth=5,
        learning_rate=0.08,
        subsample=0.8,
        min_samples_leaf=20,
        random_state=RANDOM_STATE,
    )
    model.fit(X_train, y_train)
    print("   Training complete ✓")
    return model


def evaluate(model, X_test, y_test, features):
    y_proba = model.predict_proba(X_test)[:, 1]
    y_pred  = (y_proba >= THRESHOLD).astype(int)

    acc    = accuracy_score(y_test, y_pred)
    auc    = roc_auc_score(y_test, y_proba)
    f1     = f1_score(y_test, y_pred)
    report = classification_report(
        y_test, y_pred,
        target_names=["Normal Footfall (0)", "High Footfall (1)"]
    )
    cm = confusion_matrix(y_test, y_pred)

    print("\n" + "=" * 55)
    print("   PATIENT FOOTFALL — EVALUATION RESULTS")
    print("=" * 55)
    print(f"   Accuracy  : {acc:.4f}")
    print(f"   ROC-AUC   : {auc:.4f}")
    print(f"   F1-Score  : {f1:.4f}")
    print(f"   Threshold : {THRESHOLD}")
    print("\n   Classification Report:")
    print(report)
    print("=" * 55)

    # Plot 1: Confusion Matrix + Feature Importance
    fig, axes = plt.subplots(1, 2, figsize=(15, 6))
    fig.suptitle("Patient Footfall — Model Report", fontsize=15, fontweight="bold")

    sns.heatmap(
        cm, annot=True, fmt="d", cmap="Greens", ax=axes[0],
        xticklabels=["Normal", "High Footfall"],
        yticklabels=["Normal", "High Footfall"],
        linewidths=0.5,
    )
    axes[0].set_title("Confusion Matrix", fontsize=12)
    axes[0].set_ylabel("Actual Label")
    axes[0].set_xlabel("Predicted Label")

    importances = pd.Series(
        model.feature_importances_, index=features
    ).sort_values(ascending=True)
    colors = ["#c0392b" if v >= importances.quantile(0.75) else "#27ae60" for v in importances]
    importances.plot(kind="barh", ax=axes[1], color=colors)
    axes[1].set_title("Feature Importance", fontsize=12)
    axes[1].set_xlabel("Importance Score")
    axes[1].axvline(importances.mean(), color="gray", linestyle="--", linewidth=1, label="Mean")
    axes[1].legend()

    plt.tight_layout()
    plt.savefig(REPORT_PATH, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"\n📈 Saved report plot → {REPORT_PATH}")

    fpr, tpr, _ = roc_curve(y_test, y_proba)
    plt.figure(figsize=(7, 5))
    plt.plot(fpr, tpr, color="#27ae60", lw=2, label=f"ROC AUC = {auc:.4f}")
    plt.fill_between(fpr, tpr, alpha=0.1, color="#27ae60")
    plt.plot([0, 1], [0, 1], color="gray", linestyle="--", lw=1, label="Random Classifier")
    plt.xlabel("False Positive Rate", fontsize=11)
    plt.ylabel("True Positive Rate", fontsize=11)
    plt.title("ROC Curve — Patient Footfall", fontsize=13, fontweight="bold")
    plt.legend(loc="lower right")
    plt.tight_layout()
    plt.savefig(ROC_PATH, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"📈 Saved ROC curve   → {ROC_PATH}")

    return acc, auc, f1


def save_artifacts(model, encoders, features):
    with open(MODEL_PATH,   "wb") as f: pickle.dump(model,    f)
    with open(ENCODER_PATH, "wb") as f: pickle.dump(encoders, f)
    with open(FEATURE_PATH, "wb") as f: pickle.dump(features, f)
    print(f"\n💾 Model saved    → {MODEL_PATH}")
    print(f"💾 Encoders saved → {ENCODER_PATH}")
    print(f"💾 Features saved → {FEATURE_PATH}")


def predict_single(input_dict):
    with open(MODEL_PATH,   "rb") as f: model    = pickle.load(f)
    with open(ENCODER_PATH, "rb") as f: encoders = pickle.load(f)
    with open(FEATURE_PATH, "rb") as f: features = pickle.load(f)

    row = pd.DataFrame([input_dict])
    row["Date"]         = pd.to_datetime(row["Date"])
    row["day_of_week"]  = row["Date"].dt.dayofweek
    row["month"]        = row["Date"].dt.month
    row["week_of_year"] = row["Date"].dt.isocalendar().week.astype(int)
    row["quarter"]      = row["Date"].dt.quarter

    row["patients_per_doctor"]   = (row["Patient_Count"] / row["Doctors"].replace(0, 1)).clip(upper=500)
    row["population_per_doctor"] = (row["Population"] / row["Doctors"].replace(0, 1))
    row["is_high_risk_day"]      = (
        (row["Holiday"] == 1) | (row["Weekend"] == 1) | (row["Disease_Outbreak"] == 1)
    ).astype(int)
    row["outbreak_on_weekday"]   = (
        (row["Disease_Outbreak"] == 1) & (row["Weekend"] == 0) & (row["Holiday"] == 0)
    ).astype(int)

    prob = float(model.predict_proba(row[features])[0][1])
    pred = int(prob >= THRESHOLD)

    return {
        "prediction" : pred,
        "probability": round(prob, 4),
        "risk_label" : "High Footfall" if pred == 1 else "Normal Footfall",
    }


if __name__ == "__main__":
    df                               = load_data()
    X, y, encoders, features         = preprocess(df)
    X_train, X_test, y_train, y_test = split_data(X, y)
    model                            = train_model(X_train, y_train)
    acc, auc, f1                     = evaluate(model, X_test, y_test, features)
    save_artifacts(model, encoders, features)

    print("\n✅ Patient Footfall pipeline complete!")

    sample = {
        "Patient_Count"   : 95,
        "Holiday"         : 0,
        "Weekend"         : 0,
        "Disease_Outbreak": 1,
        "Population"      : 38952,
        "Doctors"         : 2,
        "Rainfall"        : 0,
        "Date"            : "2024-07-15",
    }
    result = predict_single(sample)
    print(f"\n🔍 Sample Prediction → {result}")
