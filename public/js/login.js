document.addEventListener('DOMContentLoaded', function () {
    // פונקציה להפעלת חלון הכניסה/הרשמה
    document.getElementById('register-form')?.addEventListener('submit', function(event) {
        event.preventDefault(); // מונע שליחת הטופס
        const email = document.getElementById('email').value;
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        // ניקוי הודעות שגיאה ישנות
        document.getElementById('email-error').textContent = '';

        // אימות אימייל וסיסמא
        if (!validateEmail(email)) {
            document.getElementById('email-error').textContent = 'Invalid email address.';
            return;
        }
        if (!validatePassword(password)) {
            document.getElementById('email-error').textContent = 'Password must be at least 8 characters long and contain both letters and numbers.';
            return;
        }

        // כאן חיייב לקרוא לפונקצית API כדי להרשם
        console.log('Registering user:', { email, username, password });
        document.getElementById('email-error').textContent = 'Registration successful!'; // דוגמה להודעת הצלחה
    });

    document.getElementById('login-form')?.addEventListener('submit', function(event) {
        event.preventDefault(); // מונע שליחת הטופס
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        // ניקוי הודעות שגיאה ישנות
        document.getElementById('email-error').textContent = '';

        // כאן חיייב לקרוא לפונקצית API כדי להתחבר
        console.log('Logging in user:', { email, password });

        // יש להוסיף בדיקות שגיאה פה, למשל אם המשתמש לא קיים או סיסמה לא נכונה.
    });

    document.getElementById('reset-password-form')?.addEventListener('submit', function(event) {
        event.preventDefault(); // מונע שליחת הטופס
        const email = document.getElementById('reset-email').value;

        // ניקוי הודעות שגיאה ישנות
        document.getElementById('email-error').textContent = '';

        // כאן חיייב לקרוא לפונקצית API שליחת לינק לשחזור
        console.log('Sending reset link to:', email);
    });
});

// פונקציה לסירוגין טופסים
function toggleForm() {
    document.getElementById('buttons').style.display = 'none';
    document.getElementById('email-options').style.display = 'block';
    document.getElementById('email-form').style.display = 'block'; // הוספתי כדי להציג את הטופס
}

// פונקציה להציג את טופס ההרשמה
function showSignupForm() {
    document.getElementById('signup-form').style.display = 'block';
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('forgot-password-form').style.display = 'none';
    document.getElementById('email-error').textContent = ''; // ניקוי שגיאות ישנות
}

// פונקציה להציג את טופס הכניסה
function showLoginForm() {
    document.getElementById('signup-form').style.display = 'none'; // הסתרת טופס ההרשמה
    document.getElementById('login-form').style.display = 'block'; // הצגת טופס ההתחברות
    document.getElementById('forgot-password-form').style.display = 'none'; // הסתרת טופס שחזור סיסמה
    document.getElementById('email-error').textContent = ''; // ניקוי שגיאות ישנות
}

// פונקציה להציג את טופס שכחת הסיסמה
function toggleForgotPassword() {
    document.getElementById('forgot-password-form').style.display = 'block';
    document.getElementById('login-form').style.display = 'none';
}

// פונקציית אימות אימייל
function validateEmail(email) {
    const regex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
    return regex.test(email);
}

// פונקציית אימות סיסמה
function validatePassword(password) {
    const regex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/;
    return regex.test(password);
}
