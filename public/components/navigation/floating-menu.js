/* Floating Navigation Component JavaScript */
document.addEventListener("DOMContentLoaded", function () {
  // Initialize floating navigation with a slight delay to ensure DOM is ready
  setTimeout(() => {
    initializeFloatingNavigation();
    setActiveNavigationItem();
  }, 100);

  // Update active state when page changes (for SPAs)
  window.addEventListener('popstate', () => {
    setTimeout(setActiveNavigationItem, 50);
  });
  
  // Also update on hash changes
  window.addEventListener('hashchange', () => {
    setTimeout(setActiveNavigationItem, 50);
  });
});

function initializeFloatingNavigation() {
  const floatingNavigation = document.getElementById("floatingNavigation");
  const floatingSearchBtn = document.getElementById("floating-search-btn");
  const userIndicator = document.getElementById("user-indicator");
  const userStatus = document.getElementById("user-status");

  if (!floatingNavigation) {
    console.warn("Floating navigation elements not found");
    return;
  }

  // Add smooth fade-in animation
  floatingNavigation.style.opacity = "0";
  floatingNavigation.style.transform = "translateX(-50%) translateY(-20px)";
  
  setTimeout(() => {
    floatingNavigation.style.transition = "all 0.6s ease";
    floatingNavigation.style.opacity = "1";
    floatingNavigation.style.transform = "translateX(-50%) translateY(0)";
  }, 100);

  // Initialize user status
  initializeUserStatus();

  // Handle user indicator click
  if (userIndicator) {
    userIndicator.addEventListener("click", function () {
      toggleUserStatus();
    });
  }

  // Handle search button click
  if (floatingSearchBtn) {
    floatingSearchBtn.addEventListener("click", function () {
      // Trigger the existing search modal
      const searchModal = document.getElementById("search-modal");
      const openSearchBtn = document.getElementById("open-search-modal");
      
      if (searchModal) {
        // Use Bootstrap modal if available
        if (window.bootstrap && window.bootstrap.Modal) {
          const modal = new window.bootstrap.Modal(searchModal);
          modal.show();
        } else if (openSearchBtn) {
          // Fallback: trigger the existing search button
          openSearchBtn.click();
        }
      }
    });
  }

  // Handle navigation item clicks
  const navItems = floatingNavigation.querySelectorAll(".floating-nav-item");
  navItems.forEach((item) => {
    item.addEventListener("click", function (event) {
      const action = this.getAttribute("data-action");

      if (action === "logout") {
        event.preventDefault();
        handleLogout();
      } else {
        // Add active state animation
        this.style.transform = "scale(0.95)";
        setTimeout(() => {
          this.style.transform = "";
        }, 150);
      }
    });
  });

  // Optional: Add subtle scroll effect to navigation (removed fluttering)
  let ticking = false;
  let lastScrollY = window.scrollY;
  
  window.addEventListener("scroll", () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        const currentScrollY = window.scrollY;
        
        // Only apply scroll effect on larger screens
        if (window.innerWidth > 768) {
          if (currentScrollY > lastScrollY && currentScrollY > 150) {
            // Scrolling down - subtle hide effect
            floatingNavigation.style.transform = "translateX(-50%) translateY(-10px)";
            floatingNavigation.style.opacity = "0.9";
          } else {
            // Scrolling up - show navigation
            floatingNavigation.style.transform = "translateX(-50%) translateY(0)";
            floatingNavigation.style.opacity = "1";
          }
        }
        
        lastScrollY = currentScrollY;
        ticking = false;
      });
      ticking = true;
    }
  });
}

function toggleMenu() {
  const floatingMenu = document.getElementById("floatingMenu");
  const menuOverlay = document.getElementById("menuOverlay");

  const isActive = floatingMenu.classList.contains("active");

  if (isActive) {
    closeMenu();
  } else {
    openMenu();
  }
}

function openMenu() {
  const floatingMenu = document.getElementById("floatingMenu");
  const menuOverlay = document.getElementById("menuOverlay");

  floatingMenu.classList.add("active");
  menuOverlay.classList.add("active");

  // Prevent body scroll when menu is open
  document.body.style.overflow = "hidden";
}

function closeMenu() {
  const floatingMenu = document.getElementById("floatingMenu");
  const menuOverlay = document.getElementById("menuOverlay");

  floatingMenu.classList.remove("active");
  menuOverlay.classList.remove("active");

  // Restore body scroll
  document.body.style.overflow = "";
}

function setActiveNavigationItem() {
  const currentPage = getCurrentPage();
  const navItems = document.querySelectorAll(".floating-nav-item[data-page]");

  // Clear all active states first
  navItems.forEach((item) => {
    item.classList.remove("active");
    // Remove inline styles to let CSS classes handle styling
    item.style.background = "";
    item.style.color = "";
    item.style.borderColor = "";
    item.style.boxShadow = "";
    item.style.transform = "";
    item.style.fontWeight = "";
  });

  // Set active state for current page
  navItems.forEach((item) => {
    const page = item.getAttribute("data-page");
    if (page === currentPage) {
      item.classList.add("active");
      console.log(`Active page set: ${currentPage}`); // For debugging
    }
  });
}

function getCurrentPage() {
  const path = window.location.pathname;
  
  console.log(`Current path: ${path}`); // For debugging

  // More specific matching to avoid conflicts
  if (path.includes("admin-dashboard")) {
    return "admin";
  } else if (path.endsWith("dashboard.html") || path.includes("/dashboard")) {
    return "dashboard";
  } else if (path.includes("camera")) {
    return "camera";
  } else if (path.includes("index.html") || path === "/" || path === "/pages/" || path.endsWith("/")) {
    return "home";
  } else if (path.includes("login")) {
    return "login";
  }

  // Try to determine from document title as fallback
  const title = document.title.toLowerCase();
  if (title.includes("dashboard")) {
    return "dashboard";
  } else if (title.includes("camera")) {
    return "camera";
  } else if (title.includes("admin")) {
    return "admin";
  }

  return "home"; // Default to home instead of dashboard
}

function handleLogout() {
  // Show confirmation dialog
  if (confirm("Are you sure you want to logout?")) {
    // Show loading state
    const logoutItem = document.querySelector(
      '.menu-item[data-action="logout"]',
    );
    if (logoutItem) {
      logoutItem.innerHTML =
        '<i class="fas fa-spinner fa-spin"></i><span>Logging out...</span>';
    }

    // Redirect to logout endpoint
    window.location.href = "/logout";
  }
}

// Dynamic navigation item configuration
function addDynamicNavigationItem(item) {
  const dynamicContainer = document.getElementById("dynamic-menu-items");
  if (!dynamicContainer) return;

  const navItem = document.createElement("a");
  navItem.href = item.href;
  navItem.className = "floating-nav-item";
  navItem.innerHTML = `<i class="${item.icon}"></i><span>${item.label}</span>`;

  if (item.action) {
    navItem.setAttribute("data-action", item.action);
  }

  if (item.page) {
    navItem.setAttribute("data-page", item.page);
  }

  // Add click handler for dynamic items
  navItem.addEventListener("click", function (event) {
    const action = this.getAttribute("data-action");
    if (action === "logout") {
      event.preventDefault();
      handleLogout();
    } else {
      // Add active state animation
      this.style.transform = "scale(0.95)";
      setTimeout(() => {
        this.style.transform = "";
      }, 150);
    }
  });

  dynamicContainer.appendChild(navItem);
  
  // Update active state after adding new item
  setTimeout(setActiveNavigationItem, 100);
}

// Force update active state after a delay (for dynamic loading)
function forceUpdateActiveState() {
  setTimeout(() => {
    setActiveNavigationItem();
  }, 200);
}

// User Status Management
function initializeUserStatus() {
  const userStatus = document.getElementById("user-status");
  if (!userStatus) return;

  // Get stored user status or default to online
  const storedStatus = localStorage.getItem('userStatus') || 'online';
  setUserStatus(storedStatus);

  // Simulate user activity detection
  let activityTimeout;
  const resetActivityTimer = () => {
    clearTimeout(activityTimeout);
    if (getCurrentUserStatus() === 'away') {
      setUserStatus('online');
    }
    activityTimeout = setTimeout(() => {
      setUserStatus('away');
    }, 300000); // 5 minutes of inactivity
  };

  // Listen for user activity
  ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'].forEach(event => {
    document.addEventListener(event, resetActivityTimer, true);
  });

  resetActivityTimer();
}

function setUserStatus(status) {
  const userStatus = document.getElementById("user-status");
  const userIndicator = document.getElementById("user-indicator");
  
  if (!userStatus) return;

  // Remove all status classes
  userStatus.classList.remove('online', 'offline', 'away');
  
  // Add new status class
  userStatus.classList.add(status);
  
  // Update tooltip
  if (userIndicator) {
    const statusLabels = {
      online: 'Online',
      away: 'Away',
      offline: 'Offline'
    };
    userIndicator.setAttribute('title', `User Status: ${statusLabels[status]}`);
  }

  // Store status
  localStorage.setItem('userStatus', status);
  
  console.log(`User status set to: ${status}`);
}

function getCurrentUserStatus() {
  const userStatus = document.getElementById("user-status");
  if (!userStatus) return 'offline';
  
  if (userStatus.classList.contains('online')) return 'online';
  if (userStatus.classList.contains('away')) return 'away';
  return 'offline';
}

function toggleUserStatus() {
  const currentStatus = getCurrentUserStatus();
  const statusOrder = ['online', 'away', 'offline'];
  const currentIndex = statusOrder.indexOf(currentStatus);
  const nextIndex = (currentIndex + 1) % statusOrder.length;
  
  setUserStatus(statusOrder[nextIndex]);
}

// Export functions for external use
window.FloatingNavigation = {
  setActive: setActiveNavigationItem,
  addDynamicItem: addDynamicNavigationItem,
  getCurrentPage: getCurrentPage,
  handleLogout: handleLogout,
  forceUpdate: forceUpdateActiveState,
  setUserStatus: setUserStatus,
  getUserStatus: getCurrentUserStatus,
  toggleUserStatus: toggleUserStatus
};

// Backward compatibility
window.FloatingMenu = window.FloatingNavigation;

// Call this when navigation is fully loaded
setTimeout(() => {
  if (typeof setActiveNavigationItem === 'function') {
    setActiveNavigationItem();
  }
}, 500);
