// GitHub API configuration
const GITHUB_API_BASE = 'https://api.github.com';

// Cache configuration (1 hour default)
const CACHE_DURATION_MS = 60 * 60 * 1000;
const CACHE_KEY_PREFIX = 'github_cache_';

// State
let githubToken = '';

/**
 * Get repositories from query string
 */
export function getRepositoriesFromQueryString() {
    const params = new URLSearchParams(window.location.search);
    const reposParam = params.get('repos');
    
    if (reposParam) {
        return reposParam.split(/[,|]/).map(r => r.trim()).filter(r => r);
    }
    
    return null;
}

/**
 * Set the GitHub token
 */
export function setGitHubToken(token) {
    githubToken = token;
}

/**
 * Generate a consistent color for a repository name
 */
export function getRepoColor(repoName) {
    // Better hash function with more distribution
    // Use golden ratio to spread values across the spectrum
    let hash = 0;
    for (let i = 0; i < repoName.length; i++) {
        const char = repoName.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    
    // Use golden ratio (0.618033988749895) for better distribution
    const goldenRatio = 0.618033988749895;
    const hue = (Math.abs(hash) * goldenRatio * 360) % 360;
    
    // Use high saturation and moderate lightness for vibrant colors
    // Return as HSL with moderate opacity for background
    return `hsla(${Math.round(hue)}, 80%, 60%, 0.25)`;
}

/**
 * Get the GitHub token
 */
export function getGitHubToken() {
    return githubToken;
}

/**
 * Fetch data from GitHub API
 */
export async function fetchGitHub(url) {
    const headers = {
        'Accept': 'application/vnd.github.v3+json'
    };

    if (githubToken) {
        headers['Authorization'] = `token ${githubToken}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }));
        
        // Show token section if rate limited or needs authentication
        if (response.status === 401 || response.status === 403) {
            const tokenSection = document.getElementById('tokenSection');
            const reposSection = document.getElementById('reposSection');
            
            if (tokenSection && reposSection) {
                tokenSection.style.display = 'block';
                reposSection.classList.remove('collapsed');
            }
        }
        
        throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
}

/**
 * Classify an item (issue or PR) as bug, feature, task, or other
 */
export function classifyItem(item, repo = null) {
    const labels = item.labels.map(label => 
        typeof label === 'string' ? label : label.name
    ).map(name => name.toLowerCase());

    let type = 'other';
    
    // Check for bug indicators
    if (labels.some(label => 
        label === 'bug' ||
        label === 'bugs' ||
        label.startsWith('bug:') ||
        label.startsWith('bug ') ||
        label.includes('defect') ||
        label.includes('error') ||
        label === 'fix' ||
        label.startsWith('fix:') ||
        label.startsWith('fix ')
    )) {
        type = 'bug';
    }
    // Check for feature indicators
    else if (labels.some(label => 
        label === 'feature' ||
        label === 'features' ||
        label.startsWith('feature:') ||
        label.startsWith('feature ') ||
        label === 'enhancement' ||
        label === 'enhancements' ||
        label.startsWith('enhancement:') ||
        label.startsWith('enhancement ') ||
        label === 'improvement' ||
        label.startsWith('improvement:') ||
        label.startsWith('improvement ') ||
        label === 'feat' ||
        label.startsWith('feat:') ||
        label.startsWith('feat ')
    )) {
        type = 'feature';
    }

    // Also check if the item has a type field (GitHub issue types)
    if (item.type && typeof item.type === 'object' && item.type.name) {
        const typeName = item.type.name.toLowerCase();
        if (typeName === 'bug') {
            type = 'bug';
        } else if (typeName === 'feature') {
            type = 'feature';
        } else if (typeName === 'task') {
            type = 'task';
        }
    }

    const result = {
        ...item,
        type
    };

    if (repo) {
        result.repoName = repo;
    }

    return result;
}

/**
 * Get cached data for a repository
 */
function getCachedData(repo, openOnly) {
    const cacheKey = `${CACHE_KEY_PREFIX}${repo}_${openOnly ? 'open' : 'all'}`;
    try {
        const cached = localStorage.getItem(cacheKey);
        if (!cached) return null;
        
        const { data, timestamp } = JSON.parse(cached);
        const age = Date.now() - timestamp;
        
        // Return cached data if still fresh
        if (age < CACHE_DURATION_MS) {
            console.log(`Using cached data for ${repo} (${Math.round(age / 1000)}s old)`);
            // Add cache metadata to the result
            return { ...data, _cacheTimestamp: timestamp, _fromCache: true };
        }
        
        // Cache expired
        localStorage.removeItem(cacheKey);
        return null;
    } catch (error) {
        console.error('Cache read error:', error);
        return null;
    }
}

/**
 * Store data in cache
 */
function setCachedData(repo, openOnly, data) {
    const cacheKey = `${CACHE_KEY_PREFIX}${repo}_${openOnly ? 'open' : 'all'}`;
    try {
        const cacheEntry = {
            data,
            timestamp: Date.now()
        };
        localStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
    } catch (error) {
        console.error('Cache write error:', error);
    }
}

/**
 * Clear all cached repository data
 */
export function clearCache(repos = null) {
    try {
        const keys = Object.keys(localStorage);
        let cacheKeys;
        
        if (repos && repos.length > 0) {
            // Clear cache only for specific repositories
            cacheKeys = keys.filter(key => {
                if (!key.startsWith(CACHE_KEY_PREFIX)) return false;
                return repos.some(repo => key.includes(`${CACHE_KEY_PREFIX}${repo}_`));
            });
        } else {
            // Clear all cache
            cacheKeys = keys.filter(key => key.startsWith(CACHE_KEY_PREFIX));
        }
        
        cacheKeys.forEach(key => localStorage.removeItem(key));
        console.log(`Cleared ${cacheKeys.length} cached repositories`);
        return cacheKeys.length;
    } catch (error) {
        console.error('Cache clear error:', error);
        return 0;
    }
}

/**
 * Fetch all issues and PRs for a repository
 */
export async function fetchRepositoryData(repo, openOnly = false) {
    const [owner, repoName] = repo.split('/');
    
    // Check cache first
    const cached = getCachedData(repo, openOnly);
    if (cached) {
        console.log(`Using cache for ${repo}`);
        return cached;
    }
    
    console.log(`Fetching fresh data for ${repo}`);
    try {
        const state = openOnly ? 'open' : 'all';
        const issuesAndPRsUrl = `${GITHUB_API_BASE}/repos/${owner}/${repoName}/issues?state=${state}&per_page=100`;
        const issuesAndPRs = await fetchGitHub(issuesAndPRsUrl);

        // Separate issues from pull requests
        const issues = issuesAndPRs.filter(item => !item.pull_request);
        const pullRequests = issuesAndPRs.filter(item => item.pull_request);

        const result = {
            repo,
            owner,
            repoName,
            issues: issues.map(item => classifyItem(item, repo)),
            pullRequests: pullRequests.map(item => classifyItem(item, repo)),
            success: true
        };
        
        // Cache the successful result
        setCachedData(repo, openOnly, result);
        
        return result;
    } catch (error) {
        console.error(`Error fetching ${repo}:`, error);
        return {
            repo,
            owner,
            repoName,
            issues: [],
            pullRequests: [],
            success: false,
            error: error.message
        };
    }
}

/**
 * Calculate contrast color (black or white) based on background color
 */
export function getContrastColor(hexColor) {
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000000' : '#ffffff';
}

/**
 * Show error message
 */
export function showError(message) {
    const errorContainer = document.getElementById('error-container');
    if (!errorContainer) return;
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error';
    errorDiv.innerHTML = `
        <div class="error-content">
            <div class="error-message">${message}</div>
            <button onclick="this.parentElement.parentElement.remove()" class="error-close-btn">&times;</button>
        </div>
    `;
    errorContainer.innerHTML = '';
    errorContainer.appendChild(errorDiv);
}

/**
 * Escape HTML to prevent XSS
 */
export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Format reactions for display
 */
export function formatReactions(reactions) {
    if (!reactions) return '';
    
    const reactionMap = [
        { key: '+1', emoji: '👍', label: 'thumbs up' },
        { key: '-1', emoji: '👎', label: 'thumbs down' },
        { key: 'laugh', emoji: '😄', label: 'laugh' },
        { key: 'hooray', emoji: '🎉', label: 'hooray' },
        { key: 'confused', emoji: '😕', label: 'confused' },
        { key: 'heart', emoji: '❤️', label: 'heart' },
        { key: 'rocket', emoji: '🚀', label: 'rocket' },
        { key: 'eyes', emoji: '👀', label: 'eyes' }
    ];
    
    const reactionElements = reactionMap
        .filter(r => reactions[r.key] && reactions[r.key] > 0)
        .map(r => `<span class="interaction-metric" title="${r.label}">${r.emoji} ${reactions[r.key]}</span>`);
    
    if (reactionElements.length === 0) return '';
    
    return `<span class="reactions">${reactionElements.join('')}</span>`;
}

/**
 * Get total reactions count for an item
 */
export function getTotalReactions(reactions) {
    if (!reactions) return 0;
    
    const keys = ['+1', '-1', 'laugh', 'hooray', 'confused', 'heart', 'rocket', 'eyes'];
    return keys.reduce((total, key) => total + (reactions[key] || 0), 0);
}

/**
 * Update view switcher links to preserve current repos parameter
 */
function updateViewSwitcherLinks() {
    const params = new URLSearchParams(window.location.search);
    const repos = params.get('repos');
    
    if (repos) {
        const viewSwitcher = document.querySelector('.view-switcher');
        if (viewSwitcher) {
            const byRepoLink = viewSwitcher.querySelector('a[href="index.html"]');
            const byTypeLink = viewSwitcher.querySelector('a[href="by-type.html"]');
            
            if (byRepoLink) {
                byRepoLink.href = `index.html?repos=${encodeURIComponent(repos)}`;
            }
            if (byTypeLink) {
                byTypeLink.href = `by-type.html?repos=${encodeURIComponent(repos)}`;
            }
        }
    }
}

/**
 * Delete a specific repository from cache
 */
function deleteRepoFromCache(repo) {
    const cacheKeysToDelete = [];
    
    // Find all cache keys for this repo
    Object.keys(localStorage).forEach(key => {
        if (key.startsWith(`${CACHE_KEY_PREFIX}${repo}_`)) {
            cacheKeysToDelete.push(key);
        }
    });
    
    if (cacheKeysToDelete.length === 0) {
        showError(`No cache found for ${repo}`);
        return;
    }
    
    // Delete the cache entries
    cacheKeysToDelete.forEach(key => localStorage.removeItem(key));
    
    // Also remove from the repos textarea
    const reposInput = document.getElementById('repos');
    if (reposInput) {
        const currentRepos = reposInput.value.split('\n')
            .map(line => line.trim())
            .filter(line => line && line.includes('/'));
        
        const filteredRepos = currentRepos.filter(r => r !== repo);
        reposInput.value = filteredRepos.join('\n');
        
        // Trigger input event to show change notice
        reposInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    
    // Show confirmation message briefly
    const cacheStatus = document.getElementById('cacheStatus');
    if (cacheStatus) {
        cacheStatus.innerHTML = `🗑️ Deleted cache for ${repo}`;
    }
    
    // Update cache status display immediately to remove the item
    setTimeout(() => {
        updateCacheStatus();
    }, 500);
}

/**
 * Add a repository to the repos list if it's not already there
 */
function addRepoToList(repo) {
    const reposInput = document.getElementById('repos');
    if (!reposInput) return;
    
    const currentRepos = reposInput.value.split('\n')
        .map(line => line.trim())
        .filter(line => line && line.includes('/'));
    
    // Toggle: remove if exists, add if not
    const repoIndex = currentRepos.indexOf(repo);
    let message;
    
    if (repoIndex !== -1) {
        // Remove the repo
        currentRepos.splice(repoIndex, 1);
        message = `➖ Removed ${repo} from list`;
    } else {
        // Add the repo
        currentRepos.push(repo);
        message = `✅ Added ${repo} to list`;
    }
    
    reposInput.value = currentRepos.join('\n');
    
    // Trigger input event to show change notice
    reposInput.dispatchEvent(new Event('input', { bubbles: true }));
    
    // Expand the config section if collapsed
    const reposSection = document.getElementById('reposSection');
    if (reposSection && reposSection.classList.contains('collapsed')) {
        reposSection.classList.remove('collapsed');
    }
    
    // Show toggle message
    const cacheStatus = document.getElementById('cacheStatus');
    if (cacheStatus) {
        const originalText = cacheStatus.innerHTML;
        cacheStatus.innerHTML = message;
        setTimeout(() => {
            cacheStatus.innerHTML = originalText;
        }, 2000);
    }
}

/**
 * Setup common UI handlers (repos toggle, token permissions toggle)
 */
export function setupCommonUI() {
    // Update view switcher links with current repos
    updateViewSwitcherLinks();
    
    // Toggle repos configuration section
    const reposToggle = document.getElementById('reposToggle');
    const reposSection = document.getElementById('reposSection');
    const reposInput = document.getElementById('repos');
    
    // Auto-expand config if only default repo is present
    if (reposSection && reposInput) {
        const currentRepos = reposInput.value.trim();
        const defaultRepo = 'hodpub/github-issues-tracker';
        
        // Check if repos is just the default (no URL params)
        const queryRepos = getRepositoriesFromQueryString();
        if (!queryRepos && currentRepos === defaultRepo) {
            reposSection.classList.remove('collapsed');
        }
    }
    
    if (reposToggle && reposSection) {
        reposToggle.addEventListener('click', () => {
            reposSection.classList.toggle('collapsed');
        });
    }

    // Toggle token permissions
    const permissionsToggle = document.getElementById('permissionsToggle');
    const permissionsContent = document.getElementById('permissionsContent');
    const permissionIcon = permissionsToggle?.querySelector('.permission-icon');
    
    if (permissionsToggle && permissionsContent) {
        permissionsToggle.addEventListener('click', () => {
            permissionsContent.classList.toggle('hidden');
            permissionIcon?.classList.toggle('collapsed');
        });
    }
    
    // Clear cache button
    const clearCacheBtn = document.getElementById('clearCacheBtn');
    const cacheStatus = document.getElementById('cacheStatus');
    
    if (clearCacheBtn && cacheStatus) {
        clearCacheBtn.addEventListener('click', () => {
            const count = clearCache();
            cacheStatus.textContent = `✓ Cleared ${count} cached repositories`;
            setTimeout(() => {
                cacheStatus.textContent = '';
            }, 3000);
        });
    }
    
    // Update cache status on page load
    updateCacheStatus();
}

/**
 * Update cache status display
 */
export function updateCacheStatus() {
    const cacheStatus = document.getElementById('cacheStatus');
    const cacheDetails = document.getElementById('cacheDetails');
    if (!cacheStatus) return;
    
    try {
        const keys = Object.keys(localStorage);
        const cacheKeys = keys.filter(key => key.startsWith(CACHE_KEY_PREFIX));
        
        if (cacheKeys.length > 0) {
            // Extract repository cache info
            const cacheInfo = cacheKeys.map(key => {
                try {
                    const match = key.match(/github_cache_(.+)_(open|all)$/);
                    if (!match) return null;
                    
                    const repo = match[1];
                    const type = match[2];
                    const cached = localStorage.getItem(key);
                    if (!cached) return null;
                    
                    const { timestamp } = JSON.parse(cached);
                    const ageMs = Date.now() - timestamp;
                    const ageMinutes = Math.floor(ageMs / 60000);
                    const ageSeconds = Math.floor((ageMs % 60000) / 1000);
                    const remainingMs = CACHE_DURATION_MS - ageMs;
                    const remainingMinutes = Math.max(0, Math.ceil(remainingMs / 60000));
                    
                    let timeAgo;
                    if (ageMinutes > 0) {
                        timeAgo = `${ageMinutes}m ${ageSeconds}s ago`;
                    } else {
                        timeAgo = `${ageSeconds}s ago`;
                    }
                    
                    return {
                        repo,
                        type,
                        timeAgo,
                        remainingMinutes,
                        expired: remainingMs <= 0
                    };
                } catch (e) {
                    return null;
                }
            }).filter(info => info && !info.expired).sort((a, b) => a.repo.localeCompare(b.repo));
            
            const uniqueRepos = [...new Set(cacheInfo.map(info => info.repo))].length;
            cacheStatus.innerHTML = `📦 ${uniqueRepos} repo${uniqueRepos !== 1 ? 's' : ''} cached (click to expand)`;
            
            // Setup click handler for toggling
            cacheStatus.onclick = () => {
                if (cacheDetails && cacheInfo.length > 0) {
                    const isVisible = cacheDetails.style.display !== 'none';
                    cacheDetails.style.display = isVisible ? 'none' : 'block';
                    cacheStatus.innerHTML = isVisible ? 
                        `📦 ${uniqueRepos} repo${uniqueRepos !== 1 ? 's' : ''} cached (click to expand)` :
                        `📦 ${uniqueRepos} repo${uniqueRepos !== 1 ? 's' : ''} cached (click to collapse)`;
                }
            };
            
            // Populate details panel
            if (cacheDetails) {
                cacheDetails.innerHTML = `
                    <div class="cache-tip">
                        💡 <strong>Tip:</strong> Left-click to toggle repo in list • Right-click to delete from cache
                    </div>
                ` + cacheInfo.map(info => `
                    <div class="cache-detail-item">
                        <span class="cache-repo-name" 
                              data-repo="${escapeHtml(info.repo)}"
                              title="Left-click to toggle in list • Right-click to delete from cache">
                            ${escapeHtml(info.repo)}
                        </span>
                        <span class="cache-detail-time">
                            ${info.timeAgo} • 
                            expires in ${info.remainingMinutes}m
                        </span>
                    </div>
                `).join('');
                
                // Add click handlers for repo names
                cacheDetails.querySelectorAll('.cache-repo-name').forEach(el => {
                    el.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const repo = el.dataset.repo;
                        addRepoToList(repo);
                    });
                    
                    // Add right-click handler to delete from cache
                    el.addEventListener('contextmenu', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const repo = el.dataset.repo;
                        deleteRepoFromCache(repo);
                    });
                });
            }
        } else {
            cacheStatus.textContent = 'No cached data';
            cacheStatus.onclick = null;
            if (cacheDetails) {
                cacheDetails.style.display = 'none';
                cacheDetails.innerHTML = '';
            }
        }
    } catch (error) {
        cacheStatus.textContent = 'No cached data';
        cacheStatus.onclick = null;
        if (cacheDetails) {
            cacheDetails.style.display = 'none';
            cacheDetails.innerHTML = '';
        }
    }
}

/**
 * Get cache age text for a repository
 */
export function getCacheAgeText(repoData) {
    if (!repoData._cacheTimestamp) return '';
    
    const ageMs = Date.now() - repoData._cacheTimestamp;
    const ageMinutes = Math.floor(ageMs / 60000);
    const ageSeconds = Math.floor((ageMs % 60000) / 1000);
    const remainingMs = CACHE_DURATION_MS - ageMs;
    const remainingMinutes = Math.max(0, Math.ceil(remainingMs / 60000));
    
    // If cache is expired, don't show it
    if (remainingMs <= 0) return '';
    
    let timeAgo;
    if (ageMinutes > 0) {
        timeAgo = `${ageMinutes}m ago`;
    } else {
        timeAgo = `${ageSeconds}s ago`;
    }
    
    return `📦 Cached ${timeAgo} (expires in ${remainingMinutes}m)`;
}

/**
 * Handle force refresh - clears cache if checkbox is checked
 */
export function handleForceRefresh(repos) {
    const forceRefresh = document.getElementById('forceRefresh');
    if (forceRefresh && forceRefresh.checked) {
        const clearedCount = clearCache(repos);
        console.log(`Force refresh: cleared ${clearedCount} cache entries for`, repos);
        // Uncheck the box after clearing
        forceRefresh.checked = false;
        return true;
    }
    return false;
}

/**
 * Get initial repositories (from query string or textarea)
 */
export function getInitialRepos() {
    const reposInput = document.getElementById('repos');
    if (!reposInput) return [];
    
    const queryRepos = getRepositoriesFromQueryString();
    
    if (queryRepos) {
        reposInput.value = queryRepos.join('\n');
        return queryRepos;
    }
    
    return reposInput.value.split('\n').map(line => line.trim()).filter(line => line && line.includes('/'));
}

/**
 * Setup load button handler
 */
export function setupLoadButton(onLoad) {
    const loadBtn = document.getElementById('loadBtn');
    const tokenInput = document.getElementById('token');
    const reposInput = document.getElementById('repos');
    const forceRefresh = document.getElementById('forceRefresh');
    
    let configChanged = false;

    // Load saved token from localStorage
    const savedToken = localStorage.getItem('githubToken');
    if (savedToken) {
        tokenInput.value = savedToken;
        setGitHubToken(savedToken);
    }
    
    // Track changes to repos textarea
    const showChangeNotice = () => {
        if (!configChanged) {
            configChanged = true;
            loadBtn.style.background = '#da3633';
            loadBtn.style.animation = 'pulse 2s infinite';
            loadBtn.textContent = '⚠️ Load Issues & PRs (Config Changed)';
        }
    };
    
    const hideChangeNotice = () => {
        configChanged = false;
        loadBtn.style.background = '';
        loadBtn.style.animation = '';
        loadBtn.textContent = 'Load Issues & PRs';
    };
    
    // Watch for changes in repos textarea
    reposInput.addEventListener('input', showChangeNotice);

    loadBtn.addEventListener('click', async () => {
        const token = tokenInput.value.trim();
        setGitHubToken(token);
        const reposText = reposInput.value.trim();

        // Save to localStorage
        localStorage.setItem('githubToken', token);
        localStorage.setItem('githubRepos', reposText);
        
        // Clear change notice
        hideChangeNotice();

        if (!reposText) {
            showError('Please enter at least one repository');
            return;
        }

        const repos = reposText.split('\n')
            .map(line => line.trim())
            .filter(line => line && line.includes('/'));

        if (repos.length === 0) {
            showError('Please enter valid repositories in format: owner/repo');
            return;
        }

        // Update URL with repos list (skip if only default repo)
        const defaultRepo = 'hodpub/github-issues-tracker';
        if (!(repos.length === 1 && repos[0] === defaultRepo)) {
            const url = new URL(window.location);
            url.searchParams.set('repos', repos.join(','));
            window.history.pushState({}, '', url);
            
            // Update view switcher links with new repos
            updateViewSwitcherLinks();
        }

        // Handle force refresh
        handleForceRefresh(repos);

        await onLoad(repos);
        
        // Update cache status after loading (with small delay to ensure cache writes complete)
        setTimeout(() => updateCacheStatus(), 100);
    });

    // Setup share button
    const shareBtn = document.getElementById('shareBtn');
    if (shareBtn) {
        shareBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(window.location.href);
                const originalText = shareBtn.innerHTML;
                shareBtn.innerHTML = '✅ Copied!';
                shareBtn.style.background = '#238636';
                setTimeout(() => {
                    shareBtn.innerHTML = originalText;
                }, 2000);
            } catch (err) {
                showError('Failed to copy URL to clipboard');
            }
        });
    }

    return { tokenInput, reposInput };
}

/**
 * Setup auto-load functionality for initial repos from URL
 * @param {Function} loadFunction - The async function to call with repos array
 */
export async function setupAutoLoad(loadFunction) {
    const initialRepos = getInitialRepos();
    if (initialRepos && initialRepos.length > 0) {
        // Update URL with initial repos (skip if only default repo)
        const defaultRepo = 'hodpub/github-issues-tracker';
        if (!(initialRepos.length === 1 && initialRepos[0] === defaultRepo)) {
            const url = new URL(window.location);
            url.searchParams.set('repos', initialRepos.join(','));
            window.history.replaceState({}, '', url);
        }
        
        // Auto-load
        await loadFunction(initialRepos);
        
        // Update cache status after loading (with small delay to ensure cache writes complete)
        setTimeout(() => updateCacheStatus(), 100);
    }
}

/**
 * Setup ad banner
 */
export function setupAdBanner(imageUrl = 'hodpub-ad.webp') {
    const adContainer = document.getElementById('hodpub-ad');
    const adImg = document.getElementById('hodpub-ad-img');
    
    if (!adContainer || !adImg) return;
    
    // Set image source
    adImg.src = imageUrl;
    
    // Hide container if image fails to load
    adImg.onerror = function() {
        adContainer.style.display = 'none';
    };
}

/**
 * Setup help panel
 */
export function setupHelpPanel() {
    const helpBtn = document.getElementById('helpBtn');
    const helpPanel = document.getElementById('helpPanel');
    const closeHelp = document.getElementById('closeHelp');
    const helpContent = document.getElementById('helpContent');
    
    if (!helpBtn || !helpPanel || !closeHelp || !helpContent) return;
    
    // Help content
    const helpHTML = `
        <div class="help-content-wrapper">
            <h2>📖 Quick Start Guide</h2>
            
            <section>
                <h3>🚀 Getting Started</h3>
                <ol>
                    <li><strong>Enter repositories</strong> in the format <code>owner/repo</code> (one per line)</li>
                    <li><strong>Optional (but required for private repos):</strong> Add a GitHub token for higher rate limits (5000/hour vs 60/hour) and to access private repositories</li>
                    <li>Click <strong>"Load Issues & PRs"</strong> to fetch data</li>
                    <li>Switch between <strong>"By Repository"</strong> and <strong>"By Type"</strong> views</li>
                </ol>
            </section>
            
            <section>
                <h3>🎯 Key Features</h3>
                <ul>
                    <li><strong>Click on any issue/PR card</strong> to view details inline</li>
                    <li><strong>PRs open directly on GitHub</strong> for code review</li>
                    <li><strong>Color coding:</strong> Bugs (🐛 red/green), PRs (🔀 purple when present)</li>
                    <li><strong>Automatic classification:</strong> Bugs, features, tasks based on labels</li>
                    <li><strong>1-hour caching</strong> to reduce API calls and stay within rate limits</li>
                </ul>
            </section>
            
            <section>
                <h3>💾 Cache Management</h3>
                <ul>
                    <li><strong>Click "📦 cached"</strong> to expand/collapse cache details</li>
                    <li><strong>Left-click</strong> a cached repo name to toggle it in your list</li>
                    <li><strong>Right-click</strong> a cached repo name to delete it from cache</li>
                    <li><strong>"Force refresh"</strong> checkbox bypasses cache for fresh data</li>
                    <li><strong>"Clear Cache"</strong> button removes all cached data</li>
                </ul>
            </section>
            
            <section>
                <h3>🔗 Sharing & URLs</h3>
                <ul>
                    <li><strong>URL auto-updates</strong> when you load repositories</li>
                    <li><strong>Share button (🔗)</strong> copies the current URL to clipboard</li>
                    <li><strong>Bookmark URLs</strong> to save your repository configurations</li>
                    <li><strong>URL format:</strong> <code>?repos=owner/repo1,owner/repo2</code></li>
                </ul>
            </section>
            
            <section>
                <h3>⚠️ Important Notes</h3>
                <ul>
                    <li><strong>Red pulsing Load button</strong> means config changed - click to reload</li>
                    <li><strong>100% client-side</strong> - no data sent to servers, all stays local</li>
                    <li><strong>Token stored locally</strong> in your browser only</li>
                    <li><strong>Private repos</strong> require a token with <code>repo</code> scope</li>
                    <li><strong>Optional analytics:</strong> First visit shows consent banner - only page views tracked if you accept (no personal data or repository names)</li>
                </ul>
            </section>
            
            <section>
                <h3>🎨 View Modes</h3>
                <ul>
                    <li><strong>By Repository:</strong> Each repo gets its own section showing all issues/PRs</li>
                    <li><strong>By Type:</strong> Issues grouped across all repos (PRs, Bugs, Features, Tasks)</li>
                </ul>
            </section>
            
            <section>
                <h3>👍 How to Upvote/React to Issues</h3>
                <ol>
                    <li>Click the <strong>↗️ arrow link</strong> next to the issue title, or click <strong>"View on GitHub"</strong> button at the bottom of the detail panel</li>
                    <li>This will open the issue on GitHub in a new tab</li>
                    <li>On the GitHub issue page, find the <strong>emoji reaction buttons</strong> at the bottom of the issue description</li>
                    <li>Click the emoji you want to add (👍 for upvote, ❤️ for heart, etc.)</li>
                    <li>Your reaction will be visible to everyone and counted in the reaction totals</li>
                </ol>
                <img src="assets/reaction-example.png" alt="GitHub reaction buttons example" class="help-image">
                <p><em>Note: You need to be logged into GitHub to add reactions. Reactions are public and associated with your GitHub account.</em></p>
            </section>
            
            <div class="help-pro-tip">
                <strong>💡 Pro Tip:</strong> Use the cache panel to quickly add/remove repos you've previously viewed!
            </div>
        </div>
    `;
    
    // Show help panel
    helpBtn.addEventListener('click', () => {
        helpContent.innerHTML = helpHTML;
        helpPanel.classList.add('open');
    });
    
    // Close help panel
    closeHelp.addEventListener('click', () => {
        helpPanel.classList.remove('open');
    });
    
    // React help button (if exists on page)
    const reactHelpBtn = document.getElementById('reactHelpBtn');
    if (reactHelpBtn) {
        reactHelpBtn.addEventListener('click', () => {
            helpContent.innerHTML = helpHTML;
            helpPanel.classList.add('open');
            // Scroll to the reactions section after a brief delay
            setTimeout(() => {
                const reactSection = helpContent.querySelector('h3');
                const sections = helpContent.querySelectorAll('h3');
                sections.forEach(section => {
                    if (section.textContent.includes('How to Upvote/React')) {
                        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                });
            }, 100);
        });
    }
}

/**
 * Format a date for display
 */
export function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

/**
 * Format markdown text with support for mixed HTML/Markdown
 */
export function formatMarkdown(text) {
    if (!text) return '';
    
    // Temporarily protect HTML tags from escaping (including multi-line tags)
    const htmlTags = [];
    let html = text.replace(/(<[^>]+>)/gs, (match) => {
        htmlTags.push(match);
        return `|||HTMLTAG${htmlTags.length - 1}|||`;
    });
    
    // Now escape the remaining text
    html = escapeHtml(html);
    
    // Code blocks with language
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
    
    // Inline code (must be before other formatting)
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>');
    
    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
    
    // Italic
    html = html.replace(/\*([^\*]+)\*/g, '<em>$1</em>');
    html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
    
    // Strikethrough
    html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');
    
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="md-link">$1 ↗️</a>');
    
    // Unordered lists
    html = html.replace(/^\* (.+)$/gm, '<li class="md-list-item">$1</li>');
    html = html.replace(/^- (.+)$/gm, '<li class="md-list-item">$1</li>');
    
    // Ordered lists
    html = html.replace(/^\d+\. (.+)$/gm, '<li class="md-list-item">$1</li>');
    
    // Wrap consecutive list items and remove extra newlines within lists
    html = html.replace(/(<li[\s\S]*?<\/li>\s*)+/g, (match) => {
        // Remove newlines between list items
        const cleanedList = match.replace(/\n/g, '');
        return '<ul class="md-list">' + cleanedList + '</ul>';
    });
    
    // Blockquotes
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote class="md-blockquote">$1</blockquote>');
    
    // Horizontal rules
    html = html.replace(/^---$/gm, '<hr class="md-hr">');
    
    // Restore HTML tags (must be before converting &lt; back)
    html = html.replace(/\|\|\|HTMLTAG(\d+)\|\|\|/g, (match, index) => htmlTags[parseInt(index)]);
    
    // Paragraphs - preserve double line breaks
    html = html.replace(/\n\n/g, '</p><p class="md-paragraph">');
    html = html.replace(/\n/g, '<br>');
    
    return '<p class="md-paragraph">' + html + '</p>';
}

/**
 * Render issue details to the DOM
 */
export function renderIssueDetails(issue, htmlUrl, iframeTitle, detailsContent) {
    iframeTitle.textContent = `#${issue.number} - ${issue.title}`;
    
    const createdDate = formatDate(issue.created_at);
    const updatedDate = formatDate(issue.updated_at);
    
    // Build HTML
    let html = `
        <div class="issue-detail-header">
            <div class="issue-detail-title">
                ${escapeHtml(issue.title)}
                <a href="${htmlUrl}" target="_blank" rel="noopener noreferrer" class="issue-detail-link" title="Open on GitHub">↗️</a>
            </div>
            <div class="issue-detail-meta">
                <span>${issue.state === 'open' ? '🟢' : '🔴'} ${issue.state}</span>
                <span>👤 ${escapeHtml(issue.user.login)}</span>
                <span>📅 Created: ${createdDate}</span>
                <span>🔄 Updated: ${updatedDate}</span>
                ${issue.milestone ? `<span>🎯 ${escapeHtml(issue.milestone.title)}</span>` : ''}
            </div>
            ${formatReactions(issue.reactions) ? `<div class="issue-detail-reactions">${formatReactions(issue.reactions)}</div>` : ''}
        </div>
        
        ${issue.body ? `
            <div class="issue-detail-body">
                ${formatMarkdown(issue.body)}
            </div>
        ` : '<div class="issue-detail-body issue-detail-empty"><em>No description provided.</em></div>'}
    `;
    
    html += `<a href="${htmlUrl}" target="_blank" rel="noopener noreferrer" class="view-on-github">View on GitHub ↗️</a>`;
    
    detailsContent.innerHTML = html;
}

/**
 * Analytics consent and initialization
 */
const ANALYTICS_CONSENT_KEY = 'github_issues_tracker_analytics_consent';

export function setupAnalyticsConsent() {
    const consentValue = localStorage.getItem(ANALYTICS_CONSENT_KEY);
    
    // If already decided, initialize analytics if accepted
    if (consentValue === 'accepted') {
        initializeAnalytics();
        return;
    } else if (consentValue === 'declined') {
        return; // User declined, do nothing
    }
    
    // Show consent banner
    const consentBanner = document.getElementById('analyticsConsent');
    if (!consentBanner) return;
    
    consentBanner.style.display = 'block';
    
    // Handle accept
    document.getElementById('analyticsAccept')?.addEventListener('click', () => {
        localStorage.setItem(ANALYTICS_CONSENT_KEY, 'accepted');
        consentBanner.style.display = 'none';
        initializeAnalytics();
    });
    
    // Handle decline
    document.getElementById('analyticsDecline')?.addEventListener('click', () => {
        localStorage.setItem(ANALYTICS_CONSENT_KEY, 'declined');
        consentBanner.style.display = 'none';
    });
}

function initializeAnalytics() {
    // Initialize GoatCounter analytics
    // We track only the pathname (not query strings) to protect privacy
    // This means we don't expose repository names from URLs
    
    window.goatcounter = {
        // Only track the path, not query parameters
        path: function(counter) {
            return location.pathname || '/';
        }
    };
    
    // Load GoatCounter script
    const script = document.createElement('script');
    script.async = true;
    script.src = '//gc.zgo.at/count.js';
    script.setAttribute('data-goatcounter', 'https://hodpub.goatcounter.com/count');
    document.head.appendChild(script);
}
