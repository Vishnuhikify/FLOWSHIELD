<div align="center">

# 🌊 FLOWSHIELD

### Predict the flood. Test the response. Save the region.

An explainable **flood-simulation & decision-support engine** — built in 24 hours for **Hack-a-Matics 2026** (VECTOR theme)

<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=600&size=20&duration=2800&pause=900&color=2EA5E8&center=true&vCenter=true&width=680&lines=SIMULATE+%E2%86%92+MONITOR+%E2%86%92+WARN;TEST+RESPONSE+%E2%86%92+COMPARE+MODELED+IMPACT;Deterministic+2D+flood+simulation+engine;React+%2B+FastAPI+%2B+NumPy+%2B+Leaflet" alt="Typing SVG" />

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white)](backend)
[![FastAPI](https://img.shields.io/badge/FastAPI-Backend-009688?style=for-the-badge&logo=fastapi&logoColor=white)](backend)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](frontend)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=for-the-badge&logo=vite&logoColor=white)](frontend)
[![Tailwind](https://img.shields.io/badge/Tailwind-CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](frontend)
[![Leaflet](https://img.shields.io/badge/Leaflet-OpenStreetMap-199900?style=for-the-badge&logo=leaflet&logoColor=white)](frontend)

[![Tests](https://img.shields.io/badge/tests-passing-brightgreen?style=flat-square)](backend/tests)
[![License](https://img.shields.io/badge/license-MIT-informational?style=flat-square)](#-license)
[![Status](https://img.shields.io/badge/status-hackathon%20prototype-orange?style=flat-square)](#-important-disclaimer)
[![Made with](https://img.shields.io/badge/made%20with-24%20hours%20%26%20too%20much%20coffee-critical?style=flat-square)](#)

<br>

**[🚀 Quick Start](#-quick-start) · [🧠 How It Works](#-the-mathematical-model) · [📡 API](#-api-reference) · [🗺️ Demo Mode](#-demo-mode) · [⚠️ Limitations](#-core-assumptions--limitations)**

</div>

<br>

> [!IMPORTANT]
> FLOWSHIELD is a **simplified hackathon prototype**. It is **not** a calibrated operational flood-forecasting system, a real-time emergency service, or a public-safety instruction tool. Every number the app shows is a **modeled**, comparative output — clearly labeled as such throughout the UI. See [Core Assumptions & Limitations](#-core-assumptions--limitations).

<br>

## 📸 See It In Action

The application provides:

- Live flood progression and risk monitoring
- Bengaluru map and simulated neighborhood drill-down
- Scenario and intervention comparison
- Guided Demo Mode

Screenshots/demo GIFs can be added later when actual files are available.

<br>

## 💡 Why FLOWSHIELD

Bengaluru's **September 5, 2022** flood event affected areas including Mahadevapura, Bellandur, Varthur, K R Puram and Sarjapur after **131.6 mm of rain was recorded over 24 hours**.

FLOWSHIELD focuses on a practical decision-support question: how can a simplified simulation help users **test modeled intervention scenarios before committing resources**?

FLOWSHIELD asks a narrower, answerable question:

> *If it rains this much, and we take this drainage action — **how does the modeled outcome change**, region by region, before a single pump is deployed?*

The single continuous workflow:

```text
   ☔ SIMULATE  →  📡 MONITOR  →  🚨 WARN  →  🧪 TEST RESPONSE  →  📊 COMPARE MODELED IMPACT
