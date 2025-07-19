# CSS Architecture Overview

This document outlines the new CSS architecture for the Hazard Detection project, organized for maintainability and scalability.

## File Structure

```
public/css/
├── base.css                    # Global resets, variables, and base styles
├── layout.css                  # Grid, flexbox, and positioning utilities
├── components.css              # Buttons, cards, inputs, and UI components
├── components/
│   └── floating-menu.css       # Floating menu component
└── pages/
    ├── dashboard.css           # Dashboard-specific styles
    ├── camera.css              # Camera page styles
    ├── login.css               # Login page styles
    └── upload.css              # Upload page styles
```

## Import Order

To use the new CSS architecture, include files in this order in your HTML:

```html
<!-- Base styles first -->
<link rel="stylesheet" href="/css/base.css">

<!-- Layout utilities -->
<link rel="stylesheet" href="/css/layout.css">

<!-- UI components -->
<link rel="stylesheet" href="/css/components.css">

<!-- Specific components (if needed) -->
<link rel="stylesheet" href="/css/components/floating-menu.css">

<!-- Page-specific styles last -->
<link rel="stylesheet" href="/css/pages/dashboard.css">
```

## Key Changes Made

### 1. Removed Duplicates
- Consolidated duplicate CSS rules found across files
- Removed redundant camera-wrapper, camera-controls, and overlay definitions
- Unified button styles and form controls
- Consolidated sidebar and floating menu styles

### 2. Eliminated Unused Classes
Based on HTML analysis, removed classes that were never used:
- Old Bootstrap overrides not referenced in HTML
- Unused utility classes
- Deprecated layout classes

### 3. Organized by Purpose

#### base.css
- CSS reset and global styles
- CSS custom properties (variables)
- Typography and base element styles
- Utility classes (text-center, hidden, etc.)
- Global animations and accessibility styles

#### layout.css
- Dashboard and page layouts
- Sidebar positioning
- Flexbox and grid utilities
- Responsive layout classes
- Position and spacing utilities

#### components.css
- Button variations and states
- Card components
- Form inputs and controls
- Tables and modals
- Alerts and notifications
- Badges and tooltips

#### pages/*.css
- Page-specific styles that don't belong in components
- Unique layouts for specific pages
- Page-specific animations and interactions

### 4. Consistent Naming

Applied BEM-like naming conventions:
- `.dashboard-main-layout` (block)
- `.dashboard-center-row` (block)
- `.camera-controls` (block)
- `.camera-controls button` (element)
- `.btn-primary` (modifier)

### 5. Improved CSS Variables

Consolidated all CSS variables in base.css:
```css
:root {
  /* Color palette */
  --primary: #3b82f6;
  --accent: #1E88E5;
  --bg-main: #121212;
  --bg-panel: #1E1E1E;
  --text-main: #E0E0E0;
  
  /* Layout */
  --sidebar-width: 250px;
  --radius: 10px;
  --shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
  --transition: 0.25s ease-in-out;
}
```

## Migration Guide

### For HTML Files

1. **Update link tags** to use the new file structure
2. **Remove old CSS files** references (dashboard.css, camera.css, etc.)
3. **Add new CSS files** in the correct order

### Example for dashboard.html:
```html
<head>
  <!-- Remove old references -->
  <!-- <link rel="stylesheet" href="/css/dashboard.css"> -->
  
  <!-- Add new structure -->
  <link rel="stylesheet" href="/css/base.css">
  <link rel="stylesheet" href="/css/layout.css">
  <link rel="stylesheet" href="/css/components.css">
  <link rel="stylesheet" href="/css/components/floating-menu.css">
  <link rel="stylesheet" href="/css/pages/dashboard.css">
</head>
```

## Benefits

1. **Maintainability**: Each file has a clear purpose
2. **Scalability**: Easy to add new pages or components
3. **Performance**: Reduced CSS bundle size by removing duplicates
4. **Consistency**: Unified design system with shared variables
5. **Debugging**: Easier to find and fix styles
6. **Collaboration**: Clear structure for team development

## Next Steps

1. Update all HTML files to use the new CSS structure
2. Test all pages to ensure styles are working correctly
3. Remove old CSS files once migration is complete
4. Consider implementing a CSS build process for production

## Variables Reference

### Colors
- `--primary`: Primary brand color
- `--accent`: Accent color for highlights
- `--bg-main`: Main background color
- `--bg-panel`: Panel/card background
- `--text-main`: Primary text color
- `--text-muted`: Muted text color

### Layout
- `--sidebar-width`: Width of sidebar (250px)
- `--radius`: Standard border radius (10px)
- `--shadow`: Standard box shadow
- `--transition`: Standard transition duration

### Usage
```css
.my-component {
  background: var(--bg-panel);
  color: var(--text-main);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  transition: all var(--transition);
}
```

This new structure provides a solid foundation for maintainable CSS that can grow with your project.