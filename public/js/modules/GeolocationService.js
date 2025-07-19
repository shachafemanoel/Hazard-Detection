/**
 * Geolocation service for location tracking and fallback systems
 */
export class GeolocationService {
  constructor() {
    this.lastCoords = null;
    this.watchId = null;
    this.isTracking = false;
  }

  /**
   * Initializes location tracking with fallback system
   * @returns {Promise} Promise that resolves with coordinates
   */
  async initLocationTracking() {
    return new Promise(async (resolve) => {
      if (!navigator.geolocation) {
        console.warn("Geolocation not supported by browser");
        await this.tryIPLocation();
        return resolve(this.lastCoords);
      }

      // Check if location permission is already granted
      if (navigator.permissions) {
        try {
          const permission = await navigator.permissions.query({
            name: "geolocation",
          });
          if (permission.state === "denied") {
            console.warn("Location permission denied, trying IP fallback");
            await this.tryIPLocation();
            return resolve(this.lastCoords);
          }
        } catch (err) {
          console.warn("Permission API not supported");
        }
      }

      let done = false;
      const handleCoords = (coords, source = "GPS") => {
        if (done) return;
        done = true;
        this.lastCoords = coords;
        console.log(`📍 Location obtained from ${source}:`, coords);
        resolve(coords);
      };

      // Try High-Accuracy GPS
      navigator.geolocation.getCurrentPosition(
        (pos) => handleCoords(pos.coords, "High-Accuracy GPS"),
        async (err) => {
          console.warn("High-Accuracy GPS failed:", err.code, err.message);

          if (err.code === err.PERMISSION_DENIED) {
            console.log("Permission denied, trying IP fallback");
            await this.tryIPLocation();
            return resolve(this.lastCoords);
          }

          // Try Low-Accuracy GPS
          navigator.geolocation.getCurrentPosition(
            (pos2) => handleCoords(pos2.coords, "Low-Accuracy GPS"),
            async (err2) => {
              console.warn("Low-Accuracy GPS failed:", err2.code, err2.message);
              await this.tryIPLocation();
              resolve(this.lastCoords);
            },
            { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
          );
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );

      // Setup continuous location tracking if GPS is available
      if (!done) {
        setTimeout(() => {
          if (this.lastCoords) {
            this.startContinuousTracking();
          }
        }, 1000);
      }
    });
  }

  /**
   * Starts continuous location tracking
   */
  startContinuousTracking() {
    if (this.watchId || !navigator.geolocation) return;

    this.isTracking = true;
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.lastCoords = pos.coords;
        console.log("📍 Location updated:", pos.coords);
      },
      (err) => {
        console.warn("watchPosition error:", err.code, err.message);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }

  /**
   * Stops location tracking
   */
  stopLocationTracking() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
      this.isTracking = false;
    }
  }

  /**
   * Tries to get location from IP address
   * @returns {Promise<boolean>} True if successful
   */
  async tryIPLocation() {
    try {
      console.log("Attempting IP-based location...");
      const response = await fetch("https://ipapi.co/json/");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      if (data.latitude && data.longitude) {
        this.lastCoords = {
          latitude: data.latitude,
          longitude: data.longitude,
          source: "IP",
        };
        console.log("📍 IP-based location obtained:", this.lastCoords);
        return true;
      }
    } catch (error) {
      console.warn("IP location failed:", error);
      try {
        // Fallback to another IP service
        const response = await fetch("https://api.ipify.org?format=json");
        const ipData = await response.json();
        console.log("Using fallback IP service for:", ipData.ip);
      } catch (fallbackError) {
        console.warn("All location methods failed:", fallbackError);
      }
    }
    return false;
  }

  /**
   * Gets the latest location coordinates
   * @returns {Promise<string>} JSON string of coordinates
   */
  getLatestLocation() {
    return new Promise((resolve, reject) => {
      if (
        this.lastCoords &&
        this.lastCoords.latitude &&
        this.lastCoords.longitude
      ) {
        const lat = parseFloat(this.lastCoords.latitude);
        const lng = parseFloat(this.lastCoords.longitude);

        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          resolve(JSON.stringify({ lat: lat, lng: lng }));
        } else {
          reject("Invalid coordinates");
        }
      } else {
        reject("No location available yet");
      }
    });
  }

  /**
   * Validates coordinate values
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @returns {boolean} True if valid
   */
  static validateCoordinates(lat, lng) {
    return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }

  /**
   * Calculates distance between two coordinates
   * @param {number} lat1 - First latitude
   * @param {number} lng1 - First longitude
   * @param {number} lat2 - Second latitude
   * @param {number} lng2 - Second longitude
   * @returns {number} Distance in meters
   */
  static calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Extracts geolocation data from image EXIF
   * @param {File} file - Image file
   * @returns {Promise<string|null>} Geolocation JSON string or null
   */
  static getGeoDataFromImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = function (e) {
        const imgData = e.target.result;
        const img = new Image();
        img.onload = function () {
          EXIF.getData(img, function () {
            const lat = EXIF.getTag(this, "GPSLatitude");
            const lon = EXIF.getTag(this, "GPSLongitude");
            const latRef = EXIF.getTag(this, "GPSLatitudeRef") || "N";
            const lonRef = EXIF.getTag(this, "GPSLongitudeRef") || "E";

            if (!lat || !lon) {
              return resolve(null);
            }

            const toDecimal = (dms, ref) => {
              const [deg, min, sec] = dms;
              let decimal = deg + min / 60 + sec / 3600;
              if (ref === "S" || ref === "W") decimal *= -1;
              return decimal;
            };

            const latitude = toDecimal(lat, latRef);
            const longitude = toDecimal(lon, lonRef);

            resolve(JSON.stringify({ lat: latitude, lng: longitude }));
          });
        };
        img.src = imgData;
      };
      reader.readAsDataURL(file);
    });
  }

  /**
   * Gets current coordinates or null if not available
   * @returns {Object|null} Coordinates object or null
   */
  getCurrentCoordinates() {
    return this.lastCoords;
  }

  /**
   * Checks if location tracking is active
   * @returns {boolean} True if tracking is active
   */
  isLocationTrackingActive() {
    return this.isTracking;
  }
}
