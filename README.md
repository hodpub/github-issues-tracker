# GitHub Issues Tracker

A simple, privacy-focused web app to view GitHub issues and pull requests across multiple repositories in a unified dashboard. **100% client-side** - no server, no data collection, no tracking.

## Features

### Views & Organization
- 🏊 **Two view modes**: By Repository (swimlane per repo) or By Type (swimlanes for PRs, bugs, features, tasks)
- 📋 Collapsible sections for better navigation
- 🔍 View issues and PRs from multiple repositories simultaneously
- 📅 **Issue dates displayed**: Created and last updated dates on each card
- 🎨 **Color-coded counts**: 
  - Bugs: Red when present (>0), green when none (=0)
  - PRs: Purple when present (>0)

### Issue Management
- 🐛 **Automatic classification**: Bugs, features, tasks based on types and labels
- 🎯 Milestone support with progress tracking
- 💬 **Inline issue details**: View full issue body and comments without leaving the page
- 🔀 PRs open directly on GitHub for detailed code review
- 🔗 **Sorted by type**: Issues organized by bug/feature/task priority

### Performance & Caching
- ⚡ **1-hour intelligent cache** to reduce API calls and stay within rate limits
- 📊 **Cache status panel**: Collapsible view showing cache age and expiration per repository
- 🔄 **Force refresh option**: Bypass cache when you need fresh data
- 🗑️ **Manual cache control**: Clear cache button for complete reset

### Integration
- 🌐 **Query string support**: Share URLs with pre-configured repository lists
- 🔗 **Deep linking**: Direct access to specific repository combinations
- 📱 **Responsive design**: Works on desktop and mobile devices

## Usage

### Quick Start

Visit the [live demo](https://hodpub.github.io/github-issues-tracker/) or open `index.html` locally in your browser. No installation or build process required!

### Query String Parameters

You can specify repositories via URL for easy sharing:
- `?repos=owner/repo1,owner/repo2` (comma-separated)
- `?repos=owner/repo1|owner/repo2` (pipe-separated)

**Examples:**
- Multiple repos: `https://hodpub.github.io/github-issues-tracker/?repos=hodpub/coriolis-tgd,hodpub/invincible,fvtt-fria-ligan/vaesen-foundry-vtt`
- Single repo: `https://hodpub.github.io/github-issues-tracker/?repos=hodpub/invincible`

The URL updates automatically when you load repositories, making it easy to bookmark or share specific configurations.

### View Modes

**By Repository** (`index.html`): Each repository gets its own swimlane showing all its issues and PRs together.

**By Type** (`by-type.html`): Issues and PRs are grouped across all repositories by type (PRs, Bugs, Features, Tasks, Other).

### GitHub Token

For higher rate limits (5000 requests/hour instead of 60) or to see issues from private repositories, provide a GitHub Personal Access Token with:
- `public_repo` scope for public repositories
- `repo` scope for private repositories

**🔒 Privacy Note**: Your token is stored only in your browser's localStorage and never sent to any server. All API calls go directly from your browser to GitHub.

## Privacy & Security

**This app is 100% client-side** - there is no backend server:
- ✅ **No data collection**: We don't collect, store, or transmit any of your data
- ✅ **No tracking**: No analytics, no cookies, no third-party scripts
- ✅ **Local storage only**: Your GitHub token and cached data stay in your browser's localStorage
- ✅ **Direct API calls**: All requests go directly from your browser to GitHub's API
- ✅ **Open source**: Full source code available for inspection
- ✅ **No accounts**: No sign-up, no login, no personal information required

Your privacy is protected because the app runs entirely in your browser. When you close the tab, nothing persists except the localStorage cache (which you can clear at any time).

### Caching

The app automatically caches repository data for **1 hour** in your browser's localStorage to:
- Reduce GitHub API calls
- Stay within rate limits (60 requests/hour without token, 5000 with token)
- Speed up repeated page loads
- Work offline with recently loaded data

**Cache Controls:**
- **Force refresh** checkbox: Ignore cache and fetch fresh data
- **Clear Cache** button: Manually clear all cached data
- **Cache status panel**: Shows per-repository cache age and expiration time (click to expand/collapse)

## Technical Details

- **Pure vanilla JavaScript** - No frameworks, no dependencies, no build step
- **Modern ES6 modules** - Clean, maintainable code structure
- **Responsive CSS** - Mobile-friendly design with flexbox
- **localStorage API** - Client-side caching for performance
- **GitHub REST API v3** - Direct integration with GitHub
- **Markdown rendering** - Preserves HTML in issue bodies and comments

## Browser Compatibility

Works in all modern browsers that support:
- ES6 modules
- localStorage
- Fetch API
- CSS Flexbox

## Contributing

Issues and pull requests are welcome! This is an open-source project maintained for the community.

## License

MIT - Feel free to use, modify, and distribute as you wish.
