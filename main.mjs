import {
    getRepositoriesFromQueryString,
    setGitHubToken,
    getGitHubToken,
    fetchGitHub,
    classifyItem,
    fetchRepositoryData,
    getContrastColor,
    showError,
    escapeHtml,
    setupCommonUI,
    getInitialRepos,
    getCacheAgeText,
    setupAdBanner
} from './shared.mjs';

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    setupCommonUI();
    setupAdBanner();
    
    const initialRepos = getInitialRepos();

    // Auto-load on page load with initial repos
    if (initialRepos && initialRepos.length > 0) {
        loadAllRepositories(initialRepos, true);
    }

    // Setup load button handler
    const loadBtn = document.getElementById('loadBtn');
    loadBtn.addEventListener('click', async () => {
        setGitHubToken(document.getElementById('token').value.trim());
        const reposText = document.getElementById('repos').value.trim();

        // Save to localStorage
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

        await loadAllRepositories(repos, true);
    });

    // Setup issue detail panel handlers
    const iframePanel = document.getElementById('iframePanel');
    const detailsContent = document.getElementById('detailsContent');
    const detailsLoading = document.getElementById('detailsLoading');
    const iframeTitle = document.getElementById('iframeTitle');
    const closeIframe = document.getElementById('closeIframe');

    closeIframe.addEventListener('click', () => {
        iframePanel.classList.remove('open');
        detailsContent.innerHTML = '';
    });

    // Event delegation for issue clicks
    document.addEventListener('click', async (e) => {
        // Check if clicked on item card or its children
        const item = e.target.closest('.item');
        if (item) {
            e.preventDefault();
            
            const isPR = item.dataset.isPr === 'true';
            const issueData = JSON.parse(item.dataset.issue);
            
            // Check if it's a PR - if so, open directly on GitHub
            if (isPR) {
                window.open(issueData.html_url, '_blank', 'noopener,noreferrer');
                return;
            }
            
            // For issues, show in detail panel
            iframeTitle.textContent = 'Loading...';
            iframePanel.classList.add('open');
            detailsContent.innerHTML = '';
            detailsLoading.style.display = 'block';
            
            try {
                await loadIssueDetails(issueData);
            } catch (error) {
                detailsContent.innerHTML = `<div class="error">Failed to load issue details: ${error.message}</div>`;
            } finally {
                detailsLoading.style.display = 'none';
            }
        }
    });
});

/**
 * Load and display issue details
 */
async function loadIssueDetails(issue) {
    const detailsContent = document.getElementById('detailsContent');
    const iframeTitle = document.getElementById('iframeTitle');
    
    // No need to fetch comments - we already have the count in issue.comments
    renderIssueDetails(issue, issue.html_url, iframeTitle, detailsContent);
}

/**
 * Render issue details to the DOM
 */
function renderIssueDetails(issue, htmlUrl, iframeTitle, detailsContent) {
    
    iframeTitle.textContent = `#${issue.number} - ${issue.title}`;
    
    // Format dates
    const createdDate = new Date(issue.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
    
    const updatedDate = new Date(issue.updated_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
    
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

/**
 * Simple markdown-to-HTML formatter
 */
function formatMarkdown(text) {
    if (!text) return '';
    
    let html = escapeHtml(text);
    
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
    
    // Paragraphs - preserve double line breaks
    html = html.replace(/\n\n/g, '</p><p style="margin-bottom: 12px;">');
    html = html.replace(/\n/g, '<br>');
    
    return '<p style="margin-bottom: 12px;">' + html + '</p>';
}

/**
 * Load all repositories and display them
 */
async function loadAllRepositories(repos, openOnly = false) {
    const loadingEl = document.getElementById('loading');
    const swimlanesEl = document.getElementById('swimlanes');
    const errorContainer = document.getElementById('error-container');

    // Clear previous data
    swimlanesEl.innerHTML = '';
    errorContainer.innerHTML = '';
    loadingEl.style.display = 'block';

    try {
        // Fetch all repositories
        const results = await Promise.all(
            repos.map(repo => fetchRepositoryData(repo, openOnly))
        );

        loadingEl.style.display = 'none';

        // Show errors for failed repositories
        const failed = results.filter(r => !r.success);
        if (failed.length > 0) {
            const errorMessages = failed.map(r => `${r.repo}: ${r.error}`).join('<br>');
            showError(`Failed to load some repositories:<br>${errorMessages}`);
        }

        // Display successful repositories
        const successful = results.filter(r => r.success);
        if (successful.length === 0) {
            swimlanesEl.innerHTML = '<div class="empty-state">No repositories loaded successfully</div>';
            return;
        }

        successful.forEach(repoData => {
            renderSwimlane(repoData);
        });

    } catch (error) {
        loadingEl.style.display = 'none';
        showError(`Error loading repositories: ${error.message}`);
    }
}

/**
 * Render a swimlane for a repository
 */
function renderSwimlane(repoData) {
    const swimlanesEl = document.getElementById('swimlanes');
    const { repo, issues, pullRequests } = repoData;

    const swimlane = document.createElement('div');
    swimlane.className = 'swimlane collapsed';

    const totalIssues = issues.length;
    const totalPRs = pullRequests.length;
    const bugCount = [...issues, ...pullRequests].filter(item => item.type === 'bug').length;
    const featureCount = [...issues, ...pullRequests].filter(item => item.type === 'feature').length;
    const taskCount = [...issues, ...pullRequests].filter(item => item.type === 'task').length;
    const otherCount = issues.filter(item => item.type === 'other').length;

    const prSection = `
        <div class="section prs-section">
            <div class="section-title">Pull Requests (${totalPRs})</div>
            ${totalPRs > 0 ? renderItems(pullRequests, true) : '<div class="empty-state">No pull requests found</div>'}
        </div>
    `;
    
    const [owner, repoName] = repo.split('/');

    const cacheInfo = getCacheAgeText(repoData);

    swimlane.innerHTML = `
        <div class="swimlane-header">
            <div class="swimlane-title">
                <div class="swimlane-title-main">
                    <span class="collapse-icon">▼</span>
                    <span>${repoName}</span>
                </div>
                <a href="https://github.com/${repo}" target="_blank" rel="noopener noreferrer" class="repo-link">${repo} ↗️</a>
            </div>
            <div class="swimlane-stats">
                <div>
                    <span>📝 Issues: ${totalIssues}</span>
                    <span>🔀 PRs: ${totalPRs}</span>
                </div>
                <div>
                    <span style="${bugCount > 0 ? 'color: #f85149; font-weight: 600;' : ''}">🐛 Bugs: ${bugCount}</span>
                    <span>✨ Features: ${featureCount}</span>
                    <span>📋 Tasks: ${taskCount}</span>
                    <span>❓ Other: ${otherCount}</span>
                    ${cacheInfo ? `<span style="color: #8b949e; font-size: 11px;">${cacheInfo}</span>` : ''}
                </div>
            </div>
        </div>
        <div class="swimlane-content">
            <div class="section issues-section">
                <div class="section-title">Issues (${totalIssues})</div>
                ${renderItems(issues, false)}
            </div>
            ${prSection}
        </div>
    `;

    // Add click handler for collapsing
    const header = swimlane.querySelector('.swimlane-header');
    header.addEventListener('click', () => {
        swimlane.classList.toggle('collapsed');
    });

    swimlanesEl.appendChild(swimlane);
}

/**
 * Render a list of items (issues or PRs)
 */
function renderItems(items, isPR = false) {
    if (items.length === 0) {
        return '<div class="empty-state">No items found</div>';
    }

    return items.map(item => {
        const typeLabel = item.type === 'bug' ? 'bug' : 
                         item.type === 'feature' ? 'feature' : 
                         item.type === 'task' ? 'task' : 'other';
        const stateIcon = item.state === 'open' ? '🟢' : '🔴';
        const milestone = item.milestone ? `<span class="milestone">🎯 ${escapeHtml(item.milestone.title)}</span>` : '';
        
        return `
            <div class="item" data-issue='${JSON.stringify(item).replace(/'/g, "&apos;")}' data-is-pr="${isPR}">
                <div class="item-header">
                    <a href="${item.html_url}" class="item-title" target="_blank" rel="noopener noreferrer">
                        ${escapeHtml(item.title)} ↗️
                    </a>
                    <span class="item-number">#${item.number}</span>
                </div>
                <div class="item-meta">
                    <span class="label label-${typeLabel}">${typeLabel}</span>
                    <span class="item-state">${stateIcon} ${item.state}</span>
                    ${milestone}
                    ${item.labels.slice(0, 3).map(label => {
                        const labelName = typeof label === 'string' ? label : label.name;
                        const labelColor = typeof label === 'object' && label.color ? 
                            `#${label.color}` : '#6e7681';
                        const textColor = getContrastColor(labelColor);
                        return `<span class="label" style="background: ${labelColor}; color: ${textColor}">${escapeHtml(labelName)}</span>`;
                    }).join('')}
                </div>
            </div>
        `;
    }).join('');
}
