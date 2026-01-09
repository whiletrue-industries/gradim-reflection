# Architecture

## Overview

GraDiM Reflections is an independent platform for interactive applications that reflect on the GraDiM archive. The platform consists of a main application that hosts a gallery of inner applications, with each inner app designed as a separate Angular application.

## System Components

### Main Application
- **Location:** `projects/main`
- **Purpose:** Hosts the gallery of inner apps, provides URL wrapper functionality, and manages navigation
- **Technology:** Angular 21 standalone application

**Features:**
- URL Wrapper: Displays external URLs in an iframe with an "Open in Canvas" button
  - Accessible at `/?url=<external-url>` (defaults to https://gradim-wall.netlify.app/)
  - Transitions to sample-reflect canvas with the URL as an input layer
  - Uses sessionStorage to pass URLs to avoid encoding issues with hash-based navigation

### Inner Applications
Inner apps are independent Angular applications that can be embedded within the main app:
- **sample-reflect** (`projects/sample-reflect`): Interactive canvas application for manipulating and composing visual content

Each inner app:
- Uses the shared `Layout` component from the common library
- Imports global styles from `common/src/styles/global.less`
- Communicates with parent app via iframe postMessage protocol (in production)

### Common Library
- **Location:** `projects/common`
- **Purpose:** Shared components, styles, and utilities
- **Type:** Angular library packaged with ng-packagr

**Contents:**
- `Layout` component: Wrapper for inner app content with iframe communication
- Design system (LESS files):
  - `common.less`: Variables and mixins for component imports
  - `global.less`: Global styles, reset, typography for app-level imports
  - `_variables.less`: Colors, spacing, typography, breakpoints
  - `_mixins.less`: Reusable LESS mixins
  - `_typography.less`: Text and heading styles
  - `_reset.less`: CSS reset and normalize

## Dual-Mode Architecture

The platform operates in two distinct modes:

### Development Mode
- **Navigation:** Direct routing within the main app
- **Integration:** Inner apps loaded as lazy-loaded Angular components
- **Route Example:** `/sample-reflect` loads the sample-reflect App component directly
- **Benefits:**
  - Fast development iteration
  - Single development server
  - Shared state possible
  - Chrome DevTools work seamlessly

### Production Mode
- **Navigation:** Main app shows gallery/grid of available apps
- **Integration:** Each app deployed independently and embedded via iframe
- **Deployment Structure:**
  ```
  https://domain.com/              → Main app
  https://domain.com/sample-reflect/ → Sample-reflect app
  ```
- **Benefits:**
  - Complete isolation between apps
  - Independent deployment of each app
  - Security boundaries enforced
  - Each app can have different tech stack versions

## Parent/Child Communication Protocol

The `Layout` component implements the iframe communication protocol based on the standardized structure:

### Message Types

**From Child to Parent:**
- `APP_READY`: Sent when the child app initializes
- `DATA_UPDATE`: Send data to parent (image, metadata, etc.)
- `DATA_RESPONSE`: Response to data request from parent

**From Parent to Child:**
- `REQUEST_DATA`: Request current data from child
- `CONFIG_UPDATE`: Send configuration to child

### Data Structure
```typescript
{
  title?: string;
  description?: string;
  link?: string;
  imageUrl?: string;
  imageBlob?: Blob | null;
  metadata?: {
    itemsUsed?: string[];
    tags?: string[];
    userId?: string;
    username?: string;
    email?: string;
  };
}
```

## Data Flow

1. **Development Mode:**
   ```
   User → Main App → Router → Lazy-loaded Inner App Component
   ```

2. **Production Mode:**
   ```
   User → Main App → iframe → Inner App (separate origin)
           ↓
   postMessage communication
   ```

## Build and Deployment

### Build Process
1. Build common library: `npm run build -- common`
2. Build main app: `npm run build -- main --configuration production`
3. Build each inner app: `npm run build -- [app-name] --configuration production`

### Production Configuration
- **Output Mode:** Static (no SSR)
- **Main App:**
  - Output: `dist/main/browser/`
  - Base href: `/`
- **Inner Apps:**
  - Output: `dist/[app-name]/browser/`
  - Base href: `/[app-name]/`

### Deployment Structure
```
deploy/
├── index.html                 (main app)
├── assets/                    (main app assets)
├── *.js, *.css               (main app bundles)
└── sample-reflect/
    ├── index.html            (sample-reflect app)
    ├── assets/               (sample-reflect assets)
    └── *.js, *.css          (sample-reflect bundles)
```

### CI/CD Pipeline
GitHub Actions workflow (`.github/workflows/deploy.yml`):
1. Checkout code
2. Setup Node.js 24
3. Install dependencies
4. Build common library
5. Build all applications
6. Combine outputs into deployment directory
7. Deploy to `gh-pages` branch

## Security Considerations

### iframe Security
- Origin validation required for production postMessage communication
- Content Security Policy (CSP) should be configured
- Each app runs in isolated context

### Recommendations
1. Configure allowed origins in environment files
2. Validate all postMessage events
3. Sanitize user-generated content
4. Implement CORS policies for API calls

## Future Extensibility

### Adding New Inner Apps
1. Generate new Angular application: `ng generate application [app-name]`
2. Add route in main app's `app.routes.ts`
3. Configure production build in `angular.json`
4. Update deployment workflow
5. Import Layout component and common styles

### Scaling Considerations
- Each inner app is independently deployable
- Apps can use different Angular versions (if needed)
- Shared library updates require rebuilding all apps
- Consider versioning strategy for common library
