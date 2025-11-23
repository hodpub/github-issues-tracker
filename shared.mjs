// GitHub API configuration
const GITHUB_API_BASE = 'https://api.github.com';

// Cache configuration (15 minutes default)
const CACHE_DURATION_MS = 15 * 60 * 1000;
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
        return cached;
    }
    
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
        <div style="display: flex; justify-content: space-between; align-items: start;">
            <div style="flex: 1;">${message}</div>
            <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; color: #ffa198; cursor: pointer; font-size: 20px; padding: 0; margin-left: 10px; line-height: 1;">&times;</button>
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
 * Setup common UI handlers (repos toggle, token permissions toggle)
 */
export function setupCommonUI() {
    // Toggle repos configuration section
    const reposToggle = document.getElementById('reposToggle');
    const reposSection = document.getElementById('reposSection');
    
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
function updateCacheStatus() {
    const cacheStatus = document.getElementById('cacheStatus');
    if (!cacheStatus) return;
    
    try {
        const keys = Object.keys(localStorage);
        const cacheKeys = keys.filter(key => key.startsWith(CACHE_KEY_PREFIX));
        
        if (cacheKeys.length > 0) {
            // Extract repository names from cache keys
            const cachedRepos = cacheKeys
                .map(key => {
                    // Format: github_cache_{owner/repo}_{open|all}
                    const match = key.match(/github_cache_(.+)_(open|all)$/);
                    return match ? match[1] : null;
                })
                .filter((repo, index, self) => repo && self.indexOf(repo) === index) // unique repos
                .sort();
            
            const tooltip = cachedRepos.join('\n');
            cacheStatus.textContent = `${cacheKeys.length} repositories cached (15 min expiry)`;
            cacheStatus.title = tooltip;
            cacheStatus.style.cursor = 'help';
        } else {
            cacheStatus.textContent = 'No cached data';
            cacheStatus.title = '';
            cacheStatus.style.cursor = 'default';
        }
    } catch (error) {
        cacheStatus.textContent = 'No cached data';
        cacheStatus.title = '';
        cacheStatus.style.cursor = 'default';
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

    // Load saved token from localStorage
    const savedToken = localStorage.getItem('githubToken');
    if (savedToken) {
        tokenInput.value = savedToken;
        setGitHubToken(savedToken);
    }

    loadBtn.addEventListener('click', async () => {
        const token = tokenInput.value.trim();
        setGitHubToken(token);
        const reposText = reposInput.value.trim();

        // Save to localStorage
        localStorage.setItem('githubToken', token);
        localStorage.setItem('githubRepos', reposText);

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

        // Update URL with repos list
        const url = new URL(window.location);
        url.searchParams.set('repos', repos.join(','));
        window.history.pushState({}, '', url);

        // Clear cache for selected repos if force refresh is checked
        if (forceRefresh && forceRefresh.checked) {
            clearCache(repos);
        }

        await onLoad(repos);
        
        // Update cache status after loading
        updateCacheStatus();
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
 * Setup ad banner
 */
export function setupAdBanner(imageUrl = 'https://hodpub.com/wp-content/uploads/2025/11/ad.webp') {
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
    html = html.replace(/^### (.+)$/gm, '<h3 style="color: #c9d1d9; font-size: 16px; margin: 15px 0 10px 0;">$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2 style="color: #c9d1d9; font-size: 18px; margin: 15px 0 10px 0;">$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1 style="color: #c9d1d9; font-size: 20px; margin: 15px 0 10px 0;">$1</h1>');
    
    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
    
    // Italic
    html = html.replace(/\*([^\*]+)\*/g, '<em>$1</em>');
    html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
    
    // Strikethrough
    html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');
    
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color: #58a6ff; text-decoration: none;">$1 ↗️</a>');
    
    // Unordered lists
    html = html.replace(/^\* (.+)$/gm, '<li style="margin-left: 20px;">$1</li>');
    html = html.replace(/^- (.+)$/gm, '<li style="margin-left: 20px;">$1</li>');
    
    // Ordered lists
    html = html.replace(/^\d+\. (.+)$/gm, '<li style="margin-left: 20px;">$1</li>');
    
    // Wrap consecutive list items
    html = html.replace(/(<li[\s\S]*?<\/li>\s*)+/g, '<ul style="margin: 10px 0;">$&</ul>');
    
    // Blockquotes
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote style="border-left: 3px solid #30363d; padding-left: 15px; margin: 10px 0; color: #8b949e;">$1</blockquote>');
    
    // Horizontal rules
    html = html.replace(/^---$/gm, '<hr style="border: none; border-top: 1px solid #30363d; margin: 20px 0;">');
    
    // Restore HTML tags (must be before converting &lt; back)
    html = html.replace(/\|\|\|HTMLTAG(\d+)\|\|\|/g, (match, index) => htmlTags[parseInt(index)]);
    
    // Paragraphs - preserve double line breaks
    html = html.replace(/\n\n/g, '</p><p style="margin-bottom: 12px;">');
    html = html.replace(/\n/g, '<br>');
    
    return '<p style="margin-bottom: 12px;">' + html + '</p>';
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
                <a href="${htmlUrl}" target="_blank" rel="noopener noreferrer" style="color: #58a6ff; font-size: 14px; margin-left: 10px; text-decoration: none;" title="Open on GitHub">↗️</a>
            </div>
            <div class="issue-detail-meta">
                <span>${issue.state === 'open' ? '🟢' : '🔴'} ${issue.state}</span>
                <span>👤 ${escapeHtml(issue.user.login)}</span>
                <span>📅 Created: ${createdDate}</span>
                <span>🔄 Updated: ${updatedDate}</span>
                ${issue.milestone ? `<span>🎯 ${escapeHtml(issue.milestone.title)}</span>` : ''}
                ${issue.comments > 0 ? `<span>💬 ${issue.comments} comment${issue.comments !== 1 ? 's' : ''}</span>` : ''}
            </div>
        </div>
        
        ${issue.body ? `
            <div class="issue-detail-body">
                ${formatMarkdown(issue.body)}
            </div>
        ` : '<div class="issue-detail-body" style="color: #8b949e;"><em>No description provided.</em></div>'}
    `;
    
    html += `<a href="${htmlUrl}" target="_blank" rel="noopener noreferrer" class="view-on-github">View on GitHub ↗️</a>`;
    
    detailsContent.innerHTML = html;
}
