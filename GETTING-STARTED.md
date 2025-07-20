# 🚀 איך להריץ את הפרויקט מקומית

## TL;DR - רוצה להתחיל מהר? 

### Mac/Linux:
```bash
npm install
./start-local.sh
```

### Windows:
```cmd
npm install
start-local.bat
```

**זהו! 🎉**

---

## מה צריך לפני שמתחילים:

### 1. Node.js 18+
- הורד מ: https://nodejs.org/
- בדוק: `node --version`

### 2. Redis
**Option A - Homebrew (Mac):**
```bash
brew install redis
brew services start redis
```

**Option B - Docker (כל פלטפורמה):**
```bash
docker run -d -p 6379:6379 redis:alpine
```

**Option C - Windows:**
- הורד מ: https://github.com/microsoftarchive/redis/releases

---

## הרצה בצעדים:

### 1. הורד את הפרויקט
```bash
git clone <your-repo-url>
cd Hazard-Detection
```

### 2. התקן חבילות
```bash
npm install
```

### 3. הרץ את השרת
```bash
# Mac/Linux
./start-local.sh

# Windows  
start-local.bat

# או ידנית
npm start
```

### 4. פתח דפדפן
עבור ל: **http://localhost:3000**

---

## ✅ מה יעבוד מיד:
- רישום משתמשים חדשים
- התחברות והתנתקות
- יצירת דיווחי מפגעים (ללא תמונות)
- צפייה ברשימת דיווחים
- פילטור וחיפוש דיווחים
- ממשק ניהול (למשתמשי admin)

## ⚠️ מה דורש API keys:
- **תמונות**: Cloudinary (חינם)
- **מפות**: Google Maps API
- **איפוס סיסמה**: SendGrid

---

## 🔑 הוספת API Keys (אופציונלי):

עריכה של קובץ `server/.env`:

```env
# עבור תמונות (Cloudinary - חינם)
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key  
CLOUDINARY_API_SECRET=your-api-secret

# עבור מפות (Google Maps)
GOOGLE_MAPS_API_KEY=your-google-maps-key

# עבור איפוס סיסמה (SendGrid)
SENDGRID_API_KEY=your-sendgrid-key
```

### קישורים לרישום:
- [Cloudinary](https://cloudinary.com/) - העלאת תמונות (חינם)
- [Google Cloud Console](https://console.cloud.google.com/) - Maps API
- [SendGrid](https://sendgrid.com/) - שליחת אימיילים

---

## 🐛 פתרון בעיות:

### השרת לא עולה:
```bash
# בדוק שRedis רץ
redis-cli ping

# בדוק שהפורט פנוי
lsof -i :3000

# נקה חבילות ותתקן מחדש
rm -rf node_modules package-lock.json
npm install
```

### שגיאות בדפדפן:
1. בדוק Console (F12)
2. בדוק Network tab
3. ודא שהשרת רץ ב-3000

### לא מצליח להתחבר:
1. צור משתמש חדש
2. וודא שמילאת נכון email וסיסמה
3. בדוק שRedis רץ (לשמירת sessions)

---

## 📁 מבנה הפרויקט:
```
Hazard-Detection/
├── public/           # Frontend files
│   ├── pages/       # HTML pages
│   ├── js/          # JavaScript  
│   └── css/         # Stylesheets
├── server/          # Backend
│   ├── server.js    # Main server
│   └── .env         # Environment variables
└── package.json     # Dependencies
```

---

## 🎯 צעדים הבאים:
1. **הרץ מקומית** - ודא שהכל עובד
2. **הוסף API keys** - לפיצ'רים מתקדמים  
3. **פתח שמירות** - בדוק יצירת דיווחים
4. **בדוק ממשק ניהול** - אם אתה admin

**Success! 🎉**