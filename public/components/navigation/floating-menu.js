/* Floating Menu Component JavaScript */
document.addEventListener("DOMContentLoaded", function () {
  // Initialize floating menu
  initializeFloatingMenu();

  // Set active menu item based on current page
  setActiveMenuItem();
});

function initializeFloatingMenu() {
  const menuBtn = document.getElementById("menuBtn");
  const floatingMenu = document.getElementById("floatingMenu");
  const menuOverlay = document.getElementById("menuOverlay");

  if (!menuBtn || !floatingMenu || !menuOverlay) {
    console.warn("Floating menu elements not found");
    return;
  }

  // Toggle menu on button click
  menuBtn.addEventListener("click", function () {
    toggleMenu();
  });

  // Close menu when clicking overlay
  menuOverlay.addEventListener("click", function () {
    closeMenu();
  });

  // Close menu when clicking outside or pressing Escape
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      closeMenu();
    }
  });

  // Handle menu item clicks
  const menuItems = floatingMenu.querySelectorAll(".menu-item");
  menuItems.forEach((item) => {
    item.addEventListener("click", function (event) {
      const action = this.getAttribute("data-action");

      if (action === "logout") {
        event.preventDefault();
        handleLogout();
      } else {
        // For navigation items, close menu after click
        setTimeout(() => {
          closeMenu();
        }, 100);
      }
    });
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

function setActiveMenuItem() {
  const currentPage = getCurrentPage();
  const menuItems = document.querySelectorAll(".menu-item[data-page]");

  menuItems.forEach((item) => {
    const page = item.getAttribute("data-page");
    if (page === currentPage) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });
}

function getCurrentPage() {
  const path = window.location.pathname;

  if (path.includes("dashboard")) {
    return "dashboard";
  } else if (path.includes("camera")) {
    return "camera";
  } else if (path.includes("upload")) {
    return "upload";
  } else if (path.includes("login")) {
    return "login";
  }

  return "dashboard"; // Default
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

// Dynamic menu configuration
function addDynamicMenuItem(item) {
  const dynamicContainer = document.getElementById("dynamic-menu-items");
  if (!dynamicContainer) return;

  const menuItem = document.createElement("a");
  menuItem.href = item.href;
  menuItem.className = "menu-item";
  menuItem.innerHTML = `<i class="${item.icon}"></i><span>${item.label}</span>`;

  if (item.action) {
    menuItem.setAttribute("data-action", item.action);
  }

  if (item.page) {
    menuItem.setAttribute("data-page", item.page);
  }

  dynamicContainer.appendChild(menuItem);
}

// Export functions for external use
window.FloatingMenu = {
  open: openMenu,
  close: closeMenu,
  toggle: toggleMenu,
  addDynamicItem: addDynamicMenuItem,
  setActive: setActiveMenuItem,
};
