document.addEventListener("DOMContentLoaded", async function () {
    const openCameraBtn = document.getElementById("open-camera-btn");
    const closeCameraBtn = document.getElementById("close-camera-btn");
    const videoElement = document.getElementById("camera-stream");
    let stream = null;
    let session = null;

    // טעינת המודל ברגע שהדף נטען
    try {
        session = await ort.InferenceSession.create("/object_detecion_model/road_damage_detection_last_version.onnx");
        console.log("YOLO model loaded!");
    } catch (err) {
        console.error("Failed to load model:", err);
    }

    if (openCameraBtn && closeCameraBtn && videoElement) {
        openCameraBtn.addEventListener("click", async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: true });
                videoElement.srcObject = stream;

                closeCameraBtn.style.display = "inline-block";
                openCameraBtn.style.display = "none";

                // אפשר להוסיף כאן קריאה לפונקציה שתזהה אובייקטים מהוידאו
            } catch (error) {
                console.error("Cannot access camera:", error);
                alert("לא ניתן לגשת למצלמה. ודא שנתת הרשאה.");
            }
        });

        closeCameraBtn.addEventListener("click", () => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
                videoElement.srcObject = null;
                stream = null;

                openCameraBtn.style.display = "inline-block";
                closeCameraBtn.style.display = "none";
            }
        });
    }
});
