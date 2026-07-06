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

DATA_PATH    = r"data/3_Bed_Occupancy.xlsx"
MODEL_PATH   = "models/bed_occupancy_model.pkl"
ENCODER_PATH = "models/bed_occupancy_encoders.pkl"
FEATURE_PATH = "models/bed_occupancy_features.pkl"
REPORT_PATH  = "reports/bed_occupancy_report.png"
ROC_PATH     = "reports/bed_occupancy_roc.png"


TARGET       = "Target"
RANDOM_STATE = 42
TEST_SIZE    = 0.20
THRESHOLD    = 0.30    


def load_data():
    print("\n📂 Loading data ...")
    df = pd.read_excel(DATA_PATH)
    print(f"   Shape              : {df.shape}")
    print(f"   Target distribution:\n{df[TARGET].value_counts()}")
    pos = df[TARGET].sum()
    neg = len(df) - pos
    print(f"   Class imbalance    : {neg} normal  |  {pos} high occupancy ({100*pos/len(df):.1f}%)")
    return df


def preprocess(df):
    df = df.copy()


    df["Date"]         = pd.to_datetime(df["Date"])
    df["day_of_week"]  = df["Date"].dt.dayofweek
    df["month"]        = df["Date"].dt.month
    df["week_of_year"] = df["Date"].dt.isocalendar().week.astype(int)
    df["quarter"]      = df["Date"].dt.quarter


    df["occupancy_rate"]       = (df["Occupied_Beds"] / df["Total_Beds"].replace(0, 1)).clip(upper=1.0)
    df["net_bed_change"]       = df["Admissions"] - df["Discharges"]
    df["bed_pressure"]         = (df["Admissions"] / df["Total_Beds"].replace(0, 1)).clip(upper=5.0)
    df["avg_stay_x_occupancy"] = df["Average_Length_of_Stay"] * df["occupancy_rate"]
    df["critical_occupancy"]   = (df["occupancy_rate"] >= 0.75).astype(int)


    encoders = {}


    features = [
        "Total_Beds",
        "Occupied_Beds",
        "Admissions",
        "Discharges",
        "Average_Length_of_Stay",
        "Disease_Outbreak",
        "day_of_week",
        "month",
        "week_of_year",
        "quarter",
        "occupancy_rate",
        "net_bed_change",
        "bed_pressure",
        "avg_stay_x_occupancy",
        "critical_occupancy",
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
    print(f"   Train positives : {y_train.sum()}  |  Test positives : {y_test.sum()}")
    return X_train, X_test, y_train, y_test


def train_model(X_train, y_train):
    print("\n🚀 Training model ...")
    print("   (Using subsample + min_samples_leaf to handle class imbalance)")
    model = GradientBoostingClassifier(
        n_estimators=200,
        max_depth=4,
        learning_rate=0.08,
        subsample=0.8,
        min_samples_leaf=5,
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
        target_names=["Normal Occupancy (0)", "High Occupancy (1)"]
    )
    cm = confusion_matrix(y_test, y_pred)

    print("\n" + "=" * 55)
    print("   BED OCCUPANCY — EVALUATION RESULTS")
    print("=" * 55)
    print(f"   Accuracy  : {acc:.4f}")
    print(f"   ROC-AUC   : {auc:.4f}")
    print(f"   F1-Score  : {f1:.4f}")
    print(f"   Threshold : {THRESHOLD}  (lowered for early warning)")
    print("\n   Classification Report:")
    print(report)
    print("=" * 55)


    fig, axes = plt.subplots(1, 2, figsize=(15, 6))
    fig.suptitle("Bed Occupancy — Model Report", fontsize=15, fontweight="bold")

    sns.heatmap(
        cm, annot=True, fmt="d", cmap="Oranges", ax=axes[0],
        xticklabels=["Normal", "High Occupancy"],
        yticklabels=["Normal", "High Occupancy"],
        linewidths=0.5,
    )
    axes[0].set_title("Confusion Matrix", fontsize=12)
    axes[0].set_ylabel("Actual Label")
    axes[0].set_xlabel("Predicted Label")

    importances = pd.Series(
        model.feature_importances_, index=features
    ).sort_values(ascending=True)
    colors = ["#c0392b" if v >= importances.quantile(0.75) else "#e67e22" for v in importances]
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
    plt.plot(fpr, tpr, color="#e67e22", lw=2, label=f"ROC AUC = {auc:.4f}")
    plt.fill_between(fpr, tpr, alpha=0.1, color="#e67e22")
    plt.plot([0, 1], [0, 1], color="gray", linestyle="--", lw=1, label="Random Classifier")
    plt.xlabel("False Positive Rate", fontsize=11)
    plt.ylabel("True Positive Rate", fontsize=11)
    plt.title("ROC Curve — Bed Occupancy", fontsize=13, fontweight="bold")
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

    row["occupancy_rate"]       = (row["Occupied_Beds"] / row["Total_Beds"].replace(0, 1)).clip(upper=1.0)
    row["net_bed_change"]       = row["Admissions"] - row["Discharges"]
    row["bed_pressure"]         = (row["Admissions"] / row["Total_Beds"].replace(0, 1)).clip(upper=5.0)
    row["avg_stay_x_occupancy"] = row["Average_Length_of_Stay"] * row["occupancy_rate"]
    row["critical_occupancy"]   = (row["occupancy_rate"] >= 0.75).astype(int)

    prob = float(model.predict_proba(row[features])[0][1])
    pred = int(prob >= THRESHOLD)

    return {
        "prediction" : pred,
        "probability": round(prob, 4),
        "risk_label" : "High Occupancy Risk" if pred == 1 else "Normal Occupancy",
    }


if __name__ == "__main__":
    df                               = load_data()
    X, y, encoders, features         = preprocess(df)
    X_train, X_test, y_train, y_test = split_data(X, y)
    model                            = train_model(X_train, y_train)
    acc, auc, f1                     = evaluate(model, X_test, y_test, features)
    save_artifacts(model, encoders, features)

    print("\n✅ Bed Occupancy pipeline complete!")

    sample = {
        "Total_Beds"             : 8,
        "Occupied_Beds"          : 7,
        "Admissions"             : 3,
        "Discharges"             : 1,
        "Average_Length_of_Stay" : 4.5,
        "Disease_Outbreak"       : 1,
        "Date"                   : "2024-07-15",
    }
    result = predict_single(sample)
    print(f"\n🔍 Sample Prediction → {result}")
