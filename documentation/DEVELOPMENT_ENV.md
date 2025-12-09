# Development Environment Setup

## Prerequisites

### Required Software
- **Node.js:** Version 24.x
- **npm:** Version 11.x (comes with Node.js)
- **Git:** Latest version

### Recommended Tools
- **IDE:** VSCode with Angular Language Service extension
- **Browser:** Chrome or Edge with Angular DevTools extension

## Initial Setup

### 1. Clone the Repository
```bash
git clone https://github.com/whiletrue-industries/gradim-reflection.git
cd gradim-reflection
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Build Common Library
The common library must be built before running the applications:
```bash
npm run build -- common
```

**Note:** Rebuild the common library after making changes to it:
```bash
npm run build -- common
```

## Running the Applications

### Development Server

#### Main Application
```bash
npm start
```
or
```bash
ng serve main
```

The main app will be available at `http://localhost:4200`

#### Sample-Reflect Application (Standalone)
```bash
ng serve sample-reflect
```

The sample-reflect app will be available at `http://localhost:4200`

#### Accessing Inner Apps in Development Mode
When running the main app, inner apps are accessible via routes:
- Main app: `http://localhost:4200`
- Sample-reflect (via main app): `http://localhost:4200/sample-reflect`

### Building for Production

#### Build All Applications
```bash
# Build common library
npm run build -- common

# Build main app
npm run build -- main --configuration production

# Build sample-reflect app
npm run build -- sample-reflect --configuration production
```

#### Production Build Output
- Main app: `dist/main/browser/`
- Sample-reflect: `dist/sample-reflect/browser/`

### Serve Production Build Locally
```bash
# Install a static server (if not already installed)
npm install -g http-server

# Serve the main app
cd dist/main/browser
http-server -p 8080

# Serve sample-reflect app (in a new terminal)
cd dist/sample-reflect/browser
http-server -p 8081
```

## Development Workflow

### Making Changes to Common Library

1. Edit files in `projects/common/src/`
2. Rebuild the library: `npm run build -- common`
3. Restart the development server to see changes

### Adding a New Inner Application

1. Generate the application:
```bash
ng generate application my-new-app
```

2. Import Layout and common styles:
```typescript
// projects/my-new-app/src/app/app.ts
import { Layout } from 'common';

@Component({
  imports: [Layout, ...],
  // ...
})
```

```less
// projects/my-new-app/src/styles.less
@import '../../common/src/styles/global.less';
```

3. Add route in main app:
```typescript
// projects/main/src/app/app.routes.ts
{
  path: 'my-new-app',
  loadComponent: () => import('../../../my-new-app/src/app/app').then(m => m.App)
}
```

4. Configure production build in `angular.json`:
- Add `baseHref: "/my-new-app/"`
- Set `outputMode: "static"`
- Set `server: false` and `ssr: false`

5. Update deployment workflow in `.github/workflows/deploy.yml`

### Working with LESS Styles

#### Component Styles
Import `common.less` to access variables and mixins:
```less
@import '../../../common/src/styles/common.less';

.my-component {
  color: @color-primary;
  padding: @spacing-md;
  .flex-center();
}
```

#### Global Styles
App-level `styles.less` files should import `global.less`:
```less
@import '../../common/src/styles/global.less';
```

### Testing

Run unit tests with Vitest:
```bash
npm test
```

## Common Issues and Solutions

### Issue: "Cannot find module 'common'"

**Solution:** Build the common library:
```bash
npm run build -- common
```

### Issue: Changes to common library not reflected

**Solution:** Rebuild the common library and restart dev server:
```bash
npm run build -- common
# Then restart ng serve
```

### Issue: LESS import errors

**Solution:** Ensure you're using relative paths from the component file:
```less
// Correct
@import '../../../common/src/styles/common.less';

// Incorrect
@import 'common/src/styles/common.less';
```

### Issue: Production build fails

**Solution:** Check that `outputMode`, `server`, and `ssr` are correctly configured in `angular.json`:
```json
"production": {
  "outputMode": "static",
  "server": false,
  "ssr": false
}
```

## IDE Configuration

### VSCode Recommended Extensions
- Angular Language Service
- ESLint
- Prettier
- LESS IntelliSense

### VSCode Settings
Create `.vscode/settings.json`:
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[html]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[less]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

## Environment Variables

Currently, the project uses Angular's environment files for configuration.

### Future Enhancement
Consider adding environment-specific configuration:
- `projects/main/src/environments/environment.ts` (development)
- `projects/main/src/environments/environment.prod.ts` (production)

## Browser DevTools

### Angular DevTools
Install the Angular DevTools browser extension for:
- Component inspection
- Dependency injection debugging
- Performance profiling

### Debugging in VSCode
Create `.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "chrome",
      "request": "launch",
      "name": "Launch Chrome against localhost",
      "url": "http://localhost:4200",
      "webRoot": "${workspaceFolder}"
    }
  ]
}
```

## Performance Tips

1. **Watch mode for common library:** When actively developing the common library, use watch mode:
```bash
ng build common --watch
```

2. **Parallel development:** Run multiple dev servers in separate terminals

3. **Production builds:** Always test production builds locally before deploying

## Getting Help

- **Angular Documentation:** https://angular.dev
- **Project Issues:** GitHub Issues
- **Code Review:** Follow the project's contribution guidelines
