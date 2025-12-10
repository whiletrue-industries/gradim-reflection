# DevOps and Deployment

## Deployment Overview

GraDiM Reflections uses GitHub Actions for continuous deployment to GitHub Pages. Every push to the `main` branch triggers an automated build and deployment process.

## GitHub Pages Configuration

### Repository Settings
1. Navigate to repository Settings > Pages
2. Source: Deploy from a branch
3. Branch: `gh-pages` / `root`
4. Custom domain (optional): Configure if needed

### Workflow Permissions
The GitHub Actions workflow requires these permissions:
- `contents: write` - To push to gh-pages branch
- `pages: write` - To deploy to GitHub Pages
- `id-token: write` - For deployment authentication

These are configured in `.github/workflows/deploy.yml`

## CI/CD Pipeline

### Workflow File
Location: `.github/workflows/deploy.yml`

### Trigger
```yaml
on:
  push:
    branches:
      - main
```

The workflow runs automatically on every push to the main branch.

### Build Steps

1. **Checkout Code**
   ```yaml
   - uses: actions/checkout@v4
   ```

2. **Setup Node.js**
   ```yaml
   - uses: actions/setup-node@v4
     with:
       node-version: '24'
       cache: 'npm'
   ```

3. **Install Dependencies**
   ```bash
   npm ci
   ```
   Uses `npm ci` for faster, reproducible installs.

4. **Build Common Library**
   ```bash
   npm run build -- common
   ```

5. **Build Applications**
   ```bash
   npm run build -- main --configuration production
   npm run build -- sample-reflect --configuration production
   ```

6. **Prepare Deployment Directory**
   ```bash
   mkdir -p deploy
   cp -r dist/main/browser/* deploy/
   mkdir -p deploy/sample-reflect
   cp -r dist/sample-reflect/browser/* deploy/sample-reflect/
   ```

7. **Deploy to GitHub Pages**
   ```yaml
   - uses: peaceiris/actions-gh-pages@v4
     with:
       github_token: ${{ secrets.GITHUB_TOKEN }}
       publish_dir: ./deploy
       publish_branch: gh-pages
   ```

## Deployment Structure

### Output Directory Structure
```
deploy/
├── index.html                 # Main app entry point
├── favicon.ico
├── *.js                       # Main app JavaScript bundles
├── *.css                      # Main app stylesheets
├── assets/                    # Main app assets
└── sample-reflect/
    ├── index.html            # Sample-reflect entry point
    ├── *.js                  # Sample-reflect bundles
    ├── *.css                 # Sample-reflect stylesheets
    └── assets/               # Sample-reflect assets
```

### Live URLs
After deployment, applications are accessible at:
- Main app: `https://<org>.github.io/<repo>/`
- Sample-reflect: `https://<org>.github.io/<repo>/sample-reflect/`

## Build Configuration

### Production Settings (`angular.json`)

Both applications use these production settings:

```json
"production": {
  "budgets": [...],
  "outputHashing": "all",
  "outputMode": "static",
  "server": false,
  "ssr": false,
  "baseHref": "/",              // Main app
  "baseHref": "/sample-reflect/", // Inner apps
  "outputPath": "dist/[app]/browser"
}
```

**Key Settings:**
- `outputMode: "static"` - Static site generation (no SSR)
- `server: false` - Disable server bundle
- `ssr: false` - Disable server-side rendering
- `outputHashing: "all"` - Cache busting for all files
- `baseHref` - Correct paths for GitHub Pages subdirectories

## Manual Deployment

### Local Production Build
```bash
# Build all components
npm run build -- common
npm run build -- main --configuration production
npm run build -- sample-reflect --configuration production

# Prepare deployment directory
mkdir -p deploy
cp -r dist/main/browser/* deploy/
mkdir -p deploy/sample-reflect
cp -r dist/sample-reflect/browser/* deploy/sample-reflect/
```

### Deploy to GitHub Pages Manually
```bash
# Install gh-pages package (if not already installed)
npm install -g gh-pages

# Deploy
gh-pages -d deploy -b gh-pages
```

## Monitoring and Logs

### Workflow Status
- Check workflow runs: GitHub repository > Actions tab
- View detailed logs for each step
- Download artifacts if needed

### Build Failures
Common causes:
1. **TypeScript errors** - Fix compilation errors
2. **Missing dependencies** - Ensure package.json is up to date
3. **LESS compilation errors** - Check import paths
4. **Budget exceeded** - Optimize bundle size or adjust budgets

### Debugging Failed Deployments
1. Check Actions tab for error messages
2. Review build logs for specific errors
3. Test production build locally:
   ```bash
   npm run build -- main --configuration production
   ```
4. Serve locally to verify:
   ```bash
   npx http-server dist/main/browser -p 8080
   ```

## Performance Optimization

### Bundle Size Budgets
Configured in `angular.json`:
```json
"budgets": [
  {
    "type": "initial",
    "maximumWarning": "500kB",
    "maximumError": "1MB"
  },
  {
    "type": "anyComponentStyle",
    "maximumWarning": "4kB",
    "maximumError": "8kB"
  }
]
```

### Optimization Strategies
1. **Lazy loading** - Already implemented for inner apps
2. **Tree shaking** - Automatic with production builds
3. **Minification** - Automatic with production builds
4. **Compression** - Consider enabling gzip on server
5. **Image optimization** - Use Angular's NgOptimizedImage

## Rollback Procedures

### Rollback to Previous Version
1. Navigate to Actions > Workflows > Successful run
2. Note the commit hash
3. Create a revert commit or reset:
   ```bash
   git revert <commit-hash>
   git push origin main
   ```
   The workflow will automatically redeploy.

### Manual Rollback
1. Checkout previous version:
   ```bash
   git checkout <previous-commit-hash>
   ```
2. Build and deploy manually
3. Or create a new commit from that state

## Environment-Specific Configuration

### Current Setup
All configuration is in `angular.json` under the `production` configuration.

### Future Enhancement: Environment Files
Consider adding environment-specific files:

```typescript
// projects/main/src/environments/environment.ts
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000',
  appBaseUrl: 'http://localhost:4200'
};
```

```typescript
// projects/main/src/environments/environment.prod.ts
export const environment = {
  production: true,
  apiUrl: 'https://api.gradim.org',
  appBaseUrl: 'https://org.github.io/repo'
};
```

Then configure file replacements in `angular.json`:
```json
"production": {
  "fileReplacements": [
    {
      "replace": "projects/main/src/environments/environment.ts",
      "with": "projects/main/src/environments/environment.prod.ts"
    }
  ]
}
```

## Security

### Secrets Management
- `GITHUB_TOKEN` is automatically provided by GitHub Actions
- No additional secrets currently required
- If adding API keys, use GitHub Secrets:
  1. Settings > Secrets and variables > Actions
  2. Add new repository secret
  3. Reference in workflow: `${{ secrets.SECRET_NAME }}`

### Content Security Policy
Consider adding CSP headers for production:
- Configure in GitHub Pages settings if using custom domain
- Or add meta tag to index.html

## Adding New Applications

When adding a new inner application to the deployment:

1. **Update angular.json:**
   - Add production configuration with correct `baseHref`
   - Set `outputMode: "static"`, `server: false`, `ssr: false`

2. **Update deploy.yml:**
   ```yaml
   - name: Build new-app
     run: npm run build -- new-app --configuration production

   - name: Prepare deployment directory
     run: |
       # ... existing steps ...
       mkdir -p deploy/new-app
       cp -r dist/new-app/browser/* deploy/new-app/
   ```

3. **Test locally** before pushing to main

## Maintenance

### Dependencies Update
```bash
# Check for outdated packages
npm outdated

# Update Angular
ng update @angular/core @angular/cli

# Update other dependencies
npm update
```

### Regular Tasks
- Monthly: Review and update dependencies
- Quarterly: Audit security vulnerabilities (`npm audit`)
- Review build budgets and adjust if needed
- Monitor GitHub Actions usage (included in GitHub plan)

## Troubleshooting

### "Build failed" in Actions
- Check the logs in Actions tab
- Look for TypeScript, LESS, or bundling errors
- Test the build locally first

### "Page not found" after deployment
- Verify baseHref is correct in angular.json
- Check that files are in correct directories in gh-pages branch
- Ensure GitHub Pages is enabled in repository settings

### Assets not loading
- Check baseHref configuration
- Verify asset paths are relative
- Check browser console for 404 errors

### Workflow not triggering
- Verify you pushed to the `main` branch
- Check if workflow file has YAML syntax errors
- Verify repository has Actions enabled
