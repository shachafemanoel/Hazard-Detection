# HTML Components Documentation

This document describes the reusable HTML components extracted from the RoadGuardian application to reduce code duplication and improve maintainability.

## Component Architecture

```
public/components/
├── layout/
│   ├── base-head.html          # Common head elements
│   ├── auth-layout.html        # Authentication page layout
│   └── dashboard-layout.html   # Dashboard page layout
├── navigation/
│   ├── floating-menu.html      # Floating navigation menu
│   └── floating-menu.js        # Floating menu JavaScript
├── forms/
│   ├── auth-form.html          # Base authentication form
│   └── login-form.html         # Complete login form
├── ui/
│   ├── button.html             # Reusable button component
│   ├── modal.html              # Modal dialog component
│   ├── toast.html              # Toast notification component
│   └── camera-controls.html    # Camera controls widget
└── README.md                   # This documentation
```

## Component Usage

### Layout Components

#### 1. Base Head (`layout/base-head.html`)

Common head elements used across all pages.

**Includes:**
- Meta tags (charset, viewport)
- Favicon
- Google Fonts (Poppins)
- Font Awesome icons
- Base CSS files

**Usage:**
```html
<!-- Include in head section -->
<!-- INCLUDE: /components/layout/base-head.html -->
```

#### 2. Auth Layout (`layout/auth-layout.html`)

Template for authentication pages (login, signup, reset password).

**Features:**
- Centered layout with dark mode support
- TailwindCSS integration
- Logo and title placeholders
- Content area for forms

**Template Variables:**
- `{{PAGE_TITLE}}` - Page title
- `{{PAGE_SUBTITLE}}` - Page subtitle
- `{{CONTENT}}` - Main content area
- `{{PAGE_CSS}}` - Additional CSS files
- `{{PAGE_SCRIPTS}}` - Additional JavaScript

**Usage:**
```html
<!-- Replace placeholders with actual values -->
<title>{{PAGE_TITLE}} - RoadGuardian</title>
```

#### 3. Dashboard Layout (`layout/dashboard-layout.html`)

Template for dashboard-style pages.

**Features:**
- Bootstrap integration
- Floating menu included
- Dashboard header with branding
- Content area for dashboard widgets

**Template Variables:**
- `{{PAGE_TITLE}}` - Page title
- `{{CONTENT}}` - Main dashboard content
- `{{PAGE_CSS}}` - Additional CSS files
- `{{PAGE_SCRIPTS}}` - Additional JavaScript

### Navigation Components

#### 1. Floating Menu (`navigation/floating-menu.html`)

Responsive navigation menu used across dashboard pages.

**Features:**
- Mobile hamburger menu
- Desktop sidebar (collapsed/expanded)
- Active page highlighting
- Dynamic menu items
- Logout functionality

**JavaScript API:**
```javascript
// Access floating menu functions
window.FloatingMenu.open();
window.FloatingMenu.close();
window.FloatingMenu.toggle();
window.FloatingMenu.setActive();

// Add dynamic menu items
window.FloatingMenu.addDynamicItem({
    href: '/custom-page',
    icon: 'fas fa-custom',
    label: 'Custom Page',
    page: 'custom'
});
```

**Dynamic Items:**
Replace `{{DYNAMIC_ITEMS}}` with additional menu items:
```html
<a href="/custom-page" class="menu-item" data-page="custom">
    <i class="fas fa-custom"></i>
    <span>Custom Page</span>
</a>
```

### Form Components

#### 1. Auth Form (`forms/auth-form.html`)

Base authentication form with error handling and loading states.

**Features:**
- Error/success message display
- Loading state management
- Form validation
- AJAX submission

**Template Variables:**
- `{{FORM_ACTION}}` - Form submission URL
- `{{FORM_FIELDS}}` - Form input fields
- `{{SUBMIT_TEXT}}` - Submit button text
- `{{FORM_ACTIONS}}` - Additional form actions
- `{{SOCIAL_LOGIN}}` - Social login options

**JavaScript API:**
```javascript
// Show messages
window.AuthForm.showError('Error message');
window.AuthForm.showSuccess('Success message');
window.AuthForm.setLoading(true);
```

#### 2. Login Form (`forms/login-form.html`)

Complete login form with multiple authentication options.

**Features:**
- Email/Google login options
- Sign up form
- Forgot password form
- Form validation
- Navigation between forms

**Form Types:**
- Email login
- User registration
- Password reset
- Social authentication

### UI Components

#### 1. Button (`ui/button.html`)

Reusable button component with multiple variants.

**Template Variables:**
- `{{TYPE}}` - Button type (button, submit, reset)
- `{{VARIANT}}` - Button style (btn-primary, btn-secondary, etc.)
- `{{SIZE}}` - Button size (btn-sm, btn-lg)
- `{{TEXT}}` - Button text
- `{{ICON_LEFT}}` - Left icon class
- `{{ICON_RIGHT}}` - Right icon class
- `{{CLASSES}}` - Additional CSS classes
- `{{LOADING}}` - Show loading spinner

**Available Variants:**
- `btn-primary` - Primary action
- `btn-secondary` - Secondary action
- `btn-success` - Success/positive action
- `btn-danger` - Danger/destructive action
- `btn-warning` - Warning action
- `btn-info` - Info action
- `btn-light` - Light style
- `btn-dark` - Dark style
- `btn-outline-*` - Outline variants
- `btn-modern` - Modern rounded style

**Usage Examples:**
```html
<!-- Primary button with icon -->
{{> button TYPE="submit" VARIANT="btn-primary" TEXT="Submit" ICON_LEFT="fas fa-check"}}

<!-- Loading button -->
{{> button TYPE="button" VARIANT="btn-secondary" TEXT="Processing..." LOADING=true}}

<!-- Modern Google login -->
{{> button TYPE="button" VARIANT="btn-modern" TEXT="Google Login" ICON_LEFT="fab fa-google"}}
```

#### 2. Modal (`ui/modal.html`)

Reusable modal dialog component.

**Features:**
- Configurable header/footer
- Multiple sizes
- Backdrop click to close
- Keyboard navigation (Escape key)
- Custom events

**Template Variables:**
- `{{ID}}` - Modal ID
- `{{TITLE}}` - Modal title
- `{{CONTENT}}` - Modal content
- `{{SIZE}}` - Modal size (modal-sm, modal-lg, modal-xl)
- `{{POSITION}}` - Modal position (modal-dialog-centered)
- `{{SHOW_HEADER}}` - Show header
- `{{SHOW_FOOTER}}` - Show footer
- `{{SHOW_CLOSE}}` - Show close button
- `{{FOOTER_CONTENT}}` - Footer content

**JavaScript API:**
```javascript
// Control modal
window.Modal.myModal.show();
window.Modal.myModal.hide();
window.Modal.myModal.toggle();

// Listen for events
document.getElementById('myModal').addEventListener('modal:show', function() {
    console.log('Modal shown');
});
```

#### 3. Toast (`ui/toast.html`)

Toast notification system for user feedback.

**Features:**
- Multiple notification types
- Auto-dismiss functionality
- Stacking notifications
- Click to dismiss

**JavaScript API:**
```javascript
// Show notifications
window.Toast.success('Action completed successfully!');
window.Toast.error('Something went wrong');
window.Toast.warning('Please review your input');
window.Toast.info('Additional information');
window.Toast.loading('Processing...'); // Doesn't auto-hide

// Custom options
window.Toast.success('Custom message', {
    title: 'Custom Title',
    duration: 10000
});
```

#### 4. Camera Controls (`ui/camera-controls.html`)

Camera page control interface.

**Features:**
- Camera start/stop/switch
- Confidence threshold slider
- Performance statistics
- Object/hazard detection display
- Loading states

**JavaScript API:**
```javascript
// Control camera
window.CameraControls.start();
window.CameraControls.stop();
window.CameraControls.switch();

// Update UI
window.CameraControls.updateStats({ fps: 30, frameTime: 33 });
window.CameraControls.updateObjectCount(5);
window.CameraControls.updateHazardTypes([
    { type: 'pothole', confidence: 0.85 }
]);
```

**Events:**
```javascript
// Listen for camera events
document.addEventListener('camera:started', function(e) {
    console.log('Camera started:', e.detail);
});

document.addEventListener('detection:results', function(e) {
    console.log('Detection results:', e.detail);
});
```

## Component Loading

### Simple Component Loader

Use this JavaScript function to load components:

```javascript
function loadComponent(url, targetId) {
    fetch(url)
        .then(response => response.text())
        .then(html => {
            const target = document.getElementById(targetId);
            if (target) {
                target.innerHTML = html;
                
                // Execute any scripts in the loaded component
                const scripts = target.querySelectorAll('script');
                scripts.forEach(script => {
                    const newScript = document.createElement('script');
                    newScript.textContent = script.textContent;
                    document.head.appendChild(newScript);
                });
            }
        })
        .catch(error => {
            console.error('Error loading component:', error);
        });
}
```

### Usage Example

```javascript
document.addEventListener('DOMContentLoaded', function() {
    // Load components
    loadComponent('/components/navigation/floating-menu.html', 'menu-container');
    loadComponent('/components/ui/toast.html', 'toast-container');
    loadComponent('/components/forms/login-form.html', 'form-container');
});
```

## Template System

### Basic Template Replacement

For simple template replacement, use this function:

```javascript
function processTemplate(template, data) {
    return template.replace(/\{\{([^}]+)\}\}/g, function(match, key) {
        return data[key] || '';
    });
}

// Usage
const template = '<h1>{{TITLE}}</h1>';
const result = processTemplate(template, { TITLE: 'Welcome' });
```

### Advanced Template Processing

For conditional blocks and loops, consider using a templating library like Handlebars.js:

```javascript
// With Handlebars
const template = Handlebars.compile(templateString);
const html = template(data);
```

## Best Practices

### 1. Component Organization

- Keep components focused on a single responsibility
- Use descriptive names and consistent folder structure
- Document component APIs and events

### 2. Template Variables

- Use UPPERCASE for template variables
- Provide default values where appropriate
- Document all available variables

### 3. JavaScript APIs

- Expose component APIs through window objects
- Use consistent naming conventions
- Implement proper error handling

### 4. CSS Classes

- Use component-specific class prefixes
- Follow BEM naming convention
- Ensure components are self-contained

### 5. Events

- Use custom events for component communication
- Follow consistent event naming (component:action)
- Provide relevant event data

## Migration Guide

### From Original Pages

1. **Identify repeated sections** in your HTML
2. **Extract to components** following the structure
3. **Replace with component includes** in pages
4. **Update JavaScript** to use component APIs
5. **Test functionality** thoroughly

### Example Migration

**Before:**
```html
<!-- Repeated in multiple pages -->
<div class="floating-menu">
    <button class="floating-menu-btn">...</button>
    <!-- ... menu content ... -->
</div>
<script>
    // Repeated menu logic
</script>
```

**After:**
```html
<!-- In page -->
<div id="menu-container"></div>
<script>
    loadComponent('/components/navigation/floating-menu.html', 'menu-container');
</script>
```

## Future Enhancements

### 1. Build System Integration

- Implement component preprocessing
- Optimize component loading
- Bundle components for production

### 2. Advanced Templating

- Implement server-side rendering
- Add template compilation
- Support for partials and helpers

### 3. Component Registry

- Create component discovery system
- Implement version management
- Add dependency tracking

### 4. Testing

- Add component unit tests
- Implement integration testing
- Create visual regression tests

This component system provides a solid foundation for maintainable, reusable HTML components that can scale with your application needs.