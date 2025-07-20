# Hazard Detection - המדריך המלא להתקנה מקומית

## 📋 דרישות מוקדמות

### Node.js
```bash
# וודא שיש לך Node.js גרסה 18 ומעלה
node --version
npm --version
```

### Redis
```bash
# התקנה של Redis (macOS)
brew install redis
brew services start redis

# התקנה של Redis (Ubuntu/Linux)
sudo apt update
sudo apt install redis-server
sudo systemctl start redis-server

# התקנה של Redis (Windows)
# הורד מ: https://github.com/microsoftarchive/redis/releases
```

## 🚀 התקנה מהירה

### 1. שכפול הפרויקט
```bash
git clone <repository-url>
cd Hazard-Detection
```

### 2. התקנת חבילות
```bash
npm install
```

### 3. יצירת קובץ משתני סביבה
צור קובץ `.env` בתיקיית `server/` עם התוכן הבא:

```env
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Session
SESSION_SECRET=your-very-secure-session-secret-key-here

# Google OAuth (אופציונלי לפיתוח מקומי)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# Google Maps API
GOOGLE_MAPS_API_KEY=your-google-maps-api-key

# SendGrid (לאיפוס סיסמאות)
SENDGRID_API_KEY=your-sendgrid-api-key

# Cloudinary (לאחסון תמונות)
CLOUDINARY_CLOUD_NAME=your-cloudinary-cloud-name
CLOUDINARY_API_KEY=your-cloudinary-api-key
CLOUDINARY_API_SECRET=your-cloudinary-api-secret

# Environment
NODE_ENV=development
PORT=3000
```

### 4. הרצת השרת
```bash
# הרצה רגילה
npm start

# או הרצה עם nodemon (מתחדש אוטומטית)
npm run dev
```

## 🔧 התקנה מפורטת שלב אחר שלב

### שלב 1: וידוא Redis
```bash
# בדוק שRedis רץ
redis-cli ping
# אמור להחזיר: PONG
```

### שלב 2: יצירת משתני סביבה בסיסיים
אם אתה רוצה רק לבדוק שהמערכת עובדת, תוכל להשתמש בערכים הבאים:

```env
# server/.env - הגדרה מינימלית לפיתוח מקומי
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
SESSION_SECRET=my-secret-key-for-development-only
NODE_ENV=development
PORT=3000

# עבור Google Maps (דרוש למפות)
GOOGLE_MAPS_API_KEY=your-api-key-here

# עבור Cloudinary (דרוש להעלאת תמונות)
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

### שלב 3: הרצה
```bash
cd Hazard-Detection
npm start
```

### שלב 4: גישה לאפליקציה
פתח דפדפן וגש ל: `http://localhost:3000`

## 🛠️ פתרון בעיות נפוצות

### 1. שגיאת חיבור ל-Redis
```bash
# וודא שRedis רץ
redis-cli ping

# אם לא רץ, הפעל אותו
# macOS:
brew services start redis

# Linux:
sudo systemctl start redis-server
```

### 2. שגיאת "Cannot find module"
```bash
# נקה ותתקן מחדש
rm -rf node_modules package-lock.json
npm install
```

### 3. שגיאת פורט תפוס
```bash
# בדוק מי משתמש בפורט 3000
lsof -i :3000

# הרוג את התהליך אם צריך
kill -9 <PID>
```

### 4. שגיאות משתני סביבה
- וודא שקובץ `.env` נמצא בתיקיית `server/`
- וודא שאין רווחים סביב סימני השוויון
- וודא שאין מרכאות מיותרות

## 📱 פיצ'רים שיעבדו מקומית

### ✅ יעבדו:
- רישום והתחברות (email/password)
- שמירת דיווחים ב-Redis
- צפייה בדיווחים קיימים
- מפות (אם יש Google Maps API key)
- העלאת תמונות (אם יש Cloudinary)

### ⚠️ דרושים API keys:
- **Google Maps**: למפות
- **Cloudinary**: להעלאת תמונות
- **SendGrid**: לאיפוס סיסמאות
- **Google OAuth**: להתחברות עם Google

## 🔑 קבלת API Keys

### Google Maps API:
1. לך ל: https://console.cloud.google.com/
2. צור פרויקט חדש
3. הפעל Maps JavaScript API
4. צור API key

### Cloudinary:
1. הירשם ב: https://cloudinary.com/
2. קח את ה-cloud name, API key ו-API secret

### SendGrid:
1. הירשם ב: https://sendgrid.com/
2. צור API key במסך הניהול

## 🐛 Debug Mode

להרצה עם debug:
```bash
DEBUG=* npm start
```

## 📞 עזרה

אם אתה נתקל בבעיות:
1. בדוק את הלוגים בטרמינל
2. בדוק שRedis רץ
3. בדוק שהפורט 3000 פנוי
4. וודא שמשתני הסביבה נכונים