// js/login.js
document.addEventListener('DOMContentLoaded', function () {
    // אירוע שליחת טופס הרשמה
    document.getElementById('register-form')?.addEventListener('submit', async function(event) {
        event.preventDefault();
    
        const email = document.getElementById('email').value.trim();
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();
        const errorElement = document.getElementById('email-error');
    
        errorElement.textContent = '';
        errorElement.style.color = 'red';
    
        if (!validateEmail(email)) {
            errorElement.textContent = 'Invalid email address.';
            return;
        }
        if (!validatePassword(password)) {
            errorElement.textContent = 'Password must be at least 8 characters long and contain both letters and numbers.';
            return;
        }
    
        try {
            const res = await fetch('/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ email, username, password })
            });
    
            const data = await res.json();
    
            if (res.ok) {
                errorElement.style.color = 'green';
                errorElement.textContent = 'Registration successful! Logging you in...';
    
                // המתנה של 5 שניות ואז מעבר לדף upload
                setTimeout(() => {
                    window.location.href = '/upload.html';
                }, 3000);
    
                return;
            } else {
                errorElement.textContent = data.error || 'Registration failed.';
            }
        } catch (err) {
            console.error('Error registering user:', err);
            errorElement.textContent = 'Server error. Please try again.';
        }
    });
    

    // התחברות
    document.getElementById('login-form')?.addEventListener('submit', async function(event) {
        event.preventDefault();
    
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value.trim();
        const errorElement = document.getElementById('login-error');
    
        errorElement.textContent = '';
        errorElement.style.color = 'red';
    
        if (!validateEmail(email)) {
            errorElement.textContent = 'Invalid email format.';
            return;
        }
    
        try {
            const res = await fetch('/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ email, password })
            });
    
            const data = await res.json();
    
            if (res.ok) {
                errorElement.style.color = 'green';
                errorElement.textContent = 'Login successful! Redirecting...';
    
                setTimeout(() => {
                    window.location.href = '/upload.html';
                }, 3000);
            } else {
                errorElement.textContent = data.error || 'Login failed.';
            }
        } catch (err) {
            console.error('Login error:', err);
            errorElement.textContent = 'Server error. Please try again.';
        }
    });
    

    // אירוע שליחת טופס "שכחתי סיסמא"
    document.getElementById('reset-password-form')?.addEventListener('submit', async function(event) {
        event.preventDefault(); // מונע ריענון

        const email = document.getElementById('reset-email').value.trim();
        const errorElement = document.getElementById('reset-password-error');

        errorElement.textContent = '';
        errorElement.style.color = 'red';

        // ולידציה בסיסית על האימייל
        if (!validateEmail(email)) {
            errorElement.textContent = 'Invalid email address.';
            return;
        }

        try {
            const res = await fetch('/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ email })
            });

            const data = await res.json();

            if (res.ok) {
                // הצגת הודעת הצלחה
                errorElement.style.color = 'green';
                errorElement.textContent = 'If the email is registered, you will receive a password reset link shortly.';
                document.getElementById('reset-password-form').reset();
            } else {
                // הצגת הודעת שגיאה
                errorElement.textContent = data.error || 'Something went wrong. Please try again.';
            }
        } catch (err) {
            console.error('Error during password reset request:', err);
            errorElement.textContent = 'Server error. Please try again later.';
        }
    });
});


function toggleForm() {
    document.getElementById('buttons').style.display = 'none';
    document.getElementById('email-options').style.display = 'block';
    document.getElementById('back-options').style.display = 'block'; // הצגת כפתור back
    document.getElementById('email-form').style.display = 'block'; // הוספתי כדי להציג את הטופס
}

function backToMainScreen() {
    // הסתרת כל הטפסים
    document.getElementById('signup-form').style.display = 'none';
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('forgot-password-form').style.display = 'none';
    document.getElementById('email-options').style.display = 'none';
    document.getElementById('email-form').style.display = 'none';
    document.getElementById('buttons').style.display = 'block';
    document.getElementById('back-options').style.display = 'none'; 
}

// הצגת טופס הרשמה
function showSignupForm() {
    document.getElementById('signup-form').style.display = 'block';
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('forgot-password-form').style.display = 'none';
    document.getElementById('back-options').style.display = 'block'; // הצגת כפתור back בטופס הרשמה
}

// הצגת טופס התחברות
function showLoginForm() {
    document.getElementById('signup-form').style.display = 'none';
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('forgot-password-form').style.display = 'none';
    document.getElementById('back-options').style.display = 'block'; // הצגת כפתור back בטופס התחברות
}


// פונקציה שתציג את טופס שחזור הסיסמה
function toggleForgotPassword() {
    document.getElementById('forgot-password-form').style.display = 'block';
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('signup-form').style.display = 'none';
    document.getElementById('back-options').style.display = 'block'; // הצגת כפתור Back
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

