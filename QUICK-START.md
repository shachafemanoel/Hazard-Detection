# התקנה מהירה - 5 דקות ⚡

## מה שאתה צריך לפני שמתחילים:
1. **Node.js 18+** - [הורד כאן](https://nodejs.org/)
2. **Redis** - [הוראות התקנה](#redis-setup)

## הרצה מהירה:

### אופציה 1: עם הסקריפט (מומלץ)
```bash
# שכפל את הפרויקט
git clone <your-repo>
cd Hazard-Detection

# הרץ את הסקריפט שיסדר הכל בשבילך
./start-local.sh
```

### אופציה 2: ידנית
```bash
# 1. התקן חבילות
npm install

# 2. יצור קובץ .env בסיסי
echo "REDIS_HOST=localhost
REDIS_PORT=6379
SESSION_SECRET=my-local-secret-key
NODE_ENV=development
PORT=3000" > server/.env

# 3. הרץ את השרת
npm start
```

## Redis Setup

### macOS (עם Homebrew):
```bash
brew install redis
brew services start redis
```

### Ubuntu/Linux:
```bash
sudo apt update
sudo apt install redis-server
sudo systemctl start redis-server
```

### Windows:
1. הורד מ: https://github.com/microsoftarchive/redis/releases
2. הפעל את השירות

### Docker (לכל פלטפורמה):
```bash
docker run -d -p 6379:6379 redis:alpine
```

## בדיקה שהכל עובד:
1. פתח דפדפן: `http://localhost:3000`
2. צור משתמש חדש
3. התחבר

## פיצ'רים שיעבדו מיד:
- ✅ רישום והתחברות
- ✅ שמירת דיווחים
- ✅ צפייה בדיווחים
- ✅ ממשק ניהול

## פיצ'רים שדרושים API keys:
- 🗺️ **מפות**: Google Maps API
- 📸 **העלאת תמונות**: Cloudinary
- 📧 **איפוס סיסמה**: SendGrid

## קבלת API Keys (אופציונלי):

### Google Maps (למפות):
1. [Google Cloud Console](https://console.cloud.google.com/)
2. צור פרויקט → הפעל Maps JavaScript API → צור API key
3. הוסף ל-.env: `GOOGLE_MAPS_API_KEY=your-key`

### Cloudinary (לתמונות):
1. [Cloudinary](https://cloudinary.com/) - הרשמה חינם
2. עבור ל-Dashboard → העתק cloud name, API key, API secret
3. הוסף ל-.env:
```
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

## פתרון בעיות:

### "לא מוצא Redis":
```bash
redis-cli ping  # אמור להחזיר PONG
```

### "פורט תפוס":
```bash
lsof -i :3000  # בדוק מי משתמש בפורט
kill -9 <PID>  # הרוג את התהליך
```

### "שגיאות חבילות":
```bash
rm -rf node_modules package-lock.json
npm install
```

## Support
אם משהו לא עובד - בדוק את הקונסול, יש הודעות שגיאה ברורות! 🐛