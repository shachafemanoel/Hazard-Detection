// js/login.js
document.addEventListener('DOMContentLoaded', function () {
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');

    if (error) {
        let message = '';
        let targetElement = null;

        switch (error) {
            case 'EmailExists':
                message = 'Email already exists. Please try again.';
                targetElement = document.getElementById('email-error');
                break;
            case 'UserNotFound':
                message = 'User not found. Please sign up.';
                targetElement = document.getElementById('login-error');
                break;
            case 'LoginFailed':
                message = 'Incorrect email or password.';
                targetElement = document.getElementById('login-error');
                break;
            case 'LogoutFailed': {
                message = 'Error logging out. Please refresh and try again.';
                // הצגה כללית בראש הדף
                const container = document.querySelector('.container');
                const logoutMsg = document.createElement('div');
                logoutMsg.textContent = message;
                logoutMsg.classList.add('error-banner', 'alert', 'alert-danger'); // Added Bootstrap alert classes
                container.insertBefore(logoutMsg, container.firstChild);

                // הוספת אנימציה של fade-in לשגיאה
                logoutMsg.classList.add('fade-in');
                
                // מחיקה אחרי 5 שניות עם fade-out
                setTimeout(() => {
                    logoutMsg.classList.add('fade-out');
                    setTimeout(() => {
                        logoutMsg.remove();
                    }, 500); // מתן זמן לעזוב את האנימציה
                }, 5000); // מחיקה אחרי 5 שניות
                
                break;
            }
            default:
                message = 'An unknown error occurred.';
                // Consider a generic error display location if no targetElement is found
        }

        if (targetElement) {
            targetElement.textContent = message;
            targetElement.classList.remove('hidden'); // Make sure the element is visible
            targetElement.classList.remove('alert-success'); // Ensure no conflicting classes
            targetElement.classList.add('alert-danger'); // Ensure it's styled as an error

            // הוספת אנימציה של fade-in לשגיאות בטופס
            targetElement.classList.add('fade-in');

            if (targetElement.id === 'email-error') {
                showSignupForm(); // Ensure the correct form is visible
                toggleForm();
            } else if (targetElement.id === 'login-error') {
                showLoginForm();
                toggleForm();
            }
        }

        // ניקוי ה-URL
        window.history.replaceState({}, document.title, '/');
    }

    // אירוע שליחת טופס הרשמה
    document.getElementById('register-form')?.addEventListener('submit', async function(event) {
        event.preventDefault();
    
        const email = document.getElementById('email').value.trim();
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();
        const errorElement = document.getElementById('email-error');
    
        // Reset error message
        errorElement.textContent = '';
        errorElement.classList.add('hidden');
        errorElement.classList.remove('alert-success', 'alert-danger');
    
        if (!validateEmail(email)) {
            errorElement.textContent = 'Invalid email address.';
            errorElement.classList.add('alert-danger');
            errorElement.classList.remove('hidden');
            return;
        }
        if (!validatePassword(password)) {
            errorElement.textContent = 'Password must be at least 8 characters long and contain both letters and numbers.';
            errorElement.classList.add('alert-danger');
            errorElement.classList.remove('hidden');
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
                errorElement.classList.remove('alert-danger');
                errorElement.classList.add('alert-success');
                errorElement.textContent = 'Registration successful! Logging you in...';
                errorElement.classList.remove('hidden');
    
                // המתנה של 5 שניות ואז מעבר לדף upload
                setTimeout(() => {
                    window.location.href = '/upload.html';
                }, 3000);
    
                return;
            } else {
                errorElement.classList.add('alert-danger');
                errorElement.classList.remove('alert-success');
                errorElement.textContent = data.error || 'Registration failed.';
                errorElement.classList.remove('hidden');
            }
        } catch (err) {
            console.error('Error registering user:', err);
            errorElement.classList.add('alert-danger');
            errorElement.classList.remove('alert-success');
            errorElement.textContent = 'Server error. Please try again.';
            errorElement.classList.remove('hidden');
        }
    });
    

    // התחברות
    // Corrected to target the actual form element 'login-form-inner' instead of the div 'login-form'
    document.getElementById('login-form-inner')?.addEventListener('submit', async function(event) {
        event.preventDefault();
    
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value.trim();
        const errorElement = document.getElementById('login-error');
    
        // Reset error message
        errorElement.textContent = '';
        errorElement.classList.add('hidden');
        errorElement.classList.remove('alert-success', 'alert-danger');
    
        if (!validateEmail(email)) {
            errorElement.textContent = 'Invalid email format.';
            errorElement.classList.add('alert-danger');
            errorElement.classList.remove('hidden');
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
                errorElement.classList.remove('alert-danger');
                errorElement.classList.add('alert-success');
                errorElement.textContent = 'Login successful! Redirecting...';
                errorElement.classList.remove('hidden');
    
                setTimeout(() => {
                    window.location.href = '/upload.html';
                }, 3000);
            } else {
                errorElement.classList.add('alert-danger');
                errorElement.classList.remove('alert-success');
                errorElement.textContent = data.error || 'Login failed.';
                errorElement.classList.remove('hidden');
            }
        } catch (err) {
            console.error('Login error:', err);
            errorElement.classList.add('alert-danger');
            errorElement.classList.remove('alert-success');
            errorElement.textContent = 'Server error. Please try again.';
            errorElement.classList.remove('hidden');
        }
    });

    // אירוע שליחת טופס "שכחתי סיסמא"
    document.getElementById('reset-password-form')?.addEventListener('submit', async function(event) {
        event.preventDefault(); // מונע ריענון

        const email = document.getElementById('reset-email').value.trim();
        const errorElement = document.getElementById('reset-password-error');

        // Reset error message
        errorElement.textContent = '';
        errorElement.classList.add('hidden');
        errorElement.classList.remove('alert-success', 'alert-danger');

        if (!validateEmail(email)) {
            errorElement.textContent = 'Invalid email address.';
            errorElement.classList.add('alert-danger');
            errorElement.classList.remove('hidden');
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
                errorElement.classList.remove('alert-danger');
                errorElement.classList.add('alert-success');
                errorElement.textContent = 'If the email is registered, you will receive a password reset link shortly.';
                errorElement.classList.remove('hidden');
                document.getElementById('reset-password-form').reset();
            } else {
                // הצגת הודעת שגיאה
                errorElement.classList.add('alert-danger');
                errorElement.classList.remove('alert-success');
                errorElement.textContent = data.error || 'Something went wrong. Please try again.';
                errorElement.classList.remove('hidden');
            }
        } catch (err) {
            console.error('Error during password reset request:', err);
            errorElement.classList.add('alert-danger');
            errorElement.classList.remove('alert-success');
            errorElement.textContent = 'Server error. Please try again later.';
            errorElement.classList.remove('hidden');
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

function toggleFormVisibility(formId, show) {
    const form = document.getElementById(formId);
    form.style.display = show ? 'block' : 'none';
}
