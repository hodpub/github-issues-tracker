# GitHub Issues Viewer

A simple web app to view GitHub issues and pull requests across multiple repositories in a unified dashboard.

## Features

- 🔍 View issues and PRs from multiple repositories
- 🏊 Swimlane layout with one section per repository or by type
- 🐛 Automatic bug/feature/task classification
- 📋 Collapsible repository sections
- 💬 View issue details with comments inline
- 🔀 PRs open directly on GitHub for detailed review
- 🎯 Milestone support
- 🌐 Query string support for dynamic repo lists
- ⚡ **15-minute cache** to reduce GitHub API calls and stay within rate limits

## Usage

Visit the [live demo](https://hodpub.github.io/issues-viewer/) or open `index.html` locally.

### Query String Parameters

You can specify repositories via URL:
- `?repos=owner/repo1,owner/repo2` (comma-separated)
- `?repos=owner/repo1|owner/repo2` (pipe-separated)

Example: `https://hodpub.github.io/issues-viewer/?repos=facebook/react,microsoft/vscode`

### GitHub Token

For higher rate limits (5000 requests/hour instead of 60), provide a GitHub Personal Access Token with:
- `public_repo` scope for public repositories
- `repo` scope for private repositories

### Caching

The app automatically caches repository data for **15 minutes** in your browser's localStorage to:
- Reduce GitHub API calls
- Stay within rate limits (60 requests/hour without token, 5000 with token)
- Speed up repeated page loads

**Cache Controls:**
- **Force refresh** checkbox: Ignore cache and fetch fresh data
- **Clear Cache** button: Manually clear all cached data
- Cache status shows how many repositories are cached

## Deploy to GitHub Pages

1. Push this repository to GitHub
2. Go to Settings → Pages
3. Set source to "main" branch, root directory
4. Your site will be available at `https://hodpub.github.io/issues-viewer/`

## License

MIT
