# Health Planner Desktop

A PyQt6 desktop app for managing and viewing workout plans and local routine schedules in one window.

Built as the desktop companion to the [Workout Planner App](https://github.com/Naadir Dev Portfolio/Workout Planner App) Android app, sharing the same HTML workout files.

---

## Features

- **Workout Viewer**, browse and open HTML workout files in a built-in WebView with dark mode injection and zoom control
- **Regimen Tracker**, interactive web view of daily routine slots loaded from your local Excel master plan
- **Excel Integration**, reads directly from `.xlsm` workbooks via openpyxl; one button opens your master plan
- **Frameless window**, custom dark UI with draggable title bar, resize grip, opacity control
- **State persistence**, remembers window position between sessions

---

## Setup

**1. Install dependencies**
```bash
pip install -r requirements.txt
```

**2. Provide your Excel master plan**

The app reads a file called `master_plan.xlsm` in the following locations:
- `workout_html_files/master_plan.xlsm`, for the workout schedule
- `regimen_plan/master_plan.xlsm`, for the daily routine data

Create your own spreadsheet in the format shown in `workout_html_files/workouts_constants.json` and `regimen_plan/data/routine.data.js` (sanitized sample data provided). Keep personal regimen workbooks local; `master_plan.xlsm` and `master_plan.xlsx` are ignored by Git.

**3. Generate routine data (optional)**

If you have a populated `master_plan.xlsm`, generate the JSON for the regimen view:
```bash
cd regimen_plan
python convertData.py
```

**4. Run**
```bash
python external_app_health.py
```

---

## Project structure

```
Health-Planner-Desktop/
  external_app_health.py      Main application
  requirements.txt
  workout_html_files/
    WF-*.html                 Workout timer/plan HTML files
    Create_files.py           Script to generate new workout HTML files
    workouts_constants.json   Workout definitions
    Workout definitions.xlsx  Source spreadsheet for workout structure
  regimen_plan/
    index.html                Daily routine web view
    app.js / styles.css
    data/routine.data.js      Sanitized sample data - replace with your own
    convertData.py            Converts master_plan.xlsm to routine.data.js
  assets/                     Optional: add health_logo.png / logo.png here
```

---

## Tech

- **Python 3.10+**
- **PyQt6**, frameless window, custom UI components
- **PyQt6-WebEngine**, embedded Chromium WebView for workout and regimen pages
- **openpyxl**, Excel workbook reading
- **HTML/CSS/JS**, workout timer pages and routine web view

---

## Author

**Naadir** · [Portfolio](https://naadir dev portfolio.github.io) · [GitHub](https://github.com/Naadir Dev Portfolio)
