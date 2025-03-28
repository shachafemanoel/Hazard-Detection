// public/js/upload.js
document.addEventListener("DOMContentLoaded", function () {
    const logoutBtn = document.getElementById("logout-btn");

    if (logoutBtn) {
        logoutBtn.addEventListener("click", async () => {
            try {
                const response = await fetch("/logout", { method: "GET" });

                if (response.redirected) {
                    window.location.href = response.url; // מפנה לדף הראשי
                }
            } catch (error) {
                console.error("Logout failed:", error);
            }
        });
    }
});
